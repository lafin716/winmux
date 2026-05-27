import { onMounted, onUnmounted } from "vue";
import { ACTIONS, matchesEvent, type ActionId } from "../lib/keybindings";
import { useKeybindings } from "./useKeybindings";
import { useSettings } from "./useSettings";

type Handler = () => void | Promise<void>;

const handlers = new Map<string, Handler>();
let installed = false;

export function registerAction(id: ActionId, h: Handler) {
  handlers.set(id, h);
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

    // Never swallow plain typing in inputs/textareas. Modifier-bearing combos still pass.
    const hasMod = ev.ctrlKey || ev.metaKey || ev.altKey;
    if (!hasMod && shouldIgnoreTarget(ev.target)) return;

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
