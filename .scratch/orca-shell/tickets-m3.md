# Tickets: orca-shell M3 (File power)

Vertical slices for M3 of the orca-shell effort — richer `FileViewer`, an editable+saveable
Monaco editor, and drag-a-file-to-Terminal path insertion. Source spec:
`.scratch/orca-shell/issues/03-orca-file-power-m3.md`. Vocabulary follows `CONTEXT.md`; the
"terminal multiplexer, not agent ADE" guardrail is `docs/adr/0001-terminal-multiplexer-not-ade.md`.

Work the **frontier**: any ticket whose blockers are all done. Dependency shape:
Ticket 1 → Ticket 2 (both touch `FileViewer.vue`; edit mode builds on the view-mode resolver);
Ticket 3 is independent and can start any time. Clear context between tickets.

## Rich FileViewer (Markdown render + PDF preview)

**What to build:** The `FileViewer` renders Markdown files as formatted, read-only output and
previews PDFs inside the tab, while image and text/code files keep working exactly as before. A
new pure view-mode resolver decides which view to show from the file's preview metadata, so the
component stops branching inline. This also introduces the project's view-mode test seam.

**Blocked by:** None — can start immediately.

- [ ] A pure `viewer-mode.ts` resolver maps a `FilePreview` to a view mode (markdown / pdf / image / text, with binary/too_large fall-through) and has passing Vitest tests.
- [ ] Markdown files render as formatted output (headings, lists, code, links) in a read-only, scoped view; embedded raw HTML/scripts are not executed.
- [ ] PDF files preview inside the FileViewer tab (native webview viewer via Tauri asset URL preferred; JS renderer only if needed), including any `tauri.conf.json` asset-scope config required.
- [ ] The backend recognizes `application/pdf` (extension→mime map) so the frontend can route PDFs to the PDF view without breaking existing `kind`-union consumers; any new backend preview branch is cargo-tested.
- [ ] Image and plain text/code files render unchanged; `FileViewer.vue` switches on the resolver output.

## Editable Monaco + save

**What to build:** For text/code files, the Monaco editor becomes editable, tracks unsaved
changes with a dirty indicator on the tab, and saves to disk on Ctrl+S via a new backend write
command. After a successful save the dirty state clears and the tab's in-memory content reflects
what was written; a failed save surfaces an error. Markdown/PDF/image views stay read-only.

**Blocked by:** Rich FileViewer (Markdown render + PDF preview).

- [ ] A new Tauri command `write_file(path, contents)` writes a file via a synchronous, unit-testable core (`write_file_sync`), registered in `lib.rs` and exposed through the Tauri bridge; it has passing cargo tests (round-trip write/read, overwrite, error on an unwritable/directory target).
- [ ] The Monaco editor is editable for the `text` view mode; Markdown/PDF/image stay read-only.
- [ ] The file tab shows a dirty indicator while there are unsaved changes (tracked via editor content vs last-saved text).
- [ ] Ctrl+S saves the current editor content to the file's path; on success the dirty indicator clears and the tab's stored `preview.text` is updated; on failure an error is surfaced and dirty is not cleared.

## Drag file from Explorer to Terminal (path insert)

**What to build:** A file dragged from the Explorer and dropped onto a Terminal inserts that
file's path into the terminal input at the cursor, quoted when it contains spaces. The file-drag
gesture uses a distinct payload so it never clashes with Pane-tab dragging, and the path is
written to the PTY the same way typed/pasted text is.

**Blocked by:** None — independent (can run any time; sequenced after the others to avoid churn).

- [ ] Explorer file rows are `draggable` and start a drag carrying the file's absolute path on a distinct dataTransfer MIME type (e.g. `application/x-winmux-file`), separate from Pane-tab drags.
- [ ] `Terminal.vue` accepts a drop (dragover preventDefault) and, for a winmux-file payload, writes the formatted path to the session PTY via the existing write path; non-file/directory drags are ignored.
- [ ] A pure `path-insert.ts` formatter quotes a path containing spaces as a single argument and passes a plain path through, with passing Vitest tests.
