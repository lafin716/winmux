import { onMounted, onUnmounted } from "vue";
import { ACTIONS, matchesEvent, type ActionId } from "../lib/keybindings";
import { useKeybindings } from "./useKeybindings";
import { useSettings } from "./useSettings";
import { confirmState } from "./useConfirm";
import { quickOpenState } from "./useQuickOpen";

type Handler = () => void | Promise<void>;

const handlers = new Map<string, Handler>();
let installed = false;
let focusByIndexHandler: ((i: number) => void) | null = null;

export function registerAction(id: ActionId, h: Handler) {
  handlers.set(id, h);
}

export function registerFocusSessionByIndex(fn: (i: number) => void) {
  focusByIndexHandler = fn;
}

export function unregisterAction(id: ActionId) {
  handlers.delete(id);
}

export function dispatchAction(id: ActionId) {
  const h = handlers.get(id);
  if (h) void h();
}

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return true;
  return false;
}

export function useGlobalShortcuts() {
  const { bindingFor } = useKeybindings();
  const { settingsOpen } = useSettings();

  function onKeyDown(ev: KeyboardEvent) {
    // Settings modal owns the keyboard while open (for capture mode and Esc-to-close).
    if (settingsOpen.value) return;
    // Confirm modal also owns the keyboard while open (Esc/Enter, prevent stacking).
    if (confirmState.open) return;
    // Quick Open owns the keyboard while open (typing, ↑/↓/Enter/Esc); its own
    // handler drives navigation, so suspend all other shortcuts underneath it.
    if (quickOpenState.open) return;

    // Never swallow plain typing in inputs/textareas. Modifier-bearing combos still pass.
    const hasMod = ev.ctrlKey || ev.metaKey || ev.altKey;
    if (!hasMod && shouldIgnoreTarget(ev.target)) return;

    // Alt+1..9 / Alt+A..F: focus session by global index (matches StatusBar labels).
    if (ev.altKey && !ev.ctrlKey && !ev.shiftKey && !ev.metaKey) {
      const mDigit = /^Digit([1-9])$/.exec(ev.code);
      if (mDigit) {
        ev.preventDefault();
        ev.stopPropagation();
        focusByIndexHandler?.(parseInt(mDigit[1], 10) - 1);
        return;
      }
      const mLetter = /^Key([A-F])$/.exec(ev.code);
      if (mLetter) {
        ev.preventDefault();
        ev.stopPropagation();
        focusByIndexHandler?.(9 + (mLetter[1].charCodeAt(0) - 65));
        return;
      }
    }

    for (const a of ACTIONS) {
      const b = bindingFor(a.id as ActionId);
      if (matchesEvent(b, ev)) {
        ev.preventDefault();
        ev.stopPropagation();
        dispatchAction(a.id as ActionId);
        return;
      }
    }
  }

  onMounted(() => {
    if (installed) return;
    installed = true;
    window.addEventListener("keydown", onKeyDown, true);
  });
  onUnmounted(() => {
    window.removeEventListener("keydown", onKeyDown, true);
    installed = false;
  });
}
