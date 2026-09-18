/**
 * Frame Cloud — the case for it, beside the sign-in.
 *
 * The left half of the Frame Cloud modal while signed out and through every
 * sign-in step. The words live in COPY, apart from the layout, so the pitch
 * can be rewritten without touching the markup. Static text only, written
 * with textContent.
 */

const ICONS = {
  board: '<path d="M3 5h18v14H3z"/><path d="M9 5v14"/><path d="M15 5v14"/>',
  machines: '<rect x="2" y="4" width="12" height="9" rx="1"/><path d="M5 17h6"/><rect x="16" y="7" width="6" height="12" rx="1"/>',
  live: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4"/><path d="M19 5a10 10 0 0 1 0 14"/><path d="M5 19A10 10 0 0 1 5 5"/>',
  specs: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
};

const COPY = {
  eyebrow: 'Frame Cloud',
  title: 'Your Frame projects, on every machine and on the web.',
  lede: 'Frame keeps your agents oriented in one folder. Frame Cloud carries that context everywhere else — across your machines, into the browser, and in front of the people you work with.',
  features: [
    { icon: 'board', title: 'Brief Board', text: 'Plan work as briefs and follow them on one board. The specs your agents write land under the brief they belong to.' },
    { icon: 'machines', title: 'Every machine, one project', text: 'Connect a project once and it reads Connected on your laptop and your desktop — the same identity everywhere.' },
    { icon: 'live', title: 'Live sessions', text: 'See which machine is working on what while it happens, and pick up where another one stopped.' },
    { icon: 'specs', title: 'Specs on the web', text: 'Every spec, plan and outcome, readable from any browser — no clone needed.' },
    { icon: 'github', title: 'Start from GitHub', text: 'Bring any repository your GitHub App can see into the workspace in a click.' }
  ],
  trustLead: 'Your code stays on your machines.',
  trust: 'Frame Cloud stores project names, links and the Frame context you choose to share — never your source.'
};

function icon(name, size = 16) {
  const span = document.createElement('span');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span.firstChild;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Fill the pitch once; it never changes with the session. */
function render(root) {
  if (!root || root.childNodes.length) return;

  const head = el('div', 'cloud-pitch-head');
  head.appendChild(el('span', 'cloud-pitch-eyebrow', COPY.eyebrow));
  head.appendChild(el('h3', 'cloud-pitch-title', COPY.title));
  head.appendChild(el('p', 'cloud-pitch-lede', COPY.lede));
  root.appendChild(head);

  const list = el('ul', 'cloud-feats');
  for (const f of COPY.features) {
    const item = el('li', 'cloud-feat');
    const mark = el('span', 'cloud-feat-icon');
    mark.appendChild(icon(f.icon));
    item.appendChild(mark);
    const text = el('div', 'cloud-feat-text');
    text.appendChild(el('b', '', f.title));
    text.appendChild(el('span', '', f.text));
    item.appendChild(text);
    list.appendChild(item);
  }
  root.appendChild(list);

  const trust = el('p', 'cloud-trust');
  trust.appendChild(icon('lock', 14));
  const words = el('span');
  words.appendChild(el('b', '', COPY.trustLead));
  words.appendChild(document.createTextNode(` ${COPY.trust}`));
  trust.appendChild(words);
  root.appendChild(trust);
}

module.exports = { render };
