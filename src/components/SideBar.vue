<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon, type IconifyIcon } from "@iconify/vue";
import { useWorkspaces } from "../composables/useWorkspaces";
import { useSessions } from "../composables/useSessions";
import { useResources } from "../composables/useResources";
import { usePrefs, cycleSidebarMode } from "../composables/usePrefs";
import { collectAllSessionIds, addTabToLeaf, findFirstLeaf } from "../composables/useLayout";
import {
  chevronLeftIcon,
  chevronRightIcon,
  plusIcon,
} from "../lib/offline-icons";

const {
  state,
  activeWorkspace,
  createWorkspace,
  deleteWorkspace,
  renameWorkspace,
  setActiveWorkspace,
} = useWorkspaces();
const { kill } = useSessions();
const resources = useResources();
const { prefs } = usePrefs();

const editingId = ref<string | null>(null);
const editValue = ref("");
const menuFor = ref<string | null>(null);
const menuPos = ref({ x: 0, y: 0 });

function initialOf(name: string, icon?: string): string {
  if (icon && icon.length) return icon.slice(0, 2);
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function activate(id: string) {
  setActiveWorkspace(id);
  closeMenu();
}

function addWorkspace() {
  const ws = createWorkspace(`WS${state.workspaces.length}`);
  editingId.value = ws.id;
  editValue.value = ws.name;
}

function startRename(id: string) {
  const ws = state.workspaces.find((w) => w.id === id);
  if (!ws) return;
  editingId.value = id;
  editValue.value = ws.name;
  closeMenu();
}

function commitRename() {
  if (editingId.value && editValue.value.trim()) {
    renameWorkspace(editingId.value, editValue.value.trim());
  }
  editingId.value = null;
}

async function removeWorkspace(id: string) {
  closeMenu();
  if (state.workspaces.length <= 1) return;
  const ws = state.workspaces.find((w) => w.id === id);
  if (!ws) return;
  const sessionIds = collectAllSessionIds(ws.layout);
  if (sessionIds.length > 0) {
    const choice = confirm(
      `Workspace "${ws.name}" has ${sessionIds.length} session(s).\n\nOK: move them to the previous workspace.\nCancel: kill them.`,
    );
    if (choice) {
      const idx = state.workspaces.findIndex((w) => w.id === id);
      const target = state.workspaces[Math.max(0, idx - 1)] ?? state.workspaces[1];
      if (target && target.id !== id) {
        const leaf = findFirstLeaf(target.layout);
        for (const sid of sessionIds) addTabToLeaf(target.layout, leaf.id, sid);
      }
    } else {
      for (const sid of sessionIds) {
        if (resources.getById(sid)) resources.forgetResource(sid);
        else await kill(sid);
      }
    }
  }
  deleteWorkspace(id);
}

function openContextMenu(ev: MouseEvent, id: string) {
  ev.preventDefault();
  menuFor.value = id;
  menuPos.value = { x: ev.clientX, y: ev.clientY };
}

function closeMenu() {
  menuFor.value = null;
}

const canDelete = computed(() => state.workspaces.length > 1);

const toggleIcon = computed<IconifyIcon>(() => {
  switch (prefs.sidebarMode) {
    case "expanded":
      return chevronLeftIcon;
    case "compact":
    case "minimal":
    default:
      return chevronRightIcon;
  }
});

function onRootClick() {
  if (prefs.sidebarMode === "minimal") {
    cycleSidebarMode();
    return;
  }
  closeMenu();
}
</script>

<template>
  <aside :class="['sidebar', 'mode-' + prefs.sidebarMode]" @click="onRootClick">
    <div
      v-for="ws in state.workspaces"
      :key="ws.id"
      :class="['ws', { active: ws.id === activeWorkspace?.id }]"
      :title="ws.name"
      @click.stop="activate(ws.id)"
      @dblclick.stop="startRename(ws.id)"
      @contextmenu="openContextMenu($event, ws.id)"
    >
      <div class="bar" />
      <template v-if="editingId === ws.id">
        <input
          v-model="editValue"
          autofocus
          maxlength="20"
          @blur="commitRename"
          @keydown.enter="commitRename"
          @keydown.escape="editingId = null"
          @click.stop
        />
      </template>
      <template v-else>
        <div v-if="prefs.sidebarMode !== 'expanded'" class="icon">
          {{ initialOf(ws.name, ws.icon) }}
        </div>
        <span v-if="prefs.sidebarMode === 'expanded'" class="ws-name">{{ ws.name }}</span>
      </template>
    </div>
    <button class="add" title="New workspace" @click.stop="addWorkspace">
      <Icon class="ico" :icon="plusIcon" />
    </button>
    <button
      class="mode-toggle"
      :class="'mt-' + prefs.sidebarMode"
      :title="'Sidebar: ' + prefs.sidebarMode + ' (Ctrl+Shift+B)'"
      @click.stop="cycleSidebarMode"
    >
      <Icon class="chev" :icon="toggleIcon" />
    </button>

    <div
      v-if="menuFor"
      class="menu"
      :style="{ left: menuPos.x + 'px', top: menuPos.y + 'px' }"
      @click.stop
    >
      <div class="menu-item" @click="startRename(menuFor)">Rename</div>
      <div
        class="menu-item"
        :class="{ disabled: !canDelete }"
        @click="canDelete && removeWorkspace(menuFor)"
      >
        Delete
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  width: 56px;
  background: #1b1b1b;
  border-right: 1px solid #111;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  gap: 6px;
  user-select: none;
  flex-shrink: 0;
}
.ws {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #2a2a2a;
  color: #d4d4d4;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
.ws:hover { background: #333; }
.ws.active {
  background: #1e1e1e;
  color: #4ec9b0;
}
.ws .bar {
  position: absolute;
  left: -6px;
  top: 8px;
  bottom: 8px;
  width: 4px;
  border-radius: 2px;
  background: transparent;
}
.ws.active .bar { background: #4ec9b0; }
.icon {
  width: 100%;
  text-align: center;
}
input {
  background: #1e1e1e;
  color: #e6e6e6;
  border: 1px solid #4ec9b0;
  width: 36px;
  text-align: center;
  font: inherit;
  padding: 0;
}
.add {
  width: 44px;
  height: 36px;
  margin-top: auto;
  background: transparent;
  border: 1px dashed #444;
  border-radius: 8px;
  color: #888;
  font-size: 18px;
  cursor: pointer;
  flex-shrink: 0;
}
.add:hover {
  color: #e6e6e6;
  border-color: #4ec9b0;
}
.mode-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  line-height: 1;
  color: #1a1a1a;
  transition: background 120ms ease, transform 220ms ease, opacity 220ms ease;
}
.mode-toggle .chev {
  display: inline-block;
  font-size: 18px;
}
.mode-toggle.mt-compact {
  width: 44px;
  height: 28px;
  border-radius: 6px;
  background: #4ec9b0;
  font-weight: 700;
  flex-shrink: 0;
}
.mode-toggle.mt-compact:hover { background: #5fd9c0; }
.mode-toggle.mt-expanded {
  width: 100%;
  height: 32px;
  border-radius: 6px;
  background: #4ec9b0;
  font-weight: 700;
  flex-shrink: 0;
}
.mode-toggle.mt-expanded:hover { background: #5fd9c0; }
.mode-toggle.mt-minimal {
  position: absolute;
  top: 50%;
  left: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #4ec9b0;
  transform: translate(-50%, -50%);
  opacity: 0.55;
  z-index: 20;
}
.sidebar.mode-minimal:hover .mode-toggle.mt-minimal,
.mode-toggle.mt-minimal:hover {
  transform: translate(0, -50%);
  opacity: 1;
}
.ws-name { display: none; }

.sidebar.mode-expanded {
  width: 200px;
  align-items: stretch;
  padding: 6px 8px;
}
.sidebar.mode-expanded .ws {
  width: 100%;
  height: 36px;
  border-radius: 6px;
  justify-content: flex-start;
  padding: 0 10px;
  gap: 10px;
}
.sidebar.mode-expanded .ws-name {
  display: inline;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.sidebar.mode-expanded .add { width: 100%; }
.sidebar.mode-expanded input {
  width: 100%;
  text-align: left;
}

.sidebar.mode-minimal {
  width: 6px;
  padding: 0;
  cursor: pointer;
  gap: 0;
}
.sidebar.mode-minimal > *:not(.mode-toggle) { display: none; }
.sidebar.mode-minimal::before {
  content: "";
  display: block;
  width: 2px;
  height: 100%;
  margin: 0 auto;
  background: #2a2a2a;
}
.sidebar.mode-minimal:hover::before { background: #4ec9b0; }
.menu {
  position: fixed;
  z-index: 100;
  background: #252525;
  border: 1px solid #111;
  border-radius: 4px;
  min-width: 120px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  font-size: 12px;
}
.menu-item {
  padding: 6px 12px;
  color: #d4d4d4;
  cursor: pointer;
}
.menu-item:hover { background: #2e2e2e; }
.menu-item.disabled {
  color: #555;
  cursor: not-allowed;
}
.menu-item.disabled:hover { background: transparent; }
</style>
