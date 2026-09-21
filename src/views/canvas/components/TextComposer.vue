<template>
  <div class="text-composer nodrag nowheel nopan" @mousedown.stop @wheel="onWheel" @keydown.stop>
    <div v-if="refs.length" class="ref-strip">
      <span class="ref-label">参考</span>
      <span v-for="r in refs" :key="r.key" class="ref-chip" :title="r.name">
        <img v-if="r.type === 'image' && r.src" :src="r.src" alt="" />
        <i-text v-else-if="r.type === 'text'" size="12" />
        <i-video v-else-if="r.type === 'video'" size="12" />
        <i-voice v-else size="12" />
        <span class="ref-name">{{ r.name }}</span>
      </span>
    </div>
    <div class="row">
      <input
        v-model="instruction"
        class="instruction"
        placeholder="告诉 AI 要写什么，如「按这段大纲写三条分镜」；留空则按参考自由发挥"
        @keydown.enter.prevent="generate" />
      <t-button size="small" shape="round" :loading="busy" @click="generate">
        <template #icon><i-magic-wand size="14" /></template>
        AI 生成
      </t-button>
    </div>
    <div v-if="undoText !== null" class="sub-actions">
      <button class="link" @click="undo">撤销，退回上一版</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// 文本节点的输入面板：一行指令 + 连入的参考（文本 / 图片），AI 生成结果直接写进节点内容，可撤销一步
import { canvasApi, errorMessage } from "../api";
import { useCanvasCtx } from "../context";
import { useComposerWheel } from "../composerWheel";
import type { MediaKind, MediaNodeDto } from "../types";
import { isAssetNode } from "../types";

const props = defineProps<{ dto: MediaNodeDto }>();
const ctx = useCanvasCtx();
const onWheel = useComposerWheel();

const refs = computed(() =>
  ctx.refEdgesOf(props.dto.key).map((e) => {
    const src = ctx.dtoByKey.value.get(e.source);
    const kind = src?.current?.kind ?? (src && !isAssetNode(src) ? src.kind : "image");
    return { key: e.source, name: src?.name ?? e.source, type: kind as MediaKind, src: src?.current?.src ?? null };
  }),
);

const instruction = ref("");
const busy = ref(false);
const undoText = ref<string | null>(null);

async function generate() {
  if (busy.value) return;
  busy.value = true;
  try {
    const res = await canvasApi.generateText({ projectId: ctx.projectId.value, target: props.dto.key, instruction: instruction.value.trim() });
    undoText.value = res.previous;
    await ctx.refresh();
  } catch (e) {
    window.$message.error(errorMessage(e, "生成失败"));
  } finally {
    busy.value = false;
  }
}
async function undo() {
  if (undoText.value === null) return;
  const previous = undoText.value;
  undoText.value = null;
  await canvasApi.updateNode({ projectId: ctx.projectId.value, key: props.dto.key, prompt: previous });
  await ctx.refresh();
}
</script>

<style lang="scss" scoped>
.text-composer {
  width: 360px;
  padding: 10px;
  border-radius: 14px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ref-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  .ref-label {
    color: var(--td-text-color-placeholder);
  }
  .ref-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 140px;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--td-bg-color-secondarycontainer);
    img {
      width: 18px;
      height: 18px;
      border-radius: 3px;
      object-fit: cover;
    }
    .ref-name {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.instruction {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  font-size: 12px;
  &:focus {
    outline: none;
    border-color: var(--td-brand-color);
    box-shadow: 0 0 0 2px var(--td-brand-color-focus);
  }
}
.sub-actions {
  display: flex;
  justify-content: flex-end;
}
.link {
  border: none;
  background: transparent;
  color: var(--td-brand-color);
  font-size: 12px;
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
}
</style>
