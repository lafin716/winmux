import { describe, it, expect } from "vitest";
import { resolveViewerMode } from "./viewer-mode";

describe("resolveViewerMode", () => {
  it("renders a markdown-language text file as markdown", () => {
    expect(resolveViewerMode({ kind: "text", language: "markdown" })).toBe("markdown");
  });

  it("routes a pdf-kind preview to the pdf view", () => {
    expect(resolveViewerMode({ kind: "pdf", language: "pdf" })).toBe("pdf");
  });

  it("keeps image-kind previews on the image view", () => {
    expect(resolveViewerMode({ kind: "image", language: "image" })).toBe("image");
  });

  it("shows a non-markdown text file as text", () => {
    expect(resolveViewerMode({ kind: "text", language: "rust" })).toBe("text");
    expect(resolveViewerMode({ kind: "text", language: "plaintext" })).toBe("text");
  });

  it("falls through binary and too_large kinds unchanged", () => {
    expect(resolveViewerMode({ kind: "binary", language: "plaintext" })).toBe("binary");
    expect(resolveViewerMode({ kind: "too_large", language: "rust" })).toBe("too_large");
  });

  it("lets the kind win over the language for non-text kinds", () => {
    // A markdown language on an image/pdf/binary preview must not hijack the view.
    expect(resolveViewerMode({ kind: "image", language: "markdown" })).toBe("image");
    expect(resolveViewerMode({ kind: "pdf", language: "markdown" })).toBe("pdf");
    expect(resolveViewerMode({ kind: "binary", language: "markdown" })).toBe("binary");
  });
});
