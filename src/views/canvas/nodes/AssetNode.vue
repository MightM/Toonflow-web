<template>
  <div class="asset-node" :class="[`type-${dto.assetType}`, { selected, derived: !!dto.parentKey }]">
    <Handle type="target" :position="Position.Left" class="port port-in" />
    <header class="head">
      <TypeTag :dto="dto" />
      <NodeTitle :node-key="dto.key" :dto-name="dto.name" />
      <span v-if="inferring" class="inferring" title="正在推理提示词"><t-loading size="small" />推理中</span>
      <span v-if="data.refCount" class="ref-count" :title="`${data.refCount} 个参考`"><i-link-one size="11" />{{ data.refCount }}</span>
    </header>

    <figure class="slot" title="双击查看大图" @dblclick.stop="preview">
      <img v-if="dto.current?.src" :src="dto.current.src" :alt="dto.name" draggable="false" />
      <div v-else class="empty">
        <component :is="isRole ? 'i-people' : 'i-pic'" size="22" />
        <span v-if="isRole">写好人物需求直接生成；想先定脸，可在画布上传或生成一张定妆照，连线到这里作为身份参考</span>
      </div>
      <BusyOverlay v-if="busy" :dto="dto" />
    </figure>

    <footer class="foot">
      <span v-if="failed" class="failed" :title="dto.latest?.errorReason ?? ''"><i-caution size="11" />{{ dto.latest?.errorReason || "生成失败" }}</span>
      <span v-else-if="dto.voices.length" class="voice"><i-voice size="11" />{{ dto.voices[0].name }}</span>
      <span v-else class="hint">{{ dto.parentKey ? "状态" : isRole ? "人物多视图 · 分镜与视频引用此图" : "基础形象" }}</span>
    </footer>

    <Handle type="source" :position="Position.Right" class="port port-out" />
    <button class="add-state nodrag" title="新建状态" aria-label="新建状态" @click.stop="ctx.openCreateState(dto.key)"><i-plus size="12" /></button>

    <NodeToolbar :is-visible="!!selected && ctx.selectedCount.value === 1" :position="Position.Top" :offset="40"><NodeActions :dto="dto" /></NodeToolbar>
    <NodeToolbar :is-visible="!!selected && ctx.selectedCount.value === 1" :position="Position.Bottom" :offset="12"><NodeComposer :key="dto.key" :dto="dto" /></NodeToolbar>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";
import { NodeToolbar } from "@vue-flow/node-toolbar";
import NodeActions from "../components/NodeActions.vue";
import BusyOverlay from "../components/BusyOverlay.vue";
import { isPolishing } from "../polishJobs";
import NodeComposer from "../components/NodeComposer.vue";
import NodeTitle from "../components/NodeTitle.vue";
import TypeTag from "../components/TypeTag.vue";
import { useCanvasCtx } from "../context";
import type { AssetNodeDto, FlowNodeData } from "../types";

const props = defineProps<{ id: string; data: FlowNodeData; selected?: boolean }>();
const ctx = useCanvasCtx();

const dto = computed(() => props.data.dto as AssetNodeDto);
const isRole = computed(() => dto.value.assetType === "role");
const failed = computed(() => dto.value.latest?.state === "生成失败");
const inferring = computed(() => isPolishing(dto.value.key) || dto.value.promptState === "生成中");
const busy = computed(() => dto.value.pendingImageIds.length > 0 && dto.value.latest?.state === "生成中");

function preview() {
  const src = dto.value.current?.src;
  if (src) ctx.openPreview(src.replace(/\?size=\d+$/, ""), "image");
}
</script>

<style lang="scss" scoped>
// frame 式卡片（与 MediaNode 一致）：标题在框外，框 = 图，零内边距，高度随图片比例
.asset-node {
  --accent: var(--td-brand-color);
  position: relative;
  width: 384px;
  border-radius: 8px;
  background: var(--td-bg-color-secondarycontainer);
  border: 1px solid var(--td-component-stroke);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  transition: box-shadow 200ms;
  &.type-scene {
    --accent: var(--td-success-color);
  }
  &.type-tool {
    --accent: var(--td-warning-color);
  }
  &.derived {
    border-style: dashed;
  }
  &.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent), 0 16px 40px rgba(0, 0, 0, 0.25);
  }
  &:hover .add-state {
    opacity: 1;
    transform: translate(50%, -50%) scale(1);
  }
}
.head {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  padding: 0 2px;
  cursor: grab;
}
.inferring {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}
.ref-count {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: var(--td-text-color-placeholder);
}
.slot {
  position: relative;
  margin: 0;
  border-radius: 8px;
  overflow: hidden;
  img {
    width: 100%;
    height: auto;
    display: block;
  }
  figcaption {
    position: absolute;
    left: 6px;
    bottom: 6px;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
  }
}
.empty {
  aspect-ratio: 16 / 9;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  line-height: 1.5;
  text-align: center;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
// 状态 / 音色 / 失败原因放在框外下方，不遮图
.foot {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  margin-top: 4px;
  padding: 0 2px;
  font-size: 11px;
  min-height: 16px;
  color: var(--td-text-color-placeholder);
  span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .failed {
    color: var(--td-error-color);
  }
  .voice {
    color: var(--td-brand-color);
  }
}
.port {
  width: 16px;
  height: 16px;
  border: 3px solid var(--td-bg-color-container);
  background: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
  transition: box-shadow 150ms;
  // 透明的外圈扩大可点区域，圆点本身不用画得太大
  &::after {
    content: "";
    position: absolute;
    inset: -9px;
    border-radius: 50%;
  }
  &:hover {
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 30%, transparent);
  }
}
.add-state {
  position: absolute;
  top: 16px;
  right: 0;
  transform: translate(50%, -50%) scale(0.6);
  opacity: 0;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-right: -14px;
  border-radius: 50%;
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  transition: opacity 150ms, transform 150ms;
  z-index: 2;
}
</style>
