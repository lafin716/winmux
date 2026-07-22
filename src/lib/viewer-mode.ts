// Pure resolver for the FileViewer: given a file's preview metadata, decide
// which view the component should render. `FileViewer.vue` switches on this
// output instead of branching inline on `preview.kind`, so the routing rules
// live in one headless, unit-tested place (the `navigator.ts`/`quick-open.ts`
// seam style — no Vue/DOM/Tauri dependency).
//
// Rules: binary/too_large/image/pdf come straight from the backend `kind`; a
// text preview whose language is `markdown` renders as formatted Markdown, and
// every other text preview stays in the Monaco text view.

import type { FilePreview } from "./tauri";

export type ViewerMode =
  | "markdown"
  | "pdf"
  | "image"
  | "text"
  | "binary"
  | "too_large";

/** The narrow slice of a `FilePreview` the resolver actually reads. */
export type ViewerModeInput = Pick<FilePreview, "kind" | "language">;

export function resolveViewerMode(preview: ViewerModeInput): ViewerMode {
  switch (preview.kind) {
    case "binary":
      return "binary";
    case "too_large":
      return "too_large";
    case "image":
      return "image";
    case "pdf":
      return "pdf";
    case "text":
      return preview.language === "markdown" ? "markdown" : "text";
  }
}
