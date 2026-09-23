import type { Ref } from "vue";
import type { Edge, Node } from "@vue-flow/core";
import { canvasApi, errorMessage } from "./api";
import type { AssetNodeDto, AssetType, CanvasData, CanvasEdgeDto, CanvasNodeDto, FlowNodeData, MediaKind, NodeVoice } from "./types";
import { isAssetNode } from "./types";
import { useCanvasHistory, type UndoOp } from "./useCanvasHistory";

// ─── 布局常量（画布坐标，不受 px→rem 影响） ───────────────────────
// 角色多视图是横图，卡片更宽
const NODE_WIDTH = { role: 384, asset: 384, media: 384 } as const; // frame 式卡片统一宽度
const H_GAP = 70; // 同一行节点间距
const ROW_GAP = 330; // 每个根资产一行
const GROUP_GAP = 120; // 角色 / 场景 / 道具 / 自由节点分组间距
const POLL_INTERVAL = 3000;
const SAVE_DEBOUNCE = 800;
const TYPE_ORDER = ["role", "scene", "tool"] as const;
const TYPE_NAME: Record<AssetType, string> = { role: "角色", scene: "场景", tool: "道具" };
const KIND_NAME: Record<MediaKind, string> = { image: "图片", video: "视频", audio: "音频", text: "文本" };
const EDGE_HIT_WIDTH = 24; // 连线的可点击宽度，细线也容易选中

export type CanvasNode = Node<FlowNodeData>;
type Point = { x: number; y: number };
/** 新建节点时顺带连线：role 表示已有节点 key 在这条线里的角色 */
export interface LinkSpec {
  key: string;
  role: "source" | "target";
}
interface LayoutItem {
  id: string;
  width: number;
}

const isRole = (dto: CanvasNodeDto): dto is AssetNodeDto => isAssetNode(dto) && dto.assetType === "role";
// 自由节点的卡片宽度由页面决定（无限画布用更宽的 frame 式卡片）
let mediaWidth: number = NODE_WIDTH.media;
const widthOf = (dto: CanvasNodeDto) => (isRole(dto) ? NODE_WIDTH.role : isAssetNode(dto) ? NODE_WIDTH.asset : mediaWidth);
const layoutItem = (dto: CanvasNodeDto): LayoutItem => ({ id: dto.key, width: widthOf(dto) });

function toFlowEdge(e: CanvasEdgeDto): Edge {
  if (e.kind === "derive") {
    return { id: e.id, source: e.source, target: e.target, type: "default", class: "edge-derive", data: { kind: "derive" }, selectable: false };
  }
  return { id: e.id, source: e.source, target: e.target, type: "ref", interactionWidth: EDGE_HIT_WIDTH, data: { kind: "ref", edgeId: e.edgeId, sort: e.sort } };
}

/** 没有保存位置的节点按「类型分组 → 根资产一行 → 状态向右」自动排版 */
function autoPlace(dtos: CanvasNodeDto[], saved: Record<string, Point>) {
  const placed: Record<string, Point> = {};
  const pos = (id: string) => saved[id] ?? placed[id];
  const maxY = Object.values(saved).reduce((m, p) => Math.max(m, p.y), -Infinity);
  let y = Number.isFinite(maxY) ? maxY + ROW_GAP : 0;

  const placeRow = (items: LayoutItem[]) => {
    if (items.every((i) => saved[i.id])) return false;
    const anchored = items.filter((i) => saved[i.id]);
    if (!anchored.length) {
      let x = 0;
      for (const item of items) {
        placed[item.id] = { x, y };
        x += item.width + H_GAP;
      }
      y += ROW_GAP;
      return true;
    }
    // 行里已有节点有位置：没位置的接到这一行最右边
    const rowY = saved[anchored[0].id].y;
    const rightEdge = () => Math.max(...items.filter((i) => pos(i.id)).map((i) => pos(i.id).x + i.width));
    items.forEach((item) => {
      if (!pos(item.id)) placed[item.id] = { x: rightEdge() + H_GAP, y: rowY };
    });
    return true;
  };

  const assets = dtos.filter(isAssetNode);
  const done = new Set<string>();
  for (const type of TYPE_ORDER) {
    let used = false;
    for (const root of assets.filter((a) => a.assetType === type && !a.parentKey)) {
      const row = [root, ...assets.filter((a) => a.parentKey === root.key)];
      row.forEach((a) => done.add(a.key));
      used = placeRow(row.map(layoutItem)) || used;
    }
    if (used) y += GROUP_GAP;
  }
  // 孤立的状态资产（根不在画布上，如按集筛选时）和自由节点排最后一行
  placeRow(dtos.filter((d) => !done.has(d.key)).map(layoutItem));
  return placed;
}

export function useCanvas(projectId: Ref<number>, scriptId: Ref<number | null>, options: { mediaWidth?: number } = {}) {
  mediaWidth = options.mediaWidth ?? NODE_WIDTH.media;
  const data = ref<CanvasData | null>(null);
  const nodes = ref([]) as Ref<CanvasNode[]>; // 不让 TS 展开 vue-flow 节点的深层 UnwrapRef 类型
  const edges = ref<Edge[]>([]);
  const loading = ref(false);
  const pending = ref(new Set<number>());

  const dtoByKey = computed(() => new Map((data.value?.nodes ?? []).map((n) => [n.key, n])));
  const refEdgesOf = (key: string) =>
    (data.value?.edges ?? []).filter((e) => e.kind === "ref" && e.target === key).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  function build(next: CanvasData, keepPositions: boolean) {
    const current = new Map(nodes.value.map((n) => [n.id, n.position]));
    const saved = { ...next.layout.positions };
    if (keepPositions) current.forEach((pos, key) => (saved[key] = pos));
    const placed = autoPlace(next.nodes, saved);
    const refCount = (key: string) => next.edges.filter((e) => e.kind === "ref" && e.target === key).length;
    nodes.value = next.nodes.map((dto) => ({
      id: dto.key,
      type: isAssetNode(dto) ? "asset" : "media",
      position: saved[dto.key] ?? placed[dto.key] ?? { x: 0, y: 0 },
      data: { dto, refCount: refCount(dto.key) },
    }));
    edges.value = next.edges.map(toFlowEdge);
    for (const dto of next.nodes) dto.pendingImageIds.forEach((id) => pending.value.add(id));
    if (Object.keys(placed).length) void savePositions(placed);
  }

  async function load(keepPositions = false) {
    loading.value = true;
    try {
      const next = await canvasApi.get(projectId.value, scriptId.value);
      data.value = next;
      build(next, keepPositions);
      return next;
    } catch (e) {
      window.$message.error(errorMessage(e, "画布加载失败"));
      return null;
    } finally {
      loading.value = false;
    }
  }
  const refresh = () => load(true);

  /** 全部节点按默认规则重新排版并保存 */
  async function saveLayoutReset() {
    if (!data.value) return;
    history.record("重新整理布局", [{ type: "move", positions: positionsOf(nodes.value.map((n) => n.id)) }]);
    const placed = autoPlace(data.value.nodes, {});
    nodes.value = nodes.value.map((n) => ({ ...n, position: placed[n.id] ?? n.position }));
    await canvasApi.saveLayout({ projectId: projectId.value, positions: placed });
  }

  // ─── 布局持久化 ───────────────────────────────────────
  let positionTimer: ReturnType<typeof setTimeout> | undefined;
  const dirtyPositions: Record<string, { x: number; y: number }> = {};
  function savePositions(positions: Record<string, { x: number; y: number }>) {
    Object.assign(dirtyPositions, positions);
    clearTimeout(positionTimer);
    return new Promise<void>((resolve) => {
      positionTimer = setTimeout(async () => {
        const batch = { ...dirtyPositions };
        Object.keys(dirtyPositions).forEach((k) => delete dirtyPositions[k]);
        try {
          await canvasApi.saveLayout({ projectId: projectId.value, positions: batch });
        } catch (e) {
          window.$message.error(errorMessage(e, "布局保存失败"));
        }
        resolve();
      }, SAVE_DEBOUNCE);
    });
  }
  let viewportTimer: ReturnType<typeof setTimeout> | undefined;
  function saveViewport(viewport: { x: number; y: number; zoom: number }) {
    clearTimeout(viewportTimer);
    viewportTimer = setTimeout(() => canvasApi.saveLayout({ projectId: projectId.value, viewport }).catch(() => undefined), SAVE_DEBOUNCE);
  }

  function applyPositions(positions: Record<string, Point>) {
    nodes.value = nodes.value.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n));
  }
  const history = useCanvasHistory({ projectId, data, refresh, savePositions, applyPositions });
  const positionsOf = (keys: string[]) =>
    Object.fromEntries(nodes.value.filter((n) => keys.includes(n.id)).map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]));
  /** 拖动结束：记下拖动前的位置，供撤销 */
  function recordMove(before: Record<string, Point>) {
    const moved = Object.entries(before).filter(([key, p]) => {
      const now = nodes.value.find((n) => n.id === key)?.position;
      return now && (Math.round(now.x) !== p.x || Math.round(now.y) !== p.y);
    });
    if (moved.length) history.record(moved.length > 1 ? `移动 ${moved.length} 个节点` : "移动节点", [{ type: "move", positions: Object.fromEntries(moved) }]);
  }
  const nameOf = (key: string) => dtoByKey.value.get(key)?.name ?? key;
  const refOrder = (target: string) => refEdgesOf(target).map((e) => e.source);

  // ─── 生成状态轮询 ─────────────────────────────────────
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let polling = false;
  let lastQueueKey = "";
  async function pollOnce() {
    if (polling || !pending.value.size) return;
    polling = true;
    try {
      const rows = await canvasApi.pollVersions([...pending.value]);
      const done = rows.filter((r) => r.state !== "生成中");
      // 排队位置变了也刷新，节点上的「前面还有 N 个」才会动
      const queueKey = rows.map((r) => `${r.imageId}:${r.queue ? `${r.queue.running}/${r.queue.ahead}` : "-"}`).join("|");
      const queueChanged = queueKey !== lastQueueKey;
      lastQueueKey = queueKey;
      if (!done.length && !queueChanged) return;
      done.forEach((r) => pending.value.delete(r.imageId));
      const failed = done.filter((r) => r.state === "生成失败" && r.errorReason !== "已取消");
      failed.forEach((r) => window.$message.error(`生成失败：${r.errorReason ?? "未知原因"}`));
      await refresh();
    } catch {
      // 网络抖动时下一轮再试
    } finally {
      polling = false;
    }
  }
  watch(
    () => pending.value.size,
    (size) => {
      if (size && !pollTimer) pollTimer = setInterval(pollOnce, POLL_INTERVAL);
      if (!size && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    },
  );
  onBeforeUnmount(() => {
    clearInterval(pollTimer);
    clearTimeout(positionTimer);
    clearTimeout(viewportTimer);
  });
  const track = (imageId: number) => {
    pending.value.add(imageId);
    void refresh();
  };
  /** 终止一次生成：后端标成「已取消」，这里立刻停掉对它的轮询并刷新 */
  const cancelGeneration = (imageId: number) =>
    run(async () => {
      await canvasApi.cancelGeneration(projectId.value, imageId);
      pending.value.delete(imageId);
      await refresh();
      window.$message.success("已停止生成");
    }, "停止失败");

  // ─── 动作 ────────────────────────────────────────────
  async function run<T>(fn: () => Promise<T>, fail: string): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      window.$message.error(errorMessage(e, fail));
      return undefined;
    }
  }

  const connect = (source: string, target: string) =>
    run(async () => {
      await canvasApi.addEdge(projectId.value, source, target);
      history.record(`连线「${nameOf(source)}」→「${nameOf(target)}」`, [{ type: "removeEdge", source, target }]);
      await refresh();
    }, "连线失败");

  /** 删连线（可多条），撤销时按原顺序补回 */
  async function removeEdgesQuietly(edgeIds: number[]): Promise<UndoOp[]> {
    const ops: UndoOp[] = [];
    for (const id of edgeIds) {
      const edge = data.value?.edges.find((e) => e.edgeId === id);
      if (!edge) continue;
      const order = refOrder(edge.target);
      await canvasApi.removeEdge(projectId.value, id);
      ops.unshift({ type: "addEdge", source: edge.source, target: edge.target, order });
    }
    return ops;
  }
  const removeEdge = (edgeId: number) =>
    run(async () => {
      history.record("删除连线", await removeEdgesQuietly([edgeId]));
      await refresh();
    }, "删除连线失败");

  const reorderRefs = (targetKey: string, ids: number[]) =>
    run(async () => {
      const before = refOrder(targetKey);
      await canvasApi.reorderEdges(projectId.value, targetKey, ids);
      history.record("调整参考顺序", [{ type: "reorder", target: targetKey, order: before }]);
      await refresh();
      return true;
    }, "调整参考顺序失败");

  /** 新状态放在根资产这一行的最右边 */
  function nextStatePosition(parentKey: string) {
    const parent = dtoByKey.value.get(parentKey) as AssetNodeDto | undefined;
    const rootKey = parent?.parentKey ?? parentKey;
    const rowKeys = new Set((data.value?.nodes ?? []).filter((d) => d.key === rootKey || (isAssetNode(d) && d.parentKey === rootKey)).map((d) => d.key));
    const row = nodes.value.filter((n) => rowKeys.has(n.id));
    const right = row.reduce((m, n) => Math.max(m, n.position.x + (n.data ? widthOf(n.data.dto) : NODE_WIDTH.asset)), 0);
    return { x: right + H_GAP, y: row[0]?.position.y ?? 0 };
  }

  const createState = (parentKey: string, name: string, describe: string, prompt: string) =>
    run(async () => {
      const position = nextStatePosition(parentKey);
      const created = await canvasApi.createStateAsset({ projectId: projectId.value, parentKey, name, describe, prompt, position });
      history.record(`新建状态「${name}」`, [{ type: "delete", key: created.key }]);
      await load(true);
      return created.key;
    }, "新建状态失败");

  const createNode = (kind: MediaKind, position: Point, linkFrom?: LinkSpec, params?: Record<string, unknown>) =>
    run(async () => {
      const created = await canvasApi.createNode(projectId.value, kind, position, undefined, params);
      await linkCreated(created.key, linkFrom);
      history.record(`新建${KIND_NAME[kind]}节点`, [{ type: "delete", key: created.key }]);
      await refresh();
      return created.key;
    }, "新建节点失败");

  const createAsset = (type: "role" | "scene" | "tool", name: string, position: Point, linkFrom?: LinkSpec) =>
    run(async () => {
      const created = await canvasApi.createAsset({ projectId: projectId.value, type, name, scriptId: scriptId.value, position });
      await linkCreated(created.key, linkFrom);
      history.record(`新建「${name}」`, [{ type: "delete", key: created.key }]);
      await refresh();
      return created.key;
    }, "新建资产失败");

  /** 新建后立即连线：from 为已有节点时新节点在下游，to 为已有节点时新节点在上游 */
  async function linkCreated(key: string, link?: LinkSpec) {
    if (!link) return;
    const [source, target] = link.role === "source" ? [link.key, key] : [key, link.key];
    await canvasApi.addEdge(projectId.value, source, target);
  }

  /** 改名（双击节点名称） */
  const renameNode = (key: string, name: string) =>
    run(async () => {
      const before = nameOf(key);
      if (!name || name === before) return false;
      await canvasApi.updateNode({ projectId: projectId.value, key, name });
      history.record(`改名为「${name}」`, [{ type: "update", key, name: before }]);
      await refresh();
      return true;
    }, "改名失败");

  /** 改类型标签：资产连同它的状态一起改；自由节点可以取消标注（null） */
  const setAssetType = (key: string, assetType: AssetType | null) =>
    run(async () => {
      const dto = dtoByKey.value.get(key);
      if (!dto || dto.assetType === assetType) return false;
      await canvasApi.updateNode({ projectId: projectId.value, key, assetType });
      history.record(`把「${dto.name}」标为${assetType ? TYPE_NAME[assetType] : "未标注"}`, [{ type: "update", key, assetType: dto.assetType }]);
      await refresh();
      return true;
    }, "修改类型失败");

  /** 给标为角色的自由图片节点绑音色（音色库资产 / 画布音频节点），null 解绑；可撤销 */
  const setVoice = (key: string, voice: NodeVoice | null) =>
    run(async () => {
      const dto = dtoByKey.value.get(key);
      if (!dto || isAssetNode(dto)) return false;
      const before = dto.params ?? {};
      const stored = voice ? (voice.kind === "asset" ? { kind: "asset", id: voice.id } : { kind: "node", key: voice.key }) : undefined;
      await canvasApi.updateNode({ projectId: projectId.value, key, params: { ...before, voice: stored } });
      history.record(voice ? `绑定音色「${voice.name ?? ""}」` : "解绑音色", [{ type: "update", key, params: before }]);
      await refresh();
      return true;
    }, "设置音色失败");

  /** 复制节点到指定位置（⌘/Ctrl + V、Option 拖动）；撤销即删除复制出来的节点 */
  const duplicateNodes = (items: { key: string; position: Point }[], sourceProjectId?: number | null) =>
    run(async () => {
      const created = await canvasApi.duplicateNodes({ projectId: projectId.value, sourceProjectId: sourceProjectId ?? null, items });
      if (!created.keys.length) return [];
      history.record(created.keys.length > 1 ? `复制 ${created.keys.length} 个节点` : "复制节点", created.keys.map((key) => ({ type: "delete" as const, key })));
      await refresh();
      return created.keys;
    }, "复制失败");

  /** 给图片节点选画风（params.artStyle），null 清除 */
  const setArtStyle = (key: string, stylePath: string | null) =>
    run(async () => {
      const dto = dtoByKey.value.get(key);
      if (!dto || isAssetNode(dto)) return false;
      await canvasApi.updateNode({ projectId: projectId.value, key, params: { ...(dto.params ?? {}), artStyle: stylePath ?? undefined } });
      await refresh();
      return true;
    }, "设置风格失败");

  /** 上传得到的新节点也记一笔，撤销即删除 */
  function recordCreated(key: string, label: string) {
    history.record(label, [{ type: "delete", key }]);
  }
  /** 裁剪等产生新版本的操作：撤销时把当前版本切回原来的 imageId */
  function recordVersion(key: string, previousImageId: number, label: string) {
    history.record(label, [{ type: "version", key, imageId: previousImageId }]);
  }

  /** 删除节点（可多个）与连线；删除进回收站，撤销时恢复 */
  async function deleteSelection(keys: string[], edgeIds: number[] = []) {
    // 根资产和它的状态一起选中时，只删根（状态会随根一起删）
    const roots = keys.filter((k) => {
      const dto = dtoByKey.value.get(k);
      return !(dto && isAssetNode(dto) && dto.parentKey && keys.includes(dto.parentKey));
    });
    const deletedKeys = new Set(roots.flatMap((k) => [k, ...(data.value?.nodes ?? []).filter((d) => isAssetNode(d) && d.parentKey === k).map((d) => d.key)]));
    const looseEdges = edgeIds.filter((id) => {
      const e = data.value?.edges.find((edge) => edge.edgeId === id);
      return e && !deletedKeys.has(e.source) && !deletedKeys.has(e.target);
    });
    const ops: UndoOp[] = [];
    const names: string[] = [];
    try {
      ops.push(...(await removeEdgesQuietly(looseEdges)));
      for (const key of roots) {
        const trashId = await deleteOne(key);
        if (trashId == null) continue;
        ops.unshift({ type: "restore", trashId });
        names.push(nameOf(key));
      }
    } catch (e) {
      window.$message.error(errorMessage(e, "删除失败"));
    }
    const label = names.length === 1 ? `删除「${names[0]}」` : names.length ? `删除 ${names.length} 个节点` : "删除连线";
    history.record(label, ops);
    await refresh();
    return { label, count: ops.length };
  }

  /** 删一个节点，返回回收站 id；已被分镜引用时先确认，取消返回 null */
  async function deleteOne(key: string): Promise<number | null> {
    // 从剧本正文提取出来的人物 / 场景 / 道具：先二次确认（删了分镜和视频就没有这个参考了；24 小时内可在回收站恢复）
    const dto = dtoByKey.value.get(key);
    if (dto && isAssetNode(dto) && dto.inScript) {
      const ok = await confirmDialog(`「${dto.name}」是剧本正文中出现的${TYPE_NAME[dto.assetType] ?? "资产"}，确认删除？删除后分镜和视频会失去这个参考，24 小时内可在回收站恢复。`);
      if (!ok) return null;
    }
    try {
      return (await canvasApi.deleteNode(projectId.value, key)).trashId;
    } catch (e) {
      const message = errorMessage(e, "");
      if (!message.includes("force")) throw e;
      const ok = await confirmDialog(`「${nameOf(key)}」已被分镜引用，删除后分镜会失去这张参考图（可撤销）。确定删除？`);
      if (!ok) return null;
      return (await canvasApi.deleteNode(projectId.value, key, true)).trashId;
    }
  }

  return {
    data,
    nodes,
    edges,
    loading,
    pending,
    dtoByKey,
    refEdgesOf,
    load,
    refresh,
    track,
    cancelGeneration,
    run,
    savePositions,
    saveViewport,
    saveLayoutReset,
    connect,
    removeEdge,
    reorderRefs,
    createState,
    createNode,
    createAsset,
    renameNode,
    setAssetType,
    setArtStyle,
    setVoice,
    duplicateNodes,
    applyPositions,
    recordCreated,
    recordVersion,
    recordMove,
    positionsOf,
    deleteSelection,
    undo: history.undo,
    canUndo: history.canUndo,
  };
}

export function confirmDialog(body: string) {
  return new Promise<boolean>((resolve) => {
    const dialog = DialogPlugin.confirm({
      header: "确认",
      body,
      onConfirm: () => {
        dialog.destroy();
        resolve(true);
      },
      onClose: () => {
        dialog.destroy();
        resolve(false);
      },
      onCancel: () => {
        dialog.destroy();
        resolve(false);
      },
    });
  });
}
