# Tickets: orca-shell M1 (The orca Shell)

Vertical slices for M1 of the orca-shell effort — the 3-column IDE Shell (left Navigator, center Pane area, right Explorer). Source spec: `.scratch/orca-shell/issues/01-orca-shell-m1.md`. Vocabulary follows `CONTEXT.md`; the "terminal multiplexer, not agent ADE" guardrail is `docs/adr/0001-terminal-multiplexer-not-ade.md`.

All three tickets are **ready-for-agent** by construction. Work the **frontier**: any ticket whose blockers are all done. Dependency shape: Ticket 1 → { Ticket 2, Ticket 3 } (2 and 3 are parallel). Clear context between tickets.

## Shell panel mechanics (+ Vitest)

**What to build:** Two side panels flanking the center Pane area that a user can show/hide and freely resize, with their layout remembered across restarts. This ticket delivers the reusable Shell mechanics with placeholder panel bodies — the Navigator and Explorer content arrive in later tickets. It also stands up the project's first automated tests. A user upgrading from the old 3-mode sidebar keeps a sensible layout rather than a reset.

**Blocked by:** None — can start immediately.

- [ ] Each side panel shows/hides via a top-bar corner toggle button (left corner = left panel, right corner = right panel).
- [ ] Each side panel also toggles via a keybinding: left = Ctrl+Shift+B (repurposed from the old cycle-sidebar binding), right = a new binding.
- [ ] Dragging a panel's inner edge resizes its width; the center Pane area flexes to fill the remaining space.
- [ ] Panels cannot be dragged below a sensible minimum width.
- [ ] Panel open/closed state and widths survive an app restart.
- [ ] A user with the old 3-mode preference is migrated without a visible reset: expanded → open, compact → collapsed icon-rail, minimal → closed.
- [ ] Vitest is installed and runs via `pnpm test`.
- [ ] The headless panel-state logic has passing tests for: toggling open/closed, clamping width to the minimum, a persistence round-trip (serialize→deserialize reproduces state, tolerating missing/unknown fields), and legacy 3-mode migration.

## Left Navigator (Workspace→Session tree)

**What to build:** The left panel becomes a Navigator that lists every Workspace with its Sessions nested underneath, so a user can see everything running and jump to any Session in one click. Collapsing it leaves a compact icon-rail that still switches Workspaces.

**Blocked by:** Shell panel mechanics (+ Vitest).

- [ ] The left panel lists all Workspaces, each with its Sessions nested beneath it.
- [ ] Clicking a Session focuses its Pane and activates its tab.
- [ ] The active Workspace and the focused Session are visibly highlighted.
- [ ] Switching the active Workspace updates the Navigator's highlighting.
- [ ] Collapsing the Navigator leaves a compact icon-rail of Workspaces that can still switch Workspaces.
- [ ] The Navigator selector (Workspaces + Sessions → grouped tree with active/focused flags, each Session mapped to its Workspace) has passing tests.

## Right Explorer (file tree)

**What to build:** The right panel becomes a file Explorer so a user can browse the project and open files without leaving winmux. The tree is rooted at the active Workspace's folder and stays put as the user moves around the terminal, with an explicit button to re-root to the current terminal's directory. Each Workspace remembers its own root.

**Blocked by:** Shell panel mechanics (+ Vitest).

- [ ] The right panel shows a file tree behind a Files icon strip (with room reserved for future tools).
- [ ] The tree is rooted at the active Workspace's pinned root, defaulting to its configured default directory, falling back to the focused Session's working directory on first open.
- [ ] Folders can be expanded and collapsed.
- [ ] The root stays fixed as the user changes directory in the terminal (no automatic re-rooting).
- [ ] A "sync to current terminal" button re-roots the tree to the focused Session's working directory.
- [ ] Clicking a file opens it as a FileViewer tab in the center Pane area.
- [ ] Each Workspace remembers its own Explorer root across restarts.
- [ ] The backend directory-read behavior and the explorer-root resolution logic have passing tests.
