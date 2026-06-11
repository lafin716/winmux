import { reactive } from "vue";
import { loadPrefs, savePrefs, type Prefs, type SidebarMode } from "../lib/persistence";
import {
  defaultTerminalConfig,
  normalizeTerminalConfig,
} from "../lib/terminal-config";

const prefs = reactive<Prefs>({
  skipKillSessionConfirm: false,
  sidebarMode: "compact",
  defaultTerminal: defaultTerminalConfig(),
});

export function loadPrefsFromStorage(): void {
  const stored = loadPrefs();
  if (!stored) return;
  Object.assign(prefs, {
    ...stored,
    defaultTerminal: normalizeTerminalConfig(stored.defaultTerminal),
  });
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefs[key] = value;
  savePrefs({ ...prefs });
}

const SIDEBAR_ORDER: SidebarMode[] = ["compact", "expanded", "minimal"];

export function cycleSidebarMode(): void {
  const i = SIDEBAR_ORDER.indexOf(prefs.sidebarMode);
  setPref("sidebarMode", SIDEBAR_ORDER[(i + 1) % SIDEBAR_ORDER.length]);
}

export function usePrefs() {
  return { prefs, setPref };
}
