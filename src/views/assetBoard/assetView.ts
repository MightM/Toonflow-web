// 资产页的两种展示方式：记住上次用的那种，顶栏「资产」按钮直接打开它
export type AssetView = "board" | "canvas";

export const ASSET_VIEW_KEY = "toonflow.assetView";

export function lastAssetPath(): "/assetBoard" | "/canvas" {
  try {
    return localStorage.getItem(ASSET_VIEW_KEY) === "canvas" ? "/canvas" : "/assetBoard";
  } catch {
    return "/assetBoard";
  }
}
