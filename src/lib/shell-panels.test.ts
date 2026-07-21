import { describe, it, expect } from "vitest";
import {
  createDefaultPanelsState,
  togglePanelOpen,
  toggleLeftCollapsed,
  clampPanelWidth,
  setPanelWidth,
  serializePanels,
  deserializePanels,
  migrateLegacySidebarMode,
  panelsFromStored,
  PANEL_LIMITS,
} from "./shell-panels";

describe("panel open/closed", () => {
  it("toggles a panel from open to closed and back", () => {
    const state = createDefaultPanelsState();
    state.right.open = true;

    togglePanelOpen(state, "right");
    expect(state.right.open).toBe(false);

    togglePanelOpen(state, "right");
    expect(state.right.open).toBe(true);
  });

  it("toggles panels independently", () => {
    const state = createDefaultPanelsState();
    state.left.open = true;
    state.right.open = true;

    togglePanelOpen(state, "left");

    expect(state.left.open).toBe(false);
    expect(state.right.open).toBe(true);
  });

  it("toggles the left panel between full and collapsed icon-rail", () => {
    const state = createDefaultPanelsState();
    state.left.collapsed = false;

    toggleLeftCollapsed(state);
    expect(state.left.collapsed).toBe(true);

    toggleLeftCollapsed(state);
    expect(state.left.collapsed).toBe(false);
  });
});

describe("width clamping", () => {
  it("clamps a below-minimum width up to the minimum", () => {
    expect(clampPanelWidth("left", 10)).toBe(PANEL_LIMITS.left.min);
    expect(clampPanelWidth("right", 0)).toBe(PANEL_LIMITS.right.min);
  });

  it("clamps an above-maximum width down to the maximum", () => {
    expect(clampPanelWidth("left", 9999)).toBe(PANEL_LIMITS.left.max);
  });

  it("leaves a width within range untouched", () => {
    expect(clampPanelWidth("left", 240)).toBe(240);
  });

  it("setPanelWidth stores the clamped width on the panel", () => {
    const state = createDefaultPanelsState();
    setPanelWidth(state, "left", 5);
    expect(state.left.width).toBe(PANEL_LIMITS.left.min);
  });
});

describe("persistence round-trip", () => {
  it("serialize then deserialize reproduces the same state", () => {
    const state = createDefaultPanelsState();
    state.left.open = false;
    state.left.collapsed = true;
    state.left.width = 240;
    state.right.open = true;
    state.right.width = 320;

    const restored = deserializePanels(serializePanels(state));

    expect(restored).toEqual(state);
  });

  it("serialize produces a plain snapshot decoupled from the source state", () => {
    const state = createDefaultPanelsState();
    const snapshot = serializePanels(state);
    state.left.width = 999;
    expect(snapshot.left.width).toBe(PANEL_LIMITS.left.default);
  });

  it("fills in defaults for missing fields", () => {
    const restored = deserializePanels({ left: { open: false } });
    expect(restored.left.open).toBe(false);
    expect(restored.left.width).toBe(PANEL_LIMITS.left.default);
    expect(restored.right).toEqual(createDefaultPanelsState().right);
  });

  it("ignores unknown fields and clamps out-of-range widths", () => {
    const restored = deserializePanels({
      left: { open: true, width: 3, bogus: "x" },
      right: { open: true, width: 9999 },
      extra: 42,
    });
    expect(restored.left.width).toBe(PANEL_LIMITS.left.min);
    expect(restored.right.width).toBe(PANEL_LIMITS.right.max);
    expect(restored.left).not.toHaveProperty("bogus");
  });

  it("returns defaults for non-object input", () => {
    expect(deserializePanels(null)).toEqual(createDefaultPanelsState());
    expect(deserializePanels(undefined)).toEqual(createDefaultPanelsState());
    expect(deserializePanels("nope")).toEqual(createDefaultPanelsState());
  });

  it("never reports the right panel as collapsed", () => {
    const restored = deserializePanels({ right: { open: true, collapsed: true } });
    expect(restored.right.collapsed).toBe(false);
  });
});

describe("legacy sidebarMode migration", () => {
  it("maps expanded to an open, uncollapsed left panel", () => {
    const state = migrateLegacySidebarMode("expanded");
    expect(state.left.open).toBe(true);
    expect(state.left.collapsed).toBe(false);
  });

  it("maps compact to a collapsed icon-rail (open but collapsed)", () => {
    const state = migrateLegacySidebarMode("compact");
    expect(state.left.open).toBe(true);
    expect(state.left.collapsed).toBe(true);
  });

  it("maps minimal to a closed left panel", () => {
    const state = migrateLegacySidebarMode("minimal");
    expect(state.left.open).toBe(false);
  });

  it("leaves the right panel at its default (hidden) after migration", () => {
    const state = migrateLegacySidebarMode("expanded");
    expect(state.right).toEqual(createDefaultPanelsState().right);
  });

  it("falls back to defaults for an unknown or absent mode", () => {
    expect(migrateLegacySidebarMode(undefined)).toEqual(createDefaultPanelsState());
    expect(migrateLegacySidebarMode("wat")).toEqual(createDefaultPanelsState());
  });
});

describe("panelsFromStored", () => {
  it("prefers a stored panels payload over the legacy field", () => {
    const state = panelsFromStored({
      panels: { left: { open: false, collapsed: false, width: 200 } },
      sidebarMode: "expanded",
    });
    expect(state.left.open).toBe(false);
  });

  it("migrates the legacy field when no panels payload exists", () => {
    const state = panelsFromStored({ sidebarMode: "minimal" });
    expect(state.left.open).toBe(false);
  });

  it("returns defaults for empty stored prefs", () => {
    expect(panelsFromStored({})).toEqual(createDefaultPanelsState());
  });
});
