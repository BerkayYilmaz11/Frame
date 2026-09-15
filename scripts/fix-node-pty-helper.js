#!/usr/bin/env node
/**
 * postinstall: make node-pty's prebuilt spawn-helper executable.
 *
 * node-pty spawns every terminal through `spawn-helper`. When the native
 * build in build/Release does not match the running Electron's architecture
 * (an x64 Node under Rosetta builds x64, while the Electron dev binary is
 * arm64) node-pty falls back to prebuilds/<platform>-<arch>/, and the
 * helper shipped in the npm tarball has no execute bit. Every terminal then
 * fails with "posix_spawnp failed." This restores the bit on all prebuilt
 * helpers; a no-op on Windows and where they are already executable.
 */
const fs = require('fs');
const path = require('path');

if (process.platform === 'win32') process.exit(0);

const root = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');
let dirs = [];
try { dirs = fs.readdirSync(root); } catch (_) { process.exit(0); }

for (const dir of dirs) {
  const helper = path.join(root, dir, 'spawn-helper');
  if (!fs.existsSync(helper)) continue;
  try {
    fs.chmodSync(helper, 0o755);
  } catch (err) {
    console.warn(`fix-node-pty-helper: could not chmod ${helper}: ${err.message}`);
  }
}
