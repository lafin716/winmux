<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  api,
  base64ToBytes,
  onPtyOutput,
  stringToBase64,
  type PtyOutputPayload,
} from "../lib/tauri";
import type { UnlistenFn } from "@tauri-apps/api/event";

const props = defineProps<{
  sessionId: string;
  active: boolean;
}>();

const host = ref<HTMLDivElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let unlistenOutput: UnlistenFn | null = null;
let resizeObserver: ResizeObserver | null = null;
let isComposing = false;
let suppressUntil = 0;

async function init() {
  if (!host.value) return;
  term = new Terminal({
    fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: {
      background: "#1e1e1e",
      foreground: "#d4d4d4",
    },
  });
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(host.value);

  // Initial fit
  await nextRaf();
  safeFit();

  // Restore scrollback
  try {
    const b64 = await api.attachSession(props.sessionId);
    if (b64) {
      const bytes = base64ToBytes(b64);
      term.write(bytes);
    }
  } catch (e) {
    console.error("attach failed", e);
  }

  // Send initial resize to backend (in case fit changed dimensions)
  if (term) {
    await api.resizeSession(props.sessionId, term.cols, term.rows).catch(() => {});
  }

  // IME composition tracking: WebView2 + xterm.js may deliver the composed
  // string via both compositionend and a follow-up onData, duplicating Hangul.
  const helper = host.value.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
  if (helper) {
    helper.addEventListener("compositionstart", () => {
      isComposing = true;
    });
    helper.addEventListener("compositionend", (ev: CompositionEvent) => {
      isComposing = false;
      if (ev.data) {
        api.writeSession(props.sessionId, stringToBase64(ev.data)).catch((e) => {
          console.error("write failed", e);
        });
      }
      suppressUntil = performance.now() + 50;
    });
  }

  // User input → backend
  term.onData((data) => {
    if (isComposing) return;
    if (performance.now() < suppressUntil) return;
    api.writeSession(props.sessionId, stringToBase64(data)).catch((e) => {
      console.error("write failed", e);
    });
  });

  term.onResize(({ cols, rows }) => {
    api.resizeSession(props.sessionId, cols, rows).catch(() => {});
  });

  // Listen for output events filtered by id
  unlistenOutput = await onPtyOutput((payload: PtyOutputPayload) => {
    if (payload.id !== props.sessionId || !term) return;
    const bytes = base64ToBytes(payload.data);
    term.write(bytes);
  });

  // Resize on container resize
  resizeObserver = new ResizeObserver(() => safeFit());
  resizeObserver.observe(host.value);

  if (props.active) term.focus();
}

function safeFit() {
  if (!fitAddon || !term || !host.value) return;
  if (host.value.offsetWidth === 0 || host.value.offsetHeight === 0) return;
  try {
    fitAddon.fit();
  } catch (e) {
    // ignore
  }
}

function nextRaf(): Promise<void> {
  return new Promise((res) => requestAnimationFrame(() => res()));
}

watch(
  () => props.active,
  async (isActive) => {
    if (isActive) {
      await nextRaf();
      safeFit();
      term?.focus();
    }
  },
);

onMounted(init);

onBeforeUnmount(() => {
  if (unlistenOutput) unlistenOutput();
  if (resizeObserver) resizeObserver.disconnect();
  term?.dispose();
});

function resetTerminal() {
  if (!term) return;
  // Disable any leftover modes (mouse tracking, bracketed paste, alt screen),
  // restore cursor visibility and SGR — then reset xterm.js's parser state.
  term.write(
    "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?2004l\x1b[?1049l\x1b[?25h\x1b[0m",
  );
  term.reset();
  term.focus();
}

defineExpose({
  focus: () => term?.focus(),
  fit: safeFit,
  reset: resetTerminal,
});
</script>

<template>
  <div ref="host" class="term-host" />
</template>

<style scoped>
.term-host {
  width: 100%;
  height: 100%;
  background: #1e1e1e;
  padding: 4px;
  box-sizing: border-box;
  overflow: hidden;
}
</style>
