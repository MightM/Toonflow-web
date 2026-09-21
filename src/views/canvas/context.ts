import type { ComputedRef, InjectionKey } from "vue";
import type { ArtStyleDto, AssetType, CanvasData, CanvasEdgeDto, CanvasNodeDto, CanvasPreset, FrameAt } from "./types";

// 画布页向节点组件提供的能力（节点本身只负责展示与收集输入）
export interface CanvasContext {
  projectId: ComputedRef<number>;
  defaults: ComputedRef<CanvasData["defaults"] | null>;
  presets: ComputedRef<CanvasPreset[]>;
  /** 节点上次用过的目标模板（layout.nodeMeta[key].presetId） */
  lastPresetOf: (key: string) => string | undefined;
  /** 没用过模板时的默认选择；不提供则按节点类型取内置默认 */
  defaultPresetFor?: (key: string, hasRefs: boolean) => string | null;
  dtoByKey: ComputedRef<Map<string, CanvasNodeDto>>;
  refEdgesOf: (key: string) => CanvasEdgeDto[];
  /** 按给定的边 id 顺序重排某个节点的参考（决定图1、图2…） */
  reorderRefs: (targetKey: string, edgeIds: number[]) => Promise<boolean | undefined>;
  /** 删除一条参考。画布上是点连线按 Delete，镜头台没有连线，所以由输入面板提供 */
  removeRef?: (targetKey: string, sourceKey: string) => Promise<unknown>;
  /** 打开参考素材选择器（镜头台的「+ 参考」）。画布上靠连线，不提供 */
  openRefPicker?: (targetKey: string) => void;
  /** 优化按钮的文案。镜头台叫「推理提示词」，不提供时用默认的「优化」 */
  polishLabel?: (isVideo: boolean) => string;
  /** 当前选中的节点数：多选时不显示单个节点的操作条和输入面板 */
  selectedCount: ComputedRef<number>;
  /** 改名 / 改类型标签（可撤销） */
  renameNode: (key: string, name: string) => Promise<unknown>;
  setAssetType: (key: string, assetType: AssetType | null) => Promise<unknown>;
  track: (imageId: number) => void;
  refresh: () => Promise<unknown>;
  /** 以屏幕坐标为锚点缩放画布（输入面板里 ⌘/Ctrl + 滚轮、捏合时调用） */
  zoomAt?: (clientX: number, clientY: number, factor: number) => void;
  /** 终止一次生成（节点上的「停止」按钮） */
  cancelGeneration?: (imageId: number) => Promise<unknown>;
  openCreateState: (parentKey: string) => void;
  openHistory: (key: string | null) => void;
  openVoice: (key: string) => void;
  /** 图片节点可选的画风（视觉手册）；不提供时输入面板不显示「风格」胶囊 */
  artStyles?: ComputedRef<ArtStyleDto[]>;
  setArtStyle?: (key: string, stylePath: string | null) => Promise<unknown>;
  /** 视频截帧：把当前帧 / 首帧 / 尾帧截成新的图片节点；不提供时操作条上没有这个按钮 */
  captureFrame?: (key: string, at: FrameAt) => void;
  /** 存入资产库。无限画布没有资产库概念，不提供时操作条上不显示这个按钮 */
  openSaveToAssets?: (key: string) => void;
  openPreview: (src: string, kind: "image" | "video" | "audio") => void;
  uploadTo: (key: string) => void;
  deleteNode: (key: string) => void;
}

export const CANVAS_CTX: InjectionKey<CanvasContext> = Symbol("canvasCtx");

export function useCanvasCtx(): CanvasContext {
  const ctx = inject(CANVAS_CTX);
  if (!ctx) throw new Error("canvas context missing");
  return ctx;
}

export const TYPE_LABEL: Record<string, string> = { role: "角色", scene: "场景", tool: "道具", image: "图片", video: "视频", audio: "音频", text: "文本" };
