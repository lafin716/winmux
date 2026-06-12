import type { LayoutNode, WorkspaceStore } from "./layout-types";
import type { Keybinding } from "./keybindings";
import type { TerminalConfig } from "./terminal-config";

const STORAGE_KEY = "winmux:workspaces:v1";
const KEYBINDINGS_KEY = "winmux:keybindings:v1";
const PREFS_KEY = "winmux:prefs:v1";
const PALETTE_KEY = "winmux:palette:v1";

interface Persisted {
  version: 1;
  store: WorkspaceStore;
}

interface PersistedKeybindings {
  version: 1;
  bindings: Record<string, Keybinding>;
}

export type SidebarMode = "compact" | "expanded" | "minimal";

export interface Prefs {
  skipKillSessionConfirm: boolean;
  sidebarMode: SidebarMode;
  defaultTerminal: TerminalConfig;
}

interface PersistedPrefs {
  version: 1;
  prefs: Prefs;
}

export function loadWorkspaces(): WorkspaceStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.version !== 1 || !parsed.store) return null;
    return parsed.store;
  } catch (e) {
    console.warn("loadWorkspaces failed", e);
    return null;
  }
}

export function saveWorkspaces(store: WorkspaceStore): void {
  try {
    const cleanStore: WorkspaceStore = {
      activeWorkspaceId: store.activeWorkspaceId,
      workspaces: store.workspaces.map((workspace) => ({
        ...workspace,
        settings: {
          ...workspace.settings,
          terminal: workspace.settings.terminal
            ? {
                ...workspace.settings.terminal,
                args: [...workspace.settings.terminal.args],
              }
            : null,
        },
        layout: withoutTransientTabs(workspace.layout),
      })),
    };
    const payload: Persisted = { version: 1, store: cleanStore };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("saveWorkspaces failed", e);
  }
}

function withoutTransientTabs(node: LayoutNode): LayoutNode {
  if (node.kind === "leaf") {
    const tabs = node.tabs.filter((id) => !id.startsWith("resource-"));
    return {
      ...node,
      tabs,
      activeTabId: node.activeTabId && tabs.includes(node.activeTabId)
        ? node.activeTabId
        : (tabs[0] ?? null),
    };
  }
  return {
    ...node,
    sizes: [...node.sizes],
    children: node.children.map(withoutTransientTabs),
  };
}

export function loadKeybindings(): Record<string, Keybinding> | null {
  try {
    const raw = localStorage.getItem(KEYBINDINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedKeybindings;
    if (parsed.version !== 1 || !parsed.bindings) return null;
    return parsed.bindings;
  } catch (e) {
    console.warn("loadKeybindings failed", e);
    return null;
  }
}

export function saveKeybindings(bindings: Record<string, Keybinding>): void {
  try {
    const payload: PersistedKeybindings = { version: 1, bindings };
    localStorage.setItem(KEYBINDINGS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("saveKeybindings failed", e);
  }
}

export function loadPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPrefs;
    if (parsed.version !== 1 || !parsed.prefs) return null;
    return parsed.prefs;
  } catch (e) {
    console.warn("loadPrefs failed", e);
    return null;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    const payload: PersistedPrefs = { version: 1, prefs };
    localStorage.setItem(PREFS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("savePrefs failed", e);
  }
}

export interface PaletteItem {
  id: string;
  label: string;
  command: string;
  autoRun: boolean;
}

interface PersistedPalette {
  version: 1;
  items: PaletteItem[];
}

export function loadPaletteItems(): PaletteItem[] | null {
  try {
    const raw = localStorage.getItem(PALETTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPalette;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return null;
    return parsed.items;
  } catch (e) {
    console.warn("loadPaletteItems failed", e);
    return null;
  }
}

export function savePaletteItems(items: PaletteItem[]): void {
  try {
    const payload: PersistedPalette = { version: 1, items };
    localStorage.setItem(PALETTE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("savePaletteItems failed", e);
  }
}
