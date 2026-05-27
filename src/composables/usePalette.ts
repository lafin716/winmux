import { reactive } from "vue";
import {
  loadPaletteItems,
  savePaletteItems,
  type PaletteItem,
} from "../lib/persistence";

interface PaletteState {
  open: boolean;
  x: number;
  y: number;
  sessionId: string | null;
}

const state = reactive<PaletteState>({
  open: false,
  x: 0,
  y: 0,
  sessionId: null,
});

const items = reactive<PaletteItem[]>([]);

function persist(): void {
  savePaletteItems(items.map((it) => ({ ...it })));
}

function genId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadPaletteFromStorage(): void {
  const stored = loadPaletteItems();
  if (!stored) return;
  items.splice(0, items.length, ...stored);
}

export function openPalette(x: number, y: number, sessionId: string): void {
  state.x = x;
  state.y = y;
  state.sessionId = sessionId;
  state.open = true;
}

export function closePalette(): void {
  state.open = false;
  state.sessionId = null;
}

export function addPaletteItem(item: Omit<PaletteItem, "id">): PaletteItem {
  const created: PaletteItem = { id: genId(), ...item };
  items.push(created);
  persist();
  return created;
}

export function updatePaletteItem(
  id: string,
  patch: Partial<Omit<PaletteItem, "id">>,
): void {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  Object.assign(it, patch);
  persist();
}

export function removePaletteItem(id: string): void {
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return;
  items.splice(idx, 1);
  persist();
}

export function usePalette() {
  return { state, items };
}
