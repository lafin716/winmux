<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import "monaco-editor/esm/vs/basic-languages/bat/bat.contribution";
import "monaco-editor/esm/vs/basic-languages/css/css.contribution";
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution";
import "monaco-editor/esm/vs/basic-languages/html/html.contribution";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
import "monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import "monaco-editor/esm/vs/basic-languages/rust/rust.contribution";
import "monaco-editor/esm/vs/basic-languages/shell/shell.contribution";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution";
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import type { FilePreview } from "../lib/tauri";

const props = defineProps<{ preview: FilePreview }>();

const editorHost = ref<HTMLDivElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let model: monaco.editor.ITextModel | null = null;

const imageSrc = computed(() =>
  props.preview.data ? `data:${props.preview.mime};base64,${props.preview.data}` : "",
);

const workerScope = self as typeof self & {
  MonacoEnvironment?: {
    getWorker(moduleId: string, label: string): Worker;
  };
};
workerScope.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "json") return new JsonWorker();
    return new EditorWorker();
  },
};

function monacoLanguage(language: string): string {
  if (language === "vue") return "html";
  if (language === "shell") return "shell";
  if (language === "batch") return "bat";
  return language;
}

async function createEditor() {
  if (props.preview.kind !== "text") return;
  await nextTick();
  if (!editorHost.value) return;
  model = monaco.editor.createModel(
    props.preview.text ?? "",
    monacoLanguage(props.preview.language),
    monaco.Uri.file(props.preview.canonicalPath),
  );
  editor = monaco.editor.create(editorHost.value, {
    model,
    readOnly: true,
    domReadOnly: true,
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: 13,
    lineHeight: 19,
    renderWhitespace: "selection",
    scrollBeyondLastLine: false,
    smoothScrolling: true,
  });
  if (props.preview.line) {
    editor.setPosition({
      lineNumber: props.preview.line,
      column: props.preview.column ?? 1,
    });
    editor.revealLineInCenter(props.preview.line);
  }
}

function openFind() {
  editor?.getAction("actions.find")?.run();
}

onMounted(createEditor);
onBeforeUnmount(() => {
  editor?.dispose();
  editor = null;
  model?.dispose();
  model = null;
});
</script>

<template>
  <div class="file-viewer">
    <div class="toolbar">
      <span class="path" :title="preview.canonicalPath">{{ preview.canonicalPath }}</span>
      <button v-if="preview.kind === 'text'" title="Find (Ctrl+F)" @click="openFind">Find</button>
      <span class="meta">{{ preview.language }} · {{ preview.size.toLocaleString() }} bytes</span>
    </div>

    <div v-if="preview.kind === 'image'" class="image-wrap">
      <img :src="imageSrc" :alt="preview.name" />
    </div>
    <div v-else-if="preview.kind === 'binary'" class="message">
      Binary files cannot be previewed.
    </div>
    <div v-else-if="preview.kind === 'too_large'" class="message">
      This file is too large to preview.
    </div>
    <div v-else ref="editorHost" class="editor-host" />
  </div>
</template>

<style scoped>
.file-viewer {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #d4d4d4;
}
.toolbar {
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  background: #252525;
  border-bottom: 1px solid #111;
  font-size: 11px;
}
.path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.meta { color: #888; white-space: nowrap; }
button {
  background: #1e1e1e;
  color: #ddd;
  border: 1px solid #555;
  padding: 3px 6px;
  cursor: pointer;
}
.editor-host {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.image-wrap, .message {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  color: #888;
}
img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style>
