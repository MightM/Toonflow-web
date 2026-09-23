<template>
  <div class="busy nodrag" @mousedown.stop @dblclick.stop>
    <t-loading size="small" />
    <span class="label">{{ label }}</span>
    <button class="stop" type="button" :disabled="stopping" title="终止这次生成" @click="stop"><i-square size="10" theme="filled" />停止</button>
  </div>
</template>

<script setup lang="ts">
// 节点上的生成状态：排队位置 / 生成中 + 「停止」。停止只终止这一版，节点当前图不变
import { useCanvasCtx } from "../context";
import type { CanvasNodeDto } from "../types";

const props = defineProps<{ dto: CanvasNodeDto }>();
const ctx = useCanvasCtx();
const stopping = ref(false);

const label = computed(() => {
  const q = props.dto.latest?.queue;
  if (q && !q.running) return q.ahead > 0 ? `排队中 · 前面还有 ${q.ahead} 个` : "排队中";
  return "生成中";
});
async function stop() {
  const imageId = props.dto.latest?.imageId;
  if (!imageId || !ctx.cancelGeneration) return;
  stopping.value = true;
  try {
    await ctx.cancelGeneration(imageId);
  } finally {
    stopping.value = false;
  }
}
</script>

<style lang="scss" scoped>
.busy {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  // 不用 backdrop-filter：生成中转圈每帧都会让软件渲染重新模糊整张图
  background: color-mix(in srgb, var(--td-bg-color-container) 72%, transparent);
}
.label {
  font-size: 11px;
  color: var(--td-text-color-secondary);
}
.stop {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 12px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  font-size: 11px;
  cursor: pointer;
  transition: border-color 150ms, color 150ms;
  &:hover:not(:disabled) {
    border-color: var(--td-error-color);
    color: var(--td-error-color);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
