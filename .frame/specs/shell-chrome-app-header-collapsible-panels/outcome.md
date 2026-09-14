## T01 — App header markup and #shell wrapper

Added a static <header id="app-header"> with .app-header-left / -center / -right slots before the sidebar in index.html, moved the Frame mark (now .app-header-mark), the brand text with #app-version and #update-dot into the left slot, deleted #sidebar-header, and wrapped #sidebar + #main-content in <div id="shell">. Markup only, as planned: the header lays out in T02, so until then it renders unstyled beside the shell. Files: index.html.

_Captured: 2026-09-14T15:20:56Z · 1 file change(s)_

---

## T02 — Shell layout CSS and app-header.css

Made body a flex column (ui.css), added #shell (flex row, flex:1, min-height:0) and trimmed #sidebar's top padding to --space-sm in layout.css, deleted the #sidebar-header / #app-version / .sidebar-header-text / .sidebar-header-mark rules and the ~62px alignment comment there, and created components/app-header.css (35px row, --bg-secondary, bottom hairline, 0 8px padding, position:relative + z-index:60, three slots, mark, brand, #app-version) imported from main.css. One deviation: .update-dot and its keyframes moved from layout.css to app-header.css too, since the dot now lives in the header. Files: ui.css, layout.css, main.css, app-header.css (new).

_Captured: 2026-09-14T15:22:17Z · 4 file change(s)_

---

## T03 — Project switcher into the header center

Moved #sidebar-current-project-wrap (button, name, caret, #sidebar-project-menu — every id and class unchanged) out of the sidebar into .app-header-center in index.html, and moved the .sidebar-current-project* / .sidebar-project-menu* rules from layout.css into app-header.css: the wrap is now flex: 0 1 360px centered in the slot instead of a full-width sidebar row, the button is 26px tall to fit the 35px header, and the menu still hangs from the wrap (absolute, z-index 50) so it opens below the header over #shell. index.js:381-450 needed no change. Files: index.html, layout.css, app-header.css.

_Captured: 2026-09-14T15:23:55Z · 3 file change(s)_

---

