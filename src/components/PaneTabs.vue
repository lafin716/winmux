<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import type { LeafNode } from "../lib/layout-types";
import TerminalView from "./Terminal.vue";
import BrowserView from "./BrowserView.vue";
import { useSessions, displayName } from "../composables/useSessions";
import {
  useResources,
  type BrowserTab,
  type FileTab,
} from "../composables/useResources";
import { useWorkspaces } from "../composables/useWorkspaces";
import { useFocus } from "../composables/useFocus";
import { useDragState } from "../composables/useDragState";
import { useConfirm } from "../composables/useConfirm";
import {
  computeDropZone,
  leafCount,
  MAX_PANES,
  moveTabToLeaf,
  moveTabAsSplit,
  moveTabToIndex,
  zoneToSplit,
} from "../composables/useLayout";

const props = defineProps<{ leaf: LeafNode }>();
const FileViewer = defineAsyncComponent(() => import("./FileViewer.vue"));

const { state: sessState, kill, rename, create } = useSessions();
const resources = useResources();
const { activeWorkspace, replaceLayout } = useWorkspaces();
const { focusedLeafId, setFocusedLeaf } = useFocus();
const drag = useDragState();
const { confirm } = useConfirm();

const editingId = ref<string | null>(null);
const editValue = ref("");
const catcherRef = ref<HTMLDivElement | null>(null);

const isFocused = computed(() => focusedLeafId.value === props.leaf.id);

function sessionName(id: string): string {
  const resource = resources.getById(id);
  if (resource?.kind === "file") return resource.preview.name;
  if (resource?.kind === "browser") {
    try {
      return new URL(resource.url).hostname;
    } catch {
      return resource.url;
    }
  }
  const s = sessState.sessions.find((x) => x.id === id);
  return s ? displayName(s.name) : id.slice(0, 6);
}

function tabKind(id: string): "terminal" | "file" | "browser" {
  return resources.getById(id)?.kind ?? "terminal";
}

function tabIcon(id: string): string {
  switch (tabKind(id)) {
    case "file": return "▤";
    case "browser": return "◎";
    default: return "›_";
  }
}

function fileTab(id: string | null): FileTab | null {
  if (!id) return null;
  const tab = resources.getById(id);
  return tab?.kind === "file" ? tab : null;
}

function browserTab(id: string): BrowserTab | null {
  const tab = resources.getById(id);
  return tab?.kind === "browser" ? tab : null;
}

function selectTab(id: string) {
  props.leaf.activeTabId = id;
  setFocusedLeaf(props.leaf.id);
}

function startRename(id: string) {
  if (tabKind(id) !== "terminal") return;
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
  if (resources.getById(id)) {
    resources.closeResource(id);
    return;
  }
  const ok = await confirm({
    message: `Kill session "${sessionName(id)}"?`,
    confirmLabel: "Kill",
    rememberKey: "skipKillSessionConfirm",
  });
  if (ok) {
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

function onCatcherDragOver(ev: DragEvent) {
  if (!drag.state.active) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
  if (!catcherRef.value) return;
  const rect = catcherRef.value.getBoundingClientRect();
  const zone = computeDropZone(ev.clientX, ev.clientY, rect);
  drag.setHover(props.leaf.id, zone);
}

function onCatcherDragLeave(ev: DragEvent) {
  const related = ev.relatedTarget as Node | null;
  if (catcherRef.value && related && catcherRef.value.contains(related)) return;
  if (drag.state.hoverLeafId === props.leaf.id) drag.setHover(null, null);
}

function onCatcherDrop(ev: DragEvent) {
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
      // Edge drop creates a new leaf. Net delta is +1 only if the source leaf survives
      // (has other tabs); otherwise it collapses away.
      const willGainLeaf = sourceSurvivesAfterMove(ws.layout, sessionId);
      if (willGainLeaf && leafCount(ws.layout) >= MAX_PANES) {
        alert(`최대 ${MAX_PANES}개 pane까지 분할할 수 있습니다.`);
        drag.reset();
        return;
      }
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

function sourceSurvivesAfterMove(root: any, sessionId: string): boolean {
  const stack: any[] = [root];
  while (stack.length) {
    const n = stack.pop();
    if (n.kind === "leaf" && n.tabs.includes(sessionId)) {
      return n.tabs.length > 1;
    }
    if (n.kind === "split") stack.push(...n.children);
  }
  return false;
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
            <span class="kind-icon">{{ tabIcon(id) }}</span>
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

    <div class="body">
      <TerminalView
        v-if="leaf.activeTabId && tabKind(leaf.activeTabId) === 'terminal'"
        :key="leaf.activeTabId"
        :session-id="leaf.activeTabId"
        :active="isFocused"
      />
      <FileViewer
        v-if="fileTab(leaf.activeTabId)"
        :key="leaf.activeTabId ?? 'file'"
        :preview="fileTab(leaf.activeTabId)!.preview"
      />
      <template v-for="id in leaf.tabs" :key="'browser-' + id">
        <BrowserView
          v-if="browserTab(id)"
          :tab="browserTab(id)!"
          :active="id === leaf.activeTabId"
        />
      </template>
      <div v-if="!leaf.activeTabId" class="empty">No tab in this pane.</div>

      <div
        v-if="drag.state.active"
        ref="catcherRef"
        class="drop-catcher"
        @dragenter.prevent
        @dragover="onCatcherDragOver"
        @dragleave="onCatcherDragLeave"
        @drop="onCatcherDrop"
      >
        <div
          v-if="drag.state.hoverLeafId === leaf.id && drag.state.hoverZone"
          class="overlay"
          :class="['zone-' + drag.state.hoverZone]"
        />
      </div>
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
.kind-icon {
  color: #4ec9b0;
  font-family: Consolas, monospace;
  font-size: 11px;
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
.drop-catcher {
  position: absolute;
  inset: 0;
  z-index: 10;
}
.overlay {
  position: absolute;
  background: rgba(78, 201, 176, 0.22);
  border: 2px solid #4ec9b0;
  pointer-events: none;
  transition: all 80ms ease;
}
.overlay.zone-center { inset: 0; }
.overlay.zone-left { top: 0; bottom: 0; left: 0; width: 50%; }
.overlay.zone-right { top: 0; bottom: 0; right: 0; width: 50%; }
.overlay.zone-top { left: 0; right: 0; top: 0; height: 50%; }
.overlay.zone-bottom { left: 0; right: 0; bottom: 0; height: 50%; }
</style>
