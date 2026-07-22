import { describe, it, expect } from "vitest";
import {
  rankQuickOpen,
  workspaceCandidates,
  sessionCandidates,
  commandCandidates,
  DEFAULT_CAP_PER_KIND,
  type QuickOpenCandidate,
} from "./quick-open";

describe("rankQuickOpen — subsequence matching", () => {
  it("keeps a candidate whose label is a subsequence of the query", () => {
    const out = rankQuickOpen(
      [{ kind: "command", id: "c1", label: "git status" }],
      "gs",
    );
    expect(out.map((r) => r.id)).toEqual(["c1"]);
  });

  it("drops a candidate whose label is not a subsequence of the query", () => {
    const out = rankQuickOpen(
      [{ kind: "command", id: "c1", label: "git status" }],
      "xyz",
    );
    expect(out).toEqual([]);
  });

  it("requires the query characters to appear in order", () => {
    const cands: QuickOpenCandidate[] = [
      { kind: "file", id: "f1", label: "package.json" },
    ];
    expect(rankQuickOpen(cands, "pkg").map((r) => r.id)).toEqual(["f1"]);
    // Same letters, wrong order — not a subsequence.
    expect(rankQuickOpen(cands, "pgk")).toEqual([]);
  });
});

describe("rankQuickOpen — case-insensitivity", () => {
  it("matches regardless of the case of query or label", () => {
    const cands: QuickOpenCandidate[] = [
      { kind: "command", id: "c1", label: "Git Status" },
    ];
    expect(rankQuickOpen(cands, "git").map((r) => r.id)).toEqual(["c1"]);
    expect(rankQuickOpen(cands, "GIT").map((r) => r.id)).toEqual(["c1"]);
  });
});

describe("rankQuickOpen — ranking order", () => {
  it("sorts prefix, then word-boundary, then contiguous, above scattered", () => {
    const cands: QuickOpenCandidate[] = [
      // Intentionally shuffled so ordering can only come from scoring.
      { kind: "command", id: "scattered", label: "saber" },
      { kind: "command", id: "contiguous", label: "observer" },
      { kind: "command", id: "prefix", label: "server" },
      { kind: "command", id: "word", label: "my-server" },
    ];
    const out = rankQuickOpen(cands, "ser");
    expect(out.map((r) => r.id)).toEqual([
      "prefix",
      "word",
      "contiguous",
      "scattered",
    ]);
  });
});

describe("rankQuickOpen — empty-query rule", () => {
  it("shows Workspaces and Sessions but excludes files and commands", () => {
    const cands: QuickOpenCandidate[] = [
      { kind: "workspace", id: "w1", label: "Alpha" },
      { kind: "session", id: "s1", label: "build" },
      { kind: "file", id: "f1", label: "main.rs" },
      { kind: "command", id: "cmd1", label: "deploy" },
    ];
    const out = rankQuickOpen(cands, "");
    expect(out.map((r) => r.kind)).toEqual(["workspace", "session"]);
    expect(out.map((r) => r.id)).toEqual(["w1", "s1"]);
  });

  it("treats a whitespace-only query as empty", () => {
    const cands: QuickOpenCandidate[] = [
      { kind: "workspace", id: "w1", label: "Alpha" },
      { kind: "file", id: "f1", label: "main.rs" },
    ];
    expect(rankQuickOpen(cands, "   ").map((r) => r.id)).toEqual(["w1"]);
  });

  it("groups Workspaces before Sessions regardless of input order", () => {
    const cands: QuickOpenCandidate[] = [
      { kind: "session", id: "s1", label: "build" },
      { kind: "workspace", id: "w1", label: "Alpha" },
      { kind: "session", id: "s2", label: "logs" },
      { kind: "workspace", id: "w2", label: "Beta" },
    ];
    const out = rankQuickOpen(cands, "");
    expect(out.map((r) => r.id)).toEqual(["w1", "w2", "s1", "s2"]);
  });
});

describe("rankQuickOpen — per-kind cap", () => {
  it("caps the number of results for each kind", () => {
    const cands: QuickOpenCandidate[] = Array.from({ length: 6 }, (_, i) => ({
      kind: "command" as const,
      id: `c${i}`,
      label: `alpha-${i}`,
    }));
    const out = rankQuickOpen(cands, "a", { capPerKind: 3 });
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.kind === "command")).toBe(true);
  });

  it("caps each kind independently", () => {
    const cands: QuickOpenCandidate[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        kind: "workspace" as const,
        id: `w${i}`,
        label: `alpha-ws-${i}`,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        kind: "command" as const,
        id: `c${i}`,
        label: `alpha-cmd-${i}`,
      })),
    ];
    const out = rankQuickOpen(cands, "alpha", { capPerKind: 2 });
    expect(out.filter((r) => r.kind === "workspace")).toHaveLength(2);
    expect(out.filter((r) => r.kind === "command")).toHaveLength(2);
  });

  it("defaults the per-kind cap to DEFAULT_CAP_PER_KIND", () => {
    const cands: QuickOpenCandidate[] = Array.from(
      { length: DEFAULT_CAP_PER_KIND + 4 },
      (_, i) => ({ kind: "command" as const, id: `c${i}`, label: `alpha-${i}` }),
    );
    const out = rankQuickOpen(cands, "a");
    expect(out).toHaveLength(DEFAULT_CAP_PER_KIND);
  });
});

describe("rankQuickOpen — no matches", () => {
  it("returns an empty list when nothing matches a non-empty query", () => {
    const cands: QuickOpenCandidate[] = [
      { kind: "workspace", id: "w1", label: "Alpha" },
      { kind: "session", id: "s1", label: "build" },
    ];
    expect(rankQuickOpen(cands, "zzzz")).toEqual([]);
  });
});

describe("rankQuickOpen — kind tagging", () => {
  it("carries the kind, id, label and subtitle through to the result", () => {
    const out = rankQuickOpen(
      [{ kind: "file", id: "f1", label: "main.rs", subtitle: "src/main.rs" }],
      "main",
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("file");
    expect(out[0].id).toBe("f1");
    expect(out[0].label).toBe("main.rs");
    expect(out[0].subtitle).toBe("src/main.rs");
  });
});

describe("candidate builders", () => {
  it("workspaceCandidates maps id/name to a workspace candidate", () => {
    // Bound to a variable so the extra store fields (icon/index) exercise that
    // the builder accepts the real Workspace shape, not just a minimal literal.
    const workspaces = [{ id: "w1", name: "Alpha", icon: "A", index: 1 }];
    expect(workspaceCandidates(workspaces)).toEqual([
      { kind: "workspace", id: "w1", label: "Alpha" },
    ]);
  });

  it("sessionCandidates strips the w{index}. prefix via displayName", () => {
    expect(
      sessionCandidates([
        { id: "s1", name: "w1.build" },
        { id: "s2", name: "w2.logs" },
      ]),
    ).toEqual([
      { kind: "session", id: "s1", label: "build" },
      { kind: "session", id: "s2", label: "logs" },
    ]);
  });

  it("commandCandidates keeps the label and carries the command as subtitle", () => {
    // Bound to a variable so the extra PaletteItem field (autoRun) exercises that
    // the builder accepts the real saved-command shape.
    const saved = [
      { id: "c1", label: "Deploy", command: "npm run deploy", autoRun: true },
    ];
    expect(commandCandidates(saved)).toEqual([
      { kind: "command", id: "c1", label: "Deploy", subtitle: "npm run deploy" },
    ]);
  });

  it("commandCandidates falls back to the command text when the label is blank", () => {
    const saved = [{ id: "c1", label: "  ", command: "ls -la", autoRun: false }];
    expect(commandCandidates(saved)).toEqual([
      { kind: "command", id: "c1", label: "ls -la", subtitle: "ls -la" },
    ]);
  });
});
