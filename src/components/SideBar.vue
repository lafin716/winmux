<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon, type IconifyIcon } from "@iconify/vue";
import { useWorkspaces } from "../composables/useWorkspaces";
import { useSessions } from "../composables/useSessions";
import { useResources } from "../composables/useResources";
import { useShellPanels } from "../composables/useShellPanels";
import { useFocus } from "../composables/useFocus";
import {
  collectAllSessionIds,
  addTabToLeaf,
  findFirstLeaf,
  activateSessionTab,
} from "../composables/useLayout";
import { buildNavigatorTree } from "../lib/navigator";
import {
  bellIcon,
  chevronLeftIcon,
  chevronRightIcon,
  plusIcon,
  terminalIcon,
} from "../lib/offline-icons";

const {
  state,
  createWorkspace,
  deleteWorkspace,
  renameWorkspace,
  setActiveWorkspace,
} = useWorkspaces();
const { state: sessState, focusedSession, activity, kill } = useSessions();
const { setFocusedLeaf } = useFocus();
const resources = useResources();
const { panels, toggleLeftCollapsed } = useShellPanels();

const collapsed = computed(() => panels.left.collapsed);

// Grouped Workspace -> Session tree the Navigator renders. Derivation and its
// active/focused flags are unit-tested in `../lib/navigator`; this component
// only renders the result and wires clicks back to focus/activation.
const tree = computed(() =>
  buildNavigatorTree({
    workspaces: state.workspaces,
    sessions: sessState.sessions,
    activeWorkspaceId: state.activeWorkspaceId,
    focusedSessionId: focusedSession.value?.id ?? null,
    activityById: activity,
  }),
);

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

// Click-to-focus a Session from the Navigator: switch to its Workspace if
// needed, activate its tab within its leaf, and mark that leaf focused —
// mirroring the focus path used elsewhere (e.g. App.vue's focusSessionByIndex).
function focusSession(workspaceId: string, sessionId: string) {
  const ws = state.workspaces.find((w) => w.id === workspaceId);
  if (!ws) return;
  if (state.activeWorkspaceId !== workspaceId) setActiveWorkspace(workspaceId);
  const leafId = activateSessionTab(ws.layout, sessionId);
  if (leafId === null) return;
  setFocusedLeaf(leafId);
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

const toggleIcon = computed<IconifyIcon>(() =>
  collapsed.value ? chevronRightIcon : chevronLeftIcon,
);
</script>

<template>
  <aside :class="['sidebar', collapsed ? 'mode-collapsed' : 'mode-expanded']" @click="closeMenu">
    <div class="ws-list">
      <div v-for="ws in tree" :key="ws.id" class="ws-group">
        <div
          :class="['ws', { active: ws.isActiveWorkspace }]"
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
            <div v-if="collapsed" class="icon">
              {{ initialOf(ws.name, ws.icon) }}
            </div>
            <span v-else class="ws-name">{{ ws.name }}</span>
          </template>
        </div>
        <div v-if="!collapsed && ws.sessions.length" class="sessions">
          <div
            v-for="s in ws.sessions"
            :key="s.id"
            :class="['session', { focused: s.isFocusedSession }]"
            :title="s.displayName"
            @click.stop="focusSession(ws.id, s.id)"
          >
            <Icon class="s-ico" :icon="terminalIcon" />
            <span class="s-name">{{ s.displayName }}</span>
            <Icon
              v-if="s.hasBell"
              class="s-badge bell"
              :icon="bellIcon"
              title="Rang the bell"
            />
            <span
              v-else-if="s.hasActivity"
              class="s-badge dot"
              title="New output"
            />
          </div>
        </div>
      </div>
    </div>
    <button class="add" title="New workspace" @click.stop="addWorkspace">
      <Icon class="ico" :icon="plusIcon" />
    </button>
    <button
      class="mode-toggle"
      :class="collapsed ? 'mt-collapsed' : 'mt-expanded'"
      :title="(collapsed ? 'Expand Navigator' : 'Collapse Navigator')"
      @click.stop="toggleLeftCollapsed"
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
  width: 100%;
  height: 100%;
  background: #1b1b1b;
  border-right: 1px solid #111;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  gap: 6px;
  user-select: none;
  overflow: hidden;
}
.ws-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.ws-group {
  display: flex;
  flex-direction: column;
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
  flex-shrink: 0;
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
  background: #4ec9b0;
  font-weight: 700;
  border-radius: 6px;
  flex-shrink: 0;
  transition: background 120ms ease;
}
.mode-toggle:hover { background: #5fd9c0; }
.mode-toggle .chev {
  display: inline-block;
  font-size: 18px;
}
.mode-toggle.mt-collapsed {
  width: 44px;
  height: 28px;
}
.mode-toggle.mt-expanded {
  width: 100%;
  height: 32px;
}
.ws-name { display: none; }

.sidebar.mode-expanded {
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
.sidebar.mode-expanded .ws-list { align-items: stretch; }
.sidebar.mode-expanded input {
  width: 100%;
  text-align: left;
}
.sessions {
  display: flex;
  flex-direction: column;
  margin-top: 2px;
  padding-left: 8px;
}
.session {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 8px;
  border-radius: 5px;
  color: #b8b8b8;
  cursor: pointer;
  font-size: 12px;
}
.session:hover {
  background: #262626;
  color: #e6e6e6;
}
.session.focused {
  background: #223532;
  color: #4ec9b0;
}
.session .s-ico {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.85;
}
.session .s-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session .s-badge {
  flex-shrink: 0;
  margin-left: auto;
}
.session .s-badge.bell {
  font-size: 13px;
  color: #e2b341;
}
.session .s-badge.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4ec9b0;
}
/* The focused Session is cleared upstream, but guard against a residual badge. */
.session.focused .s-badge {
  display: none;
}
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
