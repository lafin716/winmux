import { reactive } from "vue";

/**
 * Thin reactive wrapper for the global Quick Open overlay: just the transient
 * open/query/selection state plus open/close and selection helpers. No
 * persistence — Quick Open is ephemeral. All ranking/aggregation logic lives in
 * the pure `../lib/quick-open` seam; this composable owns none of it.
 *
 * The state is a module-level singleton so the `view.quickOpen` action handler
 * in `App.vue` and the `QuickOpen.vue` overlay share one instance. `quickOpenState`
 * is exported so `useGlobalShortcuts` can suspend other shortcuts while the
 * overlay owns the keyboard (mirroring `useConfirm`'s `confirmState`).
 */
export interface QuickOpenState {
  open: boolean;
  query: string;
  /** Index into the current ranked result list. */
  selectedIndex: number;
}

export const quickOpenState = reactive<QuickOpenState>({
  open: false,
  query: "",
  selectedIndex: 0,
});

export function useQuickOpen() {
  function open(): void {
    quickOpenState.query = "";
    quickOpenState.selectedIndex = 0;
    quickOpenState.open = true;
  }

  function close(): void {
    quickOpenState.open = false;
    quickOpenState.query = "";
    quickOpenState.selectedIndex = 0;
  }

  function setQuery(query: string): void {
    quickOpenState.query = query;
    quickOpenState.selectedIndex = 0;
  }

  /** Move the highlight by `delta`, wrapping within a list of `count` results. */
  function moveSelection(delta: number, count: number): void {
    if (count <= 0) {
      quickOpenState.selectedIndex = 0;
      return;
    }
    quickOpenState.selectedIndex =
      (quickOpenState.selectedIndex + delta + count) % count;
  }

  function setSelectedIndex(index: number): void {
    quickOpenState.selectedIndex = index;
  }

  return {
    state: quickOpenState,
    open,
    close,
    setQuery,
    moveSelection,
    setSelectedIndex,
  };
}
