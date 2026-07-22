import { describe, it, expect } from "vitest";
import { formatPathForInsertion } from "./path-insert";

describe("formatPathForInsertion — plain paths pass through", () => {
  it("leaves a Windows path without spaces unchanged", () => {
    expect(formatPathForInsertion("C:\\Users\\me\\notes.txt")).toBe(
      "C:\\Users\\me\\notes.txt",
    );
  });

  it("leaves a POSIX-style path without spaces unchanged", () => {
    expect(formatPathForInsertion("/home/me/project/main.rs")).toBe(
      "/home/me/project/main.rs",
    );
  });

  it("leaves a bare filename unchanged", () => {
    expect(formatPathForInsertion("README.md")).toBe("README.md");
  });
});

describe("formatPathForInsertion — spaced paths are quoted", () => {
  it("quotes a Windows path containing spaces as one argument", () => {
    expect(formatPathForInsertion("C:\\Program Files\\app\\run.exe")).toBe(
      '"C:\\Program Files\\app\\run.exe"',
    );
  });

  it("quotes a path whose filename contains a space", () => {
    expect(formatPathForInsertion("C:\\docs\\my report.pdf")).toBe(
      '"C:\\docs\\my report.pdf"',
    );
  });

  it("quotes when the path contains a tab (shell-significant whitespace)", () => {
    expect(formatPathForInsertion("C:\\a\tb.txt")).toBe('"C:\\a\tb.txt"');
  });
});

describe("formatPathForInsertion — edge inputs", () => {
  it("returns an empty string for empty input", () => {
    expect(formatPathForInsertion("")).toBe("");
  });
});
