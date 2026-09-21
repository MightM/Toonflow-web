<template>
  <div class="editor-page">
    <header class="topbar">
      <div class="title">
        <span class="eyebrow">剪辑台</span>
        <strong>{{ project?.name }}</strong>
      </div>
      <t-select v-model="episode" size="small" class="episode" :options="episodeOptions" placeholder="选择集数" borderless @change="onEpisodeChange" />
      <div class="grow" />
      <span class="hint">剪辑工程只在这个标签页里，刷新会丢；导出前别关</span>
      <t-button size="small" variant="outline" @click="reload">
        <template #icon><i-refresh size="14" /></template>
        刷新素材
      </t-button>
    </header>

    <div class="body">
      <EditVideo
        v-if="ready"
        :key="episode ?? 0"
        :initial-tracks="tracks"
        :initial-video-items="shotVideos"
        :initial-media-items="videoItems"
        :initial-audio-items="audioItems"
        :initial-image-items="imageItems"
        :canvas-width="canvasSize.width"
        :canvas-height="canvasSize.height" />
      <div v-else class="loading"><t-loading size="large" text="读取素材…" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import { generateId, type Track } from "vue-clip-track";
import EditVideo from "./editVideo/index.vue";
import type { AudioItem, MediaItem } from "./editVideo/utils/mediaData";

// 剪辑台独立成页（从镜头台「剪辑台」按钮新开标签页进来）：
// 一边在镜头台出片，一边在这里剪，两边互不打断。
// 注意：轨道 / 字幕 / 转场仍然只是前端内存状态，没有后端工程表，刷新即失。
const route = useRoute();
const { project } = storeToRefs(projectStore());
const projectId = computed(() => Number(project.value?.id ?? 0));
const episode = ref<number | undefined>(route.query.scriptId ? Number(route.query.scriptId) : undefined);

const canvasSize = computed(() => {
  const ratio = project.value?.videoRatio;
  if (ratio === "9:16") return { width: 1080, height: 1920 };
  if (ratio === "1:1") return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
});

const ready = ref(false);
const shotVideos = ref<MediaItem[]>([]);
const videoItems = ref<MediaItem[]>([]);
const audioItems = ref<AudioItem[]>([]);
const imageItems = ref<MediaItem[]>([]);

const tracks: Track[] = [
  { id: generateId("track-"), type: "video", name: "主轨道", visible: true, locked: false, clips: [], order: 0, isMain: true },
  { id: generateId("track-"), type: "audio", name: "音频", visible: true, locked: false, clips: [], order: 2 },
  { id: generateId("track-"), type: "subtitle", name: "字幕", visible: true, locked: false, clips: [], order: 3 },
  { id: generateId("track-"), type: "filter", name: "滤镜", visible: true, locked: false, clips: [], order: 4 },
];

type MediaType = "image" | "video" | "audio" | "unknown";
function mediaType(src?: string): MediaType {
  if (!src) return "unknown";
  const ext = src.split("?")[0]!.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) return "image";
  if (["mp4", "webm", "ogg", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "aac", "flac", "m4a"].includes(ext)) return "audio";
  return "unknown";
}

async function loadMaterials() {
  if (!projectId.value) return;
  ready.value = false;
  try {
    const { data } = await axios.post("/assets/getMaterialData", { projectId: projectId.value, scriptId: episode.value ?? 0 });
    const all: any[] = data?.data ?? [];
    shotVideos.value = (data?.video ?? []).flatMap((item: any, index: number) =>
      Array.isArray(item.video)
        ? item.video.map((sub: any, subIndex: number) => ({
            id: `video-${sub.id}`,
            type: "video",
            name: `#镜头${index + 1}-${subIndex + 1}`,
            duration: sub.duration || 0,
            icon: "🎬",
            color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            url: sub.filePath,
            selected: item.videoId === sub.id,
          }))
        : [],
    );
    videoItems.value = all
      .filter((i) => mediaType(i.filePath) === "video")
      .map((i) => ({ id: `video-${i.id}`, type: "video", name: i.name, duration: i.duration || 0, icon: "🎥", color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", url: i.filePath, loading: true }));
    audioItems.value = all
      .filter((i) => mediaType(i.filePath) === "audio")
      .map((i) => ({ id: `audio-${i.id}`, type: "audio", name: i.name, duration: i.duration || 0, url: i.filePath, loading: true }));
    imageItems.value = all
      .filter((i) => mediaType(i.filePath) === "image")
      .map((i) => ({ id: `image-${i.id}`, type: "image", name: i.name, duration: i.duration || 5, icon: "🖼️", color: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)", url: i.filePath, loading: true }));
  } catch {
    window.$message.error("读取剪辑素材失败");
  } finally {
    ready.value = true;
  }
}

const episodeOptions = ref<{ label: string; value: number }[]>([]);
async function loadEpisodes() {
  if (!projectId.value) return;
  try {
    const { data } = await axios.post("/script/getScrptApi", { projectId: projectId.value, name: "" });
    episodeOptions.value = (data ?? []).map((ep: { id: number; name: string }) => ({ label: ep.name, value: ep.id }));
    if (!episode.value && episodeOptions.value.length) episode.value = episodeOptions.value[0]!.value;
  } catch {
    episodeOptions.value = [];
  }
}
function onEpisodeChange() {
  void loadMaterials();
}
const reload = () => loadMaterials();

onMounted(async () => {
  await loadEpisodes();
  await loadMaterials();
});
</script>

<style lang="scss" scoped>
.editor-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--td-bg-color-page);
}
.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container);
}
.title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  .eyebrow {
    color: var(--td-text-color-placeholder);
    font-size: 12px;
  }
}
.episode {
  width: 180px;
}
.grow {
  flex: 1;
}
.hint {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
.body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.loading {
  display: grid;
  place-items: center;
  height: 100%;
}
</style>
