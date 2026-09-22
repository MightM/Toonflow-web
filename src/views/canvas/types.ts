// 资产画布前后端共享的数据形状（与 toonflow-src/src/routes/canvas/* 对应）

export type AssetType = "role" | "scene" | "tool";
// text 是无限画布的便签节点：内容存在 prompt 里，没有版本链
export type MediaKind = "image" | "video" | "audio" | "text";
export type ImageSize = "1K" | "2K" | "4K";

export interface VersionDto {
  imageId: number;
  state: "生成中" | "已完成" | "生成失败" | string | null;
  stage: string | null; // 角色为 sheet；旧版本可能是 portrait / fourView
  kind: MediaKind;
  aspectRatio: string | null;
  errorReason: string | null;
  src: string | null;
  /** 生成中时的队列位置：running = 正在生成；ahead = 前面还有几个在排队。老任务 / 不在队列里为 null */
  queue?: { lane: "image" | "video" | "audio"; ahead: number; running: boolean } | null;
}

interface BaseNode {
  key: string;
  id: number;
  name: string;
  prompt: string | null;
  current: VersionDto | null;
  latest: VersionDto | null;
  pendingImageIds: number[];
}

export interface AssetNodeDto extends BaseNode {
  kind: "asset";
  assetType: AssetType;
  parentKey: string | null;
  describe: string | null;
  promptState: string | null;
  audioBindState: string | null;
  voices: { id: number; name: string }[];
}

/** 自由节点（标为角色的图片）绑定的音色：音色库资产或画布上的音频节点 */
export type NodeVoice = { kind: "asset"; id: number; name?: string } | { kind: "node"; key: string; name?: string };

export interface MediaNodeDto extends BaseNode {
  kind: MediaKind;
  params: Record<string, unknown>;
  /** 类型标签（人物 / 场景 / 道具），未标注为 null */
  assetType: AssetType | null;
  /** 标为角色的图片节点绑定的音色（后端解析出名字） */
  voice?: { kind: "asset" | "node"; name: string } | null;
  /** 后端按参考形状自动选出的模型与理由；资产画布不提供，用户仍手选 */
  auto?: { model: string; auto: boolean; reason: string } | null;
  /** 锁定的时长（镜头台用分镜表算出的片段时长），不让用户在常规面板上改 */
  lockedDuration?: number | null;
}

export type CanvasNodeDto = AssetNodeDto | MediaNodeDto;

/** 视觉手册的轻量信息（画布「风格」胶囊用） */
export interface ArtStyleDto {
  stylePath: string;
  name: string;
  cover: string | null;
  line: string;
}
/** 自由节点选的风格（params.artStyle） */
export const artStyleOf = (dto: CanvasNodeDto | undefined): string | null => {
  const value = dto && !isAssetNode(dto) ? dto.params?.artStyle : null;
  return typeof value === "string" && value ? value : null;
};
/** 视频截帧的位置 */
export type FrameAt = "current" | "first" | "last";

export interface CanvasEdgeDto {
  id: string;
  edgeId?: number;
  source: string;
  target: string;
  kind: "derive" | "ref";
  sort?: number;
}

export interface AssetModelBinding {
  model: string;
  aspectRatio: string;
}
export type AssetModelKey = "roleSheet" | "roleSheetRef" | "roleDerive" | "scene" | "sceneRef" | "sceneDerive" | "prop" | "propRef" | "propDerive";
export type AssetModels = Record<AssetModelKey, AssetModelBinding>;

export interface CanvasLayout {
  positions: Record<string, { x: number; y: number }>;
  nodeMeta: Record<string, Record<string, unknown>>;
  pinned: string[];
  hidden: string[];
}

export interface CanvasData {
  viewport: { x: number; y: number; zoom: number } | null;
  layout: CanvasLayout;
  nodes: CanvasNodeDto[];
  edges: CanvasEdgeDto[];
  voices: { id: number; name: string; describe: string | null }[];
  defaults: {
    imageModel: string | null;
    imageQuality: ImageSize | null;
    videoModel: string | null;
    videoRatio: string | null;
    assetModels: AssetModels;
  };
}

export interface HistoryItem {
  imageId: number;
  owner: string | null;
  ownerName: string;
  state: string | null;
  errorReason: string | null;
  stage: string | null;
  kind: MediaKind;
  model: string | null;
  resolution: string | null;
  aspectRatio: string | null;
  prompt: string | null;
  createTime: number | null;
  src: string | null;
  isCurrent: boolean;
}

/** vue-flow 节点 data：DTO + 画布上的临时状态 */
export interface FlowNodeData {
  dto: CanvasNodeDto;
  refCount: number; // 入边参考数（derive 不算）
}

export const isAssetNode = (dto: CanvasNodeDto): dto is AssetNodeDto => dto.kind === "asset";
/** 节点的类型：资产取资产类型，自由节点取类型标签 */
export const assetTypeOf = (dto: CanvasNodeDto | undefined): AssetType | null => (dto ? dto.assetType ?? null : null);

export const ASPECT_RATIOS = ["16:9", "9:16", "4:3", "3:4", "1:1"] as const;
export const IMAGE_SIZES: ImageSize[] = ["1K", "2K", "4K"];

/** 画布「目标模板」（toonflow-src/data/skills/canvas_presets/*.md） */
export interface CanvasPreset {
  id: string;
  name: string;
  group: string;
  icon: string;
  desc: string;
  targets: string[]; // image / role / scene / tool
  ratio: string;
  size: string;
  requiresRef: boolean;
  canPolish: boolean;
  steps: string[]; // 两步工作流的步骤名，如 ["换装定妆照", "人物换装"]；单步为空
  hint: string;
  modelNoRef: string; // 空串 = 不改用户选的模型
  modelWithRef: string;
  body: string;
}
