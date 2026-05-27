<script setup lang="ts">
import { ref, computed } from "vue";
import type { LeafNode } from "../lib/layout-types";
import TerminalView from "./Terminal.vue";
import { useSessions } from "../composables/useSessions";
import { useWorkspaces } from "../composables/useWorkspaces";
import { useFocus } from "../composables/useFocus";
import { useDragState } from "../composables/useDragState";
import {
  computeDropZone,
  moveTabToLeaf,
  moveTabAsSplit,
  moveTabToIndex,
  zoneToSplit,
} from "../composables/useLayout";

const props = defineProps<{ leaf: LeafNode }>();

const { state: sessState, kill, rename, create } = useSessions();
const { activeWorkspace, replaceLayout } = useWorkspaces();
const { focusedLeafId, setFocusedLeaf } = useFocus();
const drag = useDragState();

const editingId = ref<string | null>(null);
const editValue = ref("");
const bodyRef = ref<HTMLDivElement | null>(null);

const isFocused = computed(() => focusedLeafId.value === props.leaf.id);

function sessionName(id: string): string {
  return sessState.sessions.find((s) => s.id === id)?.name ?? id.slice(0, 6);
}

function selectTab(id: string) {
  props.leaf.activeTabId = id;
  setFocusedLeaf(props.leaf.id);
}

function startRename(id: string) {
  editingId.value = id;
  editValue.value = sessionName(id);
}

async function commitRename() {
  if (editingId.value && editValue.value.trim()) {
    await rename(editingId.value, editValue.value.trim());
  }
  editingId.value = null;
}

async function closeTab(id: string, ev: MouseEvent) {
  ev.stopPropagation();
  if (confirm(`Kill session "${sessionName(id)}"?`)) {
    await kill(id);
  }
}

// ---- Drag handlers ----

function onTabDragStart(ev: DragEvent, sessionId: string) {
  if (!ev.dataTransfer) return;
  ev.dataTransfer.effectAllowed = "move";
  ev.dataTransfer.setData("text/plain", sessionId);
  drag.begin(sessionId, props.leaf.id);
}

function onTabDragEnd() {
  drag.reset();
}

function onBodyDragOver(ev: DragEvent) {
  if (!drag.state.active) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
  if (!bodyRef.value) return;
  const rect = bodyRef.value.getBoundingClientRect();
  const zone = computeDropZone(ev.clientX, ev.clientY, rect);
  drag.setHover(props.leaf.id, zone);
}

function onBodyDragLeave(ev: DragEvent) {
  // Only clear if leaving the leaf body entirely.
  const related = ev.relatedTarget as Node | null;
  if (bodyRef.value && related && bodyRef.value.contains(related)) return;
  if (drag.state.hoverLeafId === props.leaf.id) drag.setHover(null, null);
}

function onBodyDrop(ev: DragEvent) {
  if (!drag.state.active || !drag.state.sessionId) return;
  ev.preventDefault();
  const ws = activeWorkspace.value;
  if (!ws) return;
  const sessionId = drag.state.sessionId;
  const zone = drag.state.hoverZone ?? "center";

  if (zone === "center") {
    if (drag.state.sourceLeafId === props.leaf.id) {
      drag.reset();
      return;
    }
    const newRoot = moveTabToLeaf(ws.layout, sessionId, props.leaf.id);
    if (newRoot !== ws.layout) replaceLayout(ws.id, newRoot);
  } else {
    const split = zoneToSplit(zone);
    if (split) {
      const newRoot = moveTabAsSplit(
        ws.layout,
        sessionId,
        props.leaf.id,
        split.direction,
        split.position,
      );
      if (newRoot !== ws.layout) replaceLayout(ws.id, newRoot);
    }
  }
  setFocusedLeaf(findLeafIdOfSession(ws, sessionId) ?? props.leaf.id);
  drag.reset();
}

function findLeafIdOfSession(ws: any, sessionId: string): string | null {
  const stack: any[] = [ws.layout];
  while (stack.length) {
    const n = stack.pop();
    if (n.kind === "leaf" && n.tabs.includes(sessionId)) return n.id;
    if (n.kind === "split") stack.push(...n.children);
  }
  return null;
}

// Tab-bar reorder: dragover on a tab placeholder
function onTabBarDragOver(ev: DragEvent) {
  if (!drag.state.active) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
}

function onTabDropAtIndex(ev: DragEvent, atIndex: number) {
  if (!drag.state.active || !drag.state.sessionId) return;
  ev.preventDefault();
  ev.stopPropagation();
  const ws = activeWorkspace.value;
  if (!ws) return;
  const sessionId = drag.state.sessionId;
  const newRoot = moveTabToIndex(ws.layout, sessionId, props.leaf.id, atIndex);
  if (newRoot !== ws.layout) replaceLayout(ws.id, newRoot);
  setFocusedLeaf(props.leaf.id);
  drag.reset();
}

function onPaneClick() {
  setFocusedLeaf(props.leaf.id);
}

async function onAddClick(ev: MouseEvent) {
  ev.stopPropagation();
  setFocusedLeaf(props.leaf.id);
  await create();
}

const showOverlay = computed(
  () => drag.state.active && drag.state.hoverLeafId === props.leaf.id,
);
</script>

<template>
  <div class="pane" :class="{ focused: isFocused }" @mousedown="onPaneClick">
    <div class="tab-bar" @dragover="onTabBarDragOver">
      <template v-for="(id, i) in leaf.tabs" :key="id">
        <div
          class="drop-gap"
          @dragover.prevent
          @drop="onTabDropAtIndex($event, i)"
        />
        <div
          :class="['tab', { active: id === leaf.activeTabId }]"
          draggable="true"
          @click="selectTab(id)"
          @dblclick="startRename(id)"
          @dragstart="onTabDragStart($event, id)"
          @dragend="onTabDragEnd"
        >
          <template v-if="editingId === id">
            <input
              v-model="editValue"
              autofocus
              @blur="commitRename"
              @keydown.enter="commitRename"
              @keydown.escape="editingId = null"
              @click.stop
              @mousedown.stop
            />
          </template>
          <template v-else>
            <span class="name">{{ sessionName(id) }}</span>
          </template>
          <span class="close" @click="closeTab(id, $event)">×</span>
        </div>
      </template>
      <div
        class="drop-gap"
        @dragover.prevent
        @drop="onTabDropAtIndex($event, leaf.tabs.length)"
      />
      <button class="add-tab" title="New terminal (Ctrl+N)" @click="onAddClick">+</button>
      <div class="tab-bar-spacer" />
    </div>

    <div
      ref="bodyRef"
      class="body"
      @dragover="onBodyDragOver"
      @dragleave="onBodyDragLeave"
      @drop="onBodyDrop"
    >
      <TerminalView
        v-if="leaf.activeTabId"
        :key="leaf.activeTabId"
        :session-id="leaf.activeTabId"
        :active="true"
      />
      <div v-else class="empty">No session in this pane.</div>

      <div v-if="showOverlay" class="overlay" :class="['zone-' + drag.state.hoverZone]" />
    </div>
  </div>
</template>

<style scoped>
.pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-width: 0;
  min-height: 0;
  background: #1e1e1e;
  position: relative;
}
.pane.focused .tab-bar {
  border-bottom-color: #4ec9b0;
}
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 28px;
  background: #252525;
  border-bottom: 1px solid #111;
  user-select: none;
  overflow-x: auto;
  flex-shrink: 0;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  color: #aaa;
  border-right: 1px solid #111;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.tab:hover { background: #2e2e2e; }
.tab.active {
  background: #1e1e1e;
  color: #e6e6e6;
}
.close {
  opacity: 0.4;
  padding: 0 4px;
  border-radius: 3px;
}
.close:hover {
  opacity: 1;
  background: #5a2d2d;
  color: #fff;
}
.drop-gap {
  width: 4px;
  flex-shrink: 0;
}
.add-tab {
  background: transparent;
  border: none;
  color: #888;
  width: 28px;
  height: 28px;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}
.add-tab:hover {
  background: #2e2e2e;
  color: #e6e6e6;
}
.tab-bar-spacer { flex: 1; }
input {
  background: #1e1e1e;
  color: #e6e6e6;
  border: 1px solid #4ec9b0;
  font: inherit;
  padding: 0 4px;
  width: 120px;
}
.body {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.body :deep(.term-host) {
  position: absolute;
  inset: 0;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  font-size: 12px;
}
.overlay {
  position: absolute;
  background: rgba(78, 201, 176, 0.18);
  border: 1px solid #4ec9b0;
  pointer-events: none;
  transition: all 80ms ease;
}
.overlay.zone-center { inset: 0; }
.overlay.zone-left { top: 0; bottom: 0; left: 0; width: 50%; }
.overlay.zone-right { top: 0; bottom: 0; right: 0; width: 50%; }
.overlay.zone-top { left: 0; right: 0; top: 0; height: 50%; }
.overlay.zone-bottom { left: 0; right: 0; bottom: 0; height: 50%; }
</style>
