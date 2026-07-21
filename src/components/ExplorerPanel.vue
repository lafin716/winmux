<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { filesIcon } from "../lib/offline-icons";

// Placeholder Explorer. This ticket delivers the Shell panel mechanics only;
// the file tree, root resolution, and click-to-open arrive in a later ticket.
// The icon strip reserves room for future tools, with only Files active now.
</script>

<template>
  <section class="explorer">
    <div class="body">
      <div class="head">Explorer</div>
      <div class="placeholder">
        File tree coming soon.
      </div>
    </div>
    <nav class="strip" aria-label="Explorer tools">
      <button class="tool active" title="Files" type="button">
        <Icon class="ico" :icon="filesIcon" />
      </button>
    </nav>
  </section>
</template>

<style scoped>
.explorer {
  display: flex;
  height: 100%;
  width: 100%;
  background: #1b1b1b;
  border-left: 1px solid #111;
  overflow: hidden;
}
.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
}
.head {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #888;
  margin-bottom: 10px;
}
.placeholder {
  color: #666;
  font-size: 12px;
  line-height: 1.5;
}
.strip {
  width: 40px;
  flex-shrink: 0;
  background: #161616;
  border-left: 1px solid #111;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  gap: 4px;
}
.tool {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #888;
  cursor: pointer;
}
.tool:hover { color: #d4d4d4; background: #262626; }
.tool.active { color: #4ec9b0; background: #232323; }
.tool .ico { font-size: 18px; }
</style>
