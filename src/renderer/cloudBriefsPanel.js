/**
 * Cloud Briefs Panel
 *
 * The open folder's Frame Cloud briefs, read-only (frame-cloud-briefs-read-only
 * spec). Reached from the sidebar's Context → Briefs row, which exists only
 * while the open folder is connected to a cloud project; hosted in the center
 * by `multiTerminalUI` the way Sessions is (`PANEL_REGISTRY.cloudBriefs`).
 *
 * The renderer sends a folder path and nothing else — main resolves the
 * connected project and holds the token. Nothing here writes to the cloud.
 *
 * Names are `cloudBriefs*` / `cloud-briefs`, not `briefs`: the local briefs
 * of brief-capture-and-shaping own those, and the two must meet in one tree.
 *
 * Host contract, the same as every center-hosted panel: `show()` adds
 * `.visible` and loads, `hide()` drops `.visible` — which is what the host's
 * MutationObserver watches to route back to the terminals view.
 */

const state = require('./state');
const cloudProjectMark = require('./cloudProjectMark');

let hub = null;
let panelElement = null;
let contentElement = null;
let visible = false;

function init(cloudHub) {
  hub = cloudHub;
  panelElement = document.getElementById('cloud-briefs-panel');
  contentElement = document.getElementById('cloud-briefs-content');
  if (!panelElement || !contentElement) {
    console.error('cloudBriefsPanel: #cloud-briefs-panel not found — Briefs will not open');
    return;
  }

  // The Briefs row follows the connection: sign-in, sign-out, a folder
  // connected or disconnected, a project switch.
  hub.onProjects(onCloudChange);
  hub.onSession(onCloudChange);
  state.onProjectChange(onCloudChange);
}

function onCloudChange() {
  try {
    require('./projectListUI').updateWorkspaceNav();
  } catch (err) {
    console.error('cloudBriefsPanel: could not refresh the nav', err);
  }
}

/** True while the open folder is connected to a cloud project — the same test as the Connected mark. */
function isAvailable() {
  if (!hub) return false;
  const { folder } = cloudProjectMark.openFolder();
  return Boolean(folder && folder.connected && folder.project);
}

/** Show the panel — the host calls this on mount. */
function show() {
  if (!panelElement) return;
  panelElement.classList.add('visible');
  visible = true;
}

function hide() {
  if (!panelElement) return;
  panelElement.classList.remove('visible');
  visible = false;
}

function isVisible() {
  return visible;
}

module.exports = {
  init,
  show,
  hide,
  isVisible,
  isAvailable,
};
