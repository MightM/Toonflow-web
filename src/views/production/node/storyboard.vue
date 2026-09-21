<template>
  <t-card class="storyboard">
    <div class="titleBar dragHandle pr">
      <div class="title">{{ $t("workbench.production.node.storyboard.title") }}</div>
      <t-button class="toShots" size="small" theme="primary" @click.stop="openShots()">
        <template #icon><i-carousel-video size="14" /></template>
        镜头台
      </t-button>
      <Handle :id="props.handleIds.target" type="target" :position="Position.Left" style="left: calc(-1 * var(--td-comp-paddingLR-xl))" />
      <Handle :id="props.handleIds.source" type="source" :position="Position.Right" style="right: calc(-1 * var(--td-comp-paddingLR-xl))" />
    </div>

    <div class="content">
      <t-empty v-if="!storyboard.length" style="margin-top: 16px" />
      <template v-else>
        <div class="progress">
          <span class="num">{{ doneCount }} / {{ storyboard.length }}</span>
          <span class="label">已出图</span>
          <span v-if="failedCount" class="failed">{{ failedCount }} 失败</span>
          <span v-if="pendingCount" class="pending">{{ pendingCount }} 生成中</span>
          <div class="grow" />
          <t-button size="small" variant="text" @click.stop="previewAll">
            {{ $t("workbench.production.node.storyboard.gridPreview") }}
          </t-button>
        </div>
        <div class="bar"><i :style="{ width: `${(doneCount / storyboard.length) * 100}%` }" /></div>

        <!-- 缩略总览：点任意一格直接进镜头台并定位到那一镜 -->
        <div class="thumbs">
          <button
            v-for="(item, index) in visibleShots"
            :key="item.id"
            class="thumb"
            :class="{ failed: item.state === '生成失败' }"
            :title="`镜头 ${index + 1}`"
            @click.stop="openShots(item.id)">
            <span class="no">{{ index + 1 }}</span>
            <img v-if="item.src" :src="item.src" :alt="`镜头 ${index + 1}`" loading="lazy" />
            <span v-else class="blank">
              <t-loading v-if="item.state === '生成中'" size="small" />
              <template v-else>{{ item.state === "生成失败" ? "失败" : "待生成" }}</template>
            </span>
          </button>
          <button v-if="storyboard.length > VISIBLE_LIMIT" class="thumb more" @click.stop="openShots()">
            还有 {{ storyboard.length - VISIBLE_LIMIT }} 镜<br />在镜头台里看
          </button>
        </div>

        <p class="tip">出图、换参考、改提示词、出视频都在镜头台里做。</p>
      </template>
    </div>

    <t-image-viewer
      v-if="previewVisible"
      v-model:visible="previewVisible"
      :images="previewImages"
      :onClose="closePreview"
      :onDownload="downLoadImage"
      :imageScale="{ max: 10, min: 0.1 }" />
  </t-card>
</template>

<script setup lang="ts">
import { LoadingPlugin } from "tdesign-vue-next";
import { Handle, Position } from "@vue-flow/core";
import axios from "@/utils/axios";
import type { AssetItem, Storyboard } from "../utils/flowBuilder";
import projectStore from "@/stores/project";
import productionAgentStore from "@/stores/productionAgent";
const { project } = storeToRefs(projectStore());
const { episodesId } = storeToRefs(productionAgentStore());

// 分镜节点现在只是「进度总览 + 入口」：逐镜的出图 / 出视频、参考、版本、增删
// 全部在镜头台（/shots）里做，流程图不再承载这些操作。
const props = defineProps<{
  id: string;
  handleIds: { target: string; source: string };
  assetsData: AssetItem[];
}>();

const storyboard = defineModel<Storyboard[]>({ required: true });

const VISIBLE_LIMIT = 24;
const visibleShots = computed(() => storyboard.value.slice(0, VISIBLE_LIMIT));
const doneCount = computed(() => storyboard.value.filter((s) => s.src).length);
const failedCount = computed(() => storyboard.value.filter((s) => s.state === "生成失败").length);
const pendingCount = computed(() => storyboard.value.filter((s) => s.state === "生成中").length);

const router = useRouter();
/** 打开镜头台（逐镜出图 / 出视频、参考可自由挑、有版本链） */
function openShots(shotId?: number | null) {
  void router.push({ path: "/shots", query: { scriptId: String(episodesId.value ?? ""), shot: shotId ? String(shotId) : undefined } });
}

// ─── 九宫格预览 / 导出（整集总览，留在这里） ─────────────────
const previewVisible = ref(false);
const previewImages = ref<string[]>([]);

function closePreview() {
  previewImages.value = [];
}
const generatedIds = () => (storyboard.value ?? []).filter((s) => s.src).map((s) => s.id!);

async function previewAll() {
  const allIds = generatedIds();
  if (!allIds.length) return window.$message.warning($t("workbench.production.node.storyboard.noPreviewImages"));
  LoadingPlugin(true);
  try {
    const { data } = await axios.post("/production/storyboard/previewImage", { storyboardIds: allIds, projectId: project.value?.id });
    previewImages.value = [data];
    previewVisible.value = true;
  } catch {
    window.$message.error($t("workbench.production.node.storyboard.imageLoadFailed"));
  } finally {
    LoadingPlugin(false);
  }
}

async function downLoadImage() {
  const allIds = generatedIds();
  if (!allIds.length) return window.$message.warning($t("workbench.production.node.storyboard.noPreviewImages"));
  LoadingPlugin(true);
  try {
    const res = await axios.post("/production/storyboard/downPreviewImage", { storyboardIds: allIds }, { responseType: "blob" });
    const url = URL.createObjectURL(res as unknown as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storyboardImagePreview-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    window.$message.error($t("workbench.production.node.storyboard.imageLoadFailed"));
  } finally {
    LoadingPlugin(false);
  }
}
</script>

<style lang="scss" scoped>
.storyboard {
  width: 520px;
  user-select: text;
  cursor: default;

  .toShots {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
  }
  .titleBar {
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
  .content {
    margin-top: 12px;
  }
}
.progress {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  .num {
    font-size: 20px;
    font-weight: 600;
    color: var(--td-text-color-primary);
    font-variant-numeric: tabular-nums;
  }
  .failed {
    color: var(--td-error-color);
  }
  .pending {
    color: var(--td-brand-color);
  }
}
.grow {
  flex: 1;
}
.bar {
  height: 4px;
  margin: 6px 0 10px;
  border-radius: 2px;
  background: var(--td-bg-color-secondarycontainer);
  overflow: hidden;
  i {
    display: block;
    height: 100%;
    background: var(--td-brand-color);
    transition: width 0.3s;
  }
}
.thumbs {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}
.thumb {
  position: relative;
  padding: 0;
  border: 1px solid var(--td-component-stroke);
  border-radius: 6px;
  background: var(--td-bg-color-secondarycontainer);
  cursor: pointer;
  overflow: hidden;
  &:hover {
    border-color: var(--td-brand-color);
  }
  &.failed {
    border-color: var(--td-error-color);
  }
  img,
  .blank {
    display: grid;
    place-items: center;
    width: 100%;
    height: 56px;
    object-fit: cover;
    font-size: 10px;
    color: var(--td-text-color-placeholder);
  }
  &.more {
    display: grid;
    place-items: center;
    height: 56px;
    padding: 0 4px;
    font-size: 10px;
    line-height: 1.4;
    color: var(--td-text-color-placeholder);
  }
}
.no {
  position: absolute;
  top: 2px;
  left: 3px;
  z-index: 1;
  padding: 0 4px;
  border-radius: 3px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.tip {
  margin: 10px 0 0;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
</style>
