import { onMounted, onUnmounted } from "vue";

type Handler = (key: string, ev: KeyboardEvent) => void;

/**
 * tmux-style prefix key handler. Defaults: prefix is Ctrl+B.
 * After prefix is pressed, the next key (within timeout) is captured and forwarded to handler.
 */
export function usePrefixKey(handler: Handler, opts: { timeoutMs?: number } = {}) {
  const timeoutMs = opts.timeoutMs ?? 1500;
  let armed = false;
  let timer: number | null = null;

  function disarm() {
    armed = false;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function onKeyDown(ev: KeyboardEvent) {
    if (armed) {
      ev.preventDefault();
      ev.stopPropagation();
      // ignore standalone modifier keys
      if (["Control", "Shift", "Alt", "Meta"].includes(ev.key)) return;
      const key = ev.key;
      disarm();
      handler(key, ev);
      return;
    }
    // Detect prefix: Ctrl+B (without Shift/Alt/Meta to avoid clobbering shortcuts)
    if (ev.ctrlKey && !ev.shiftKey && !ev.altKey && !ev.metaKey && ev.key.toLowerCase() === "b") {
      ev.preventDefault();
      ev.stopPropagation();
      armed = true;
      timer = window.setTimeout(disarm, timeoutMs);
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeyDown, true);
  });
  onUnmounted(() => {
    window.removeEventListener("keydown", onKeyDown, true);
    disarm();
  });

  return {
    isArmed: () => armed,
  };
}
