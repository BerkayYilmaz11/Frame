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
 * Run a `gh <type> list` for the current project and parse its JSON.
 * Shared by issues and pull requests: both need the gh + repo checks and
 * the same error shapes so the panel renders them identically.
 */
async function loadGhList(projectPath, type, state, fields, parseErrorMessage) {
  const ghAvailable = await checkGhCli();
  if (!ghAvailable) {
    return { error: 'gh CLI not installed', items: [] };
  }

  const repoInfo = await checkGitHubRepo(projectPath);
  if (!repoInfo.isGitHubRepo) {
    return { error: 'Not a GitHub repository', items: [] };
  }

  return new Promise((resolve) => {
    const args = [
      type, 'list',
      '--state', String(state),
      '--json', fields,
      '--limit', '50'
    ];

    execFile('gh', args, { cwd: projectPath }, (error, stdout, stderr) => {
      if (isMissingBinary(error)) {
        resolve({ error: 'gh CLI not installed', items: [], repoName: repoInfo.repoName });
      } else if (error) {
        resolve({ error: stderr || error.message, items: [], repoName: repoInfo.repoName });
      } else {
        try {
          const items = JSON.parse(stdout);
          resolve({ error: null, items, repoName: repoInfo.repoName });
        } catch (e) {
          resolve({ error: parseErrorMessage, items: [], repoName: repoInfo.repoName });
        }
      }
    });
  });
}

/**
 * Load GitHub issues for current project
 */
async function loadIssues(projectPath, state = 'open') {
  const result = await loadGhList(
    projectPath, 'issue', state,
    'number,title,state,author,labels,createdAt,updatedAt,url',
    'Failed to parse issues'
  );
  return { error: result.error, issues: result.items, repoName: result.repoName };
}

/**
 * Load GitHub pull requests for current project
 */
async function loadPullRequests(projectPath, state = 'open') {
  const result = await loadGhList(
    projectPath, 'pr', state,
    'number,title,state,author,labels,createdAt,updatedAt,url,isDraft,headRefName',
    'Failed to parse pull requests'
  );
  return { error: result.error, pullRequests: result.items, repoName: result.repoName };
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

  // Load pull requests
  ipcMain.handle(IPC.LOAD_GITHUB_PRS, async (event, { projectPath, state }) => {
    const path = projectPath || currentProjectPath;
    if (!path) {
      return { error: 'No project selected', pullRequests: [] };
    }
    return await loadPullRequests(path, state);
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
  loadPullRequests,
  openIssue
};
