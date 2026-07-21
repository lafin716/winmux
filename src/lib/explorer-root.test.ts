import { describe, it, expect } from "vitest";
import { resolveExplorerRoot, syncExplorerRoot } from "./explorer-root";

describe("resolveExplorerRoot", () => {
  it("prefers the pinned root over defaultCwd and the focused cwd", () => {
    const root = resolveExplorerRoot({
      pinnedRoot: "C:\\pinned",
      defaultCwd: "C:\\default",
      focusedCwd: "C:\\focused",
    });
    expect(root).toBe("C:\\pinned");
  });

  it("falls back to defaultCwd when no root is pinned", () => {
    const root = resolveExplorerRoot({
      pinnedRoot: undefined,
      defaultCwd: "C:\\default",
      focusedCwd: "C:\\focused",
    });
    expect(root).toBe("C:\\default");
  });

  it("falls back to the focused cwd on first open when nothing is pinned or configured", () => {
    const root = resolveExplorerRoot({
      pinnedRoot: undefined,
      defaultCwd: "",
      focusedCwd: "C:\\focused",
    });
    expect(root).toBe("C:\\focused");
  });

  it("returns undefined when nothing is known yet", () => {
    expect(resolveExplorerRoot({})).toBeUndefined();
    expect(
      resolveExplorerRoot({ pinnedRoot: "", defaultCwd: "   ", focusedCwd: null }),
    ).toBeUndefined();
  });

  it("treats a blank pinned root as unset and falls through", () => {
    const root = resolveExplorerRoot({
      pinnedRoot: "   ",
      defaultCwd: "C:\\default",
      focusedCwd: "C:\\focused",
    });
    expect(root).toBe("C:\\default");
  });
});

describe("syncExplorerRoot", () => {
  it("returns the focused cwd as the new pinned root", () => {
    expect(syncExplorerRoot("C:\\new")).toBe("C:\\new");
  });

  it("returns undefined when there is no focused cwd to sync to", () => {
    expect(syncExplorerRoot(undefined)).toBeUndefined();
    expect(syncExplorerRoot(null)).toBeUndefined();
    expect(syncExplorerRoot("  ")).toBeUndefined();
  });
});
