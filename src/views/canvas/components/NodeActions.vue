<template>
  <div class="actions nodrag nopan" @mousedown.stop>
    <button v-if="isRole" class="accent" @click="ctx.openVoice(dto.key)">
      <i-voice size="14" />{{ voiceName ? `音色：${voiceName}` : "绑定音色" }}
    </button>
    <button v-if="isAsset" @click="ctx.openCreateState(dto.key)"><i-branch-one size="14" />新建状态</button>
    <span v-if="isAsset" class="sep" />
    <!-- 视频截帧：当前帧 / 首帧 / 尾帧 → 新的图片节点 -->
    <t-dropdown v-if="ctx.captureFrame && dto.kind === 'video'" :options="FRAME_OPTIONS" trigger="click" :min-column-width="120" @click="onCapture">
      <button :disabled="!src"><i-screenshot-one size="14" />截帧<i-down size="12" /></button>
    </t-dropdown>
    <span v-if="ctx.captureFrame && dto.kind === 'video'" class="sep" />
    <t-tooltip v-if="(dto.kind === 'image' || isAsset) && ctx.openCrop" content="裁剪图片（裁出的图作为新版本）">
      <button class="icon" aria-label="裁剪" :disabled="!src" @click="ctx.openCrop?.(dto.key)"><i-cutting-one size="15" /></button>
    </t-tooltip>
    <t-tooltip v-if="(dto.kind === 'image' || isAsset) && ctx.openFrame" content="缩放画幅：把主体缩进更大的画面里，双图合成时让人物和场景比例协调（结果作为新版本）">
      <button class="icon" aria-label="缩放画幅" :disabled="!src" @click="ctx.openFrame?.(dto.key)"><i-zoom-out size="15" /></button>
    </t-tooltip>
    <t-tooltip v-if="(dto.kind === 'image' || isAsset) && ctx.removeBackground" content="一键去背景：抠出主体，白底 + 透明 PNG，原图留在历史版本">
      <button class="icon" aria-label="去背景" :disabled="!src || busy" @click="ctx.removeBackground?.(dto.key)"><i-magic-wand size="15" /></button>
    </t-tooltip>
    <t-tooltip :content="isAsset ? '换图：上传本地图片替换当前图，旧图留在历史版本里' : '上传本地文件作为新版本'">
      <button class="icon" aria-label="上传" @click="ctx.uploadTo(dto.key)"><i-upload size="15" /></button>
    </t-tooltip>
    <t-tooltip content="下载当前版本">
      <button class="icon" aria-label="下载" :disabled="!src" @click="download"><i-download size="15" /></button>
    </t-tooltip>
    <t-tooltip content="历史版本">
      <button class="icon" aria-label="历史" @click="ctx.openHistory(dto.key)"><i-history size="15" /></button>
    </t-tooltip>
    <t-tooltip v-if="dto.kind === 'image' && ctx.openSaveToAssets" content="存入资产库">
      <button class="icon" aria-label="存入资产库" :disabled="!src" @click="ctx.openSaveToAssets?.(dto.key)"><i-folder-plus size="15" /></button>
    </t-tooltip>
    <t-tooltip content="全屏查看">
      <button class="icon" aria-label="全屏" :disabled="!src" @click="src && ctx.openPreview(src, kind)"><i-full-screen size="15" /></button>
    </t-tooltip>
    <span class="sep" />
    <t-tooltip content="删除节点">
      <button class="icon danger" aria-label="删除" @click="ctx.deleteNode(dto.key)"><i-delete size="15" /></button>
    </t-tooltip>
  </div>
</template>

<script setup lang="ts">
import { useCanvasCtx } from "../context";
import type { CanvasNodeDto, FrameAt } from "../types";
import { isAssetNode } from "../types";
import type { DropdownOption } from "tdesign-vue-next";

const FRAME_OPTIONS: DropdownOption[] = [
  { content: "截取当前帧", value: "current" },
  { content: "截取首帧", value: "first" },
  { content: "截取尾帧", value: "last" },
];

const props = defineProps<{ dto: CanvasNodeDto }>();
const ctx = useCanvasCtx();

const isAsset = computed(() => isAssetNode(props.dto));
// 角色资产，或标为「角色」的自由图片节点，都能绑音色
const isRole = computed(() => (isAssetNode(props.dto) ? props.dto.assetType === "role" : props.dto.kind === "image" && props.dto.assetType === "role"));
const voiceName = computed(() => (isAssetNode(props.dto) ? props.dto.voices[0]?.name : props.dto.voice?.name));
const src = computed(() => props.dto.current?.src?.replace(/\?size=\d+$/, "") ?? null);
const kind = computed(() => props.dto.current?.kind ?? "image");
const busy = computed(() => props.dto.pendingImageIds.length > 0);
function onCapture(option: DropdownOption) {
  ctx.captureFrame?.(props.dto.key, option.value as FrameAt);
}

function download() {
  if (!src.value) return;
  const a = document.createElement("a");
  a.href = src.value;
  a.download = `${props.dto.name}`;
  a.target = "_blank";
  a.click();
}
</script>

<style lang="scss" scoped>
.actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px;
  border-radius: 12px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--td-text-color-primary);
    font-size: 12px;
    cursor: pointer;
    transition: background-color 150ms;
    &:hover:not(:disabled) {
      background: var(--td-bg-color-container-hover);
    }
    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    &:focus-visible {
      outline: 2px solid var(--td-brand-color-focus);
    }
  }
  .icon {
    width: 28px;
    padding: 0;
    justify-content: center;
  }
  .accent {
    background: var(--td-brand-color);
    color: #fff;
    &:hover:not(:disabled) {
      background: var(--td-brand-color-hover);
    }
  }
  .danger:hover:not(:disabled) {
    color: var(--td-error-color);
  }
}
.sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--td-component-stroke);
}
</style>
