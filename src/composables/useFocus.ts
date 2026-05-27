import { ref } from "vue";

const focusedLeafId = ref<string | null>(null);

export function useFocus() {
  function setFocusedLeaf(id: string | null) {
    focusedLeafId.value = id;
  }
  return { focusedLeafId, setFocusedLeaf };
}
