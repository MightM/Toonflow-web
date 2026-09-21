<template>
  <div class="production-page" :class="[`tool-${tool}`, { 'space-pan': spaceHeld }]">
    <VueFlow
      class="flow flowMain"
      :class="{ 'is-interacting': isInteracting && otherSetting.interacting }"
      id="mainFlowBox"
      :nodes="episodesId ? nodes : []"
      :edges="episodesId ? edges : []"
      :only-render-visible-elements="false"
      :max-zoom="10"
      :min-zoom="0.1"
      :nodes-focusable="false"
      :edges-focusable="false"
      :edges-updatable="false"
      :elevate-nodes-on-select="true"
      :elevate-edges-on-select="false"
      :disable-keyboard-a11y="true"
      :select-nodes-on-drag="false"
      :auto-pan-on-node-drag="false"
      :auto-pan-on-connect="false"
      :zoom-on-double-click="false"
      :delete-key-code="null"
      fit-view-on-init
      :pan-on-drag="activeTool === 'pan' ? true : [1]"
      :selection-key-code="activeTool === 'select' ? true : 'Shift'"
      :multi-selection-key-code="MULTI_SELECT_KEYS"
      :selection-mode="SelectionMode.Partial"
      pan-activation-key-code="Space"
      :pan-on-scroll="true"
      :zoom-on-scroll="true"
      :zoom-on-pinch="true">
      <template #node-script="props">
        <scriptNode :id="props.id" v-model="flowData.script" :handleIds="props.data.handleIds" />
      </template>
      <template #node-scriptPlan="props">
        <scriptPlan :id="props.id" v-model="flowData.scriptPlan" :handleIds="props.data.handleIds" />
      </template>
      <template #node-storyboardTable="props">
        <storyboardTable :id="props.id" v-model="flowData.storyboardTable" :handleIds="props.data.handleIds" />
      </template>
      <template #node-assets="props">
        <assets :id="props.id" v-model="flowData.assets" :handleIds="props.data.handleIds" />
      </template>
      <template #node-storyboard="props">
        <storyboard :id="props.id" v-model="flowData.storyboard" :assetsData="flowData.assets" :handleIds="props.data.handleIds" />
      </template>
      <template #node-workbench="props">
        <workbench :id="props.id" v-model="flowData.workbench" :handleIds="props.data.handleIds" />
      </template>
      <!-- <template #node-poster="props">
        <poster :id="props.id" v-model="flowData.poster" :handleIds="props.data.handleIds" />
      </template> -->
      <Background :gap="22" :size="1.2" pattern-color="var(--canvas-dot)" />
      <MiniMap pannable zoomable class="minimap" :node-color="miniNodeColor" :mask-color="'var(--canvas-mask)'" />
    </VueFlow>

    <!-- 顶部：返回 + 项目名 + 集数筛选 -->
    <header class="topbar">
      <button class="glass-btn" aria-label="返回" @click="router.back()"><i-left size="18" /></button>
      <div class="title glass">
        <span class="eyebrow">生产</span>
        <strong>{{ project?.name }}</strong>
        <t-select
          class="episodesSelect episode"
          :value="episodesId"
          :placeholder="$t('workbench.production.selectPlaceholder')"
          size="small"
          borderless
          :options="episodesOptions"
          filterable
          @change="handleEpisodesChange">
          <template #label>
            <i-document-folder size="16" />
          </template>
        </t-select>
      </div>
    </header>

    <!-- 右侧工具栏：抽屉打开时贴着它的左边缘，关上时回到窗口右侧 -->
    <nav class="rail glass" aria-label="生产工具" :style="{ right: `${railRight}px` }">
      <t-tooltip :content="chatOpen ? '收起 AI 助手' : '打开 AI 助手'" placement="left">
        <button class="openRightChatBoxBtn" :aria-label="chatOpen ? '收起 AI 助手' : '打开 AI 助手'" @click.stop="openShowVisible = !openShowVisible">
          <i-menu-fold-one v-if="chatOpen" size="20" />
          <i-menu-unfold-one v-else size="20" />
        </button>
      </t-tooltip>
      <span class="rule" />
      <t-tooltip :content="$t('workbench.production.getFlowData')" placement="left">
        <button class="guide-refresh-btn" :aria-label="$t('workbench.production.getFlowData')" @click="refFlowData"><i-refresh size="20" /></button>
      </t-tooltip>
      <t-tooltip :content="$t('workbench.production.autoLayoutLR')" placement="left">
        <button class="guide-layout-btn" :aria-label="$t('workbench.production.autoLayoutLR')" @click="layoutGraph()"><i-tree-diagram size="20" /></button>
      </t-tooltip>
      <i-loading-four v-show="loading" class="spin railLoading" size="18" />
    </nav>

    <!-- 左下：工具切换 + 缩放 -->
    <div class="dock glass">
      <button :class="{ active: tool === 'select' }" aria-label="移动 / 框选" title="移动 / 框选（V）：拖动空白处框选，Shift 追加选中" @click="setTool('select')">
        <i-mouse size="16" />
      </button>
      <button :class="{ active: tool === 'pan' }" aria-label="抓手" title="抓手（H）：拖动画布；任何时候按住空格也可拖动" @click="setTool('pan')">
        <i-palm size="16" />
      </button>
      <span class="rule v" />
      <button aria-label="缩小" @click="zoomOut({ duration: ZOOM_DURATION })"><i-minus size="14" /></button>
      <span class="zoom">{{ Math.round(viewport.zoom * 100) }}%</span>
      <button aria-label="放大" @click="zoomIn({ duration: ZOOM_DURATION })"><i-plus size="14" /></button>
      <button aria-label="适应画布" title="适应画布" @click="fitView({ duration: 300 })"><i-full-screen-one size="14" /></button>
    </div>

    <transition name="slide" v-show="openShowVisible" v-if="episodesId">
      <rightChatBox :title="title" v-model="flowData" v-model:width="chatWidth" @close="openShowVisible = false" />
    </transition>
    <t-guide v-model="current" :steps="steps" @finish="() => (current = -1)" />
    <t-tag variant="outline" class="fps" v-if="!openShowVisible">{{ fps }}</t-tag>
  </div>
</template>

<script setup lang="ts">
import { useLocalStorage, useEventListener } from "@vueuse/core";
import { SelectionMode, VueFlow, useVueFlow, type GraphNode } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/minimap/dist/style.css";
//子node组件
import scriptNode from "./node/script.vue";
import scriptPlan from "./node/scriptPlan.vue";
import assets from "./node/assets.vue";
import storyboardTable from "./node/storyboardTable.vue";
import storyboard from "./node/storyboard.vue";
import workbench from "./node/workbench.vue";
import rightChatBox from "./components/rightChatBox/index.vue";
import { useLayout } from "./utils/dagre";
import { useFlowBuilder } from "./utils/flowBuilder";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";

const router = useRouter();
const { project } = storeToRefs(projectStore());
import settingStore from "@/stores/setting";
const { otherSetting } = storeToRefs(settingStore());
const openShowVisible = ref(true);
const {
  toObject,
  fromObject,
  fitView,
  zoomIn,
  zoomOut,
  viewport,
  findNode,
  onNodeDragStart,
  onNodeDragStop,
  onMoveStart,
  onMoveEnd,
  updateNodeInternals,
  getNodes,
} = useVueFlow({ id: "mainFlowBox" });

// ─── 画板交互（对齐资产画布）──────────────────────────────
// H 抓手（默认）：左键拖动画布；V 移动 / 框选：拖空白处框选。
// 和资产画布默认框选不同——生产页就 6 个固定节点，没有多选场景，平移才是常用动作。
// 任何时候按住空格或中键也能拖动画布（空格由 vue-flow 的 pan-activation-key-code 接管）。
type Tool = "select" | "pan";
const TOOL_KEY = "toonflow.production.tool";
const MULTI_SELECT_KEYS = ["Shift", "Meta", "Control"];
const ZOOM_DURATION = 200;
const readTool = (): Tool => {
  try {
    return localStorage.getItem(TOOL_KEY) === "select" ? "select" : "pan";
  } catch {
    return "pan";
  }
};
const tool = ref<Tool>(readTool());
function setTool(next: Tool) {
  tool.value = next;
  try {
    localStorage.setItem(TOOL_KEY, next);
  } catch {
    // 无痕模式等拿不到存储时只在本次生效
  }
}
const spaceHeld = ref(false);
/** 按住空格时临时切到抓手，松开恢复 */
const activeTool = computed<Tool>(() => (spaceHeld.value ? "pan" : tool.value));

// 生产页的节点里全是 Markdown 编辑器和输入框，快捷键必须让开输入态
function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
      !!el.closest?.(".t-dialog, .t-drawer, .t-popup, .cm-editor, .monaco-editor, .CodeMirror"))
  );
}
useEventListener(
  window,
  "keydown",
  (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing || isTyping(e.target)) return;
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault(); // 不让空格触发按钮或滚动页面
      spaceHeld.value = true;
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (e.key.toLowerCase() === "v") setTool("select");
    else if (e.key.toLowerCase() === "h") setTool("pan");
  },
  true,
);
useEventListener(window, "keyup", (e: KeyboardEvent) => e.code === "Space" && (spaceHeld.value = false), true);
useEventListener(window, "blur", () => (spaceHeld.value = false));

// 拖拽/平移期间降低渲染复杂度，优化性能
const isInteracting = ref(false);
let interactionTimer: ReturnType<typeof setTimeout> | null = null;

function startInteracting() {
  if (interactionTimer) clearTimeout(interactionTimer);
  isInteracting.value = true;
}
function stopInteracting() {
  // 延迟恢复，避免频繁切换
  if (interactionTimer) clearTimeout(interactionTimer);
  interactionTimer = setTimeout(() => {
    isInteracting.value = false;
  }, 150);
}

onNodeDragStart(() => startInteracting());
onMoveStart(() => startInteracting());
onMoveEnd(() => stopInteracting());
const { layout } = useLayout("mainFlowBox");

import productionAgentStore from "@/stores/productionAgent";
const { episodesId, flowData, status } = storeToRefs(productionAgentStore());
// 抽屉宽度可拖，工具栏得贴着它的左边缘；抽屉自己还有 5px 的 margin-right
const chatWidth = ref(400);
const chatOpen = computed(() => openShowVisible.value && !!episodesId.value);
const railRight = computed(() => (chatOpen.value ? chatWidth.value + 13 : 16));
provide("episodesId", episodesId);

const loading = ref(false);

const NODE_COLORS: Record<string, string> = {
  script: "var(--td-brand-color)",
  scriptPlan: "var(--td-brand-color)",
  assets: "var(--td-success-color)",
  storyboardTable: "var(--td-warning-color)",
  storyboard: "var(--td-warning-color)",
  workbench: "#8b5cf6",
};
const miniNodeColor = (node: GraphNode) => NODE_COLORS[node.id] ?? "var(--td-brand-color)";

// 节点位置
const nodePositions = ref<Record<string, { x: number; y: number }>>({
  script: { x: 0, y: 0 },
  scriptPlan: { x: 900, y: 0 },
  assets: { x: 1200, y: 4000 },
  storyboardTable: { x: 1800, y: 0 },
  storyboard: { x: 2500, y: 0 },
  workbench: { x: 3000, y: 0 },
  // poster: { x: 4500, y: 0 },
});
const { nodes, edges } = useFlowBuilder(flowData, nodePositions);

// 用户拖拽节点后，同步位置到 nodePositions，防止 flowData 更新时位置被复原
onNodeDragStop(async ({ nodes: draggedNodes }) => {
  await nextTick();
  stopInteracting();
  for (const node of draggedNodes) {
    nodePositions.value[node.id] = { x: node.position.x, y: node.position.y };
  }
});

// flowData 变化时，将 VueFlow 中节点的当前实际位置同步到 nodePositions，防止位置回跳
watch(
  flowData,
  () => {
    for (const node of getNodes.value) {
      nodePositions.value[node.id] = { x: node.position.x, y: node.position.y };
    }
  },
  { deep: true },
);

async function waitForNodesReady(maxRetries = 60, delay = 100) {
  while (maxRetries-- > 0) {
    const nodes = getNodes.value;
    if (nodes.length > 0) {
      // 等待所有节点的 DOM 尺寸都已被 VueFlow 测量完成
      const allMeasured = nodes.every((n) => n.dimensions?.width && n.dimensions.width > 0);
      if (allMeasured) return true;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return false;
}

onMounted(async () => {
  await getScriptData();
  if (!episodesId.value) return;

  const nodesReady = await waitForNodesReady();
  if (nodesReady) {
    await layoutGraph();
  }
});

const episodesOptions = ref<{ label: string; value: number }[]>([]);
function confirmEpisodesSwitch() {
  if (status.value !== "pending" && status.value !== "streaming") {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const dialog = DialogPlugin.confirm({
      header: $t("workbench.production.confirm"),
      body: $t("workbench.production.confirmEpisodesSwitch"),
      confirmBtn: $t("workbench.production.save"),
      cancelBtn: $t("workbench.production.cancel"),
      theme: "warning",
      onConfirm: () => {
        dialog.destroy();
        resolve(true);
      },
      onCancel: () => {
        dialog.destroy();
        resolve(false);
      },
      onClose: () => {
        dialog.destroy();
        resolve(false);
      },
    });
  });
}

function handleEpisodesChange(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const nextEpisodesId = Number(rawValue);
  if (!Number.isFinite(nextEpisodesId) || nextEpisodesId === episodesId.value) return;

  void (async () => {
    if (!(await confirmEpisodesSwitch())) return;

    episodesId.value = nextEpisodesId;
    await productionAgentStore().getFlowData();
  })();
}

async function getScriptData() {
  //获取剧本
  const { data: scriptRes } = await axios.post("/script/getScrptApi", {
    projectId: project.value?.id,
    name: "",
  });
  episodesOptions.value = scriptRes.map((ep: any) => ({
    label: ep.name,
    value: ep.id,
  }));
  if (episodesOptions.value.length) {
    episodesId.value = episodesOptions.value[0].value;
  }
  if (status.value !== "pending" && status.value !== "streaming") {
    episodesId.value && (await productionAgentStore().getFlowData());
    await productionAgentStore().getHistory();
  }
}

async function layoutGraph(direction: "LR" | "TB" = "LR") {
  // 等待 DOM 渲染完成
  await nextTick();

  // 强制 VueFlow 重新测量所有节点尺寸
  const nodeIds = getNodes.value.map((n) => n.id);
  updateNodeInternals(nodeIds);
  await nextTick();

  // 等待所有节点的 dimensions 都已被 VueFlow 正确测量且尺寸稳定
  let retries = 30;
  let lastSnapshot = "";
  let stableCount = 0;
  while (retries-- > 0) {
    const allMeasured = nodeIds.every((id) => {
      const node = findNode(id);
      return node?.dimensions?.width && node.dimensions.width > 0;
    });
    if (allMeasured) {
      // 检查尺寸是否稳定（连续两次相同才算就绪）
      const snapshot = nodeIds
        .map((id) => {
          const node = findNode(id);
          return `${id}:${node?.dimensions?.width}x${node?.dimensions?.height}`;
        })
        .join(",");
      if (snapshot === lastSnapshot) {
        stableCount++;
        if (stableCount >= 2) break;
      } else {
        stableCount = 0;
        lastSnapshot = snapshot;
      }
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  const oldData = toObject();

  // 从 VueFlow 内部获取已测量的尺寸（流坐标系，无需 zoom 换算）
  const dims = new Map<string, { w: number; h: number }>();
  for (const n of oldData.nodes) {
    const vNode = findNode(n.id);
    dims.set(n.id, {
      w: vNode?.dimensions?.width ?? 150,
      h: vNode?.dimensions?.height ?? 50,
    });
  }

  const gap = 80; // 节点之间的最小留白

  if (direction === "LR") {
    // 手动布局：主链从左到右排列，assets 放在 script 正下方
    const mainChain = ["script", "scriptPlan", "storyboardTable", "storyboard", "workbench", "poster"];
    const chainNodes = mainChain.filter((id) => oldData.nodes.some((n) => n.id === id));

    // 逐个排列主链节点，x 基于前一个节点的右边缘 + gap，顶部对齐
    let curX = 0;
    for (const id of chainNodes) {
      const node = oldData.nodes.find((n) => n.id === id);
      const dim = dims.get(id);
      if (!node || !dim) continue;
      node.position.x = curX;
      node.position.y = 0;
      curX += dim.w + gap;
    }

    // assets 放在 script 正下方
    const scriptNode = oldData.nodes.find((n) => n.id === "script");
    const assetsNode = oldData.nodes.find((n) => n.id === "assets");
    const scriptDim = dims.get("script");
    if (scriptNode && assetsNode && scriptDim) {
      assetsNode.position.x = scriptNode.position.x;
      assetsNode.position.y = scriptNode.position.y + scriptDim.h + gap;
    }

    // 确保 assets 不与主链中其他节点重叠（检查水平方向）
    if (assetsNode) {
      const assetsDim = dims.get("assets");
      if (assetsDim) {
        const assetsRight = assetsNode.position.x + assetsDim.w;
        const assetsTop = assetsNode.position.y;
        const assetsBottom = assetsTop + assetsDim.h;
        for (const id of chainNodes) {
          if (id === "script") continue;
          const node = oldData.nodes.find((n) => n.id === id);
          const dim = dims.get(id);
          if (!node || !dim) continue;
          const nodeTop = node.position.y;
          const nodeBottom = nodeTop + dim.h;
          // 检查垂直范围是否有交集
          const vertOverlap = assetsTop < nodeBottom && assetsBottom > nodeTop;
          if (vertOverlap && node.position.x < assetsRight) {
            // 将该节点及其后续都右移
            const shift = assetsRight + gap - node.position.x;
            const idx = chainNodes.indexOf(id);
            for (let i = idx; i < chainNodes.length; i++) {
              const shiftNode = oldData.nodes.find((n) => n.id === chainNodes[i]);
              if (shiftNode) shiftNode.position.x += shift;
            }
            break;
          }
        }
      }
    }
  } else {
    // TB 方向使用 dagre 自动布局
    const widths = [...dims.values()].map((d) => d.w);
    const heights = [...dims.values()].map((d) => d.h);
    const avgWidth = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 150;
    const avgHeight = heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 50;
    const ranksep = avgHeight * 0.5 + gap;
    const nodesep = avgWidth * 0.3 + gap;
    oldData.nodes = layout(oldData.nodes, oldData.edges, direction, nodesep, ranksep);
  }

  await fromObject(oldData);
  await nextTick();

  // 布局后同步新位置到 nodePositions，防止后续 flowData 变化时回跳
  for (const node of getNodes.value) {
    nodePositions.value[node.id] = { x: node.position.x, y: node.position.y };
  }

  fitView({ duration: 300 });
}

const title = computed(() => {
  const episode = episodesOptions.value.find((option) => option.value === episodesId.value);
  return episode ? episode.label : "";
});

watch(
  () => episodesId.value,
  async (newVal) => {
    if (!newVal || newVal < 0) return;
    await refFlowData();
    productionAgentStore().updateContext();
    await productionAgentStore().getHistory();
  },
);

async function refFlowData() {
  await productionAgentStore().getFlowData();
  layoutGraph();
}

const current = useLocalStorage("productionCurrent", 0);
const steps = [
  {
    element: ".episodesSelect",
    title: $t("workbench.production.guideSwitchEpisode"),
    body: $t("workbench.production.guideSwitchEpisodeBody"),
    placement: "bottom",
  },
  {
    element: ".guide-refresh-btn",
    title: $t("workbench.production.guideRefresh"),
    body: $t("workbench.production.guideRefreshBody"),
    placement: "left",
  },
  {
    element: ".guide-layout-btn",
    title: $t("workbench.production.guideLayoutBtn"),
    body: $t("workbench.production.guideLayoutBtnBody"),
    placement: "left",
  },
  {
    element: ".dock",
    title: $t("workbench.production.guideCanvasNav"),
    body: $t("workbench.production.guideCanvasNavBody"),
    placement: "top",
  },
] as any;

const fps = ref(0);
let lastFrameTime = performance.now();
let frameCount = 0;
function animate() {
  const now = performance.now();
  frameCount++;
  const elapsed = now - lastFrameTime;
  if (elapsed >= 500) {
    fps.value = Math.round((frameCount * 1000) / elapsed);
    frameCount = 0;
    lastFrameTime = now;
  }
  if (!openShowVisible.value) {
    requestAnimationFrame(animate);
  }
}

watch(openShowVisible, (val) => {
  if (!val) {
    animate();
  }
});
</script>
<style lang="scss" scoped>
.production-page {
  --canvas-bg: #f4f5f7;
  --canvas-dot: rgba(15, 23, 42, 0.16);
  --canvas-mask: rgba(244, 245, 247, 0.72);
  --glass: color-mix(in srgb, var(--td-bg-color-container) 86%, transparent);
  --select-blue: #0d99ff;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--canvas-bg);
}
html[theme-mode="dark"] .production-page {
  --canvas-bg: #0d0f14;
  --canvas-dot: rgba(255, 255, 255, 0.09);
  --canvas-mask: rgba(13, 15, 20, 0.72);
}
.flow {
  width: 100%;
  height: 100%;
}
.glass {
  background: var(--glass);
  backdrop-filter: blur(14px) saturate(1.2);
  border: 1px solid var(--td-component-stroke);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
}
.topbar {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 96px;
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: none;
  z-index: 10;
  > * {
    pointer-events: auto;
  }
}
.glass-btn {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--td-component-stroke);
  background: var(--glass);
  color: var(--td-text-color-primary);
  cursor: pointer;
  &:hover {
    border-color: var(--td-brand-color);
  }
}
.title {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 6px 0 14px;
  border-radius: 12px;
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--td-text-color-placeholder);
  }
  strong {
    font-size: 15px;
    max-width: 260px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .episode {
    width: 180px;
  }
}
.rail {
  position: absolute;
  top: 50%;
  // right 由 railRight 内联给出（跟着抽屉宽度走）
  transform: translateY(-50%);
  z-index: 10000;
  transition: right 0.3s ease-out;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
  border-radius: 18px;
  z-index: 10;
  button {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--td-text-color-secondary);
    cursor: pointer;
    transition:
      background-color 150ms,
      color 150ms,
      transform 150ms;
    &:hover {
      background: var(--td-bg-color-container-hover);
      color: var(--td-text-color-primary);
    }
    &:active {
      transform: scale(0.94);
    }
    &:focus-visible {
      outline: 2px solid var(--td-brand-color-focus);
    }
  }
  .railLoading {
    color: var(--td-brand-color);
  }
}
.rule {
  width: 22px;
  height: 1px;
  background: var(--td-component-stroke);
  &.v {
    width: 1px;
    height: 18px;
  }
}
.dock {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 12px;
  z-index: 10;
  button {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--td-text-color-secondary);
    cursor: pointer;
    &.active {
      background: var(--td-brand-color);
      color: #fff;
    }
    &:hover:not(.active) {
      background: var(--td-bg-color-container-hover);
    }
  }
  .zoom {
    min-width: 44px;
    text-align: center;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
}
// 小地图挪到左下角 dock 上方：右下角整列被 AI 助手抽屉占着
.production-page .minimap {
  left: 16px;
  right: auto;
  bottom: 62px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--td-component-stroke);
  background: var(--glass);
}
:deep(.slide-enter-active),
:deep(.slide-leave-active) {
  transition: transform 0.3s ease-out;
}
:deep(.slide-enter-from) {
  transform: translateX(100%);
}
:deep(.slide-leave-to) {
  transform: translateX(100%);
}
// 拖拽/平移时优化渲染性能
.flowMain.is-interacting {
  :deep(.vue-flow__node) {
    will-change: transform;
    contain: layout style paint;
  }
  :deep(.vue-flow__transformationpane) {
    will-change: transform;
  }
  :deep(.t-image),
  :deep(.assetImage),
  :deep(.frameImg),
  :deep(.assetImageWrap) {
    pointer-events: none;
    contain: strict;
  }
  // 禁用 hover 效果，减少样式重算
  :deep(.imageToolsWrap),
  :deep(.addBetween) {
    display: none !important;
  }
}
$handelSize: 12px;

:deep(.source) {
  height: $handelSize;
  width: $handelSize;
}
:deep(.target) {
  height: $handelSize;
  width: $handelSize;
}
:deep(.dragHandle) {
  padding: 4px;
  border-radius: 4px;
  transition: backdrop-filter 0.3s ease-out;
  &:hover {
    cursor: move;
    backdrop-filter: brightness(0.95);
  }
}
.fps {
  position: absolute;
  bottom: 10px;
  right: 10px;
  padding: 2px 6px;
  font-size: 12px;
  border-radius: 4px;
  z-index: 10;
}
:deep(.vue-flow__edge-path) {
  stroke: var(--td-brand-color);
  stroke-width: 1.6;
}
:deep(.vue-flow__node) {
  border-radius: 14px;
}
// 光标：移动工具下空白处是箭头，抓手工具 / 按住空格时是手
.tool-select :deep(.vue-flow__pane) {
  cursor: default;
}
.tool-pan :deep(.vue-flow__pane),
.space-pan :deep(.vue-flow__pane),
.space-pan :deep(.vue-flow__node) {
  cursor: grab;
}
.tool-pan :deep(.vue-flow__pane.dragging),
.space-pan :deep(.vue-flow__pane.dragging) {
  cursor: grabbing;
}
// 框选框与多选包围框（Figma 蓝）
:deep(.vue-flow__selection) {
  border: 1px solid var(--select-blue);
  background: color-mix(in srgb, var(--select-blue) 8%, transparent);
  border-radius: 0;
}
:deep(.vue-flow__nodesselection-rect) {
  border: 1px solid var(--select-blue);
  background: transparent;
  border-radius: 4px;
  cursor: move;
}
</style>
