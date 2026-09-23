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
// 复制节点时往系统剪贴板写一个标记：粘贴时系统剪贴板里还是这个标记 → 粘节点；已经是别的东西（文字 / 文件）→ 粘那个
const CLIPBOARD_MARK = "toonflow:canvas-nodes:";
const COPY_MARK_WINDOW = 1000; // ⌘C keydown 之后多久内的 copy 事件算同一次复制
const PASTED_NAME_LIMIT = 20;
interface ClipboardData {
  projectId: number;
  items: { key: string; position: Point }[];
  token: string;
  /** 标记是否已写进系统剪贴板（写不进去时以内部剪贴板为准） */
  marked: boolean;
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
  let pendingMark: { token: string; at: number } | null = null;
  function copySelection() {
    const items = getSelectedNodes.value.map((n) => ({ key: n.id, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } }));
    if (!items.length) return;
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    writeClipboard({ projectId: projectId.value, items, token, marked: false });
    pendingMark = { token, at: Date.now() }; // 紧随其后的 copy 事件把标记写进系统剪贴板
    window.$message.success(items.length > 1 ? `已复制 ${items.length} 个节点` : "已复制节点");
  }
  // ⌘C 的 keydown 不拦默认行为，让浏览器接着发 copy 事件：这里才能往系统剪贴板写东西（不需要权限，http 下也能用）
  function onCopy(event: ClipboardEvent) {
    const mark = pendingMark;
    pendingMark = null;
    if (!mark || Date.now() - mark.at > COPY_MARK_WINDOW || !event.clipboardData) return;
    event.clipboardData.setData("text/plain", CLIPBOARD_MARK + mark.token);
    event.preventDefault();
    const data = readClipboard();
    if (data?.token === mark.token) writeClipboard({ ...data, marked: true });
  }
  async function pasteClipboard() {
    const data = readClipboard();
    if (!data?.items.length) return;
    const shifted = data.items.map((i) => ({ key: i.key, position: { x: i.position.x + PASTE_OFFSET, y: i.position.y + PASTE_OFFSET } }));
    const keys = await duplicateTo(shifted, data.projectId === projectId.value ? null : data.projectId);
    // 连续粘贴逐次错开
    if (keys?.length) writeClipboard({ ...data, items: shifted });
  }
  /** 系统剪贴板粘贴：文件（图片 / 视频 / 音频）→ 上传成节点；文字 → 文本节点；还是复制节点时留下的标记 → 粘节点 */
  function onPaste(event: ClipboardEvent) {
    if (isTyping(event.target) || anyDialogOpen()) return;
    const data = event.clipboardData;
    if (!data) return;
    const files = [...data.files];
    const text = data.getData("text/plain").trim();
    const internal = readClipboard();
    if (files.length) {
      event.preventDefault();
      return void pasteFiles(files);
    }
    // 内部剪贴板有节点，且系统剪贴板还是我们的标记（或标记没写成、或是空的）→ 粘节点
    if (internal?.items.length && (text === CLIPBOARD_MARK + internal.token || !internal.marked || !text)) {
      event.preventDefault();
      return void pasteClipboard();
    }
    if (text) {
      event.preventDefault();
      void pasteText(text);
    }
  }
  const supportedPaste = (file: File) => /^(image|video|audio)\//.test(file.type);
  async function pasteFiles(files: File[]) {
    const usable = files.filter(supportedPaste);
    if (!usable.length) return void window.$message.warning("剪贴板里的文件不是图片 / 视频 / 音频");
    const center = viewportCenter();
    const keys: string[] = [];
    for (const [i, file] of usable.entries()) {
      const key = await uploadFile(file, null, { x: Math.round(center.x + i * PASTE_OFFSET), y: Math.round(center.y + i * PASTE_OFFSET) }, undefined, pastedName(file));
      if (key) keys.push(key);
    }
    if (keys.length) selectKeys(keys);
  }
  /** 截图 / 剪贴板图片的文件名多半是 image.png 这种，给个看得懂的名字 */
  function pastedName(file: File) {
    const base = file.name.replace(/\.[^.]+$/, "");
    if (base && !/^(image|blob|clipboard|screenshot|unknown)$/i.test(base)) return base;
    const kind = file.type.startsWith("video/") ? "视频" : file.type.startsWith("audio/") ? "音频" : "图片";
    const now = new Date();
    return `粘贴的${kind} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }
  async function pasteText(text: string) {
    const firstLine = text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "文本";
    const name = firstLine.length > PASTED_NAME_LIMIT ? `${firstLine.slice(0, PASTED_NAME_LIMIT)}…` : firstLine;
    const center = viewportCenter();
    const key = await canvas.run(async () => {
      const created = await canvasApi.createNode(projectId.value, "text", { x: Math.round(center.x), y: Math.round(center.y) }, name, undefined, text);
      canvas.recordCreated(created.key, "粘贴文本");
      await canvas.refresh();
      window.$message.success("已把剪贴板文字放进文本节点");
      return created.key;
    }, "粘贴文本失败");
    if (key) selectOnly(key);
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
  async function uploadFile(file: File, target: string | null, position?: Point, link?: LinkSpec, displayName?: string) {
    return canvas.run(async () => {
      const base64Data = await readAsDataUrl(file);
      const name = displayName ?? file.name.replace(/\.[^.]+$/, "");
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

  // ─── 裁剪（图片节点 / 资产当前图）────────────────────────
  const cropVisible = ref(false);
  const cropKey = ref<string | null>(null);
  const cropDto = computed(() => (cropKey.value ? canvas.dtoByKey.value.get(cropKey.value) : undefined));
  const cropSrc = computed(() => cropDto.value?.current?.src?.replace(/\?size=\d+$/, "") ?? "");
  const cropName = computed(() => cropDto.value?.name ?? "");
  function openCrop(key: string) {
    const dto = canvas.dtoByKey.value.get(key);
    if (!dto?.current?.src || dto.current.kind !== "image") return void window.$message.warning("这个节点还没有图片");
    cropKey.value = key;
    cropVisible.value = true;
  }
  /** 前端处理过的图（裁剪 / 缩放画幅）作为该节点的新版本上传，撤销时切回原版本（处理后的图仍留在历史里） */
  async function applyImageEdit(key: string | null, payload: { base64Data: string; width: number; height: number }, verb: string, failMsg: string) {
    const dto = key ? canvas.dtoByKey.value.get(key) : undefined;
    if (!key || !dto) return;
    const previous = dto.current?.imageId;
    await canvas.run(async () => {
      await canvasApi.upload({ projectId: projectId.value, base64Data: payload.base64Data, target: key });
      if (previous) canvas.recordVersion(key, previous, `${verb}「${dto.name}」`);
      await canvas.refresh();
      window.$message.success(`已${verb}为 ${payload.width} × ${payload.height}，原图在历史版本里，按 ${UNDO_HINT} 切回`);
    }, failMsg);
  }
  const applyCrop = (payload: { base64Data: string; width: number; height: number }) => applyImageEdit(cropKey.value, payload, "裁剪", "裁剪失败");

  // ─── 缩放画幅（主体缩进更大的画面里，双图合成时让人物与场景比例协调）────
  const frameVisible = ref(false);
  const frameKey = ref<string | null>(null);
  const frameDto = computed(() => (frameKey.value ? canvas.dtoByKey.value.get(frameKey.value) : undefined));
  const frameSrc = computed(() => frameDto.value?.current?.src?.replace(/\?size=\d+$/, "") ?? "");
  const frameName = computed(() => frameDto.value?.name ?? "");
  /** 对照图：与当前节点连向同一目标的其它图片参考（合成时它们会同框，缩放时拿来目测比例） */
  const frameCompare = computed(() => {
    const key = frameKey.value;
    if (!key) return [];
    const edges = canvas.data.value?.edges ?? [];
    const targets = new Set(edges.filter((e) => e.kind === "ref" && e.source === key).map((e) => e.target));
    const seen = new Set<string>();
    const result: { key: string; name: string; src: string }[] = [];
    for (const edge of edges) {
      if (edge.kind !== "ref" || !targets.has(edge.target) || edge.source === key || seen.has(edge.source)) continue;
      const dto = canvas.dtoByKey.value.get(edge.source);
      const src = dto?.current?.kind === "image" ? dto.current.src?.replace(/\?size=\d+$/, "") : undefined;
      if (!dto || !src) continue;
      seen.add(edge.source);
      result.push({ key: edge.source, name: dto.name, src });
    }
    return result;
  });
  function openFrame(key: string) {
    const dto = canvas.dtoByKey.value.get(key);
    if (!dto?.current?.src || dto.current.kind !== "image") return void window.$message.warning("这个节点还没有图片");
    frameKey.value = key;
    frameVisible.value = true;
  }
  const applyFrame = (payload: { base64Data: string; width: number; height: number }) => applyImageEdit(frameKey.value, payload, "缩放画幅", "缩放失败");

  // ─── 一键去背景（ComfyUI rembg 工作流，结果作为新版本）────────────────
  async function removeBackground(key: string) {
    const dto = canvas.dtoByKey.value.get(key);
    if (!dto?.current?.src || dto.current.kind !== "image") return void window.$message.warning("这个节点还没有图片");
    await canvas.run(async () => {
      const { imageId } = await canvasApi.removeBackground(projectId.value, key);
      canvas.track(imageId);
      await canvas.refresh();
      window.$message.success(`正在给「${dto.name}」去背景，完成后自动切到新版本，原图留在历史里`);
    }, "去背景失败");
  }

  // ─── 回收站 ──────────────────────────────────────────
  const trashVisible = ref(false);
  const openTrash = () => (trashVisible.value = true);
  /** 从回收站恢复一条：恢复出来的节点选中并定位，撤销即再次删除 */
  async function restoreTrash(trashId: number, name: string) {
    const restored = await canvas.run(async () => {
      const result = await canvasApi.restoreNode(projectId.value, trashId);
      await canvas.refresh();
      return result.restored;
    }, "恢复失败");
    if (!restored?.length) return false;
    restored.forEach((key) => canvas.recordCreated(key, `恢复「${name}」`));
    selectKeys(restored);
    window.$message.success(`已恢复「${name}」，按 ${UNDO_HINT} 可再次删除`);
    await nextTick();
    await focusNode(restored[0]);
    return true;
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
  const anyDialogOpen = () =>
    historyVisible.value ||
    preview.visible ||
    voiceVisible.value ||
    cropVisible.value ||
    frameVisible.value ||
    trashVisible.value ||
    !!connectMenu.value ||
    !!options.extraDialogOpen?.();
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
  /** V / H 切工具、Esc 取消选中、⌘/Ctrl + A 全选、⌘/Ctrl + C 复制（粘贴走 paste 事件，见 onPaste） */
  function handleSelectionKeys(event: KeyboardEvent): boolean {
    const mod = event.metaKey || event.ctrlKey;
    const plain = !mod && !event.altKey && !event.shiftKey;
    const key = event.key.toLowerCase();
    if (plain && key === "v") return setTool("select"), true;
    if (plain && key === "h") return setTool("pan"), true;
    if (plain && event.key === "Escape") return clearSelection(), true;
    if (mod && !event.altKey && !event.shiftKey && key === "a") return selectAll(), true;
    // 复制不拦默认行为：让浏览器接着发 copy 事件，标记才写得进系统剪贴板
    if (mod && !event.altKey && !event.shiftKey && key === "c") return copySelection(), false;
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
    window.addEventListener("copy", onCopy, true);
    window.addEventListener("paste", onPaste, true);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("keydown", onSpace, true);
    window.removeEventListener("keyup", onSpace, true);
    window.removeEventListener("blur", releaseSpace);
    window.removeEventListener("copy", onCopy, true);
    window.removeEventListener("paste", onPaste, true);
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
    cropVisible,
    cropSrc,
    cropName,
    openCrop,
    applyCrop,
    frameVisible,
    frameSrc,
    frameName,
    frameCompare,
    openFrame,
    applyFrame,
    removeBackground,
    trashVisible,
    openTrash,
    restoreTrash,
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
