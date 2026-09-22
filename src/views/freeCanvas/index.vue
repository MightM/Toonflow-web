<template>
  <div
    class="canvas-page free-canvas"
    :class="[`tool-${tool}`, { 'space-pan': spaceHeld, 'alt-copy': altHeld }]"
    @dragover.prevent
    @drop.prevent="onDrop"
    @dragstart.prevent
    @pointerdown.capture="onPanePointerDown"
    @click.capture="onGroupBoxClick">
    <VueFlow
      id="freeCanvas"
      v-model:nodes="canvas.nodes.value"
      v-model:edges="canvas.edges.value"
      class="flow"
      :min-zoom="0.1"
      :max-zoom="3"
      :delete-key-code="null"
      :zoom-on-double-click="false"
      :pan-on-drag="activeTool === 'pan' ? true : [1]"
      :selection-key-code="activeTool === 'select' ? true : 'Shift'"
      :multi-selection-key-code="MULTI_SELECT_KEYS"
      :selection-mode="SelectionMode.Partial"
      pan-activation-key-code="Space"
      :pan-on-scroll="true"
      :zoom-on-scroll="true"
      :zoom-on-pinch="true"
      @connect="onConnect"
      @connect-start="onConnectStart"
      @connect-end="onConnectEnd"
      @node-drag-start="onDragStart"
      @node-drag-stop="onDragStop"
      @selection-drag-start="onDragStart"
      @selection-drag-stop="onDragStop"
      @selection-end="onSelectionEnd"
      @move-end="onMoveEnd"
      @dblclick="onPaneDblclick">
      <!-- 「存入资产库」会把自由节点变成资产节点，所以这里也要能渲染资产 -->
      <template #node-asset="nodeProps">
        <AssetNode v-bind="nodeProps" />
      </template>
      <template #node-media="nodeProps">
        <MediaNode v-bind="nodeProps" />
      </template>
      <template #edge-ref="edgeProps">
        <RefEdge v-bind="edgeProps" />
      </template>
      <Background :gap="22" :size="1.2" pattern-color="var(--canvas-dot)" />
      <MiniMap pannable zoomable class="minimap" :node-color="miniNodeColor" :mask-color="'var(--canvas-mask)'" />
    </VueFlow>

    <!-- 顶部：返回 + 标题 -->
    <header class="topbar">
      <button class="glass-btn icon" aria-label="返回项目列表" @click="router.push('/project')"><i-left size="18" /></button>
      <div class="title glass">
        <span class="eyebrow">无限画布</span>
        <strong>{{ project?.name }}</strong>
        <span class="counts" :title="`文本 ${counts.text} · 图片 ${counts.image} · 音频 ${counts.audio} · 视频 ${counts.video}`">{{ canvas.nodes.value.length }} 个节点</span>
      </div>
    </header>

    <!-- 右侧工具栏 -->
    <nav class="rail bottom glass" aria-label="画布工具">
      <t-tooltip content="新建文本节点" placement="top"><button aria-label="新建文本节点" @click="addNode('text')"><i-text size="20" /></button></t-tooltip>
      <t-tooltip content="新建图片节点" placement="top"><button aria-label="新建图片节点" @click="addNode('image')"><i-add-pic size="20" /></button></t-tooltip>
      <t-tooltip content="新建音频节点" placement="top"><button aria-label="新建音频节点" @click="addNode('audio')"><i-voice size="20" /></button></t-tooltip>
      <t-tooltip content="新建视频节点" placement="top"><button aria-label="新建视频节点" @click="addNode('video')"><i-video-two size="20" /></button></t-tooltip>
      <span class="rule" />
      <t-tooltip content="上传本地文件" placement="top"><button aria-label="上传本地文件" @click="uploadTo(null)"><i-upload size="20" /></button></t-tooltip>
      <t-tooltip content="从资产中心导入素材" placement="top"><button aria-label="从资产中心导入素材" @click="openLibrary"><i-box size="20" /></button></t-tooltip>
      <t-tooltip content="查看历史" placement="top"><button aria-label="查看历史" @click="openHistory(null)"><i-history size="20" /></button></t-tooltip>
      <span class="rule" />
      <t-tooltip content="资产模型绑定" placement="top"><button aria-label="资产模型绑定" @click="modelsVisible = true"><i-setting-two size="20" /></button></t-tooltip>
      <t-tooltip content="重新整理布局" placement="top"><button aria-label="重新整理布局" @click="relayout"><i-tree-diagram size="20" /></button></t-tooltip>
    </nav>

    <!-- 左下：选择 / 拖拽 + 缩放 -->
    <div class="dock glass">
      <button :class="{ active: tool === 'select' }" aria-label="移动 / 框选" title="移动 / 框选（V）：拖动空白处框选，Shift 追加选中" @click="setTool('select')"><i-mouse size="16" /></button>
      <button :class="{ active: tool === 'pan' }" aria-label="抓手" title="抓手（H）：拖动画布；任何时候按住空格也可拖动" @click="setTool('pan')"><i-palm size="16" /></button>
      <span class="rule v" />
      <button aria-label="缩小" @click="zoomOut({ duration: 200 })"><i-minus size="14" /></button>
      <span class="zoom">{{ Math.round(viewport.zoom * 100) }}%</span>
      <button aria-label="放大" @click="zoomIn({ duration: 200 })"><i-plus size="14" /></button>
      <button aria-label="适应画布" title="适应画布" @click="fitViewBelowTopbar(300)"><i-full-screen-one size="14" /></button>
      <span class="rule v" />
      <button aria-label="撤销" :title="`撤销（${UNDO_HINT}）`" :disabled="!canvas.canUndo.value" @click="canvas.undo()"><i-undo size="14" /></button>
    </div>

    <!-- 多选：整组生成 -->
    <GroupActionBar :selection="selection" @derive="deriveFrom" />

    <div v-if="!canvas.loading.value && canvas.nodes.value.length === 0" class="empty-state glass">
      <i-mind-mapping size="36" />
      <h3>从一个念头开始</h3>
      <p>双击空白处新建文本、图片、音频或视频节点，拖线把它们连起来：文本可以生成图片、视频、语音，图片可以动起来，多张图可以一起参考。</p>
      <div class="starters">
        <button @click="addNode('text')"><i-text size="14" />写一段文字</button>
        <button @click="uploadTo(null)"><i-upload size="14" />上传素材</button>
        <button @click="addNode('image')"><i-add-pic size="14" />直接出图</button>
      </div>
    </div>

    <input ref="fileInput" type="file" hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/mp4" @change="onFilePicked" />
    <ConnectMenu :state="connectMenu" variant="free" @pick="onMenuPick" @close="connectMenu = null" />
    <HistoryDrawer v-model:visible="historyVisible" :target="historyTarget" @preview="openPreview" />
    <MediaLightbox v-model:visible="preview.visible" :src="preview.src" :kind="preview.kind" />
    <SaveToAssetsDialog v-model:visible="saveVisible" :node-key="saveKey" />
    <CreateStateDialog v-model:visible="stateVisible" :parent-key="stateParent" @create="onCreateState" />
    <AssetModelsDialog v-if="projectId" v-model:visible="modelsVisible" :project-id="projectId" @saved="canvas.refresh" />
    <VoicePicker v-model:visible="voiceVisible" :node-key="voiceKey" @bind="bindVoice" />
    <CropDialog v-model:visible="cropVisible" :src="cropSrc" :name="cropName" @confirm="applyCrop" />
  </div>
</template>

<script setup lang="ts">
// 无限画布：projectType = canvas 的项目主页面。与资产画布共用节点组件、输入面板、历史、回收站、撤销与全部交互，
// 区别只在：节点只有文本 / 图片 / 音频 / 视频四种自由节点，没有资产、集数与资产模型绑定。
import { SelectionMode, VueFlow } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/minimap/dist/style.css";
import projectStore from "@/stores/project";
import openAssetsSelector from "@/utils/assetsCheck";
import MediaNode from "../canvas/nodes/MediaNode.vue";
import AssetNode from "../canvas/nodes/AssetNode.vue";
import CreateStateDialog from "../canvas/components/CreateStateDialog.vue";
import AssetModelsDialog from "../canvas/components/AssetModelsDialog.vue";
import RefEdge from "../canvas/components/RefEdge.vue";
import MediaLightbox from "../canvas/components/MediaLightbox.vue";
import HistoryDrawer from "../canvas/components/HistoryDrawer.vue";
import ConnectMenu, { type ConnectMenuKind } from "../canvas/components/ConnectMenu.vue";
import GroupActionBar from "../canvas/components/GroupActionBar.vue";
import VoicePicker from "../canvas/components/VoicePicker.vue";
import CropDialog from "../canvas/components/CropDialog.vue";
import SaveToAssetsDialog from "../canvas/components/SaveToAssetsDialog.vue";
import { canvasApi, readAsDataUrl } from "../canvas/api";
import { CANVAS_CTX, type CanvasContext } from "../canvas/context";
import { useCanvas, confirmDialog, type CanvasNode } from "../canvas/useCanvas";
import { MULTI_SELECT_KEYS, UNDO_HINT, useCanvasInteractions } from "../canvas/useCanvasInteractions";
import { useFrameCapture } from "../canvas/useFrameCapture";
import type { CanvasPreset, MediaKind } from "../canvas/types";

const router = useRouter();
const { project } = storeToRefs(projectStore());
const projectId = computed(() => Number(project.value?.id ?? 0));
const scriptId = ref<number | null>(null); // 无限画布没有集数

const FRAME_WIDTH = 384; // frame 式卡片宽度（MediaNode .frame），排版与落位按它算
const KIND_COLOR: Record<string, string> = { text: "#f59e0b", image: "#2563eb", video: "#8b5cf6", audio: "#0ea5e9" };
const canvas = useCanvas(projectId, scriptId, { mediaWidth: FRAME_WIDTH });
// 存入资产库弹窗（弹窗状态先于交互层声明，快捷键在弹窗打开时不响应）
const saveVisible = ref(false);
const saveKey = ref<string | null>(null);
const stateVisible = ref(false);
const stateParent = ref<string | null>(null);
const modelsVisible = ref(false);
const {
  flow,
  zoomIn,
  zoomOut,
  viewport,
  getSelectedNodes,
  tool,
  activeTool,
  spaceHeld,
  altHeld,
  setTool,
  focusNode,
  fitViewBelowTopbar,
  restoreViewport,
  reload,
  zoomAt,
  viewportCenter,
  selectOnly,
  onConnect,
  onConnectStart,
  onConnectEnd,
  onDragStart,
  onDragStop,
  onMoveEnd,
  onPaneDblclick,
  onPanePointerDown,
  onSelectionEnd,
  onGroupBoxClick,
  connectMenu,
  placeFromMenu,
  linkFromMenu,
  fileInput,
  uploadTo,
  onFilePicked,
  onDrop,
  historyVisible,
  historyTarget,
  openHistory,
  preview,
  openPreview,
  deleteWithHint,
  defaultParams,
  selection,
  deriveFrom,
  artStyles,
  voiceVisible,
  voiceKey,
  openVoice,
  bindVoice,
  cropVisible,
  cropSrc,
  cropName,
  openCrop,
  applyCrop,
} = useCanvasInteractions({
  flowId: "freeCanvas",
  canvas,
  projectId,
  extraDialogOpen: () => saveVisible.value || stateVisible.value || modelsVisible.value,
  projectArtStyle: () => project.value?.artStyle,
});

onMounted(async () => {
  if (!projectId.value) {
    window.$message.warning("请先打开一个项目");
    return router.replace("/project");
  }
  await Promise.all([canvas.load(false), loadPresets()]);
  await nextTick();
  await restoreViewport();
});

const counts = computed(() => {
  const c = { text: 0, image: 0, audio: 0, video: 0 };
  for (const n of canvas.nodes.value) {
    const kind = n.data?.dto.kind as keyof typeof c;
    if (kind in c) c[kind] += 1;
  }
  return c;
});

async function relayout() {
  const ok = await confirmDialog(`重新排列所有节点？手动摆放的位置会被覆盖（可按 ${UNDO_HINT} 撤销）。`);
  if (!ok) return;
  await canvas.saveLayoutReset();
  await reload();
}

async function addNode(kind: MediaKind) {
  const key = await canvas.createNode(kind, viewportCenter(), undefined, defaultParams(kind));
  if (key) selectOnly(key);
}

// 拖线 / 双击弹出的新建菜单：文本 / 图片 / 音频 / 视频 / 上传
async function onMenuPick(kind: ConnectMenuKind) {
  const menu = connectMenu.value;
  connectMenu.value = null;
  if (!menu) return;
  const link = linkFromMenu(menu);
  if (kind === "upload") return uploadTo(null, { link, position: placeFromMenu(menu, FRAME_WIDTH) });
  if (kind !== "text" && kind !== "image" && kind !== "audio" && kind !== "video") return;
  const key = await canvas.createNode(kind, placeFromMenu(menu, FRAME_WIDTH), link, defaultParams(kind));
  if (key) selectOnly(key);
}

// ─── 从资产中心导入素材（复制成画布上的自由节点） ─────────────────
async function openLibrary() {
  const picked = await openAssetsSelector({ title: "从资产中心导入", types: ["clip", "audio"], selectorMode: true, multiple: true });
  // 音色资产（父级）本身没有文件，样本在子项里；拿第一条样本当作导入的音频
  const items = picked.map((a) => ({ ...a, src: a.src || (a as { sonAssets?: { src?: string }[] }).sonAssets?.find((s) => s.src)?.src || "" }));
  const skipped = items.filter((a) => !a.src);
  if (skipped.length) window.$message.warning(`「${skipped.map((a) => a.name).join("、")}」没有可导入的文件`);
  if (!items.some((a) => a.src)) return;
  let last: string | undefined;
  for (const [i, item] of items.filter((a) => a.src).entries()) {
    last = await canvas.run(async () => {
      const blob = await (await fetch(item.src)).blob();
      const base64Data = await readAsDataUrl(new File([blob], item.name, { type: blob.type }));
      const c = viewportCenter();
      const created = await canvasApi.upload({ projectId: projectId.value, base64Data, name: item.name, position: { x: c.x + i * 40, y: c.y + i * 40 } });
      canvas.recordCreated(created.key, `导入「${item.name}」`);
      return created.key;
    }, `导入素材「${item.name}」失败`);
  }
  await canvas.refresh();
  if (last) selectOnly(last);
}

const miniNodeColor = (node: CanvasNode) => KIND_COLOR[node.data?.dto.kind ?? ""] ?? "#8b5cf6";

// 新建状态（存入资产库之后的资产节点也能派生状态，与资产画布一致）
function openCreateState(key: string) {
  stateParent.value = key;
  stateVisible.value = true;
}
async function onCreateState(payload: { parentKey: string; name: string; describe: string }) {
  const key = await canvas.createState(payload.parentKey, payload.name, payload.describe, payload.describe);
  if (key) selectOnly(key);
}

// 视频截帧
const { captureFrame } = useFrameCapture({
  canvas,
  projectId,
  nodeWidth: (key) => flow.findNode(key)?.dimensions?.width || FRAME_WIDTH,
  nodePosition: (key) => flow.findNode(key)?.position ?? null,
  afterCreate: (key) => selectOnly(key),
});

// 目标模板：图片节点能用的全部模板（人物 / 场景 / 道具 / 通用）都给，默认「画面描述」
const presets = ref<CanvasPreset[]>([]);
async function loadPresets() {
  try {
    presets.value = await canvasApi.getPresets(projectId.value);
  } catch {
    presets.value = [];
  }
}

const ctx: CanvasContext = {
  projectId,
  defaults: computed(() => canvas.data.value?.defaults ?? null),
  presets: computed(() => presets.value),
  lastPresetOf: (key) => {
    const meta = canvas.data.value?.layout.nodeMeta[key];
    return typeof meta?.presetId === "string" ? meta.presetId : undefined;
  },
  defaultPresetFor: () => "free_canvas",
  dtoByKey: canvas.dtoByKey,
  refEdgesOf: canvas.refEdgesOf,
  reorderRefs: canvas.reorderRefs,
  selectedCount: computed(() => getSelectedNodes.value.length),
  renameNode: canvas.renameNode,
  setAssetType: canvas.setAssetType,
  track: canvas.track,
  refresh: canvas.refresh,
  zoomAt,
  cancelGeneration: canvas.cancelGeneration,
  artStyles: computed(() => artStyles.value),
  setArtStyle: canvas.setArtStyle,
  captureFrame: (key, at) => void captureFrame(key, at),
  openCrop,
  openCreateState,
  openVoice,
  openSaveToAssets: (key) => {
    saveKey.value = key;
    saveVisible.value = true;
  },
  openHistory,
  openPreview,
  uploadTo,
  deleteNode: (key) => void deleteWithHint([key]),
};
provide(CANVAS_CTX, ctx);
</script>

<style lang="scss" scoped src="../canvas/canvasPage.scss"></style>
<style lang="scss" scoped>
.title .counts {
  margin-left: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--td-bg-color-secondarycontainer);
  font-size: 11px;
  color: var(--td-text-color-secondary);
  white-space: nowrap;
}
.empty-state {
  max-width: 460px;
}
</style>
