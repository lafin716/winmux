import { reactive } from "vue";
import type { DropZone } from "../lib/layout-types";

interface DragState {
  active: boolean;
  sessionId: string | null;
  sourceLeafId: string | null;
  hoverLeafId: string | null;
  hoverZone: DropZone | null;
}

const state = reactive<DragState>({
  active: false,
  sessionId: null,
  sourceLeafId: null,
  hoverLeafId: null,
  hoverZone: null,
});

export function useDragState() {
  function begin(sessionId: string, sourceLeafId: string) {
    state.active = true;
    state.sessionId = sessionId;
    state.sourceLeafId = sourceLeafId;
    state.hoverLeafId = null;
    state.hoverZone = null;
  }
  function setHover(leafId: string | null, zone: DropZone | null) {
    state.hoverLeafId = leafId;
    state.hoverZone = zone;
  }
  function reset() {
    state.active = false;
    state.sessionId = null;
    state.sourceLeafId = null;
    state.hoverLeafId = null;
    state.hoverZone = null;
  }
  return { state, begin, setHover, reset };
}
