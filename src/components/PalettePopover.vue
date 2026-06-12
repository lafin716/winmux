<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Icon, type IconifyIcon } from "@iconify/vue";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { usePalette, closePalette } from "../composables/usePalette";
import { folderOpenIcon, terminalIcon } from "../lib/offline-icons";
import { api, stringToBase64 } from "../lib/tauri";

const { state, items } = usePalette();

const RADIUS = 80;
const ITEM_SIZE = 56;

interface RingItem {
  id: string;
  label: string;
  icon: IconifyIcon;
  builtin: boolean;
}

const allItems = computed<RingItem[]>(() => [
  { id: "__open_folder", label: "Open Folder", icon: folderOpenIcon, builtin: true },
  ...items.map((it) => ({
    id: it.id,
    label: it.label || "(unnamed)",
    icon: terminalIcon,
    builtin: false,
  })),
]);

function offsetFor(i: number, n: number): { left: string; top: string } {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
  const cx = Math.cos(angle) * RADIUS;
  const cy = Math.sin(angle) * RADIUS;
  return {
    left: `${cx - ITEM_SIZE / 2}px`,
    top: `${cy - ITEM_SIZE / 2}px`,
  };
}

const rootEl = ref<HTMLElement | null>(null);

async function activate(item: RingItem) {
  const sid = state.sessionId;
  closePalette();
  if (!sid) return;

  if (item.builtin && item.id === "__open_folder") {
    let selected: string | string[] | null = null;
    try {
      selected = await openDialog({ directory: true, multiple: false });
    } catch (e) {
      console.warn("dialog open failed", e);
      return;
    }
    if (typeof selected !== "string") return;
    const text = `cd "${selected}"\r`;
    try {
      await api.writeSession(sid, stringToBase64(text));
    } catch (e) {
      console.warn("writeSession failed", e);
    }
    return;
  }

  const def = items.find((i) => i.id === item.id);
  if (!def) return;
  const text = def.command + (def.autoRun ? "\r" : "");
  if (!text) return;
  try {
    await api.writeSession(sid, stringToBase64(text));
  } catch (e) {
    console.warn("writeSession failed", e);
  }
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === "Escape") {
    ev.preventDefault();
    closePalette();
  }
}

function onOutsidePointer(ev: PointerEvent) {
  if (!rootEl.value) return;
  if (!rootEl.value.contains(ev.target as Node)) {
    closePalette();
  }
}

watch(
  () => state.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("pointerdown", onOutsidePointer, true);
    } else {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onOutsidePointer, true);
    }
  },
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("pointerdown", onOutsidePointer, true);
});
</script>

<template>
  <div
    v-if="state.open"
    ref="rootEl"
    class="palette-root"
    :style="{ left: state.x + 'px', top: state.y + 'px' }"
  >
    <div class="center-dot" />
    <button
      v-for="(item, i) in allItems"
      :key="item.id"
      class="palette-item"
      :style="offsetFor(i, allItems.length)"
      :title="item.label"
      @click.stop="activate(item)"
    >
      <Icon class="ico" :icon="item.icon" />
      <span class="lbl">{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.palette-root {
  position: fixed;
  z-index: 200;
  width: 0;
  height: 0;
  pointer-events: none;
}
.palette-root > * {
  pointer-events: auto;
}
.center-dot {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #4ec9b0;
  left: -5px;
  top: -5px;
  opacity: 0.7;
  pointer-events: none;
}
.palette-item {
  position: absolute;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #252525;
  border: 1px solid #333;
  color: #e6e6e6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  transition: background 120ms ease, transform 120ms ease, border-color 120ms ease;
}
.palette-item:hover {
  background: #2e2e2e;
  border-color: #4ec9b0;
  transform: scale(1.05);
}
.palette-item .ico {
  font-size: 20px;
  color: #4ec9b0;
}
.palette-item .lbl {
  font-size: 9px;
  color: #d4d4d4;
  max-width: 52px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}
</style>
