import type { Ref } from "vue";
import { canvasApi, errorMessage } from "./api";
import type { AssetType, CanvasData } from "./types";

// ─── 画布撤销栈（Ctrl/⌘ + Z） ───────────────────────────────
// 每条记录是一组「逆操作」，按顺序执行即可回到操作前。记录里只存节点 key，
// 不存连线 id：撤销时按 key 现查，避免连线被重建后 id 失效。

type Point = { x: number; y: number };

export type UndoOp =
  | { type: "move"; positions: Record<string, Point> } // 位置改回去
  | { type: "removeEdge"; source: string; target: string } // 撤销连线
  | { type: "addEdge"; source: string; target: string; order: string[] } // 撤销删线：补回并恢复参考顺序
  | { type: "reorder"; target: string; order: string[] } // 撤销调序
  | { type: "delete"; key: string } // 撤销新建
  | { type: "restore"; trashId: number } // 撤销删除（从回收站恢复）
  | { type: "update"; key: string; name?: string; assetType?: AssetType | null; params?: Record<string, unknown> } // 撤销改名 / 改类型 / 改参数（音色、画风）
  | { type: "version"; key: string; imageId: number }; // 撤销裁剪 / 换版本：把当前版本切回去（裁出的版本留在历史里）

interface UndoEntry {
  label: string;
  ops: UndoOp[];
}

const HISTORY_LIMIT = 50;

interface HistoryDeps {
  projectId: Ref<number>;
  data: Ref<CanvasData | null>;
  refresh: () => Promise<unknown>;
  savePositions: (positions: Record<string, Point>) => Promise<void>;
  applyPositions: (positions: Record<string, Point>) => void;
}

const renameOp = (op: UndoOp, map: Record<string, string>): UndoOp => {
  const r = (key: string) => map[key] ?? key;
  switch (op.type) {
    case "move":
      return { ...op, positions: Object.fromEntries(Object.entries(op.positions).map(([k, p]) => [r(k), p])) };
    case "removeEdge":
      return { ...op, source: r(op.source), target: r(op.target) };
    case "addEdge":
      return { ...op, source: r(op.source), target: r(op.target), order: op.order.map(r) };
    case "reorder":
      return { ...op, target: r(op.target), order: op.order.map(r) };
    case "delete":
    case "update":
    case "version":
      return { ...op, key: r(op.key) };
    default:
      return op;
  }
};

export function useCanvasHistory(deps: HistoryDeps) {
  const stack = ref<UndoEntry[]>([]);
  const busy = ref(false);
  const canUndo = computed(() => stack.value.length > 0 && !busy.value);

  function record(label: string, ops: UndoOp[]) {
    if (!ops.length) return;
    stack.value = [...stack.value.slice(-(HISTORY_LIMIT - 1)), { label, ops }];
  }

  /** 恢复删除时 id 被占用会换 key：栈里剩下的记录一并改名 */
  function renameKeys(map: Record<string, string>) {
    if (!Object.keys(map).length) return;
    stack.value = stack.value.map((entry) => ({ ...entry, ops: entry.ops.map((op) => renameOp(op, map)) }));
  }

  const refEdges = (target: string) =>
    (deps.data.value?.edges ?? []).filter((e) => e.kind === "ref" && e.target === target).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  async function applyOrder(target: string, order: string[]) {
    const edges = refEdges(target);
    const ids = [...order.map((k) => edges.find((e) => e.source === k)), ...edges.filter((e) => !order.includes(e.source))]
      .map((e) => e?.edgeId)
      .filter((id): id is number => typeof id === "number");
    if (ids.length === edges.length && ids.length > 1) await canvasApi.reorderEdges(deps.projectId.value, target, ids);
  }

  async function runOp(op: UndoOp): Promise<Record<string, string>> {
    const projectId = deps.projectId.value;
    switch (op.type) {
      case "move":
        deps.applyPositions(op.positions);
        await deps.savePositions(op.positions);
        return {};
      case "removeEdge": {
        const edge = refEdges(op.target).find((e) => e.source === op.source);
        if (edge?.edgeId) await canvasApi.removeEdge(projectId, edge.edgeId);
        return {};
      }
      case "addEdge":
        await canvasApi.addEdge(projectId, op.source, op.target);
        await deps.refresh();
        await applyOrder(op.target, op.order);
        return {};
      case "reorder":
        await applyOrder(op.target, op.order);
        return {};
      case "delete":
        await canvasApi.deleteNode(projectId, op.key, true);
        return {};
      case "restore":
        return (await canvasApi.restoreNode(projectId, op.trashId)).keyMap;
      case "update":
        await canvasApi.updateNode({ projectId, key: op.key, name: op.name, assetType: op.assetType, params: op.params });
        return {};
      case "version":
        await canvasApi.setCurrentVersion(projectId, op.key, op.imageId);
        return {};
    }
  }

  async function undo(): Promise<boolean> {
    const entry = stack.value[stack.value.length - 1];
    if (!entry || busy.value) return false;
    stack.value = stack.value.slice(0, -1);
    busy.value = true;
    try {
      let ops = entry.ops;
      while (ops.length) {
        const [op, ...rest] = ops;
        const map = await runOp(op);
        renameKeys(map);
        ops = rest.map((o) => renameOp(o, map));
      }
      window.$message.success(`已撤销：${entry.label}`);
      return true;
    } catch (e) {
      window.$message.error(errorMessage(e, `撤销「${entry.label}」失败`));
      return false;
    } finally {
      await deps.refresh();
      busy.value = false;
    }
  }

  return { record, undo, canUndo, busy };
}
