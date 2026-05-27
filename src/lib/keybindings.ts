export type Keybinding = {
  key?: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  prefix?: string;
} | null;

export interface ActionDef {
  id: string;
  label: string;
  category: "session" | "pane" | "window" | "settings";
  default: Keybinding;
  defaultPrefix: string | null;
}

export const ACTIONS: ReadonlyArray<ActionDef> = [
  { id: "session.new",          label: "New Terminal",         category: "session", default: { ctrl: true, key: "n" }, defaultPrefix: "c" },
  { id: "session.kill",         label: "Kill Focused Session", category: "session", default: null,                     defaultPrefix: "&" },
  { id: "session.killNoConfirm",label: "Close Focused Session",category: "session", default: { ctrl: true, key: "w" }, defaultPrefix: null },
  { id: "session.rename",       label: "Rename Session",       category: "session", default: null,                     defaultPrefix: "," },
  { id: "session.cycleNext",    label: "Next Tab in Pane",     category: "session", default: null,                     defaultPrefix: "n" },
  { id: "session.cyclePrev",    label: "Previous Tab in Pane", category: "session", default: null,                     defaultPrefix: "p" },
  { id: "pane.splitHorizontal", label: "Split Horizontally",   category: "pane",    default: null,                     defaultPrefix: "%" },
  { id: "pane.splitVertical",   label: "Split Vertically",     category: "pane",    default: null,                     defaultPrefix: "\"" },
  { id: "window.detach",        label: "Hide Window",          category: "window",  default: null,                     defaultPrefix: "d" },
  { id: "settings.open",        label: "Open Settings",        category: "settings",default: { ctrl: true, key: "," }, defaultPrefix: null },
  { id: "session.focusPrev",        label: "Focus Previous Session (Global)", category: "session", default: { ctrl: true, shift: true, key: "{" },           defaultPrefix: null },
  { id: "session.focusNext",        label: "Focus Next Session (Global)",     category: "session", default: { ctrl: true, shift: true, key: "}" },           defaultPrefix: null },
  { id: "pane.splitOrMoveLeft",     label: "Split or Move Left",              category: "pane",    default: { ctrl: true, alt: true, key: "ArrowLeft" },     defaultPrefix: null },
  { id: "pane.splitOrMoveRight",    label: "Split or Move Right",             category: "pane",    default: { ctrl: true, alt: true, key: "ArrowRight" },    defaultPrefix: null },
  { id: "pane.splitOrMoveUp",       label: "Split or Move Up",                category: "pane",    default: { ctrl: true, alt: true, key: "ArrowUp" },       defaultPrefix: null },
  { id: "pane.splitOrMoveDown",     label: "Split or Move Down",              category: "pane",    default: { ctrl: true, alt: true, key: "ArrowDown" },     defaultPrefix: null },
  { id: "pane.quadrantTopLeft",     label: "Quadrant Top-Left Split",         category: "pane",    default: { ctrl: true, alt: true, key: "i" },             defaultPrefix: null },
  { id: "pane.quadrantTopRight",    label: "Quadrant Top-Right Split",        category: "pane",    default: { ctrl: true, alt: true, key: "o" },             defaultPrefix: null },
  { id: "pane.quadrantBottomLeft",  label: "Quadrant Bottom-Left Split",      category: "pane",    default: { ctrl: true, alt: true, key: "k" },             defaultPrefix: null },
  { id: "pane.quadrantBottomRight", label: "Quadrant Bottom-Right Split",     category: "pane",    default: { ctrl: true, alt: true, key: "l" },             defaultPrefix: null },
  { id: "view.cycleSidebar",        label: "Cycle Sidebar Mode",              category: "window",  default: { ctrl: true, shift: true, key: "b" },           defaultPrefix: null },
];

export type ActionId = (typeof ACTIONS)[number]["id"];

export function getAction(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.id === id);
}

function normalizeKey(k: string): string {
  if (k.length === 1) return k.toLowerCase();
  return k;
}

export function formatKeybinding(b: Keybinding, prefix?: string | null): string {
  const parts: string[] = [];
  if (b && b.key) {
    if (b.ctrl) parts.push("Ctrl");
    if (b.shift) parts.push("Shift");
    if (b.alt) parts.push("Alt");
    if (b.meta) parts.push("Meta");
    parts.push(b.key.length === 1 ? b.key.toUpperCase() : b.key);
  }
  let s = parts.join("+");
  if (prefix) {
    const pfx = `Ctrl+B ${prefix}`;
    s = s ? `${s}  /  ${pfx}` : pfx;
  }
  return s || "(unbound)";
}

export function matchesEvent(b: Keybinding, ev: KeyboardEvent): boolean {
  if (!b || !b.key) return false;
  if (!!b.ctrl !== ev.ctrlKey) return false;
  if (!!b.shift !== ev.shiftKey) return false;
  if (!!b.alt !== ev.altKey) return false;
  if (!!b.meta !== ev.metaKey) return false;
  return normalizeKey(b.key) === normalizeKey(ev.key);
}

export function captureKeybinding(ev: KeyboardEvent): Keybinding {
  if (["Control", "Shift", "Alt", "Meta"].includes(ev.key)) return null;
  return {
    key: ev.key,
    ctrl: ev.ctrlKey,
    shift: ev.shiftKey,
    alt: ev.altKey,
    meta: ev.metaKey,
  };
}

export function sameBinding(a: Keybinding, b: Keybinding): boolean {
  if (!a || !b) return a === b;
  if (!a.key || !b.key) return false;
  return (
    normalizeKey(a.key) === normalizeKey(b.key) &&
    !!a.ctrl === !!b.ctrl &&
    !!a.shift === !!b.shift &&
    !!a.alt === !!b.alt &&
    !!a.meta === !!b.meta
  );
}
