// Pure helper for inserting a filesystem path into a terminal's input line.
//
// When a file is dragged from the Explorer and dropped onto a Terminal, its
// absolute path is written to the PTY. If the path contains whitespace the
// shell would split it into several arguments, so it is wrapped in double
// quotes to stay a single argument. A path with no whitespace passes through
// untouched. No Vue/DOM/Tauri dependency, so this is unit-tested directly (the
// project's pure test seam style, like `quick-open.ts`).

// dataTransfer MIME type carrying an Explorer file drag. Distinct from the
// Pane-tab drag (which uses `text/plain` = sessionId), so the two gestures
// never interfere. Shared here so the Explorer (drag source) and Terminal
// (drop target) can't drift apart on a typo.
export const FILE_DRAG_MIME = "application/x-winmux-file";

/**
 * Format a filesystem path for insertion at a terminal's cursor.
 *
 * Quotes the path when it contains whitespace (space, tab, etc.) so the shell
 * treats it as one argument; otherwise returns it unchanged. Empty input yields
 * an empty string (nothing to insert).
 */
export function formatPathForInsertion(path: string): string {
  if (!path) return "";
  if (/\s/.test(path)) return `"${path}"`;
  return path;
}
