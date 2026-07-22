# Spec: M2 — Quick Open (global fuzzy finder)

Status: ready-for-agent
Feature: orca-shell
Depends on: M1 (the orca Shell) — shipped
See also: `../PRD.md`, `CONTEXT.md`, `docs/adr/0001-terminal-multiplexer-not-ade.md`, `./01-orca-shell-m1.md`

## Problem Statement

As a winmux user I now have a Navigator and an Explorer, but jumping around still means
reaching for the mouse: to focus a Session I open the Navigator and click it, to switch
Workspaces I click the rail, to open a file I drill the Explorer tree, and to run one of my
saved commands I middle-click a terminal for the Palette. There is no single keyboard-first
way to say "take me to _that_" — a Session, a Workspace, a file, or a saved command — by
typing a few characters. Compared to orca's Quick Open (and VS Code's Ctrl+P), winmux has no
global fuzzy finder.

## Solution

Add a global **Quick Open** overlay, opened with a keybinding (Ctrl+P), that fuzzy-matches a
typed query against four sources at once and acts on the chosen result:

- **Workspaces** → switch the active Workspace.
- **Sessions** (in the active Workspace) → focus that Session's Pane and activate its tab.
- **Files** under the Explorer root → open as a `FileViewer` tab.
- **Commands** (the user's saved Palette snippets) → run in the focused Session.

Quick Open is distinct from the per-terminal **Palette** (per `CONTEXT.md`): the Palette is a
mouse-anchored, per-terminal command injector; Quick Open is a global, keyboard-first
*navigator*. winmux stays a terminal multiplexer — Quick Open only navigates/focuses/opens/runs
existing surfaces (per ADR-0001).

## User Stories

1. As a winmux user, I want to press a global shortcut to open Quick Open, so that I can navigate without reaching for the mouse.
2. As a winmux user, I want Quick Open to appear as a centered overlay with a text field focused, so that I can start typing immediately.
3. As a winmux user, I want to fuzzy-type a few characters and see ranked matches, so that I don't have to type exact names.
4. As a winmux user, I want each result to show an icon indicating its kind (Workspace / Session / File / Command), so that I can tell result types apart at a glance.
5. As a winmux user, I want to move the selection with the arrow keys and confirm with Enter, so that Quick Open is fully keyboard-driven.
6. As a winmux user, I want to dismiss Quick Open with Escape, so that I can back out without acting.
7. As a winmux user, I want to pick a Workspace result, so that it becomes the active Workspace.
8. As a winmux user, I want to pick a Session result, so that its Pane is focused and its tab activated.
9. As a winmux user, I want the Session results to show their display names (without the `w{index}.` prefix), so that they read naturally.
10. As a winmux user, I want to pick a file result, so that it opens as a `FileViewer` tab in the center Pane area.
11. As a winmux user, I want file results to be scoped to the active Workspace's Explorer root, so that they match what I'm working on.
12. As a winmux user, I want files to appear only once I've typed something, so that opening Quick Open doesn't dump thousands of paths at me.
13. As a winmux user, I want to pick a saved Command, so that it runs in my focused Session just like the Palette would run it.
14. As a winmux user, I want an empty query to show a useful default (my Workspaces and active-Workspace Sessions), so that Quick Open is useful even before I type.
15. As a winmux user, I want matches ranked so that closer matches (prefix / word-boundary / contiguous) sort above scattered ones, so that the best result is usually first.
16. As a winmux user, I want matching to be case-insensitive, so that I don't have to match capitalization.
17. As a winmux user, I want Quick Open capped at a sensible number of results per kind, so that the list stays scannable.
18. As a winmux user, I want Quick Open to close after I act on a result, so that I'm returned to my work.
19. As a winmux user, I want the Command source to be my existing saved Palette snippets, so that I don't maintain two command lists.
20. As a winmux user, I want the Quick Open keybinding to be reconfigurable like other actions, so that I can move it off Ctrl+P if it clashes with my shell habits.
21. As a winmux user, I want Quick Open to sit above the rest of the UI as its own overlay, so that it doesn't disturb my layout.
22. As a winmux user, I want the file list to skip heavy/irrelevant directories (e.g. `node_modules`, `.git`), so that results are relevant and fast.
23. As a winmux user, I want file results to display a path relative to the Explorer root, so that I can tell files with the same name apart.

## Implementation Decisions

- **New global overlay + composable.** Add a Quick Open overlay component mounted as a root-level
  sibling in `App.vue` (alongside `PalettePopover` / `SettingsModal` / `ConfirmModal`), `position:
  fixed` above the rest of the UI. A new composable (e.g. `useQuickOpen`) owns the transient
  open/closed + query + selection reactive state and exposes `open()/close()`. No persistence —
  Quick Open state is ephemeral.
- **The pure seam — `quick-open.ts` (the test seam).** Introduce one headless module owning the
  fuzzy matching, scoring, ranking, and cross-source aggregation, with **no Vue/DOM/Tauri
  dependency**. It takes plain candidate arrays (narrowed input types in the `navigator.ts`
  `Pick<>` style) plus the query string and returns a ranked, kind-tagged result list. It also
  encodes the "files hidden on empty query" rule and the per-kind result cap. The overlay and
  composable are thin reactive wrappers over this module (logic/UI split, mirroring
  `shell-panels.ts` ↔ `useShellPanels.ts`).
- **Sources and their actions.**
  - *Workspaces* — from `useWorkspaces` (`state.workspaces`: id/name/icon/index). Acting calls
    `setActiveWorkspace(id)`.
  - *Sessions* — from `useSessions.workspaceSessions` (active Workspace only). Label via
    `displayName` (`session-names.ts`). Acting focuses the Session using the existing path
    (`useLayout.activateSessionTab` + `useFocus.setFocusedLeaf`), the same combination `App.vue`'s
    `focusSessionByIndex` already uses.
  - *Files* — a bounded recursive index of files under the resolved Explorer root
    (`explorer-root.ts` `resolveExplorerRoot`). Acting calls `useResources.openFile(path)`.
  - *Commands* — the user's saved Palette snippets (`usePalette().items`, `PaletteItem
    { label, command, autoRun }`). Acting runs the command in the **focused Session** by writing to
    its PTY (`api.writeSession`, reusing `PalettePopover`'s activation path: append `\r` when
    `autoRun`). If there is no focused Session, Command results are shown but acting is a no-op.
- **File sourcing — new backend command.** Reading one directory level (`read_directory`) is not
  enough for a fuzzy file finder. Add a Tauri command that returns a **bounded, flat** list of
  file paths under a root: skip a fixed set of heavy/irrelevant directories (`node_modules`,
  `.git`, `target`, `dist`, and dotfile dirs), do not follow symlinks, and cap the total count.
  Mirror the M1 `read_directory` shape: an async command delegating to a **synchronous, unit-
  testable core** (`walk_files_sync`-style) via `spawn_blocking`. Expose it through the Tauri
  bridge (`src/lib/tauri.ts`) returning file entries with an absolute path and a root-relative
  display path. The frontend fetches the index when Quick Open opens (or lazily on first
  keystroke) and feeds it into `quick-open.ts`.
- **Keybinding.** Register a new action `view.quickOpen` in the `ACTIONS` registry
  (`keybindings.ts`), `category: "window"`, `default: { ctrl: true, key: "p" }`,
  `defaultPrefix: null`. Wire its handler in `App.vue`'s `ACTION_HANDLERS` to `useQuickOpen().open()`;
  dispatch flows through the existing global-shortcut path (`useGlobalShortcuts`, capture-phase).
  Ctrl+P is currently unused by any action and is reconfigurable through `useKeybindings`.
- **Overlay interaction.** Text input auto-focused on open; ↑/↓ move the selection; Enter acts on
  the highlighted result; Escape closes; acting on any result closes the overlay. Results render a
  kind icon (offline glyph, extending `offline-icons.ts`) and, for files, the root-relative path.
- **ADR-0001 compliance.** Quick Open only navigates to / opens / runs surfaces winmux already
  owns (Workspaces, Sessions, files, saved commands). No task/agent/worktree entries, no source
  control, no account/usage. It does not replace the Palette; both coexist.

## Testing Decisions

- **One Vitest seam: `quick-open.ts`.** Continue the M1 pattern — test observable outputs of the
  pure module, never component internals, without mounting Vue. A good test asserts "for this
  query over these candidates, the ranked result list is X" or "an empty query hides files",
  not markup or method calls.
- **Modules under test:**
  - *Quick Open ranking* (`quick-open.ts`) — subsequence fuzzy matching (matched vs not);
    case-insensitivity; ranking order (prefix / word-boundary / contiguous beat scattered);
    the empty-query rule (files excluded, Workspaces + Sessions shown); the per-kind cap; a
    no-match query returns no results; each result carries its kind tag and (for files) a
    root-relative display path.
  - *Backend file walk* — the synchronous core of the new recursive-list command, cargo-tested
    like M1's `read_directory` core: honors the skip-list (`node_modules`/`.git`/etc. pruned),
    respects the total cap, returns root-relative display paths, and does not follow symlinks.
- **Prior art:** M1's `shell-panels.test.ts` / `navigator.test.ts` / `explorer-root.test.ts`
  (frontend Vitest) and the `read_directory` cargo tests (backend). Keep tests colocated; follow
  the existing seam conventions.

## Out of Scope

- **Cross-Workspace Session jump** — Sessions are sourced from the active Workspace only. Focusing
  a Session that lives in another Workspace (switch-then-focus) is deferred.
- **Sigil scoping** (e.g. `>` for commands, `@` for symbols, `:` for line). M2 is a single flat
  ranked list over all sources; scoped modes are a later enhancement.
- **Persisted recents / frequency-boosted ranking.** No history is stored; ranking is purely
  match-quality based.
- **`.gitignore`-aware file filtering.** M2 uses a fixed skip-list, not per-repo ignore rules.
- **Live file-index invalidation.** The index is fetched on open (or first keystroke); it is not
  kept in sync with filesystem changes while Quick Open is open.
- **Milestones M3–M5:** file power (editable `FileViewer`, Markdown/PDF, drag-path), Session
  activity notifications, and `winmuxctl` CLI parity.

## Further Notes

- Vocabulary follows `CONTEXT.md` — note the explicit **Palette vs Quick Open** distinction there.
- Manual verification (from the PRD): run `pnpm tauri dev`; press Ctrl+P; confirm the overlay
  opens focused; typing fuzzy-filters across Workspaces / Sessions / files / commands; ↑/↓ + Enter
  navigates/focuses/opens/runs the right thing; Escape dismisses; picking a file opens a
  `FileViewer` tab; picking a command runs it in the focused terminal; files appear only after
  typing and skip `node_modules`/`.git`.
