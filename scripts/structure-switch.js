/**
 * Structure switch — STRUCTURE.json maintenance is opt-in per project.
 *
 * A project gets it only when its `.frame/config.json` says
 * `settings.structureMap: true` (Frame's own repo does). Everywhere else
 * nothing writes or regenerates the map: the pre-commit hook
 * (`update-structure.js --staged`) stages nothing, `npm run structure` does
 * nothing, the app starts no lifecycle worker, init runs no initial scan,
 * the module-hint search hook stays silent and check-freshness skips its
 * STRUCTURE checks. The code stays shipped, so opting in needs no re-init.
 *
 * Not `settings.autoUpdateStructure`: init has written that one as `true`
 * into every project, and nothing ever read it.
 *
 * `FRAME_STRUCTURE=on` in the environment turns it on for one process
 * regardless of the config (the test suite runs that way).
 *
 * Ships to user projects' .frame/bin/ beside the scripts that read it.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function structureEnabled(projectRoot, env = process.env) {
  if (env.FRAME_STRUCTURE === 'on') return true;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(projectRoot, '.frame', 'config.json'), 'utf8'));
    return Boolean(config && config.settings && config.settings.structureMap === true);
  } catch (_) {
    return false;
  }
}

const PAUSED_MESSAGE = 'STRUCTURE.json maintenance is off for this project (.frame/config.json settings.structureMap) — the map was left as it is';

module.exports = { structureEnabled, PAUSED_MESSAGE };
