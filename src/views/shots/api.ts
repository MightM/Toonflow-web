import axios from "@/utils/axios";
import type { ShotsData } from "./types";

// 镜头台只有一个自己的接口：一次读出整集。
// 生成、版本、参考边全部复用 /api/canvas/*（见 ../canvas/api.ts 的 canvasApi）。
interface Envelope<T> {
  code: number;
  data: T;
  message: string;
}
const post = async <T>(url: string, body: object): Promise<T> => ((await axios.post(url, body)) as unknown as Envelope<T>).data;

export const shotsApi = {
  get: (projectId: number, scriptId: number) => post<ShotsData>("/production/shots/getShots", { projectId, scriptId }),
  /** 批量生成分镜图（与单张走同一条后端路径） */
  batchGenerateImage: (body: { projectId: number; scriptId: number; storyboardIds: number[]; compulsory?: boolean; concurrentCount?: number }) =>
    post<{ id: number; imageId: number | null; state: string }[]>("/production/storyboard/batchGenerateImage", body),
  editShot: (body: { id: number; prompt: string; videoDesc: string }) => post<unknown>("/production/storyboard/editStoryboardInfo", body),
  removeShot: (id: number) => post<unknown>("/production/storyboard/removeFrame", { id }),
  removeShots: (projectId: number, ids: number[]) => post<unknown>("/production/storyboard/batchDelete", { projectId, ids }),
  /** 合并 / 拆开片段（多镜合一） */
  setSegment: (body: { projectId: number; scriptId: number; action: "merge" | "split"; shotIds: number[] }) =>
    post<{ trackId?: number; trackIds?: number[] }>("/production/shots/setSegment", body),
  /** 片段参考：take = 把当前自动推导的结果落成可编辑的边；reset = 回到跟随各镜素材板 */
  trackRefs: (body: { projectId: number; trackId: number; action: "take" | "reset" }) =>
    post<{ overridden: boolean; refs: string[] }>("/production/shots/trackRefs", body),
  /** 老视频（分镜台时期生成的）没有 o_image 版本行，只能用老接口选用 */
  selectLegacyVideo: (trackId: number, videoId: number) => post<unknown>("/production/workbench/selectVideo", { trackId, videoId }),
};
