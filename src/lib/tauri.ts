import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface SessionInfo {
  id: string;
  name: string;
  shell: string;
  cols: number;
  rows: number;
}

export interface PtyOutputPayload {
  id: string;
  data: string; // base64
}

export interface PtyExitPayload {
  id: string;
}

export const api = {
  createSession(opts: {
    name?: string;
    shell?: string;
    cwd?: string;
    cols?: number;
    rows?: number;
  } = {}): Promise<SessionInfo> {
    return invoke("create_session", opts);
  },
  listSessions(): Promise<SessionInfo[]> {
    return invoke("list_sessions");
  },
  killSession(id: string): Promise<void> {
    return invoke("kill_session", { id });
  },
  writeSession(id: string, data: string): Promise<void> {
    // data must be base64
    return invoke("write_session", { id, data });
  },
  resizeSession(id: string, cols: number, rows: number): Promise<void> {
    return invoke("resize_session", { id, cols, rows });
  },
  attachSession(id: string): Promise<string> {
    return invoke("attach_session", { id });
  },
  renameSession(id: string, name: string): Promise<void> {
    return invoke("rename_session", { id, name });
  },
};

export function onPtyOutput(
  handler: (payload: PtyOutputPayload) => void,
): Promise<UnlistenFn> {
  return listen<PtyOutputPayload>("pty-output", (e) => handler(e.payload));
}

export function onPtyExit(
  handler: (payload: PtyExitPayload) => void,
): Promise<UnlistenFn> {
  return listen<PtyExitPayload>("pty-exit", (e) => handler(e.payload));
}

// Helpers for base64 <-> binary
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function stringToBase64(str: string): string {
  return bytesToBase64(new TextEncoder().encode(str));
}
