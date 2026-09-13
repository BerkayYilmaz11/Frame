/**
 * gitRefNames — is this string a branch name git would accept?
 *
 * The rules of `git check-ref-format --branch`, as a pure predicate, so the
 * status bar's "Create new branch" row can answer on every keystroke and
 * main can refuse a bad name before it ever reaches git
 * (status-bar-branch-picker spec, D8). Shared rather than duplicated: one
 * implementation, two callers, no drift between what the UI allows and what
 * the process runs.
 *
 * Deliberately strict where git is merely lenient — a name that passes here
 * is safe to hand to `git checkout -b` as an argv element. Anything git
 * still rejects surfaces from git itself, verbatim, in the picker's notice.
 */

// One path component, between slashes: git's per-component rules.
function componentOk(part) {
  if (part === '') return false;                 // "a//b", leading or trailing "/"
  if (part.startsWith('.')) return false;        // ".hidden", "..", "."
  if (part.endsWith('.lock')) return false;      // "foo.lock"
  return true;
}

/**
 * @param {unknown} name
 * @returns {boolean}
 */
function isValidBranchName(name) {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name.length > 255) return false;
  if (name === '@') return false;                // the one reserved single-char name
  if (name.startsWith('-')) return false;        // would read as an option
  if (name.endsWith('.')) return false;
  if (name.endsWith('/')) return false;
  if (name.includes('..')) return false;
  if (name.includes('@{')) return false;
  // Space, control characters (0x00–0x1F, 0x7F), git's forbidden set, and
  // the shell metacharacters git tolerates but no script the user will ever
  // run does ($ ` " ' ; | & < >). Stricter than git on purpose.
  if (/[\s\x00-\x1f\x7f~^:?*[\\$`"';|&<>]/.test(name)) return false;
  return name.split('/').every(componentOk);
}

module.exports = { isValidBranchName };
