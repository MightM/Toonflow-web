// 镜头台的数据形状（与 toonflow-src/src/routes/production/shots/getShots.ts 对应）
import type { AssetType, ImageSize, MediaKind } from "../canvas/types";

export interface ShotVersionDto {
  imageId: number;
  state: string | null;
  stage: string | null;
  kind: MediaKind;
  aspectRatio: string | null;
  errorReason: string | null;
  src: string | null;
  /** 原图（src 是缩略图，顶部大图预览要用这个） */
  full: string | null;
}

/** 自动选出来的模型与理由（后端 lib/modelLadder.ts 按参考形状定的） */
export interface AutoModelDto {
  model: string;
  auto: boolean;
  reason: string;
}

export interface ShotRefDto {
  /** null = 推导出来的参考（片段自动跟随各镜素材板时），没有边可删 */
  edgeId: number | null;
  key: string;
  sort: number;
  name: string;
  kind: MediaKind;
  assetType: AssetType | null;
  src: string | null;
  /** 参考指向的资产 / 节点已被删除 */
  missing: boolean;
}

export interface ShotDto {
  key: string; // s:<id>
  id: number;
  index: number;
  prompt: string | null;
  videoDesc: string | null;
  duration: number;
  track: string | null;
  trackId: number | null;
  shouldGenerateImage: number | null;
  state: string | null;
  reason: string | null;
  current: ShotVersionDto | null;
  latest: ShotVersionDto | null;
  pendingImageIds: number[];
  refs: ShotRefDto[];
  auto: AutoModelDto | null;
}

export interface TrackVideoDto {
  id: number;
  /** 对应的 o_image 版本行；「设为当前」用它 */
  imageId: number | null;
  state: string | null;
  errorReason: string | null;
  src: string | null;
}

export interface TrackDto {
  key: string; // v:<id>
  id: number;
  kind: "shot" | "segment" | string;
  duration: number | null;
  prompt: string | null;
  state: string | null;
  reason: string | null;
  model: string | null;
  params: Record<string, unknown>;
  videoId: number | null;
  shotIds: number[];
  refs: ShotRefDto[];
  /** true = 参考跟随各镜素材板自动推导；false = 用户改过，以片段自己的边为准 */
  derived: boolean;
  /** 会作为 <Audio N> 传进去的角色音色（不在 refs 里，界面上要单独列） */
  voices: { assetId: number; name: string }[];
  auto: AutoModelDto | null;
  pendingImageIds: number[];
  videos: TrackVideoDto[];
}

/** 可当参考的素材：资产、自由节点、本集其它镜头 */
export interface PoolItem {
  key: string;
  name: string;
  kind: MediaKind;
  assetType: AssetType | null;
  src: string | null;
}

export interface ShotsData {
  defaults: {
    imageModel: string | null;
    imageQuality: ImageSize | null;
    videoModel: string | null;
    videoRatio: string | null;
    artStyle: string | null;
  };
  shots: ShotDto[];
  tracks: TrackDto[];
  pool: PoolItem[];
}

export const shotLabel = (shot: ShotDto) => `镜头 ${shot.index + 1}`;

/** 素材来源分组，给选择器分区用 */
export const poolGroupOf = (item: PoolItem): "角色" | "场景" | "道具" | "镜头" | "素材" => {
  if (item.key.startsWith("s:")) return "镜头";
  if (item.assetType === "role") return "角色";
  if (item.assetType === "scene") return "场景";
  if (item.assetType === "tool") return "道具";
  return "素材";
};
