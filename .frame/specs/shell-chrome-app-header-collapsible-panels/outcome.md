## T01 — App header markup and #shell wrapper

Added a static <header id="app-header"> with .app-header-left / -center / -right slots before the sidebar in index.html, moved the Frame mark (now .app-header-mark), the brand text with #app-version and #update-dot into the left slot, deleted #sidebar-header, and wrapped #sidebar + #main-content in <div id="shell">. Markup only, as planned: the header lays out in T02, so until then it renders unstyled beside the shell. Files: index.html.

_Captured: 2026-09-14T15:20:56Z · 1 file change(s)_

---

