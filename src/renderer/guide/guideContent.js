/**
 * How to Use Frame — the guide's content (how-to-use-frame-guide spec).
 *
 * Pure data plus the helpers that read it: no electron, no DOM, no lucide at
 * require time, so `npm test` loads it in CI without `npm ci` (the Testing
 * record's convention — test the pure module, not its DOM host). The modal
 * (guideModal.js) renders it; the illustrations (guide/guideSketches.js)
 * draw each page's `sketch`.
 *
 * Shape:
 *   CHAPTERS → [{ id, title, pages }]
 *   page     → { id, title, sketch: { kind, focus? }, claudeOnly?, blocks, actions? }
 *   block    → exactly one of { p } | { list: [..] } | { code } | { note }
 *   action   → { id, label, stay? }
 *
 * Text is plain — never HTML. Two inline tokens are expanded by the host
 * after escaping:
 *   {kbd:<commandId>}  the command's current shortcut, read from the command
 *                      registry and formatted for the platform, so a page can
 *                      never quote a shortcut the app no longer has
 *   `code`             a path, a file name or a literal command
 *
 * Every command a page cites — as an action or a {kbd:} token — must be in
 * ACTION_IDS; `stay` (run without closing the guide) only on STAY_IDS, the
 * commands whose effect is visible in the guide itself. validate() checks
 * all of it and the test pins it.
 */

/** The sketch kinds guideSketches.render() draws. */
const SKETCH_KINDS = Object.freeze([
  'agents', 'shell', 'fileTree', 'gitSharing', 'settings', 'terminalGrid',
  'laneStates', 'home', 'specFlow', 'implementModes', 'boards', 'orchestrator',
  'sessions', 'dockTabs', 'multiProject', 'plugins', 'themes', 'zoom', 'keys',
  'feedback'
]);

/** Theme and zoom commands change what the guide itself looks like, so their
 *  links apply in place instead of closing the guide (plan D7). */
const STAY_IDS = Object.freeze([
  'theme.dark', 'theme.light', 'theme.darkPlus', 'theme.lightPlus',
  'view.zoomIn', 'view.zoomOut', 'view.zoomReset'
]);

/** Every command-registry id the guide may cite. */
const ACTION_IDS = Object.freeze([
  // Projects
  'project.add', 'project.create', 'project.initializeFrame',
  'project.next', 'project.prev',
  // Settings and help
  'settings.open', 'settings.openProject', 'help.shortcuts', 'help.welcome',
  'help.guide', 'feedback.open', 'plugins.open',
  // Layout and views
  'panel.toggleSidebar', 'sidebar.github', 'lane.home',
  'panel.toggleSpecsDashboard', 'panel.toggleTasksDashboard',
  'panel.toggleSessions', 'orchestrator.open',
  'dock.toggle', 'dock.decisions', 'dock.prompts', 'dock.activity',
  // Terminals and agents
  'terminal.new', 'terminal.close', 'terminal.next', 'ai.startSession',
  // Palette
  'palette.toggle', 'palette.open',
  // Look
  ...STAY_IDS
]);

const BLOCK_KEYS = Object.freeze(['p', 'list', 'code', 'note']);

const CHAPTERS = [
  {
    id: 'start',
    title: 'Start here',
    pages: [
      {
        id: 'start.what',
        title: 'What Frame is',
        sketch: { kind: 'agents' },
        blocks: [
          { p: 'Frame is a terminal-first IDE for working with AI coding agents. The agent is a command-line tool you already use — Claude Code, Codex CLI or Gemini CLI — and Frame runs it in real terminals, next to your project.' },
          { p: 'You bring your own agent. Sign in to the CLI with your own subscription or API key, the way you would in any terminal. Frame never calls a model itself and never sees your credentials.' },
          { p: 'What Frame adds around the agent:' },
          { list: [
            'Project context that survives sessions — a module map, decisions, tasks and a spec archive the agent reads at the start of every session.',
            'A spec-driven workflow: describe the work, plan it, break it into tasks, implement it.',
            'Visibility across every terminal and every project — which agent is working, which one is waiting for you.'
          ] },
          { note: 'This guide walks through Frame step by step. Use the index on the left to jump, or Next to read it in order.' }
        ]
      },
      {
        id: 'start.agent',
        title: 'Pick your agent',
        sketch: { kind: 'shell', focus: 'header-agent' },
        blocks: [
          { p: 'Frame works with three agent CLIs: Claude Code, Codex CLI and Gemini CLI. Install the one you use and sign in to it once in a terminal before starting it from Frame.' },
          { p: 'On first run Frame picks the first of them it finds installed. Change it any time with the Agent picker in the header — Start launches whichever agent is selected there. The agent\'s own menu in the menu bar has the same switch under Switch AI Tool.' },
          { note: 'A few features read Claude Code\'s own data and only appear when Claude Code is the agent: Sessions, Plugins and the usage meters in the status bar.' }
        ]
      },
      {
        id: 'start.open',
        title: 'Open a project',
        sketch: { kind: 'shell', focus: 'header-switcher' },
        blocks: [
          { p: 'Everything in Frame happens inside a project. There are four ways in:' },
          { list: [
            'Open a folder already on your machine — any language, any layout.',
            'Create a new, empty project.',
            'Clone a repository from GitHub by its URL.',
            'Try the sample project — a small fictional codebase with specs, tasks and notes already filled in.'
          ] },
          { p: 'The project switcher in the middle of the header shows the current project; its menu lists your other projects and ends with “+ Add a project…”. The Welcome screen, which follows this guide when Frame starts, has all four too.' }
        ],
        actions: [
          { id: 'project.add', label: 'Add a project' },
          { id: 'project.create', label: 'Create a new project' }
        ]
      }
    ]
  }
];

/**
 * Every page in tree order — the order Back / Next walk and the "n / N"
 * counter counts. Collapsing a chapter in the tree never changes it.
 * @returns {{ chapterId: string, page: object, index: number }[]}
 */
function flattenPages(chapters = CHAPTERS) {
  const out = [];
  for (const chapter of chapters) {
    for (const page of chapter.pages || []) {
      out.push({ chapterId: chapter.id, page, index: out.length });
    }
  }
  return out;
}

/**
 * Split a text into plain, {kbd:id} and `code` segments. The host escapes
 * each value and wraps kbd / code segments; nothing here produces markup.
 * @returns {{ type: 'text'|'kbd'|'code', value: string }[]}
 */
function parseInline(text) {
  const segments = [];
  const re = /\{kbd:([A-Za-z0-9_.-]+)\}|`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    if (m.index > last) segments.push({ type: 'text', value: text.slice(last, m.index) });
    if (m[1] !== undefined) segments.push({ type: 'kbd', value: m[1] });
    else segments.push({ type: 'code', value: m[2] });
    last = re.lastIndex;
  }
  if (last < String(text).length) segments.push({ type: 'text', value: String(text).slice(last) });
  return segments;
}

/** Every string of a block, for token scanning. */
function blockTexts(block) {
  if (Array.isArray(block.list)) return block.list;
  const key = BLOCK_KEYS.find((k) => k in block);
  return key && typeof block[key] === 'string' ? [block[key]] : [];
}

/**
 * Check the content against every rule the host relies on.
 * @returns {string[]} one line per problem; [] when the content is sound
 */
function validate(chapters = CHAPTERS) {
  const problems = [];
  const chapterIds = new Set();
  const pageIds = new Set();

  if (!Array.isArray(chapters) || chapters.length === 0) {
    return ['no chapters'];
  }

  for (const chapter of chapters) {
    const where = `chapter "${chapter.id}"`;
    if (!chapter.id) problems.push('chapter without an id');
    else if (chapterIds.has(chapter.id)) problems.push(`duplicate chapter id "${chapter.id}"`);
    chapterIds.add(chapter.id);
    if (!chapter.title) problems.push(`${where} has no title`);
    if (!Array.isArray(chapter.pages) || chapter.pages.length === 0) {
      problems.push(`${where} has no pages`);
      continue;
    }

    for (const page of chapter.pages) {
      const at = `page "${page.id}"`;
      if (!page.id) problems.push(`page without an id in ${where}`);
      else if (pageIds.has(page.id)) problems.push(`duplicate page id "${page.id}"`);
      pageIds.add(page.id);
      if (!page.title) problems.push(`${at} has no title`);

      if (!page.sketch || !SKETCH_KINDS.includes(page.sketch.kind)) {
        problems.push(`${at} has an unknown sketch kind "${page.sketch && page.sketch.kind}"`);
      }

      if (!Array.isArray(page.blocks) || page.blocks.length === 0) {
        problems.push(`${at} has no blocks`);
      } else {
        for (const block of page.blocks) {
          const keys = Object.keys(block || {});
          if (keys.length !== 1 || !BLOCK_KEYS.includes(keys[0])) {
            problems.push(`${at} has a block that is not exactly one of ${BLOCK_KEYS.join(' / ')}`);
            continue;
          }
          const texts = blockTexts(block);
          if (texts.length === 0 || texts.some((t) => typeof t !== 'string' || !t.trim())) {
            problems.push(`${at} has an empty ${keys[0]} block`);
            continue;
          }
          for (const t of texts) {
            for (const seg of parseInline(t)) {
              if (seg.type === 'kbd' && !ACTION_IDS.includes(seg.value)) {
                problems.push(`${at} cites {kbd:${seg.value}}, which is not in ACTION_IDS`);
              }
            }
          }
        }
      }

      for (const action of page.actions || []) {
        if (!ACTION_IDS.includes(action.id)) {
          problems.push(`${at} links "${action.id}", which is not in ACTION_IDS`);
        }
        if (!action.label) problems.push(`${at} has an action without a label`);
        if (action.stay && !STAY_IDS.includes(action.id)) {
          problems.push(`${at} marks "${action.id}" as stay, which only theme and zoom commands may be`);
        }
      }
    }
  }
  return problems;
}

module.exports = {
  CHAPTERS,
  SKETCH_KINDS,
  ACTION_IDS,
  STAY_IDS,
  flattenPages,
  parseInline,
  validate
};
