<template>
  <BaseEdge :id="id" :path="path[0]" :marker-end="markerEnd" :interaction-width="interactionWidth" :style="lineStyle" />
  <path v-if="active" :d="path[0]" pathLength="100" class="flow-light" />
</template>

<script setup lang="ts">
import { BaseEdge, getBezierPath, type EdgeProps } from "@vue-flow/core";

// 参考连线：默认实线；选中这条线、或选中它两端的节点时，沿参考方向流光
// 删除：选中后按 Delete / Backspace（index.vue 统一处理）
const props = defineProps<EdgeProps<{ kind: "ref"; edgeId: number; sort: number }>>();

const path = computed(() => getBezierPath(props));
const active = computed(() => !!props.selected || !!props.sourceNode?.selected || !!props.targetNode?.selected);
// 内联样式：盖过 vue-flow 主题里选中连线变灰的规则
const lineStyle = computed(() => ({
  stroke: "var(--td-brand-color)",
  strokeWidth: active.value ? 2.4 : 1.6,
  opacity: active.value ? 1 : 0.65,
  transition: "stroke-width 150ms, opacity 150ms",
}));
</script>

<style lang="scss" scoped>
.flow-light {
  fill: none;
  stroke: color-mix(in srgb, var(--td-brand-color) 35%, #fff);
  stroke-width: 3.2;
  stroke-linecap: round;
  stroke-dasharray: 8 42;
  filter: drop-shadow(0 0 3px var(--td-brand-color));
  pointer-events: none;
  animation: edge-flow 1.6s linear infinite;
}
@keyframes edge-flow {
  from {
    stroke-dashoffset: 100;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .flow-light {
    animation: none;
    stroke-dasharray: none;
    opacity: 0.5;
  }
}
</style>
