import { ref } from "vue";

const settingsOpen = ref(false);

export function useSettings() {
  return {
    settingsOpen,
    openSettings: () => {
      settingsOpen.value = true;
    },
    closeSettings: () => {
      settingsOpen.value = false;
    },
    toggleSettings: () => {
      settingsOpen.value = !settingsOpen.value;
    },
  };
}
