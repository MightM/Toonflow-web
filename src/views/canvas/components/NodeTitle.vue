<template>
  <input
    v-if="editing"
    ref="input"
    v-model="draft"
    class="title-input nodrag"
    maxlength="40"
    :aria-label="`重命名「${dtoName}」`"
    @keydown.enter.prevent="commit"
    @keydown.esc.prevent="cancel"
    @blur="commit"
    @mousedown.stop
    @dblclick.stop />
  <span v-else class="title" :title="`${dtoName}（双击改名）`" @dblclick.stop="start">{{ dtoName }}</span>
</template>

<script setup lang="ts">
import { useCanvasCtx } from "../context";

// 节点名称：双击编辑，回车或点到输入框外保存，Esc 放弃
const props = defineProps<{ nodeKey: string; dtoName: string }>();
const ctx = useCanvasCtx();

const editing = ref(false);
const draft = ref("");
const input = ref<HTMLInputElement>();

function start() {
  draft.value = props.dtoName;
  editing.value = true;
  void nextTick(() => input.value?.select());
}
function cancel() {
  editing.value = false;
}
function commit() {
  if (!editing.value) return; // 回车保存后失焦会再触发一次
  editing.value = false;
  const name = draft.value.trim();
  if (name && name !== props.dtoName) void ctx.renameNode(props.nodeKey, name);
}
</script>

<style lang="scss" scoped>
.title,
.title-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}
.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
}
.title-input {
  height: 22px;
  margin: -2px 0;
  padding: 0 6px;
  border-radius: 6px;
  border: 1px solid var(--td-brand-color);
  background: var(--td-bg-color-container);
  box-shadow: 0 0 0 2px var(--td-brand-color-focus);
  font-family: inherit;
  outline: none;
  cursor: text;
}
</style>
