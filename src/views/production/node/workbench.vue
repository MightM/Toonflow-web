<template>
  <t-card class="workbench">
    <div class="titleBar dragHandle pr">
      <div class="title">{{ $t("workbench.production.node.workbench.title") }}</div>
      <Handle :id="props.handleIds.target" type="target" :position="Position.Left" style="left: calc(-1 * var(--td-comp-paddingLR-xl))" />
      <!-- <Handle :id="props.handleIds.source" type="source" :position="Position.Right" /> -->
    </div>
    <div class="entries" @click.stop>
      <t-button size="small" theme="primary" block @click="openShots">
        <template #icon><i-carousel-video size="14" /></template>
        镜头台（逐镜出图 / 出视频）
      </t-button>
      <t-button size="small" variant="outline" block @click="openEditor">
        <template #icon><i-film size="14" /></template>
        剪辑台（新标签页）
      </t-button>
      <t-button size="small" variant="text" block @click="visible = true">快速预览 / 分镜台</t-button>
    </div>
    <div class="videoPreview">
      <div class="videoPlaceholder" :style="{ background: workbenchData?.gradient }">
        <t-image v-if="workbenchData?.cover" :src="workbenchData.cover" fit="cover" class="videoCover" />
        <div class="playButton">
          <i-video theme="outline" size="48" />
        </div>
      </div>
      <!-- <div class="videoInfo">
        <div class="videoName">{{ workbenchData?.name }}</div>
        <div class="videoMeta">
          <span>{{ workbenchData?.duration }}</span>
          <span class="divider">|</span>
          <span>{{ workbenchData?.resolution }}</span>
          <span class="divider">|</span>
          <span>{{ workbenchData?.fps }}</span>
        </div>
      </div> -->
    </div>
    <workbench v-model:visible="visible" v-if="visible" />
  </t-card>
</template>

<script setup lang="ts">
import workbench from "../components/workbench/index.vue";
import type { Ref } from "vue";
import { Handle, Position } from "@vue-flow/core";

const visible = ref(false);

const router = useRouter();
const episodesId = inject<Ref<number | undefined>>("episodesId");
// 视频环节已经搬到镜头台；这个节点只留入口，快速预览与老分镜台仍在弹窗里
function openShots() {
  void router.push({ path: "/shots", query: { scriptId: String(episodesId?.value ?? "") } });
}
function openEditor() {
  const query = new URLSearchParams({ scriptId: String(episodesId?.value ?? "") });
  window.open(`${location.origin}${location.pathname}#/editor?${query}`, "_blank");
}

interface WorkbenchData {
  name: string;
  duration: string;
  resolution: string;
  fps: string;
  cover?: string;
  gradient?: string;
}

const props = defineProps<{
  id: string;
  handleIds: {
    target: string;
    source: string;
  };
}>();

const workbenchData = defineModel<WorkbenchData>({ required: true });
</script>

<style lang="scss" scoped>
.entries {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0;
}
.workbench {
  cursor: pointer;
  min-width: 280px;
  user-select: text;
  transition: filter 0.1s;
  &:hover {
    .playButton {
      transform: scale(1.1);
    }
  }
  &:active {
    filter: brightness(0.9);
  }

  .titleBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    cursor: grab;
    user-select: none;
  }

  .title {
    background-color: #000;
    width: fit-content;
    padding: 5px 10px;
    color: #fff;
    border-radius: 8px 0;
    font-size: 16px;
  }

  .videoPreview {
    margin-bottom: 12px;
  }

  .videoPlaceholder {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    overflow: hidden;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .videoCover {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .playButton {
    position: absolute;
    color: rgba(255, 255, 255, 0.9);
    transition: transform 0.2s;
  }

  .videoInfo {
    margin-top: 8px;
  }

  .videoName {
    font-size: 14px;
    font-weight: 600;
    color: var(--td-text-color-primary, #333);
    margin-bottom: 4px;
  }

  .videoMeta {
    font-size: 12px;
    color: var(--td-text-color-secondary, #666);

    .divider {
      margin: 0 6px;
      color: var(--td-border-level-1-color, #ddd);
    }
  }
}
</style>
