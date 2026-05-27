import { reactive } from "vue";
import type { Prefs } from "../lib/persistence";
import { usePrefs, setPref } from "./usePrefs";

export interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  rememberKey?: keyof Prefs;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  dontAsk: boolean;
  resolve: ((v: boolean) => void) | null;
}

const state = reactive<ConfirmState>({
  open: false,
  options: null,
  dontAsk: false,
  resolve: null,
});

function confirm(opts: ConfirmOptions): Promise<boolean> {
  const { prefs } = usePrefs();
  if (opts.rememberKey && prefs[opts.rememberKey]) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    state.options = opts;
    state.dontAsk = false;
    state.resolve = resolve;
    state.open = true;
  });
}

function accept(): void {
  if (state.options?.rememberKey && state.dontAsk) {
    setPref(state.options.rememberKey, true);
  }
  const r = state.resolve;
  state.open = false;
  state.resolve = null;
  r?.(true);
}

function cancel(): void {
  const r = state.resolve;
  state.open = false;
  state.resolve = null;
  r?.(false);
}

export function useConfirm() {
  return { state, confirm, accept, cancel };
}

export const confirmState = state;
