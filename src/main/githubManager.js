/**
 * GitHub Manager Module
 * Handles GitHub integration using gh CLI
 */

const { execFile } = require('child_process');
const { shell } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let mainWindow = null;
let currentProjectPath = null;

/**
 * Initialize GitHub manager
 */
function init(window) {
  mainWindow = window;
}

/**
 * Set current project path
 */
function setProjectPath(projectPath) {
  currentProjectPath = projectPath;
}

// gh is invoked with execFile (no shell): args are not shell-parsed and a
// missing binary surfaces as ENOENT, distinguishable from "not a repo" or a
// gh error. PATH itself is patched once at startup by shellEnv, so gh in
// /usr/local/bin or /opt/homebrew/bin is found even when Frame was launched
// from Finder/Dock.
function isMissingBinary(error) {
  return Boolean(error) && (error.code === 'ENOENT' || error.code === 'EACCES');
}

/**
 * Check if gh CLI is available
 */
function checkGhCli() {
  return new Promise((resolve) => {
    execFile('gh', ['--version'], (error) => {
      resolve(!isMissingBinary(error));
    });
  });
}

/**
 * Check if current directory is a git repo with GitHub remote
 */
function checkGitHubRepo(projectPath) {
  return new Promise((resolve) => {
    execFile('gh', ['repo', 'view', '--json', 'nameWithOwner'], { cwd: projectPath }, (error, stdout) => {
      if (error) {
        resolve({ isGitHubRepo: false, repoName: null });
      } else {
        try {
          const data = JSON.parse(stdout);
          resolve({ isGitHubRepo: true, repoName: data.nameWithOwner });
        } catch {
          resolve({ isGitHubRepo: false, repoName: null });
        }
      }
    });
  });
}

/**
 * Load GitHub issues for current project
 */
async function loadIssues(projectPath, state = 'open') {
  const ghAvailable = await checkGhCli();
  if (!ghAvailable) {
    return { error: 'gh CLI not installed', issues: [] };
  }

  const repoInfo = await checkGitHubRepo(projectPath);
  if (!repoInfo.isGitHubRepo) {
    return { error: 'Not a GitHub repository', issues: [] };
  }

  return new Promise((resolve) => {
    const args = [
      'issue', 'list',
      '--state', String(state),
      '--json', 'number,title,state,author,labels,createdAt,updatedAt,url',
      '--limit', '50'
    ];

    execFile('gh', args, { cwd: projectPath }, (error, stdout, stderr) => {
      if (isMissingBinary(error)) {
        resolve({ error: 'gh CLI not installed', issues: [], repoName: repoInfo.repoName });
      } else if (error) {
        resolve({ error: stderr || error.message, issues: [], repoName: repoInfo.repoName });
      } else {
        try {
          const issues = JSON.parse(stdout);
          resolve({ error: null, issues, repoName: repoInfo.repoName });
        } catch (e) {
          resolve({ error: 'Failed to parse issues', issues: [], repoName: repoInfo.repoName });
        }
      }
    });
  });
}

/**
 * Open issue in browser
 */
function openIssue(url) {
  if (url) {
    shell.openExternal(url);
  }
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  // Load issues
  ipcMain.handle(IPC.LOAD_GITHUB_ISSUES, async (event, { projectPath, state }) => {
    const path = projectPath || currentProjectPath;
    if (!path) {
      return { error: 'No project selected', issues: [] };
    }
    return await loadIssues(path, state);
  });

  // Open issue in browser
  ipcMain.on(IPC.OPEN_GITHUB_ISSUE, (event, url) => {
    openIssue(url);
  });
}

module.exports = {
  init,
  setProjectPath,
  setupIPC,
  loadIssues,
  openIssue
};
