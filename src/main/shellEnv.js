/**
 * Shell Environment — resolve the main process PATH from the login shell.
 *
 * A macOS app launched from Finder/Dock inherits launchd's minimal PATH
 * (/usr/bin:/bin:/usr/sbin:/sbin), so every child_process caller in the
 * main process fails to find CLIs that live in /usr/local/bin or
 * /opt/homebrew/bin — the "gh CLI not installed" bug while gh works fine in
 * the terminal. Instead of teaching each manager to probe, this module runs
 * once before any manager is initialised and patches process.env.PATH so
 * the whole main process sees what the PTY sees.
 *
 * Strategy (the fix-path pattern VS Code and Hyper use):
 *   1. Spawn the user's login shell with `-ilc` and print $PATH between
 *      sentinel markers, so rc-file noise cannot corrupt the value. The
 *      probe is bounded by a timeout; stdin is closed so an rc that prompts
 *      gets EOF instead of hanging.
 *   2. Merge: login-shell entries first, current entries appended, de-duped.
 *   3. Belt and braces: whether the probe succeeded, failed or timed out,
 *      append the well-known install directories that exist on disk, so a
 *      machine whose rc hangs or errors still finds gh.
 *
 * Skipped on win32 — GUI apps inherit the user PATH there; only the
 * fallback directories are applied.
 *
 * resolve() returns `{ source, path }` where source is one of
 * 'shell' | 'fallback' | 'timeout' | 'skipped' so the log shows which branch ran.
 */

const os = require('os');
const fs = require('fs');
const nodePath = require('path');
const { spawn } = require('child_process');
const logger = require('./logger');

const SCOPE = 'shellEnv';
const DEFAULT_TIMEOUT_MS = 5000;

// The sentinels are split in the shell command (`"__FRAME_PATH" "_BEGIN__"`)
// so an rc file running with `set -x` — which echoes the command text —
// never prints the joined marker itself.
const BEGIN = '__FRAME_PATH_BEGIN__';
const END = '__FRAME_PATH_END__';
const PROBE_COMMAND = 'printf "%s\\n%s\\n%s\\n" "__FRAME_PATH""_BEGIN__" "$PATH" "__FRAME_PATH""_END__"';

/**
 * The user's real login shell: passwd entry first (GUI-launched apps often
 * have no $SHELL), then $SHELL, then the platform default. Never /bin/sh —
 * it does not source the configs where PATH additions live.
 */
function loginShell(env = process.env, platform = process.platform) {
  try {
    const s = os.userInfo().shell;
    if (s) return s;
  } catch (e) {
    logger.warn(SCOPE, 'userInfo shell lookup failed:', e.message);
  }
  return env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
}

/**
 * Pull the PATH out of probe stdout. The last sentinel pair wins so anything
 * an rc file prints — even a stray marker — cannot shadow the real value.
 * Returns null when no complete pair is present.
 */
function extractPath(stdout) {
  if (typeof stdout !== 'string') return null;
  const beginIdx = stdout.lastIndexOf(BEGIN);
  if (beginIdx === -1) return null;
  const endIdx = stdout.indexOf(END, beginIdx + BEGIN.length);
  if (endIdx === -1) return null;
  const value = stdout.slice(beginIdx + BEGIN.length, endIdx).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  return value.length ? value : null;
}

function splitPath(value, delimiter) {
  if (!value) return [];
  return value.split(delimiter).map((p) => p.trim()).filter(Boolean);
}

/**
 * Merge PATH lists in priority order, dropping duplicates while keeping the
 * first occurrence. `lists` is an array of arrays.
 */
function mergePaths(lists, delimiter) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const entry of list) {
      const key = delimiter === ';' ? entry.toLowerCase() : entry;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

/**
 * Well-known install directories per platform. These are appended only if
 * they exist on disk, so a genuinely missing CLI still reports as missing.
 */
function fallbackCandidates(platform, home, env = process.env) {
  // Join with the target platform's separator so candidates are correct on
  // that platform regardless of where this code (or its tests) runs.
  const path = platform === 'win32' ? nodePath.win32 : nodePath.posix;
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || (home && path.join(home, 'AppData', 'Local'));
    const pf = env.ProgramFiles || 'C:\\Program Files';
    const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    return [
      local && path.join(local, 'Programs', 'GitHub CLI'),
      path.join(pf, 'GitHub CLI'),
      path.join(pf86, 'GitHub CLI'),
      path.join(pf, 'Git', 'cmd'),
      path.join(pf, 'Git', 'bin'),
      home && path.join(home, '.cargo', 'bin'),
      home && path.join(home, 'scoop', 'shims'),
      'C:\\ProgramData\\chocolatey\\bin',
    ].filter(Boolean);
  }

  const common = [
    '/usr/local/bin',
    '/usr/local/sbin',
    home && path.join(home, '.local', 'bin'),
    home && path.join(home, '.cargo', 'bin'),
    home && path.join(home, 'bin'),
    '/usr/local/go/bin',
  ];
  const darwin = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/opt/local/bin'];
  const linux = ['/home/linuxbrew/.linuxbrew/bin', '/home/linuxbrew/.linuxbrew/sbin', '/snap/bin'];
  return [...common, ...(platform === 'darwin' ? darwin : linux)].filter(Boolean);
}

function existingDirs(candidates, existsSync) {
  return candidates.filter((dir) => {
    try {
      return existsSync(dir);
    } catch {
      return false;
    }
  });
}

/**
 * Run the login-shell probe. Resolves to
 * `{ ok: true, path }` or `{ ok: false, reason }` — never rejects.
 */
function probeLoginShell({ shell, env, timeoutMs, spawnFn }) {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    let child;
    try {
      child = spawnFn(shell, ['-ilc', PROBE_COMMAND], {
        // stdin closed: an rc file that prompts gets EOF instead of blocking.
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...env, FRAME_SHELL_ENV_PROBE: '1' },
        // Own process group, so a timeout can kill rc-spawned children too
        // (they would otherwise keep our stdout pipe open).
        detached: true,
      });
    } catch (err) {
      finish({ ok: false, reason: `spawn-error: ${err.message}` });
      return;
    }

    timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group already gone */ }
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      finish({ ok: false, reason: 'timeout' });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.on('error', (err) => finish({ ok: false, reason: `spawn-error: ${err.message}` }));
    child.on('close', (code) => {
      const value = extractPath(stdout);
      if (value) {
        finish({ ok: true, path: value });
      } else {
        finish({ ok: false, reason: code === 0 ? 'no-sentinel' : `exit-${code}` });
      }
    });
  });
}

/**
 * Resolve PATH and patch `env.PATH` (process.env by default). Idempotent
 * in effect: running twice merges to the same result. Never throws.
 *
 * Options exist for tests: shell, platform, env, home, timeoutMs, existsSync, spawnFn.
 */
async function resolve(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.home !== undefined ? options.home : os.homedir();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const existsSync = options.existsSync || fs.existsSync;
  const spawnFn = options.spawnFn || spawn;
  const delimiter = platform === 'win32' ? ';' : ':';

  const pathKey = platform === 'win32'
    ? (Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'Path')
    : 'PATH';
  const current = splitPath(env[pathKey], delimiter);

  let source = 'fallback';
  let fromShell = [];

  if (platform === 'win32') {
    source = 'skipped';
  } else {
    const shell = options.shell || loginShell(env, platform);
    const probe = await probeLoginShell({ shell, env, timeoutMs, spawnFn });
    if (probe.ok) {
      source = 'shell';
      fromShell = splitPath(probe.path, delimiter);
    } else {
      source = probe.reason === 'timeout' ? 'timeout' : 'fallback';
      logger.warn(SCOPE, `login-shell PATH probe via ${shell} failed (${probe.reason}); using fallback dirs`);
    }
  }

  const fallback = existingDirs(fallbackCandidates(platform, home, env), existsSync);
  const merged = mergePaths([fromShell, current, fallback], delimiter);
  const value = merged.join(delimiter);
  env[pathKey] = value;

  const added = merged.length - current.length;
  logger.info(SCOPE, `PATH resolved (source=${source}, entries=${merged.length}, added=${added})`);
  return { source, path: value };
}

module.exports = {
  resolve,
  // exported for tests
  extractPath,
  mergePaths,
  fallbackCandidates,
  probeLoginShell,
  loginShell,
  PROBE_COMMAND,
};
