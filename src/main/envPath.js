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
 * `.zshrc`, which is where most PATH edits actually live.
 *
 * Windows is left alone — GUI processes there inherit the system and user PATH
 * already, and there is no login-shell equivalent to consult.
 */

const { spawn } = require('child_process');
const os = require('os');
const logger = require('./logger');

/** The probe is a shell startup; slow rc files are common. Same budget as the CLI probe. */
const PROBE_TIMEOUT_MS = 6000;

/** Sentinel so we can find PATH in output even if an rc file chatters on stdout. */
const MARKER = '__FRAME_PATH__';

/** Promise<string|null>, resolved once and reused. null = "no better answer than what we have". */
let pending = null;

/** Overridable for tests. Resolves the raw PATH string a login shell reports. */
let probe = defaultProbe;

/** The user's login shell, preferring the passwd entry over a possibly-absent $SHELL. */
function loginShell() {
  try {
    const s = os.userInfo().shell;
    if (s) return s;
  } catch (e) {
    logger.warn('envPath', 'userInfo shell lookup failed:', e.message);
  }
  return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
}

function defaultProbe() {
  const shell = process.env.SHELL || loginShell();
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
      child = spawn(shell, ['-ilc', `printf '${MARKER}%s' "$PATH"`], {
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch (err) {
      logger.warn('envPath', 'login-shell PATH probe could not spawn:', err.message);
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (e) { logger.warn('envPath', 'probe kill failed:', e.message); }
      finish(null, 'timeout');
    }, PROBE_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', () => finish(null, 'spawn-error'));
    child.on('exit', (code) => {
      if (code !== 0) return finish(null, `exit ${code}`);
      const at = stdout.lastIndexOf(MARKER);
      if (at === -1) return finish(null, 'no marker in output');
      finish(stdout.slice(at + MARKER.length).trim() || null, 'empty');
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
 * failure mode.
 */
function resolveLoginPath() {
  if (process.platform === 'win32') return Promise.resolve(process.env.PATH || '');
  if (!pending) {
    pending = probe()
      .catch((err) => {
        logger.warn('envPath', 'login-shell PATH probe threw:', err.message);
        return null;
      })
      .then((resolved) => mergePath(resolved, process.env.PATH));
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

/** Test seam: swap the probe and drop the cache. */
function __setProbeForTests(fn) {
  probe = fn || defaultProbe;
  pending = null;
}

module.exports = {
  resolveLoginPath,
  primeLoginPath,
  childEnv,
  mergePath,
  __setProbeForTests
};
