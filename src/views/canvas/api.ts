import axios from "@/utils/axios";
import type { ArtStyleDto, AssetModels, AssetType, CanvasData, CanvasPreset, HistoryItem, ImageSize, MediaKind, VersionDto } from "./types";

// 资产画布接口（/api/canvas/*、/api/setting/assetModels/*）
interface Envelope<T> {
  code: number;
  data: T;
  message: string;
}
const post = async <T>(url: string, body: object): Promise<T> => ((await axios.post(url, body)) as unknown as Envelope<T>).data;

export const canvasApi = {
  get: (projectId: number, scriptId?: number | null) => post<CanvasData>("/canvas/getCanvas", { projectId, scriptId: scriptId ?? null }),
  saveLayout: (body: { projectId: number; viewport?: object; positions?: Record<string, { x: number; y: number }>; nodeMeta?: object; pinned?: string[] }) =>
    post<unknown>("/canvas/saveLayout", body),
  addEdge: (projectId: number, sourceKey: string, targetKey: string) =>
    post<{ id: number; sort: number }>("/canvas/addEdge", { projectId, sourceKey, targetKey }),
  removeEdge: (projectId: number, id: number) => post<unknown>("/canvas/removeEdge", { projectId, id }),
  reorderEdges: (projectId: number, targetKey: string, ids: number[]) => post<unknown>("/canvas/reorderEdges", { projectId, targetKey, ids }),
  createNode: (projectId: number, kind: MediaKind, position: { x: number; y: number }, name?: string, params?: Record<string, unknown>, prompt?: string) =>
    post<{ key: string; id: number }>("/canvas/createNode", { projectId, kind, position, name, params, prompt }),
  updateNode: (body: { projectId: number; key: string; name?: string; describe?: string; prompt?: string; params?: Record<string, unknown>; assetType?: AssetType | null }) =>
    post<unknown>("/canvas/updateNode", body),
  listArtStyles: () => post<ArtStyleDto[]>("/canvas/listArtStyles", {}),
  createStateAsset: (body: { projectId: number; parentKey: string; name: string; describe?: string; prompt?: string; position?: { x: number; y: number } }) =>
    post<{ key: string; id: number; rootKey: string }>("/canvas/createStateAsset", body),
  generateImage: (body: {
    projectId: number;
    target: string;
    model?: string | null;
    size?: ImageSize | null;
    aspectRatio?: string | null;
    prompt?: string | null;
    promptMode?: "raw" | "template";
    presetId?: string | null;
    artStyle?: string | null;
  }) => post<{ imageId: number; steps?: number[] }>("/canvas/generateImage", body),
  /** 文本节点：用通用 AI 按指令 + 连入的参考写内容，直接写进节点，返回旧内容供撤销 */
  generateText: (body: { projectId: number; target: string; instruction: string }) =>
    post<{ text: string; previous: string }>("/canvas/generateText", body),
  /** 音频节点：文本转语音，立即返回 imageId，后台生成 */
  generateAudio: (body: { projectId: number; target: string; model: string; text: string; voice?: string; speechRate?: number; pitchRate?: number; volume?: number }) =>
    post<{ imageId: number; usedRefs: { key: string; kind: string }[] }>("/canvas/generateAudio", body),
  getPresets: (projectId: number) => post<CanvasPreset[]>("/canvas/getPresets", { projectId }),
  polishPreset: (body: { projectId: number; presetId: string; text: string; nodeKey?: string | null; artStyle?: string | null }) =>
    post<{ text: string }>("/canvas/polishPreset", body),
  generateVideo: (body: {
    projectId: number;
    target: string;
    model?: string | null;
    prompt: string;
    duration: number;
    resolution: string;
    aspectRatio?: "16:9" | "9:16";
    audio?: boolean;
  }) => post<{ imageId: number; usedRefs: { key: string; kind: string }[] }>("/canvas/generateVideo", body),
  polishVideoPrompt: (body: { projectId: number; nodeKey: string; model: string; text: string; duration: number; aspectRatio: "16:9" | "9:16" }) =>
    post<{ text: string; rules: string; refs: { tag: string; name: string; type: string }[] }>("/canvas/polishVideoPrompt", body),
  /** 复制节点（含当前版本文件与它们之间的连线）；跨项目时资产降级成图片节点 */
  duplicateNodes: (body: { projectId: number; sourceProjectId?: number | null; items: { key: string; position: { x: number; y: number } }[] }) =>
    post<{ keyMap: Record<string, string>; keys: string[] }>("/canvas/duplicateNodes", body),
  /** 终止一次生成（排队中的移除，正在跑的发取消信号），节点当前图不变 */
  cancelGeneration: (projectId: number, imageId: number) => post<{ cancelled: boolean; queued?: boolean }>("/canvas/cancelGeneration", { projectId, imageId }),
  pollVersions: (ids: number[]) => post<(VersionDto & { owner: string | null })[]>("/canvas/pollVersions", { ids }),
  listHistory: (body: { projectId: number; target?: string | null; kind?: "image" | "video" | "audio" | null; page: number; limit: number }) =>
    post<{ total: number; list: HistoryItem[] }>("/canvas/listHistory", body),
  setCurrentVersion: (projectId: number, target: string, imageId: number) => post<unknown>("/canvas/setCurrentVersion", { projectId, target, imageId }),
  upload: (body: { projectId: number; base64Data: string; name?: string; target?: string | null; position?: { x: number; y: number } }) =>
    post<{ key: string; imageId: number }>("/canvas/upload", body),
  saveNodeToAssets: (body: { projectId: number; nodeId: number; type: "role" | "scene" | "tool"; name: string; describe?: string; parentAssetId?: number | null }) =>
    post<{ key: string; id: number }>("/canvas/saveNodeToAssets", body),
  createAsset: (body: { projectId: number; type: "role" | "scene" | "tool"; name: string; describe?: string; scriptId?: number | null; position?: { x: number; y: number } }) =>
    post<{ key: string; id: number }>("/canvas/createAsset", body),
  deleteNode: (projectId: number, key: string, force = false) => post<{ removed: string[]; trashId: number }>("/canvas/deleteNode", { projectId, key, force }),
  restoreNode: (projectId: number, trashId: number) =>
    post<{ restored: string[]; keyMap: Record<string, string> }>("/canvas/restoreNode", { projectId, trashId }),
  bindVoice: (assetsId: number, audioId?: number) => post<unknown>("/cornerScape/updateAssetsAudio", audioId ? { assetsId, audioIds: [audioId] } : { assetsId }),
  getAssetModels: (projectId?: number | null) =>
    post<{ global: AssetModels; project?: Partial<AssetModels>; effective?: AssetModels }>("/setting/assetModels/getAssetModels", { projectId: projectId ?? null }),
  setAssetModels: (models: Partial<AssetModels>, projectId?: number | null) =>
    post<unknown>("/setting/assetModels/setAssetModels", { models, projectId: projectId ?? null }),
};

/** 读本地文件为 data URL */
export const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const errorMessage = (e: unknown, fallback: string) => (e as { message?: string })?.message || fallback;
