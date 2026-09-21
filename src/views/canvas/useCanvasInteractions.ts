import type { Ref } from "vue";
import { useVueFlow, type Connection, type NodeDragEvent } from "@vue-flow/core";
import { canvasApi, readAsDataUrl } from "./api";
import type { ConnectMenuState } from "./components/ConnectMenu.vue";
import type { ArtStyleDto, MediaKind, NodeVoice } from "./types";
import { isAssetNode } from "./types";
import type { CanvasNode, LinkSpec, useCanvas } from "./useCanvas";

// 画板交互（对齐 Figma），资产画布与无限画布共用：
// V 移动 / 框选（默认）：拖空白处框选（碰到即选中），Shift 点选 / 框选追加，拖动任一选中节点整组移动；
// H 抓手：左键拖动画布；任何时候按住空格或中键也能拖动画布。
// 滚轮 / 触控板双指滑动平移画布，⌘/Ctrl + 滚轮或双指捏合缩放。
// 还包括：连线 / 拖线弹菜单 / 双击弹菜单、拖动落位、视口保存与恢复、focus= 定位、键盘快捷键、上传、预览与历史抽屉状态。

export type Tool = "select" | "pan";
export const MULTI_SELECT_KEYS = ["Shift", "Meta", "Control"];
export const UNDO_HINT = /mac/i.test(navigator.platform) ? "⌘Z" : "Ctrl+Z";
/** 新建节点时的卡片宽度（画布坐标） */
export const MENU_NODE_WIDTH = { role: 384, asset: 384, media: 384 } as const; // frame 式卡片统一宽度
const MENU_NODE_OFFSET = { x: 24, y: 60 };
const TOOL_KEY = "toonflow.canvas.tool";
const READY_WAIT_STEPS = 40;
const FOCUS_COMPOSER_ROOM = 60; // 把节点放在视野中上部，给下方的输入面板留位置
const TOPBAR_CLEARANCE = 56; // 适应画布后整体下移，避免最上排节点的操作条被顶栏挡住
const ZOOM_DURATION = 200;
const CLICK_SLOP = 4;

export type Point = { x: number; y: number };
const PASTE_OFFSET = 40; // 粘贴 / 连续粘贴时相对原位置的错位
const CLIPBOARD_KEY = "toonflow.canvas.clipboard"; // 存 sessionStorage：两张画布之间、刷新之后都能粘
interface ClipboardData {
  projectId: number;
  items: { key: string; position: Point }[];
}
export type UploadLink = { link?: LinkSpec; position: Point } | null;

export interface CanvasInteractionOptions {
  flowId: string;
  canvas: ReturnType<typeof useCanvas>;
  projectId: Ref<number>;
  /** 返回 false 时不保存 / 恢复视口（资产画布按集筛选时） */
  persistViewport?: () => boolean;
  /** 页面自己的弹窗打开时也不响应快捷键 */
  extraDialogOpen?: () => boolean;
  /** 项目绑定的画风：新建图片节点默认带上 */
  projectArtStyle?: () => string | null | undefined;
}
const NODE_GAP = 70;

export function useCanvasInteractions(options: CanvasInteractionOptions) {
  const { canvas, projectId } = options;
  const route = useRoute();
  const persistViewport = options.persistViewport ?? (() => true);
  const flow = useVueFlow(options.flowId);
  const {
    fitView,
    zoomIn,
    zoomOut,
    setViewport,
    setCenter,
    findNode,
    viewport,
    screenToFlowCoordinate,
    dimensions,
    getNodes,
    getSelectedNodes,
    getSelectedEdges,
    addSelectedNodes,
    removeSelectedNodes,
    removeSelectedElements,
    nodesSelectionActive,
  } = flow;

  // ─── 工具 ────────────────────────────────────────────
  const readTool = (): Tool => {
    try {
      return localStorage.getItem(TOOL_KEY) === "pan" ? "pan" : "select";
    } catch {
      return "select";
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
  const altHeld = ref(false);
  /** 按住空格时临时切到抓手，松开恢复 */
  const activeTool = computed<Tool>(() => (spaceHeld.value ? "pan" : tool.value));

  // ─── 视口 / 定位 ─────────────────────────────────────
  // 数据加载后等画布和节点尺寸就绪，再恢复视口 / 定位节点（只在首次加载时做一次）
  async function waitForCanvasReady(nodeId?: string | null) {
    for (let i = 0; i < READY_WAIT_STEPS; i++) {
      const node = nodeId ? findNode(nodeId) : undefined;
      if (dimensions.value.width && (!nodeId || node?.dimensions?.width)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  async function focusNode(id: string, duration = 300) {
    const node = findNode(id);
    if (!node) return;
    const width = node.dimensions?.width || 240;
    const height = node.dimensions?.height || 200;
    await setCenter(node.position.x + width / 2, node.position.y + height / 2 + FOCUS_COMPOSER_ROOM, { zoom: 1, duration });
  }
  async function fitViewBelowTopbar(duration = 0) {
    await fitView({ padding: 0.2, duration });
    await setViewport({ ...viewport.value, y: viewport.value.y + TOPBAR_CLEARANCE }, { duration });
  }
  async function restoreViewport() {
    if (!canvas.data.value) return;
    const focus = typeof route.query.focus === "string" ? route.query.focus : null;
    const target = focus && canvas.nodes.value.some((n) => n.id === focus) ? focus : null;
    await waitForCanvasReady(target);
    const saved = canvas.data.value.viewport;
    if (target) {
      selectOnly(target);
      await focusNode(target, 0); // 首次加载不做动画（后台标签页里动画不会推进）
    } else if (saved && persistViewport()) await setViewport(saved);
    else await fitViewBelowTopbar();
  }
  const reload = () => canvas.load(false).then(() => setTimeout(() => fitViewBelowTopbar(300), 50));
  /** 以屏幕上某点为锚点缩放：该点下方的画布内容保持不动（与滚轮在画布空白处缩放一致） */
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 3;
  function zoomAt(clientX: number, clientY: number, factor: number) {
    const pane = document.querySelector(`[id="${options.flowId}"] .vue-flow__pane, .vue-flow__pane`) as HTMLElement | null;
    const rect = pane?.getBoundingClientRect();
    if (!rect) return;
    const { x, y, zoom } = viewport.value;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    const scale = next / zoom;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    void setViewport({ x: px - (px - x) * scale, y: py - (py - y) * scale, zoom: next });
  }
  const viewportCenter = () => screenToFlowCoordinate({ x: dimensions.value.width / 2 - 120, y: dimensions.value.height / 2 - 90 });
  function selectOnly(key: string) {
    canvas.nodes.value = canvas.nodes.value.map((n) => ({ ...n, selected: n.id === key }) as CanvasNode);
  }

  // ─── 连线 / 拖动 / 移动 ───────────────────────────────
  // 连线 = 把 source 作为 target 的参考
  function onConnect(connection: Connection) {
    connectedDuringDrag = true;
    if (connection.source === connection.target) return;
    void canvas.connect(connection.source, connection.target);
  }
  let dragStartPositions: Record<string, Point> = {};
  let altDrag = false; // 按住 Option/Alt 拖动 = 复制：原节点回到原位，落点处生成副本
  function onDragStart(event: NodeDragEvent) {
    dragStartPositions = canvas.positionsOf(event.nodes.map((n) => n.id));
    // vue-flow 给的可能是 d3 的包装事件（altKey 在 sourceEvent 上），再兜底用键盘监听到的 Alt 状态
    const raw = event.event as (MouseEvent & { sourceEvent?: MouseEvent }) | undefined;
    altDrag = !!(raw?.altKey || raw?.sourceEvent?.altKey || altHeld.value);
  }
  function onDragStop(event: NodeDragEvent) {
    const moved = Object.fromEntries(event.nodes.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]));
    if (altDrag) {
      altDrag = false;
      canvas.applyPositions(dragStartPositions);
      void canvas.savePositions(dragStartPositions);
      void duplicateTo(Object.entries(moved).map(([key, position]) => ({ key, position })));
      return;
    }
    void canvas.savePositions(moved);
    canvas.recordMove(dragStartPositions);
  }

  // ─── 复制 / 粘贴 ─────────────────────────────────────
  const readClipboard = (): ClipboardData | null => {
    try {
      return JSON.parse(sessionStorage.getItem(CLIPBOARD_KEY) || "null");
    } catch {
      return null;
    }
  };
  const writeClipboard = (data: ClipboardData) => {
    try {
      sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data));
    } catch {
      // 拿不到存储时只在本次生效
    }
  };
  function copySelection() {
    const items = getSelectedNodes.value.map((n) => ({ key: n.id, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } }));
    if (!items.length) return;
    writeClipboard({ projectId: projectId.value, items });
    window.$message.success(items.length > 1 ? `已复制 ${items.length} 个节点` : "已复制节点");
  }
  async function pasteClipboard() {
    const data = readClipboard();
    if (!data?.items.length) return;
    const shifted = data.items.map((i) => ({ key: i.key, position: { x: i.position.x + PASTE_OFFSET, y: i.position.y + PASTE_OFFSET } }));
    const keys = await duplicateTo(shifted, data.projectId === projectId.value ? null : data.projectId);
    // 连续粘贴逐次错开
    if (keys?.length) writeClipboard({ projectId: data.projectId, items: shifted });
  }
  async function duplicateTo(items: { key: string; position: Point }[], sourceProjectId?: number | null) {
    const keys = await canvas.duplicateNodes(items, sourceProjectId);
    if (keys?.length) selectKeys(keys);
    return keys;
  }
  function selectKeys(keys: string[]) {
    const set = new Set(keys);
    canvas.nodes.value = canvas.nodes.value.map((n) => ({ ...n, selected: set.has(n.id) }) as CanvasNode);
  }
  function onMoveEnd() {
    if (persistViewport()) canvas.saveViewport({ x: viewport.value.x, y: viewport.value.y, zoom: viewport.value.zoom });
  }

  // ─── 从连线拖到空白处 / 双击空白处：弹出新建菜单 ─────────────
  const connectMenu = ref<ConnectMenuState | null>(null);
  let connectStart: { nodeId: string; handleType: "source" | "target" } | null = null;
  let connectedDuringDrag = false;
  function onConnectStart(params: { nodeId?: string; handleType?: "source" | "target" }) {
    connectStart = params.nodeId && params.handleType ? { nodeId: params.nodeId, handleType: params.handleType } : null;
    connectedDuringDrag = false;
  }
  // vue-flow 先发 connect（落在端口上）再发 connect-end，所以这里能知道有没有连上
  function onConnectEnd(event?: MouseEvent | TouchEvent) {
    const start = connectStart;
    connectStart = null;
    if (!start || !event || connectedDuringDrag) return;
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    const hit = document.elementFromPoint(point.clientX, point.clientY);
    if (!hit?.closest(".vue-flow") || hit.closest(".vue-flow__node-toolbar, .vue-flow__minimap, .vue-flow__panel")) return;
    // 松手在另一个节点身上（没对准端口）：直接连上
    const hitNode = (hit.closest(".vue-flow__node") as HTMLElement | null)?.dataset.id;
    if (hitNode) {
      if (hitNode !== start.nodeId) void canvas.connect(...((start.handleType === "source" ? [start.nodeId, hitNode] : [hitNode, start.nodeId]) as [string, string]));
      return;
    }
    const from = canvas.dtoByKey.value.get(start.nodeId);
    if (from) connectMenu.value = { clientX: point.clientX, clientY: point.clientY, from, role: start.handleType };
  }
  function onPaneDblclick(event: MouseEvent) {
    const el = event.target as HTMLElement | null;
    if (!el?.closest(".vue-flow__pane") || el.closest(".vue-flow__node, .vue-flow__edge, .vue-flow__node-toolbar, .vue-flow__minimap, .vue-flow__panel")) return;
    connectMenu.value = { clientX: event.clientX, clientY: event.clientY, from: null, role: null };
  }
  /** 菜单新建的节点往拖线方向放：从输出端拖出放右边，从输入端拖出放左边；双击空白处则以双击点为中心 */
  function placeFromMenu(menu: ConnectMenuState, width: number): Point {
    const at = screenToFlowCoordinate({ x: menu.clientX, y: menu.clientY });
    return {
      x: Math.round(!menu.role ? at.x - width / 2 : menu.role === "source" ? at.x + MENU_NODE_OFFSET.x : at.x - width - MENU_NODE_OFFSET.x),
      y: Math.round(at.y - MENU_NODE_OFFSET.y),
    };
  }
  const linkFromMenu = (menu: ConnectMenuState): LinkSpec | undefined => (menu.from && menu.role ? { key: menu.from.key, role: menu.role } : undefined);

  // ─── 新建节点默认参数 / 整组生成 ────────────────────────
  /** 新建图片节点默认带上项目绑定的画风（可在节点上换或清除） */
  const defaultParams = (kind: MediaKind) => {
    const style = options.projectArtStyle?.();
    return kind === "image" && style ? { artStyle: style } : undefined;
  };
  const selection = computed(() => getSelectedNodes.value.map((n) => n.id));
  /** 以若干节点为参考新建下游节点，按给定顺序连线（决定图1、图2…），放在最右那个源节点右侧 */
  async function deriveFrom(sourceKeys: string[], kind: MediaKind) {
    if (!sourceKeys.length) return;
    const sources = sourceKeys.map((k) => findNode(k)).filter((n): n is NonNullable<typeof n> => !!n);
    const right = Math.max(...sources.map((n) => n.position.x + (n.dimensions?.width || MENU_NODE_WIDTH.media)));
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

  // ─── 画风清单（视觉手册，风格胶囊用） ───────────────────
  const artStyles = ref<ArtStyleDto[]>([]);
  async function loadArtStyles() {
    try {
      artStyles.value = await canvasApi.listArtStyles();
    } catch {
      artStyles.value = [];
    }
  }
  onMounted(() => void loadArtStyles());

  // ─── 音色（角色资产 / 标为角色的自由图片节点） ────────────
  const voiceVisible = ref(false);
  const voiceKey = ref<string | null>(null);
  function openVoice(key: string) {
    voiceKey.value = key;
    voiceVisible.value = true;
  }
  /** VoicePicker 选定后：资产角色写绑定表（只认音色库），自由节点写 params.voice */
  async function bindVoice(voice: NodeVoice | null) {
    const key = voiceKey.value;
    const dto = key ? canvas.dtoByKey.value.get(key) : undefined;
    if (!key || !dto) return;
    if (isAssetNode(dto)) {
      if (voice && voice.kind !== "asset") return void window.$message.warning("资产角色只能绑音色库里的音色");
      const done = await canvas.run(() => canvasApi.bindVoice(dto.id, voice?.kind === "asset" ? voice.id : undefined), voice ? "绑定音色失败" : "解绑失败");
      if (done !== undefined) {
        window.$message.success(voice ? `已绑定音色：${voice.name ?? ""}` : "已解绑音色");
        await canvas.refresh();
      }
      return;
    }
    const ok = await canvas.setVoice(key, voice);
    if (ok) window.$message.success(voice ? `已绑定音色：${voice.name ?? ""}` : "已解绑音色");
  }

  // ─── 上传 ────────────────────────────────────────────
  const fileInput = ref<HTMLInputElement>();
  const uploadTarget = ref<string | null>(null);
  // 从连线菜单上传：新素材放在松手处并连到拖线的节点
  const uploadLink = ref<UploadLink>(null);
  function uploadTo(key: string | null, link: UploadLink = null) {
    uploadTarget.value = key;
    uploadLink.value = link;
    if (fileInput.value) {
      fileInput.value.accept = key && canvas.dtoByKey.value.get(key)?.kind === "asset" ? "image/png,image/jpeg,image/webp" : fileInput.value.accept;
      fileInput.value.value = "";
      fileInput.value.click();
    }
  }
  async function uploadFile(file: File, target: string | null, position?: Point, link?: LinkSpec) {
    return canvas.run(async () => {
      const base64Data = await readAsDataUrl(file);
      const name = file.name.replace(/\.[^.]+$/, "");
      const created = await canvasApi.upload({ projectId: projectId.value, base64Data, name, target, position });
      if (!target) {
        if (link) await canvasApi.addEdge(projectId.value, link.role === "source" ? link.key : created.key, link.role === "source" ? created.key : link.key);
        canvas.recordCreated(created.key, `上传「${name}」`);
      }
      await canvas.refresh();
      window.$message.success(target ? "已作为新版本上传" : "已添加到画布");
      return created.key;
    }, "上传失败");
  }
  async function onFilePicked(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const linked = uploadLink.value;
    uploadLink.value = null;
    const position = linked?.position ?? (uploadTarget.value ? undefined : viewportCenter());
    const key = await uploadFile(file, uploadTarget.value, position, linked?.link);
    if (key && linked) selectOnly(key);
  }
  function onDrop(event: DragEvent) {
    const files = [...(event.dataTransfer?.files ?? [])];
    const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
    files.forEach((file, i) => void uploadFile(file, null, { x: position.x + i * 40, y: position.y + i * 40 }));
  }

  // ─── 预览 / 历史抽屉 ─────────────────────────────────
  const historyVisible = ref(false);
  const historyTarget = ref<string | null>(null);
  function openHistory(key: string | null) {
    historyTarget.value = key;
    historyVisible.value = true;
  }
  /** 全屏预览（MediaLightbox）：图片 / 视频 / 音频同一个 */
  const preview = reactive({ visible: false, src: "", kind: "image" as "image" | "video" | "audio" });
  function openPreview(src: string, kind: "image" | "video" | "audio") {
    Object.assign(preview, { visible: true, src, kind });
  }

  // ─── 删除 ────────────────────────────────────────────
  async function deleteWithHint(keys: string[], edgeIds: number[] = []) {
    const { label, count } = await canvas.deleteSelection(keys, edgeIds);
    if (count) window.$message.success(`${label}，按 ${UNDO_HINT} 撤销`);
  }
  async function deleteSelected() {
    const keys = getSelectedNodes.value.map((n) => n.id);
    const edgeIds = getSelectedEdges.value.map((e) => e.data?.edgeId).filter((id): id is number => typeof id === "number");
    if (!keys.length && !edgeIds.length) return;
    await deleteWithHint(keys, edgeIds);
  }

  // ─── 选择：Shift + 框选追加、整组框点击 ─────────────────
  let selectionBefore: Set<string> | null = null;
  let pointerDownAt: Point | null = null;
  function onPanePointerDown(event: PointerEvent) {
    pointerDownAt = { x: event.clientX, y: event.clientY };
    const onPane = (event.target as HTMLElement | null)?.classList?.contains("vue-flow__pane");
    selectionBefore = onPane && event.shiftKey && activeTool.value === "select" ? new Set(getSelectedNodes.value.map((n) => n.id)) : null;
  }
  // Shift + 框选：在原有选中的基础上追加（vue-flow 默认框选会先清空）
  function onSelectionEnd() {
    const before = selectionBefore;
    selectionBefore = null;
    if (!before?.size) return;
    // 松手时可能已不按 Shift：按「原选中 ∪ 框选」整体重设
    const union = getNodes.value.filter((n) => n.selected || before.has(n.id));
    addSelectedNodes(union);
  }
  // 多选后 vue-flow 会在选中节点上盖一层整组框（拖它整组移动），它会吃掉点击：
  // 点击（没拖动）时按 Figma 处理——Shift 点击增减这个节点，普通点击只选它
  function onGroupBoxClick(event: MouseEvent) {
    const box = (event.target as HTMLElement | null)?.closest?.(".vue-flow__nodesselection-rect");
    const moved = pointerDownAt ? Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y) : 0;
    if (!box || moved > CLICK_SLOP) return;
    const hit = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((el) => (el as HTMLElement).closest?.(".vue-flow__node") as HTMLElement | null)
      .find((el): el is HTMLElement => !!el);
    const node = hit?.dataset.id ? findNode(hit.dataset.id) : undefined;
    if (!node) return;
    event.stopPropagation();
    if (!event.shiftKey) {
      nodesSelectionActive.value = false; // 只剩一个节点：收起整组框，显示它的操作条
      return addSelectedNodes([node]);
    }
    if (node.selected) removeSelectedNodes([node]);
    else addSelectedNodes([...getSelectedNodes.value, node]);
    if (getSelectedNodes.value.length < 2) nodesSelectionActive.value = false;
  }
  const selectAll = () => addSelectedNodes(getNodes.value);
  const clearSelection = () => removeSelectedElements();

  // ─── 键盘 ────────────────────────────────────────────
  const anyDialogOpen = () => historyVisible.value || preview.visible || voiceVisible.value || !!connectMenu.value || !!options.extraDialogOpen?.();
  function isTyping(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest(".t-dialog, .t-drawer, .t-popup"));
  }
  /** Figma 的视图快捷键：Shift+0 100%、Shift+1 适应画布、Shift+2 缩放到选中、⌘/Ctrl + =/- 缩放 */
  function handleViewKeys(event: KeyboardEvent): boolean {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.altKey && (event.key === "=" || event.key === "+")) return void zoomIn({ duration: ZOOM_DURATION }), true;
    if (mod && !event.altKey && event.key === "-") return void zoomOut({ duration: ZOOM_DURATION }), true;
    if (!event.shiftKey || mod || event.altKey) return false;
    if (event.code === "Digit0") return void setViewport({ ...viewport.value, zoom: 1 }, { duration: ZOOM_DURATION }), true;
    if (event.code === "Digit1") return void fitViewBelowTopbar(300), true;
    if (event.code === "Digit2") {
      const ids = getSelectedNodes.value.map((n) => n.id);
      if (ids.length) void fitView({ nodes: ids, padding: 0.3, duration: 300 });
      return true;
    }
    return false;
  }
  /** V / H 切工具、Esc 取消选中、⌘/Ctrl + A 全选、⌘/Ctrl + C / V 复制粘贴 */
  function handleSelectionKeys(event: KeyboardEvent): boolean {
    const mod = event.metaKey || event.ctrlKey;
    const plain = !mod && !event.altKey && !event.shiftKey;
    const key = event.key.toLowerCase();
    if (plain && key === "v") return setTool("select"), true;
    if (plain && key === "h") return setTool("pan"), true;
    if (plain && event.key === "Escape") return clearSelection(), true;
    if (mod && !event.altKey && !event.shiftKey && key === "a") return selectAll(), true;
    if (mod && !event.altKey && !event.shiftKey && key === "c") return copySelection(), true;
    if (mod && !event.altKey && !event.shiftKey && key === "v") return void pasteClipboard(), true;
    return false;
  }
  function onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || isTyping(event.target) || anyDialogOpen()) return;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      void canvas.undo();
      return;
    }
    if (handleViewKeys(event) || handleSelectionKeys(event)) {
      event.preventDefault();
      return;
    }
    // 焦点在节点工具条 / 输入面板的按钮上时不删节点（撤销照常可用）
    if ((event.key === "Delete" || event.key === "Backspace") && !(event.target as HTMLElement | null)?.closest?.(".vue-flow__node-toolbar")) {
      event.preventDefault();
      void deleteSelected();
    }
  }
  function onSpace(event: KeyboardEvent) {
    if (event.key === "Alt") altHeld.value = event.type === "keydown";
    if (event.code !== "Space") return;
    if (event.type === "keyup") return void (spaceHeld.value = false);
    if (isTyping(event.target)) return;
    event.preventDefault(); // 不让空格触发按钮或滚动页面
    spaceHeld.value = true;
  }
  const releaseSpace = () => {
    spaceHeld.value = false;
    altHeld.value = false;
  };
  // 捕获阶段监听：输入面板会拦截 keydown 冒泡
  onMounted(() => {
    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("keydown", onSpace, true);
    window.addEventListener("keyup", onSpace, true);
    window.addEventListener("blur", releaseSpace);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("keydown", onSpace, true);
    window.removeEventListener("keyup", onSpace, true);
    window.removeEventListener("blur", releaseSpace);
  });

  return {
    flow,
    zoomIn,
    zoomOut,
    viewport,
    getSelectedNodes,
    screenToFlowCoordinate,
    tool,
    activeTool,
    spaceHeld,
    altHeld,
    setTool,
    waitForCanvasReady,
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
    defaultParams,
    selection,
    deriveFrom,
    artStyles,
    voiceVisible,
    voiceKey,
    openVoice,
    bindVoice,
    fileInput,
    uploadTo,
    uploadFile,
    onFilePicked,
    onDrop,
    historyVisible,
    historyTarget,
    openHistory,
    preview,
    openPreview,
    deleteWithHint,
    deleteSelected,
    copySelection,
    pasteClipboard,
  };
}
