# Spec: M1 — The orca Shell (layout)

Status: ready-for-agent
Feature: orca-shell
Depends on: none
See also: `../PRD.md`, `CONTEXT.md`, `docs/adr/0001-terminal-multiplexer-not-ade.md`

## Problem Statement

As a winmux user I have a powerful center Pane area for terminals, but everything else is thin: the left rail only switches Workspaces, there is no place to see all my Sessions at a glance, and there is no way to browse files without leaving the terminal. Compared to orca's IDE-style layout, winmux feels like a bare terminal grid — I can't navigate my Sessions or my files from the app frame.

## Solution

Wrap the existing center Pane area in an orca-style **Shell**: a left **Navigator** panel that lists every Workspace with its Sessions nested underneath (click to focus), and a right **Explorer** panel showing a file tree rooted at the Workspace's folder (click a file to open it as a tab). Both panels can be shown/hidden and freely resized by dragging their inner edge, with toggle buttons in the top-bar corners; their open state and widths are remembered across restarts. winmux stays a terminal multiplexer — these panels are navigation surfaces, not agent/task tooling (per ADR-0001).

## User Stories

1. As a winmux user, I want the left Navigator to list all my Workspaces, so that I can see my whole environment at once.
2. As a winmux user, I want each Workspace in the Navigator to show its Sessions nested underneath, so that I can see everything running without hunting through Panes.
3. As a winmux user, I want to click a Session in the Navigator, so that I can focus its Pane and tab immediately.
4. As a winmux user, I want the active Workspace and focused Session highlighted in the Navigator, so that I always know where I am.
5. As a winmux user, I want to collapse the Navigator to a compact icon-rail of Workspaces, so that I keep Workspace switching while reclaiming horizontal space.
6. As a winmux user, I want to hide the Navigator entirely, so that I can maximize the terminal area when I don't need navigation.
7. As a winmux user, I want a toggle button in the top-left corner of the Shell, so that I can show/hide the Navigator with the mouse (orca-style).
8. As a winmux user, I want a keyboard shortcut to toggle the Navigator, so that I can do it without reaching for the mouse.
9. As a winmux user, I want to drag the Navigator's inner edge to resize its width, so that I can size it to my content.
10. As a winmux user, I want the Navigator's open state and width remembered after I restart, so that my layout is stable.
11. As a winmux user, I want a right Explorer panel showing a file tree, so that I can browse the project without leaving winmux.
12. As a winmux user, I want the Explorer rooted at my Workspace's folder, so that it shows the files relevant to what I'm working on.
13. As a winmux user, I want to expand and collapse folders in the Explorer, so that I can drill into the tree.
14. As a winmux user, I want to click a file in the Explorer, so that it opens as a FileViewer tab in the center Pane area.
15. As a winmux user, I want a "sync to current terminal" button on the Explorer, so that I can re-root the tree to my focused Session's working directory on demand.
16. As a winmux user, I want the Explorer root to stay put as I `cd` around, so that the tree doesn't thrash unless I ask it to sync.
17. As a winmux user, I want each Workspace to remember its own Explorer root, so that switching Workspaces shows the right folder.
18. As a winmux user, I want the Explorer to hide fully when toggled off, so that I can reclaim the space.
19. As a winmux user, I want a toggle button in the top-right corner of the Shell, so that I can show/hide the Explorer with the mouse.
20. As a winmux user, I want a keyboard shortcut to toggle the Explorer, so that I can do it from the keyboard.
21. As a winmux user, I want to drag the Explorer's inner edge to resize it, so that I can size the file tree to my needs.
22. As a winmux user, I want the Explorer's open state and width remembered after restart, so that my layout persists.
23. As a winmux user, I want the two panels to resize independently, so that the center Pane area flexes to fill whatever space remains.
24. As a winmux user, I want the panels to respect sensible minimum widths, so that I can't accidentally collapse them into an unusable sliver by dragging.
25. As a winmux user, I want switching Workspaces to update both the Navigator highlight and the Explorer root, so that both panels always reflect the active Workspace.
26. As a winmux user, I want the Explorer to sit behind an icon strip, so that the panel is ready to hold more tools later even though only Files ships now.
27. As a winmux user upgrading from the old 3-mode sidebar, I want my previous sidebar preference migrated to the new panel model, so that the app doesn't reset my layout on update.

## Implementation Decisions

- **Left panel becomes the Navigator.** Evolve the existing `SideBar` component from a Workspace-only rail into a Workspace→Session Navigator. Its expanded state lists Workspaces with their Sessions nested (click-to-focus); its compact icon-rail becomes the "collapsed-but-visible" state. The Navigator derives its tree from the Workspaces store (`useWorkspaces`) and the Sessions store (`useSessions`), and focuses a Session by combining the focus module (`useFocus`) with the layout query that locates a Session's leaf (`useLayout.findLeafBySession`).
- **Right panel is a new Explorer.** A new panel component renders a file tree behind an orca-style icon strip with a single **Files** tool active (leave affordance for future tools). Selecting a file opens it via the existing resources module (`useResources.openFile`), which already creates a Monaco `FileViewer` tab. Folder listing requires a new backend Tauri command to read a directory's entries; the frontend calls it through the existing Tauri bridge.
- **Explorer root resolution.** The Explorer is rooted at a **pinned per-Workspace root**, defaulting to the Workspace's `defaultCwd` (falling back to the focused Session's tracked cwd on first open). A "sync to current terminal" action re-roots to the focused Session's cwd. The pinned root is stored per Workspace by extending `WorkspaceSettings`, persisted through the Workspaces store envelope (`winmux:workspaces:v1`).
- **Headless panel-state module (the test seam).** Introduce a single module owning the Shell's non-visual state: left/right panel `open` booleans and pixel `width`s, with clamp-to-minimum and a serialize/deserialize pair for persistence. This replaces the old 3-mode `sidebarMode` cycle. Panel state persists in the prefs envelope (`winmux:prefs:v1`); the old `sidebarMode` value is migrated on load (expanded→open, compact→collapsed icon-rail, minimal→closed).
- **Between-region splitters.** Add drag-to-resize handles between the Navigator and the center content, and between the center content and the Explorer. This is new resize logic conceptually parallel to the existing pane splitter, but operating on panel widths rather than split ratios. Enforce minimum widths.
- **Shell composition.** The Shell's main row gains the Explorer as a new region alongside the existing Navigator + center content, with region splitters framing the center. The center Pane tree's own behavior (splits, quadrants, tab drag) is unchanged.
- **Toggle affordances.** Add show/hide toggle buttons to the top-bar (`MenuBar`) left and right corners. Register two actions in the keybindings registry (`ACTIONS`): a left-panel toggle (repurposing the current Ctrl+Shift+B "cycle sidebar" binding) and a new right-panel toggle.
- **ADR-0001 compliance.** The panels are terminal-multiplexer surfaces only — a Session Navigator and a file Explorer. No task/worktree lists, source-control tools, or account/usage meters. winmux keeps its existing `StatusBar`.

## Testing Decisions

- **Introduce Vitest** as the test runner (natural fit for the existing Vite + pnpm stack), runnable via a `pnpm test` script. This is the project's first automated test and establishes the seam pattern for later milestones (M2–M5).
- **Test external behavior only, at one headless seam.** Tests target pure functions / the headless panel-state and root-resolution logic — asserting returned state and persisted payloads, never internal calls, and without mounting Vue components. A good test here describes an observable outcome ("after toggling, the left panel reports closed"; "serialize→deserialize yields the same panel state"), not markup or method invocations.
- **Modules under test:**
  - *Panel-state module* — toggling open/closed; setting width with clamp-to-minimum; persistence round-trip (serialize then deserialize reproduces state; missing/unknown persisted fields are tolerated); migration from a legacy `sidebarMode` value to the new open/width state.
  - *Explorer-root resolution* — default root from the Workspace's `defaultCwd`; first-open fallback to the focused Session's cwd; "sync" updates the pinned root; switching Workspaces surfaces that Workspace's pinned root.
  - *Navigator selector* — given a set of Workspaces and Sessions, produces the grouped Workspace→Session tree with the active Workspace and focused Session flagged, mapping each Session to its Workspace.
- **Prior art:** none — this is the first test in the repo. Keep tests colocated with the module under test and follow the persistence-envelope convention already documented in the project.

## Out of Scope

- Milestones M2–M5: Quick Open, rich previews / editable `FileViewer` / drag-path (file power), Session activity notifications, and `winmuxctl` CLI parity.
- Any Explorer tool beyond **Files** (search, git). The icon strip reserves room but only Files ships in M1.
- Making `FileViewer` editable — it stays read-only until M3.
- All dropped orca features per ADR-0001: Mobile Companion, Parallel Worktrees, Design Mode, GitHub & Linear, Annotate AI Diffs, Account/Usage Tracking, Computer Use, and SSH/remote sessions.
- orca's bottom account-usage meters.
- Changes to the center Pane tree's split/quadrant/tab-drag behavior beyond framing it with the new region splitters.
- Automated tests for drag-resize/splitter dragging, DOM rendering, keybinding dispatch, and real directory I/O — these are covered by the PRD's manual verification, not Vitest.

## Further Notes

- Vocabulary follows `CONTEXT.md` (Shell, Navigator, Explorer, Pane, Split, Workspace, Session, Palette vs Quick Open). Rationale for keeping winmux a terminal multiplexer rather than an agent ADE is in `docs/adr/0001-terminal-multiplexer-not-ade.md`.
- The compact icon-rail is the Navigator's "collapsed-but-visible" state, preserving Workspace switching when the Session list is hidden; a fully-hidden state mirrors the Explorer for symmetry.
- Manual verification (from the PRD): run `pnpm tauri dev`; confirm both panels toggle/resize with persisted state, the Navigator lists Workspaces→Sessions with click-to-focus, and the Explorer opens rooted at the Workspace cwd with a working sync button and click-to-open into a FileViewer tab.
