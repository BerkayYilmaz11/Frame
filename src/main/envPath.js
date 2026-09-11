/**
 * The PATH a child process should actually run with.
 *
 * A packaged app launched from Finder or the Dock does not inherit the shell's
 * environment — it gets launchd's, which on macOS is
 * `/usr/bin:/bin:/usr/sbin:/sbin` and nothing else. Every binary installed by
 * Homebrew (`/opt/homebrew/bin`), nvm, asdf or mise is therefore invisible to
 * `child_process`, so `exec('gh ...')` fails with "command not found" on a
 * machine where the user's terminal runs `gh` perfectly well. Frame's own
 * terminals are unaffected because the PTY starts a login shell, which is
 * exactly why the bug reads as "Frame can't see a tool I demonstrably have".
 *
 * So: ask the user's shell once what PATH really is, cache it for the life of
 * the process, and hand that to child processes.
 *
 * `-ilc` matches aiToolManager's CLI probe and the PTY (`-i -l`), and the
 * interactive flag is load-bearing: a non-interactive login (`-lc`) skips
 * `.zshrc`, which is where most PATH edits actually live. Shells that do not
 * speak POSIX flags (tcsh/csh, nushell) get their own invocation, the same way
 * ptyManager branches on the shell name.
 *
 * Windows is left alone — GUI processes there inherit the system and user PATH
 * already, and there is no login-shell equivalent to consult.
 */

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const logger = require('./logger');

/** The probe is a shell startup; slow rc files are common. Shared with aiToolManager's CLI probe. */
const PROBE_TIMEOUT_MS = 6000;

/**
 * After a failed probe we do not memoise the launchd PATH for the process
 * lifetime — a slow boot rc would otherwise disable the repair until relaunch.
 * But we also do not re-pay a 6s shell startup on every click when the rc is
 * genuinely broken, so a failure is only retried after this cooldown.
 */
const RETRY_AFTER_MS = 30000;

/**
 * Sentinels bracketing the PATH in probe output. Both are needed: rc files
 * chatter on stdout before the command runs, and `-l` shells run `.zlogout`
 * (or equivalent) *after* it, which would otherwise fuse onto the last segment.
 */
const START = '__FRAME_PATH_START__';
const END = '__FRAME_PATH_END__';

/** Promise<string>, resolved once and reused. Cleared when the probe failed so a later caller can retry. */
let pending = null;

/** Wall-clock of the last failed probe, gating retries. */
let lastFailureAt = 0;

/** Overridable for tests. Resolves the raw PATH string a login shell reports, or null. */
let probe = defaultProbe;

/** Overridable for tests. */
let retryAfterMs = RETRY_AFTER_MS;

/**
 * The user's real login shell. The passwd entry wins: in a GUI-launched
 * (packaged) app `$SHELL` is often unset, and when a launcher or wrapper does
 * export one it is not necessarily the shell whose rc files hold the PATH.
 * Never `/bin/sh`, which sources none of them. Last resort is platform-aware:
 * zsh is macOS's default, bash Linux's.
 */
function loginShell() {
  try {
    const s = os.userInfo().shell;
    if (s) return s;
  } catch (e) {
    logger.warn('envPath', 'userInfo shell lookup failed:', e.message);
  }
  return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
}

/**
 * The argv that makes `shell` print `START<PATH>END` on stdout.
 *
 * - POSIX shells and fish: `-ilc` — fish colon-joins path variables inside
 *   double quotes, so the same command works.
 * - tcsh/csh: reject `-ilc` outright (tcsh has no `-l` flag at all) and source
 *   `.cshrc`/`.tcshrc` for every shell anyway, so `-c` is enough.
 * - nushell: `"$PATH"` is a literal, and PATH is a list, so join it ourselves.
 */
function probeArgsFor(shell) {
  const name = path.basename(shell);
  if (name === 'tcsh' || name === 'csh') {
    return ['-c', `printf '${START}%s${END}' "$PATH"`];
  }
  if (name === 'nu') {
    return ['-l', '-c', `print ("${START}" + ($env.PATH | str join ":") + "${END}")`];
  }
  return ['-ilc', `printf '${START}%s${END}' "$PATH"`];
}

/** The PATH between the sentinels, or null if the pair is not (yet) complete. */
function parseProbeOutput(stdout) {
  const at = stdout.lastIndexOf(START);
  if (at === -1) return null;
  const from = at + START.length;
  const to = stdout.indexOf(END, from);
  if (to === -1) return null;
  return stdout.slice(from, to).trim() || null;
}

function defaultProbe() {
  const shell = loginShell();
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';

    const finish = (value, reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!value) logger.warn('envPath', `login-shell PATH probe failed (${reason}) via ${shell}`);
      resolve(value);
    };

    let child;
    try {
      child = spawn(shell, probeArgsFor(shell), {
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch (err) {
      logger.warn('envPath', 'login-shell PATH probe could not spawn:', err.message);
      resolve(null);
      return;
    }

    // SIGKILL, not SIGTERM: interactive (`-i`) zsh and bash ignore SIGTERM by
    // design, so a rc file blocked on ssh-add or a proxy would outlive the
    // budget and leak an orphaned login shell.
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (e) { logger.warn('envPath', 'probe kill failed:', e.message); }
      finish(null, 'timeout');
    }, PROBE_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', () => finish(null, 'spawn-error'));

    // A complete sentinel pair is the answer regardless of exit code — a
    // `.zlogout` that returns non-zero does not make the PATH wrong. Resolve on
    // 'exit' when it is already there; otherwise wait for 'close', because on
    // Linux libuv can reap the child before its last stdout chunk is read.
    child.on('exit', (code) => {
      const found = parseProbeOutput(stdout);
      if (found) return finish(found, 'ok');
      if (code !== 0) return finish(null, `exit ${code}`);
    });
    child.on('close', (code) => {
      finish(parseProbeOutput(stdout), code === 0 ? 'no marker in output' : `exit ${code}`);
    });
  });
}

/**
 * Union of two PATH strings, `resolved` first, preserving order and dropping
 * duplicates and empties. Union rather than replace: the login shell is the
 * better answer, but anything already on the process PATH was working before
 * this module existed and must not stop working because of it.
 */
function mergePath(resolved, current) {
  const seen = new Set();
  const out = [];
  for (const part of `${resolved || ''}:${current || ''}`.split(':')) {
    if (!part || seen.has(part)) continue;
    seen.add(part);
    out.push(part);
  }
  return out.join(':');
}

/**
 * The merged PATH, resolving it on first call. Never rejects: a failed probe
 * degrades to the PATH we already had, which is the status quo, not a new
 * failure mode — and is retried after a cooldown rather than remembered
 * for the rest of the session.
 */
function resolveLoginPath() {
  if (process.platform === 'win32') return Promise.resolve(process.env.PATH || '');
  if (!pending) {
    if (lastFailureAt && Date.now() - lastFailureAt < retryAfterMs) {
      return Promise.resolve(mergePath(null, process.env.PATH));
    }
    const attempt = probe()
      .catch((err) => {
        logger.warn('envPath', 'login-shell PATH probe threw:', err.message);
        return null;
      })
      .then((resolved) => {
        if (resolved == null) {
          lastFailureAt = Date.now();
          if (pending === attempt) pending = null;
        } else {
          lastFailureAt = 0;
        }
        return mergePath(resolved, process.env.PATH);
      });
    pending = attempt;
  }
  return pending;
}

/** Start the probe early (app boot) so the first real caller doesn't wait on a shell. */
function primeLoginPath() {
  resolveLoginPath().catch(() => {});
}

/** `env` for a child process: the current environment with the repaired PATH. */
async function childEnv(extra = {}) {
  return { ...process.env, PATH: await resolveLoginPath(), ...extra };
}

/** Test seam: swap the probe, drop the cache, optionally shorten the retry cooldown. */
function __setProbeForTests(fn, opts = {}) {
  probe = fn || defaultProbe;
  pending = null;
  lastFailureAt = 0;
  retryAfterMs = opts.retryAfterMs ?? RETRY_AFTER_MS;
}

module.exports = {
  PROBE_TIMEOUT_MS,
  loginShell,
  probeArgsFor,
  parseProbeOutput,
  resolveLoginPath,
  primeLoginPath,
  childEnv,
  mergePath,
  __setProbeForTests
};
