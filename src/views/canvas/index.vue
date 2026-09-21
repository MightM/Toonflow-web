<template>
  <div
    class="canvas-page"
    :class="[`tool-${tool}`, { 'space-pan': spaceHeld, 'alt-copy': altHeld }]"
    @dragover.prevent
    @drop.prevent="onDrop"
    @dragstart.prevent
    @pointerdown.capture="onPanePointerDown"
    @click.capture="onGroupBoxClick">
    <VueFlow
      id="assetCanvas"
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

    <!-- 顶部：返回 + 标题 + 集数筛选 -->
    <header class="topbar">
      <button class="glass-btn icon" aria-label="返回" @click="router.back()"><i-left size="18" /></button>
      <div class="title glass">
        <span class="eyebrow">资产画布</span>
        <strong>{{ project?.name }}</strong>
        <t-select v-model="episodeFilter" size="small" class="episode" :options="episodeOptions" placeholder="全部集" clearable borderless @change="reload" />
      </div>
      <AssetViewSwitch current="canvas" :script-id="scriptId" />
    </header>

    <!-- 底部工具栏（与无限画布一致，多一个「资产模型绑定」） -->
    <nav class="rail bottom glass" aria-label="画布工具">
      <t-tooltip content="新建文本节点" placement="top"><button aria-label="新建文本节点" @click="addNode('text')"><i-text size="20" /></button></t-tooltip>
      <t-tooltip content="新建图片节点" placement="top"><button aria-label="新建图片节点" @click="addNode('image')"><i-add-pic size="20" /></button></t-tooltip>
      <t-tooltip content="新建音频节点" placement="top"><button aria-label="新建音频节点" @click="addNode('audio')"><i-voice size="20" /></button></t-tooltip>
      <t-tooltip content="新建视频节点" placement="top"><button aria-label="新建视频节点" @click="addNode('video')"><i-video-two size="20" /></button></t-tooltip>
      <span class="rule" />
      <t-tooltip content="上传本地文件" placement="top"><button aria-label="上传本地文件" @click="uploadTo(null)"><i-upload size="20" /></button></t-tooltip>
      <t-tooltip content="从资产库导入" placement="top"><button aria-label="从资产库导入" @click="openLibrary"><i-box size="20" /></button></t-tooltip>
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

    <div v-if="!canvas.loading.value && canvas.nodes.value.length === 0" class="empty-state glass">
      <i-mind-mapping size="36" />
      <h3>画布还是空的</h3>
      <p>先在剧本里提取资产，或者从资产库导入、上传本地图片开始；也可以双击空白处新建节点。</p>
      <div class="starters">
        <button @click="addNode('text')"><i-text size="14" />写一段文字</button>
        <button @click="uploadTo(null)"><i-upload size="14" />上传素材</button>
        <button @click="addNode('image')"><i-add-pic size="14" />直接出图</button>
      </div>
    </div>

    <input ref="fileInput" type="file" hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/mp4" @change="onFilePicked" />
    <ConnectMenu :state="connectMenu" @pick="onMenuPick" @close="connectMenu = null" />
    <HistoryDrawer v-model:visible="historyVisible" :target="historyTarget" @preview="openPreview" />
    <CreateStateDialog v-model:visible="stateVisible" :parent-key="stateParent" @create="onCreateState" />
    <SaveToAssetsDialog v-model:visible="saveVisible" :node-key="saveKey" />
    <VoicePicker v-model:visible="voiceVisible" :node-key="voiceKey" @bind="bindVoice" />
    <GroupActionBar :selection="selection" @derive="deriveFrom" />
    <AssetModelsDialog v-if="projectId" v-model:visible="modelsVisible" :project-id="projectId" @saved="canvas.refresh" />
    <MediaLightbox v-model:visible="preview.visible" :src="preview.src" :kind="preview.kind" />
  </div>
</template>

<script setup lang="ts">
import { SelectionMode, VueFlow } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/minimap/dist/style.css";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import openAssetsSelector from "@/utils/assetsCheck";
import AssetNode from "./nodes/AssetNode.vue";
import MediaNode from "./nodes/MediaNode.vue";
import RefEdge from "./components/RefEdge.vue";
import MediaLightbox from "./components/MediaLightbox.vue";
import HistoryDrawer from "./components/HistoryDrawer.vue";
import CreateStateDialog from "./components/CreateStateDialog.vue";
import SaveToAssetsDialog from "./components/SaveToAssetsDialog.vue";
import AssetModelsDialog from "./components/AssetModelsDialog.vue";
import AssetViewSwitch from "../assetBoard/AssetViewSwitch.vue";
import ConnectMenu, { type ConnectMenuKind } from "./components/ConnectMenu.vue";
import GroupActionBar from "./components/GroupActionBar.vue";
import VoicePicker from "./components/VoicePicker.vue";
import { canvasApi, readAsDataUrl } from "./api";
import { CANVAS_CTX, type CanvasContext } from "./context";
import { useCanvas, confirmDialog, type CanvasNode } from "./useCanvas";
import { MENU_NODE_WIDTH, MULTI_SELECT_KEYS, UNDO_HINT, useCanvasInteractions } from "./useCanvasInteractions";
import { useFrameCapture } from "./useFrameCapture";
import type { CanvasPreset, MediaKind } from "./types";

const route = useRoute();
const router = useRouter();
const { project } = storeToRefs(projectStore());

const projectId = computed(() => Number(project.value?.id ?? 0));
const scriptId = ref<number | null>(route.query.scriptId ? Number(route.query.scriptId) : null);
// t-select 不接受 null，筛选框用 undefined 表示「全部集」
const episodeFilter = computed({
  get: () => scriptId.value ?? undefined,
  set: (value: number | undefined) => (scriptId.value = value ?? null),
});

const canvas = useCanvas(projectId, scriptId);
// 弹窗状态要先于交互层声明：快捷键在弹窗打开时不响应
const stateVisible = ref(false);
const stateParent = ref<string | null>(null);
const saveVisible = ref(false);
const saveKey = ref<string | null>(null);
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
} = useCanvasInteractions({
  flowId: "assetCanvas",
  canvas,
  projectId,
  persistViewport: () => !scriptId.value, // 按集筛选时不保存 / 恢复视口
  extraDialogOpen: () => stateVisible.value || saveVisible.value || modelsVisible.value,
  projectArtStyle: () => project.value?.artStyle,
});

// ─── 数据加载 ────────────────────────────────────────
const episodeOptions = ref<{ label: string; value: number }[]>([]);
async function loadEpisodes() {
  try {
    const { data } = await axios.post("/script/getScrptApi", { projectId: projectId.value, name: "" });
    episodeOptions.value = (data ?? []).map((ep: { id: number; name: string }) => ({ label: ep.name, value: ep.id }));
  } catch {
    episodeOptions.value = [];
  }
}

onMounted(async () => {
  if (!projectId.value) {
    window.$message.warning("请先打开一个项目");
    return router.replace("/project");
  }
  await Promise.all([canvas.load(false), loadEpisodes(), loadPresets()]);
  await nextTick();
  await restoreViewport();
});

async function relayout() {
  const ok = await confirmDialog(`按「角色 → 场景 → 道具 → 素材」重新排列所有节点？手动摆放的位置会被覆盖（可按 ${UNDO_HINT} 撤销）。`);
  if (!ok) return;
  await canvas.saveLayoutReset();
  await reload();
}

async function addNode(kind: MediaKind) {
  const key = await canvas.createNode(kind, viewportCenter(), undefined, defaultParams(kind));
  if (key) selectOnly(key);
}

// 拖线 / 双击弹出的新建菜单：文本 / 图片 / 音频 / 视频、新建状态、角色 / 场景 / 道具、上传
async function onMenuPick(kind: ConnectMenuKind, name: string) {
  const menu = connectMenu.value;
  connectMenu.value = null;
  if (!menu) return;
  if (kind === "state") return menu.from && openCreateState(menu.from.key);
  const link = linkFromMenu(menu);
  if (kind === "upload") return uploadTo(null, { link, position: placeFromMenu(menu, MENU_NODE_WIDTH.media) });
  const key =
    kind === "image" || kind === "video" || kind === "text" || kind === "audio"
      ? await canvas.createNode(kind, placeFromMenu(menu, MENU_NODE_WIDTH.media), link, defaultParams(kind))
      : kind === "role" || kind === "scene" || kind === "tool"
        ? await canvas.createAsset(kind, name, placeFromMenu(menu, kind === "role" ? MENU_NODE_WIDTH.role : MENU_NODE_WIDTH.asset), link)
        : undefined;
  if (key) selectOnly(key);
}

// ─── 资产库导入 ──────────────────────────────────────
async function openLibrary() {
  const picked = await openAssetsSelector({ title: "从资产库导入", types: ["role", "scene", "tool", "clip"], selectorMode: true, multiple: true });
  if (!picked.length) return;
  const onCanvas = canvas.dtoByKey.value;
  const assetKeys = picked.filter((a) => a.type !== "clip").map((a) => `a:${a.id}`);
  const missing = assetKeys.filter((k) => !onCanvas.has(k));
  if (missing.length) {
    const pinned = [...new Set([...(canvas.data.value?.layout.pinned ?? []), ...missing])];
    await canvasApi.saveLayout({ projectId: projectId.value, pinned });
  }
  // 素材（clip）复制成画布上的自由节点
  const clips = picked.filter((a) => a.type === "clip" && a.src);
  for (const [i, clip] of clips.entries()) {
    await canvas.run(async () => {
      const blob = await (await fetch(clip.src!)).blob();
      const base64Data = await readAsDataUrl(new File([blob], clip.name, { type: blob.type }));
      const c = viewportCenter();
      const created = await canvasApi.upload({ projectId: projectId.value, base64Data, name: clip.name, position: { x: c.x + i * 40, y: c.y + i * 40 } });
      canvas.recordCreated(created.key, `导入「${clip.name}」`);
    }, `导入素材「${clip.name}」失败`);
  }
  await canvas.refresh();
  const focus = assetKeys[0];
  if (focus) {
    selectOnly(focus);
    await nextTick();
    await focusNode(focus);
  }
}

// ─── 新建状态 ────────────────────────────────────────
function openCreateState(key: string) {
  stateParent.value = key;
  stateVisible.value = true;
}
async function onCreateState(payload: { parentKey: string; name: string; describe: string }) {
  const key = await canvas.createState(payload.parentKey, payload.name, payload.describe, payload.describe);
  if (key) selectOnly(key);
}

const miniNodeColor = (node: CanvasNode) => {
  const dto = node.data?.dto;
  const type = dto?.assetType;
  if (!type) return "#8b5cf6";
  return { role: "var(--td-brand-color)", scene: "var(--td-success-color)", tool: "var(--td-warning-color)" }[type];
};

// 视频节点截帧
const { captureFrame } = useFrameCapture({
  canvas,
  projectId,
  nodeWidth: (key) => flow.findNode(key)?.dimensions?.width || MENU_NODE_WIDTH.media,
  nodePosition: (key) => flow.findNode(key)?.position ?? null,
  afterCreate: (key) => selectOnly(key),
});

// 目标模板（改了模板文件后重新打开画布即可看到）
const presets = ref<CanvasPreset[]>([]);
async function loadPresets() {
  try {
    // 与无限画布一致：图片节点能用的模板都给（资产节点在 NodeComposer 里按 role / scene / tool 再过滤）
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
  // 自由图片节点默认「画面描述」；资产节点由 NodeComposer 按类型选内置默认
  defaultPresetFor: (key) => (canvas.dtoByKey.value.get(key)?.kind === "image" ? "free_canvas" : null),
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
  openCreateState,
  openHistory,
  openVoice,
  openSaveToAssets: (key) => {
    saveKey.value = key;
    saveVisible.value = true;
  },
  openPreview,
  uploadTo,
  deleteNode: (key) => void deleteWithHint([key]),
  captureFrame: (key, at) => void captureFrame(key, at),
};
provide(CANVAS_CTX, ctx);
</script>

<style lang="scss" scoped src="./canvasPage.scss"></style>
