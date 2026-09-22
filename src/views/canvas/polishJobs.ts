import { canvasApi, errorMessage } from "./api";
import { getDraft, saveDraft } from "./composerDrafts";

// 提示词推理（优化）任务：跨面板存活。输入面板随节点取消选中而卸载，任务不能跟着丢——
// 结果先落草稿（撤销可用，重新打开面板即恢复），再写回节点本身（刷新后也在）；
// 面板若还挂着，通过订阅拿到结果直接填进编辑框。节点卡片上按 isPolishing 显示「推理中」。

export interface PolishResult {
  text: string;
  polishedBy?: string;
}
type Listener = (result: PolishResult, before: string) => void;

const running = reactive(new Set<string>());
const listeners = new Map<string, Set<Listener>>();

export const isPolishing = (key: string) => running.has(key);
export const polishingCount = computed(() => running.size);

export function onPolishDone(key: string, listener: Listener) {
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(key);
  };
}

/** 只有资产 / 自由节点的提示词存在节点本身上；镜头 / 片段由镜头台自己回写 */
const persistable = (key: string) => /^[an]:\d+$/.test(key);

export async function runPolish(projectId: number, key: string, before: string, task: () => Promise<PolishResult>, failMessage = "优化失败，请检查「通用 AI」文本模型配置") {
  if (running.has(key)) return;
  running.add(key);
  try {
    const result = await task();
    const existing = getDraft(projectId, key);
    saveDraft(projectId, key, { audio: false, ...(existing ?? {}), prompt: result.text, undoText: before, polishedBy: result.polishedBy ?? "" });
    if (persistable(key)) {
      try {
        await canvasApi.updateNode({ projectId, key, prompt: result.text });
      } catch {
        // 写回失败不影响草稿里的结果
      }
    }
    listeners.get(key)?.forEach((fn) => fn(result, before));
    if (!listeners.get(key)?.size) window.$message.success("提示词已推理完成，打开该节点即可查看");
  } catch (e) {
    window.$message.error(errorMessage(e, failMessage));
  } finally {
    running.delete(key);
  }
}
