<template>
  <div class="media-node" :class="[`kind-${dto.kind}`, { selected }]">
    <Handle type="target" :position="Position.Left" class="port" />
    <header class="drag-handle head">
      <!-- 类型只用图标，名字里已经写着「图片 / 视频」，不再重复 -->
      <span class="kind-chip" :title="TYPE_LABEL[dto.kind]"><component :is="icon" size="12" /></span>
      <TypeTag v-if="dto.kind === 'image'" :dto="dto" />
      <!-- 画风：节点属性，不是节点；封面缩略图 + 名称 -->
      <span v-if="style" class="style-badge" :title="`画风：${style.name}`">
        <img v-if="style.cover" :src="style.cover" alt="" />
        <i-platte v-else size="11" />
        <span>{{ style.name }}</span>
      </span>
      <NodeTitle :node-key="dto.key" :dto-name="dto.name" />
      <span v-if="data.refCount" class="ref-count"><i-link-one size="11" />{{ data.refCount }}</span>
    </header>
    <!-- 文本节点：就地编辑的便签，内容存在 prompt 里，失焦或停笔 400ms 保存 -->
    <div v-if="dto.kind === 'text'" class="body text-body">
      <textarea
        v-model="text"
        class="nodrag nowheel note"
        placeholder="写点什么：灵感、台词、分镜大纲……连到图片 / 视频 / 音频节点后可用 @文本N 引用"
        @input="scheduleSave"
        @blur="flushSave"
        @keydown.stop
        @wheel.stop />
    </div>
    <div v-else class="body" title="双击查看大图" @dblclick.stop="preview">
      <VideoPlayer v-if="dto.current?.kind === 'video' && dto.current.src" :src="dto.current.src" />
      <AudioPlayer v-else-if="dto.current?.kind === 'audio' && dto.current.src" :src="dto.current.src" />
      <img v-else-if="dto.current?.src" :src="dto.current.src" alt="" draggable="false" />
      <div v-else class="empty">
        <component :is="icon" size="22" />
        <span>{{ dto.kind === "video" ? "连入参考素材，写提示词生成视频" : "连入参考图，写提示词生成" }}</span>
      </div>
      <BusyOverlay v-if="busy" :dto="dto" />
    </div>
    <footer v-if="failed" class="foot failed" :title="dto.latest?.errorReason ?? ''"><i-caution size="11" />{{ dto.latest?.errorReason || "生成失败" }}</footer>
    <Handle type="source" :position="Position.Right" class="port" />

    <!-- frame 式卡片的标题在框外，操作条要再抬高一点才不压住它 -->
    <NodeToolbar :is-visible="!!selected && ctx.selectedCount.value === 1" :position="Position.Top" :offset="40"><NodeActions :dto="dto" /></NodeToolbar>
    <NodeToolbar :is-visible="!!selected && ctx.selectedCount.value === 1" :position="Position.Bottom" :offset="12">
      <TextComposer v-if="dto.kind === 'text'" :key="dto.key" :dto="dto" />
      <AudioComposer v-else-if="dto.kind === 'audio'" :key="dto.key" :dto="dto" />
      <NodeComposer v-else :key="dto.key" :dto="dto" />
    </NodeToolbar>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";
import { NodeToolbar } from "@vue-flow/node-toolbar";
import NodeActions from "../components/NodeActions.vue";
import NodeComposer from "../components/NodeComposer.vue";
import TextComposer from "../components/TextComposer.vue";
import AudioComposer from "../components/AudioComposer.vue";
import { canvasApi, errorMessage } from "../api";
import NodeTitle from "../components/NodeTitle.vue";
import TypeTag from "../components/TypeTag.vue";
import AudioPlayer from "../components/AudioPlayer.vue";
import VideoPlayer from "../components/VideoPlayer.vue";
import BusyOverlay from "../components/BusyOverlay.vue";
import { artStyleOf } from "../types";
import { TYPE_LABEL, useCanvasCtx } from "../context";
import type { FlowNodeData, MediaNodeDto } from "../types";

const props = defineProps<{ id: string; data: FlowNodeData; selected?: boolean }>();
const ctx = useCanvasCtx();

const dto = computed(() => props.data.dto as MediaNodeDto);
const icon = computed(() => ({ image: "i-pic", video: "i-video", audio: "i-voice", text: "i-text" })[dto.value.kind]);

// ─── 文本节点内容 ───────────────────────────────────
const SAVE_DEBOUNCE = 400;
const text = ref(dto.value.prompt ?? "");
let savedText = text.value;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
// 后端刷新（AI 生成 / 撤销）改了内容时同步进来；用户正在输入时不覆盖
watch(
  () => dto.value.prompt,
  (next) => {
    if ((next ?? "") !== savedText) {
      savedText = next ?? "";
      text.value = savedText;
    }
  },
);
async function flushSave() {
  clearTimeout(saveTimer);
  if (dto.value.kind !== "text" || text.value === savedText) return;
  const value = text.value;
  try {
    await canvasApi.updateNode({ projectId: ctx.projectId.value, key: dto.value.key, prompt: value });
    savedText = value;
    await ctx.refresh();
  } catch (e) {
    window.$message.error(errorMessage(e, "保存文本失败"));
  }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE);
}
onBeforeUnmount(() => clearTimeout(saveTimer));
const busy = computed(() => dto.value.pendingImageIds.length > 0 && dto.value.latest?.state === "生成中");
const failed = computed(() => dto.value.latest?.state === "生成失败");
const style = computed(() => {
  const stylePath = artStyleOf(dto.value);
  return stylePath ? (ctx.artStyles?.value.find((s) => s.stylePath === stylePath) ?? { stylePath, name: stylePath, cover: null }) : null;
});

function preview() {
  const current = dto.value.current;
  if (current?.src) ctx.openPreview(current.src.replace(/\?size=\d+$/, ""), current.kind);
}
</script>

<style lang="scss" scoped>
// frame 式卡片（参照 Figma frame / liblib）：标题在框外，框 = 内容，零内边距，高度随内容比例
.media-node {
  position: relative;
  width: 384px;
  border-radius: 8px;
  background: var(--td-bg-color-secondarycontainer);
  border: 1px solid var(--td-component-stroke);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  --accent: var(--td-brand-color-7, var(--td-brand-color));
  &.kind-video {
    --accent: #8b5cf6;
  }
  &.kind-audio {
    --accent: #0ea5e9;
  }
  &.kind-text {
    --accent: #f59e0b;
    width: 340px;
  }
  &.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent), 0 16px 40px rgba(0, 0, 0, 0.25);
  }
}
// 标题行在框外上方（不占框的尺寸）
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
.kind-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: #fff;
  background: var(--accent);
}
.style-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 110px;
  padding: 1px 6px 1px 2px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--td-text-color-secondary);
  background: color-mix(in srgb, #d6307a 10%, var(--td-bg-color-secondarycontainer));
  img {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    object-fit: cover;
  }
  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}
.ref-count {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: var(--td-text-color-placeholder);
}
.body {
  position: relative;
  margin: 0;
  border-radius: 8px;
  overflow: hidden;
  img,
  video {
    width: 100%;
    height: auto;
    display: block;
  }
}
.kind-audio .body {
  height: 64px;
}
.text-body {
  height: auto;
  min-height: 160px;
  max-height: 320px;
  background: color-mix(in srgb, #f59e0b 6%, var(--td-bg-color-container));
  .note {
    display: block;
    width: 100%;
    min-height: 160px;
    max-height: 320px;
    padding: 10px 12px;
    border: none;
    resize: vertical;
    background: transparent;
    color: var(--td-text-color-primary);
    font: inherit;
    font-size: 13px;
    line-height: 1.6;
    &:focus {
      outline: none;
    }
    &::placeholder {
      color: var(--td-text-color-placeholder);
    }
  }
}
.empty {
  aspect-ratio: 16 / 9;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 16px;
  text-align: center;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
.foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 6px 10px;
  border-radius: 0 0 8px 8px;
  background: color-mix(in srgb, var(--td-bg-color-container) 82%, transparent);
  backdrop-filter: blur(4px);
  font-size: 11px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  &.failed {
    color: var(--td-error-color);
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
</style>
