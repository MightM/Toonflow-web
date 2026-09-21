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
    <div v-if="selection.length >= 2" class="group-bar glass">
      <span class="picked">已选 {{ selection.length }} 个节点</span>
      <button v-if="selectedImages.length >= 2" class="accent" @click="deriveFrom(selectedImages, 'video')"><i-video-two size="14" />{{ selectedImages.length }} 图生视频</button>
      <button v-else class="accent" @click="deriveFrom(selection, 'video')"><i-video-two size="14" />生成视频</button>
      <button @click="deriveFrom(selection, 'image')"><i-pic size="14" />生成图片</button>
      <button v-if="selectedTexts.length" @click="deriveFrom(selectedTexts, 'audio')"><i-voice size="14" />生成语音</button>
      <span class="hint">按选中顺序排成 图1、图2…</span>
    </div>

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
import RefEdge from "../canvas/components/RefEdge.vue";
import MediaLightbox from "../canvas/components/MediaLightbox.vue";
import HistoryDrawer from "../canvas/components/HistoryDrawer.vue";
import ConnectMenu, { type ConnectMenuKind } from "../canvas/components/ConnectMenu.vue";
import { canvasApi, readAsDataUrl } from "../canvas/api";
import { CANVAS_CTX, type CanvasContext } from "../canvas/context";
import { useCanvas, confirmDialog, type CanvasNode } from "../canvas/useCanvas";
import { MULTI_SELECT_KEYS, UNDO_HINT, useCanvasInteractions } from "../canvas/useCanvasInteractions";
import { useFrameCapture } from "../canvas/useFrameCapture";
import type { ArtStyleDto, CanvasPreset, MediaKind } from "../canvas/types";

const router = useRouter();
const { project } = storeToRefs(projectStore());
const projectId = computed(() => Number(project.value?.id ?? 0));
const scriptId = ref<number | null>(null); // 无限画布没有集数

const NODE_GAP = 70;
const FRAME_WIDTH = 384; // frame 式卡片宽度（MediaNode .frame），排版与落位按它算
const KIND_COLOR: Record<string, string> = { text: "#f59e0b", image: "#2563eb", video: "#8b5cf6", audio: "#0ea5e9" };
const canvas = useCanvas(projectId, scriptId, { mediaWidth: FRAME_WIDTH });
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
} = useCanvasInteractions({ flowId: "freeCanvas", canvas, projectId });

onMounted(async () => {
  if (!projectId.value) {
    window.$message.warning("请先打开一个项目");
    return router.replace("/project");
  }
  await Promise.all([canvas.load(false), loadPresets(), loadArtStyles()]);
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

// 新建图片节点默认带上项目绑定的画风（可在节点上换或清除）
const defaultParams = (kind: MediaKind) => (kind === "image" && project.value?.artStyle ? { artStyle: project.value.artStyle } : undefined);
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

// ─── 多选整组生成：以选中的节点为参考新建下游节点，按选中顺序连线（决定图1、图2…） ─────────
const selection = computed(() => getSelectedNodes.value.map((n) => n.id));
const kindOf = (key: string) => canvas.dtoByKey.value.get(key)?.kind;
const selectedImages = computed(() => selection.value.filter((k) => kindOf(k) === "image"));
const selectedTexts = computed(() => selection.value.filter((k) => kindOf(k) === "text"));
async function deriveFrom(sourceKeys: string[], kind: MediaKind) {
  if (!sourceKeys.length) return;
  // 放在最右边那个源节点的右侧、第一个源节点的高度
  const sources = sourceKeys.map((k) => flow.findNode(k)).filter((n): n is NonNullable<typeof n> => !!n);
  const right = Math.max(...sources.map((n) => n.position.x + (n.dimensions?.width || FRAME_WIDTH)));
  const position = { x: Math.round(right + NODE_GAP), y: Math.round(sources[0]?.position.y ?? 0) };
  const key = await canvas.run(async () => {
    const created = await canvas.createNode(kind, position, undefined, defaultParams(kind));
    if (!created) return undefined;
    for (const source of sourceKeys) await canvasApi.addEdge(projectId.value, source, created);
    await canvas.refresh();
    return created;
  }, "生成节点失败");
  if (!key) return;
  selectOnly(key);
  await nextTick();
  await focusNode(key);
}

// ─── 从资产中心导入素材（复制成画布上的自由节点） ─────────────────
async function openLibrary() {
  const picked = await openAssetsSelector({ title: "从资产中心导入", types: ["clip", "audio"], selectorMode: true, multiple: true });
  const items = picked.filter((a) => a.src);
  if (!items.length) return;
  let last: string | undefined;
  for (const [i, item] of items.entries()) {
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

// 画风清单（视觉手册）
const artStyles = ref<ArtStyleDto[]>([]);
async function loadArtStyles() {
  try {
    artStyles.value = await canvasApi.listArtStyles();
  } catch {
    artStyles.value = [];
  }
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
    presets.value = (await canvasApi.getPresets(projectId.value)).filter((p) => p.targets.includes("free") || p.targets.includes("image"));
  } catch {
    presets.value = [];
  }
}

const noop = () => undefined;
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
  // 无限画布没有资产：状态 / 音色 / 存入资产库都不提供
  openCreateState: noop,
  openVoice: noop,
  openHistory,
  openPreview,
  uploadTo,
  deleteNode: (key) => void deleteWithHint([key]),
  // 图片 / 视频节点的按钮文案：这里都叫「优化提示词」（资产画布仍叫「扩写」）
  polishLabel: () => "优化提示词",
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
.group-bar {
  position: absolute;
  left: 50%;
  bottom: 84px; // 工具栏在底部居中，整组栏放它上面
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 12px;
  border-radius: 14px;
  .picked {
    margin-right: 4px;
    font-size: 12px;
    color: var(--td-text-color-secondary);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 12px;
    border: none;
    border-radius: 9px;
    background: var(--td-bg-color-secondarycontainer);
    color: var(--td-text-color-primary);
    font-size: 12px;
    cursor: pointer;
    transition: background-color 150ms, transform 150ms;
    &:hover {
      background: var(--td-bg-color-container-hover);
    }
    &:active {
      transform: scale(0.96);
    }
    &.accent {
      background: var(--td-brand-color);
      color: #fff;
      &:hover {
        background: var(--td-brand-color-hover);
      }
    }
  }
  .hint {
    margin-left: 6px;
    font-size: 11px;
    color: var(--td-text-color-placeholder);
  }
}
.empty-state {
  max-width: 460px;
  .starters {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 16px;
    button {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 32px;
      padding: 0 14px;
      border-radius: 10px;
      border: 1px solid var(--td-component-stroke);
      background: var(--td-bg-color-container);
      color: var(--td-text-color-primary);
      font-size: 12px;
      cursor: pointer;
      transition: border-color 150ms, transform 150ms;
      &:hover {
        border-color: var(--td-brand-color);
        transform: translateY(-1px);
      }
    }
  }
}
</style>
