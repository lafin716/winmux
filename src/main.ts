import { createApp } from "vue";
import App from "./App.vue";
import OAuthLoginWindow from "./OAuthLoginWindow.vue";

// The floating OAuth login window (see `src/lib/floating-login.ts`) is a
// separate Tauri window loading this same bundle; it's told apart from the
// main window purely via a `win` query param on the URL it's opened with,
// so it mounts a different, minimal root instead of the full app shell.
const params = new URLSearchParams(window.location.search);
const root = params.get("win") === "oauth-login" ? OAuthLoginWindow : App;

createApp(root).mount("#app");
