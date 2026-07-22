# Spec: M3 — File power (rich FileViewer, edit+save, drag-path)

Status: ready-for-agent
Feature: orca-shell
Depends on: M1 (shell), M2 (Quick Open) — shipped
See also: `../PRD.md`, `CONTEXT.md`, `docs/adr/0001-terminal-multiplexer-not-ade.md`, `./01-orca-shell-m1.md`, `./02-orca-quick-open-m2.md`

## Problem Statement

As a winmux user I can now open files into a `FileViewer` tab, but the viewer is thin: Markdown
shows as raw source, PDFs won't preview at all (they fall back to "binary"), and every file is
strictly read-only — I can't fix a typo and save without leaving winmux. And when I want a file's
path on my terminal command line, I have to type or paste it by hand; I can't just drag the file
from the Explorer onto the terminal. Compared to orca, winmux's file surface is view-only and
disconnected from the terminal.

## Solution

Give the file surface real power, in three parts:

1. **Rich rendering.** The `FileViewer` renders **Markdown** as formatted output and **previews
   PDFs**, in addition to the existing text (Monaco) and image views. A pure resolver decides the
   view mode from the file's preview metadata.
2. **Edit + save.** The Monaco editor becomes **editable** for text/code files, tracks a **dirty**
   state, and **saves** back to disk (Ctrl+S) via a new backend write command.
3. **Drag-path.** A file can be **dragged from the Explorer onto a Terminal** to insert its path
   at the cursor, quoted if it contains spaces.

winmux stays a terminal multiplexer — this is file *viewing/editing* and a terminal convenience,
not agent/task tooling (per ADR-0001).

## User Stories

1. As a winmux user, I want Markdown files to render as formatted text (headings, lists, code, links), so that docs are readable without mentally parsing the source.
2. As a winmux user, I want the Markdown renderer to not execute embedded raw HTML/scripts, so that opening an untrusted file is safe.
3. As a winmux user, I want to preview a PDF inside a FileViewer tab, so that I can read it without launching an external app.
4. As a winmux user, I want image and plain-text/code files to keep working exactly as before, so that rich rendering is purely additive.
5. As a winmux user, I want the view mode (markdown / pdf / image / text) chosen automatically from the file, so that I don't pick a viewer manually.
6. As a winmux user, I want text and code files to be editable in the Monaco editor, so that I can make quick changes in place.
7. As a winmux user, I want the tab to show a dirty indicator when I have unsaved changes, so that I don't lose edits unknowingly.
8. As a winmux user, I want to press Ctrl+S to save the file to disk, so that my edits persist.
9. As a winmux user, I want the dirty indicator to clear after a successful save, so that I know the file is written.
10. As a winmux user, I want a save failure to surface as an error rather than silently succeeding, so that I can trust the indicator.
11. As a winmux user, I want the in-memory tab content to reflect what I saved, so that reopening or re-focusing the tab shows my saved text.
12. As a winmux user, I want Markdown and PDF views to stay read-only, so that "edit+save" is scoped to the text editor and I'm not surprised by an editable rendered view.
13. As a winmux user, I want to drag a file from the Explorer, so that I can drop it where I need it.
14. As a winmux user, I want to drop a dragged file onto a Terminal to insert its path, so that I can build a command without typing the path.
15. As a winmux user, I want an inserted path to be quoted when it contains spaces, so that the shell treats it as one argument.
16. As a winmux user, I want dragging a file onto a Terminal to not be confused with dragging a Pane tab, so that the two drag gestures don't interfere.
17. As a winmux user, I want the dropped path written to the focused terminal's input the same way typed/pasted text is, so that it behaves predictably (including IME/paste rules).
18. As a winmux user, I want dropping a folder (or a non-file drag) onto a Terminal to be ignored or handled sensibly, so that I don't get garbage on my command line.

## Implementation Decisions

- **View-mode resolver (pure seam).** Introduce a headless module (e.g. `viewer-mode.ts`) with a
  pure function that maps a `FilePreview` to a view mode — `markdown` when the language is
  markdown, `pdf` when the file is a PDF, `image`/`text` as today, plus the existing
  `binary`/`too_large` fallbacks. `FileViewer.vue` switches on the resolver's output instead of
  branching inline on `preview.kind`. No Vue/DOM/Tauri dependency; unit-tested directly (the
  `navigator.ts`/`quick-open.ts` seam style).
- **Markdown rendering.** Add a Markdown renderer dependency configured to **not** emit
  executable raw HTML (e.g. `markdown-it` with `html: false`, or an equivalent + sanitization).
  Render `preview.text` to safe HTML in a scoped, read-only view. No editing of rendered Markdown
  in M3.
- **PDF preview.** Prefer the platform webview's native PDF capability (WebView2 on Windows):
  feed the file to an embedded viewer via Tauri's asset URL (`convertFileSrc` / asset protocol),
  enabling whatever `tauri.conf.json` asset-scope config that requires; fall back to a JS PDF
  renderer (`pdfjs-dist`) only if the native path proves unworkable. The backend marks PDFs so the
  frontend knows to use the PDF view: extend the preview so `application/pdf` is recognized
  (add `pdf` to the extension→(language,mime) map) and surface a `pdf` view mode (the resolver may
  key off mime/extension rather than requiring a new server `kind`, whichever is cleaner — but do
  not break the existing `kind` union consumers).
- **Editable Monaco + dirty state.** For the `text` view mode, create the Monaco editor with
  `readOnly: false`. Track dirty via `onDidChangeModelContent` (compare against the last-saved
  text). Extend the file tab model (`useResources` `FileTab`) with a `dirty` flag and add mutators
  to set dirty and to update the stored `preview.text` after a save, so `PaneTabs` can show a
  dirty indicator and a re-focused tab keeps saved content. Markdown/PDF/image views remain
  read-only.
- **Save command (backend).** Add a Tauri command `write_file(path, contents) -> Result<(),
  String>` following the established in-process pattern: a thin async `#[tauri::command]` wrapper
  delegating to a synchronous, unit-testable core (`write_file_sync`) via `spawn_blocking`;
  register it in `lib.rs`'s `invoke_handler`; expose it through the Tauri bridge (`tauri.ts`,
  `api.writeFile`). Ctrl+S in the editor calls it with the editor's current text; on success clear
  dirty and update the stored preview; on failure surface an error (do not clear dirty).
- **Drag-path.** Make Explorer file rows `draggable` (dir rows need not be), mirroring
  `PaneTabs.vue`'s `dragstart`/`dataTransfer` pattern, but on a **distinct dataTransfer MIME type**
  (e.g. `application/x-winmux-file`) carrying the absolute path — so a file drag is
  distinguishable from a Pane-tab drag (which uses `text/plain` = sessionId). Add `dragover`
  (preventDefault to allow drop) and `drop` handlers to `Terminal.vue`'s host element; on drop of a
  winmux-file payload, format the path and write it to the session PTY the same way
  typed/pasted/`compositionend` text is written (`api.writeSession(id, stringToBase64(text))`).
  A non-file drag or a directory payload is ignored.
- **Path-insertion formatter (pure seam).** Introduce a pure helper (e.g. `path-insert.ts`)
  that formats a filesystem path for terminal insertion — quote when it contains spaces (or other
  shell-significant whitespace), pass through otherwise. Unit-tested directly.
- **ADR-0001 compliance.** All three parts operate on files the user already opened/holds — richer
  viewing, editing, and a terminal convenience. No task/agent/worktree/source-control surfaces.

## Testing Decisions

- **Test external behavior at pure seams; no component mounting.** Continue the M1/M2 pattern.
- **Frontend Vitest seams:**
  - *View-mode resolver* (`viewer-mode.ts`) — markdown for markdown language; pdf for a PDF
    file; image/text as before; binary/too_large fall through; unknown/edge inputs resolve
    sensibly.
  - *Path-insertion formatter* (`path-insert.ts`) — a path with spaces is quoted as a single
    argument; a plain path is unchanged; empty/edge inputs handled.
- **Backend cargo seam:**
  - *`write_file_sync`* — writes contents to a path and reads back equal; overwrites an existing
    file; errors on an unwritable target (e.g. a directory path). Mirror the temp-dir approach of
    the existing `directory_tests`/`file_walk_tests`/`resource_tests` modules.
  - If the PDF path adds/extends preview kind decisions in `read_file_preview_sync`, cover the new
    branch (a `.pdf` file resolves to the PDF/data path, honoring the size cap).
- **Prior art:** M1/M2 frontend `*.test.ts` seams and the `commands.rs` `#[cfg(test)]` modules.
- **Out of scope for automated tests:** actual Monaco editing/keystrokes, real PDF/Markdown
  rendering output, drag-and-drop DOM events, and the asset-protocol wiring — these are covered by
  the PRD's manual verification.

## Out of Scope

- Editing/saving Markdown as raw source (Markdown stays a read-only rendered view in M3).
- PDF editing/annotation, multi-tool PDF navigation beyond basic preview/scroll.
- Rich rendering for other formats (Office docs, notebooks, SVG-as-render, etc.).
- Auto-save, save-all, external-change/file-watch reconciliation, and conflict detection.
- Dragging files *out* of winmux, or dragging into panes other than a Terminal (e.g. drop-to-open).
- Milestones M4–M5: Session activity notifications and `winmuxctl` CLI parity.

## Further Notes

- Vocabulary follows `CONTEXT.md`.
- Manual verification (from the PRD): run `pnpm tauri dev`; open a Markdown file (renders
  formatted, raw HTML not executed) and a PDF (previews); open a text/code file, edit it, see the
  dirty indicator, press Ctrl+S, confirm it clears and the file on disk changed; drag a file from
  the Explorer onto a Terminal and confirm its (quoted-if-spaced) path is inserted without
  clashing with Pane-tab dragging.
