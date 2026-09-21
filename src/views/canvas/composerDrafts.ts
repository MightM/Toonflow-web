// 节点输入面板的草稿：面板在取消选中时会卸载，没点「生成」的输入要留到下次打开。
// 按项目存在 localStorage，刷新页面也还在；只影响本机本浏览器。
export interface ComposerDraft {
  prompt: string;
  undoText: string | null;
  polishedBy: string;
  presetId?: string | null; // 只有用户手动选过模板才记
  model?: string; // 只有用户手动选过模型才记
  // 比例 / 画质 / 时长 / 分辨率同样只在用户自己动过时才记：
  // 无条件存会把项目设置和分镜表算出的片段时长永久盖掉
  ratio?: string;
  size?: string;
  duration?: number;
  resolution?: string;
  audio: boolean;
  savedAt: number;
}

const MAX_DRAFTS = 200;
const storageKey = (projectId: number) => `toonflow.canvas.drafts.${projectId}`;
const cache = new Map<number, Record<string, ComposerDraft>>();

function load(projectId: number): Record<string, ComposerDraft> {
  const hit = cache.get(projectId);
  if (hit) return hit;
  let drafts: Record<string, ComposerDraft> = {};
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") drafts = parsed as Record<string, ComposerDraft>;
  } catch {
    // 存储不可用或内容损坏：本次会话只在内存里保留草稿
  }
  cache.set(projectId, drafts);
  return drafts;
}

function persist(projectId: number, drafts: Record<string, ComposerDraft>) {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(drafts));
  } catch {
    // 存满或不可用时仍保留内存里的草稿
  }
}

export function getDraft(projectId: number, key: string): ComposerDraft | null {
  return load(projectId)[key] ?? null;
}

export function saveDraft(projectId: number, key: string, draft: Omit<ComposerDraft, "savedAt">) {
  const entries = Object.entries({ ...load(projectId), [key]: { ...draft, savedAt: Date.now() } });
  // 只留最近的一批，删掉的节点留下的草稿会被自然挤掉
  const kept = Object.fromEntries(entries.sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_DRAFTS));
  cache.set(projectId, kept);
  persist(projectId, kept);
}
