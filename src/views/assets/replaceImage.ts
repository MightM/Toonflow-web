import axios from "@/utils/axios";
import { readAsDataUrl } from "@/views/canvas/api";

// 「换图」：选一张本地图片替换资产当前图。走 /canvas/upload 的 target=a:<id>，
// 与画布上传同一条路：写一条 o_image 版本并把 o_assets.imageId 指过去，旧图留在历史版本里，
// 资产 id 不变，所以它和剧本 / 分镜 / 衍生状态的绑定都保持不动。
const ACCEPT = "image/png,image/jpeg,image/webp";

/** 弹系统文件选择器，取消时返回 null */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.style.display = "none";
    document.body.appendChild(input);
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.onchange = () => done(input.files?.[0] ?? null);
    input.oncancel = () => done(null);
    input.click();
  });
}

/** 上传并设为资产当前图，返回本地预览用的 data URL */
export async function replaceAssetImage(projectId: number, assetId: number, file: File): Promise<string> {
  const base64Data = await readAsDataUrl(file);
  await axios.post("/canvas/upload", { projectId, base64Data, target: `a:${assetId}` });
  return base64Data;
}
