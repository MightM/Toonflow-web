import type { Ref } from "vue";
import { canvasApi } from "./api";
import type { FrameAt } from "./types";
import type { useCanvas } from "./useCanvas";

// 视频截帧：当前帧 / 首帧 / 尾帧 → 上传成新的图片节点，放在视频右侧并从视频连一条线（记录来源）。
// 当前帧取节点里正在播放的 <video> 的时刻；首尾帧用离屏 <video> 定位（需要 /oss 支持范围请求，否则定位不到尾帧）。
const NODE_GAP = 70;
const LAST_FRAME_BACKOFF = 0.05; // 定位到 duration 本身常常拿到黑帧，往前退一点
const JPEG_QUALITY = 0.92;
const LOAD_TIMEOUT = 20000; // 加载 / 定位超时（后台标签页里浏览器会推迟媒体加载）

const withTimeout = <T>(promise: Promise<T>, message: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), LOAD_TIMEOUT);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

export function useFrameCapture(options: {
  canvas: ReturnType<typeof useCanvas>;
  projectId: Ref<number>;
  nodeWidth: (key: string) => number;
  nodePosition: (key: string) => { x: number; y: number } | null;
  afterCreate?: (key: string) => void;
}) {
  const { canvas, projectId } = options;

  function findNodeVideo(key: string): HTMLVideoElement | null {
    const safe = key.replace(/"/g, '\\"');
    return document.querySelector<HTMLVideoElement>(`.vue-flow__node[data-id="${safe}"] video`);
  }

  async function seekOffscreen(src: string, at: "first" | "last"): Promise<{ video: HTMLVideoElement; time: number }> {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous"; // 同源也标一下，Electron 里换端口时 canvas 才不会被污染
    video.src = src;
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("视频加载失败"));
      }),
      "视频加载超时：请确认标签页在前台后再试",
    );
    const time = at === "first" ? 0 : Math.max(0, video.duration - LAST_FRAME_BACKOFF);
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("视频定位失败"));
        video.currentTime = time;
      }),
      "视频定位超时：服务端需要支持范围请求（已在 /oss 打开）",
    );
    // seeked 之后画面不一定已经解码到，等一帧
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
    return { video, time };
  }

  function grab(video: HTMLVideoElement): string {
    const canvasEl = document.createElement("canvas");
    canvasEl.width = video.videoWidth;
    canvasEl.height = video.videoHeight;
    const context = canvasEl.getContext("2d");
    if (!context || !canvasEl.width) throw new Error("视频还没加载出画面");
    context.drawImage(video, 0, 0);
    return canvasEl.toDataURL("image/jpeg", JPEG_QUALITY);
  }

  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}.${String(Math.floor((t % 1) * 1000)).padStart(3, "0")}`;
  const LABEL: Record<FrameAt, string> = { current: "当前帧", first: "首帧", last: "尾帧" };

  async function captureFrame(key: string, at: FrameAt) {
    const dto = canvas.dtoByKey.value.get(key);
    const src = dto?.current?.src?.replace(/\?size=\d+$/, "");
    if (!dto || !src) return void window.$message.warning("这个节点还没有视频");
    await canvas.run(async () => {
      let video: HTMLVideoElement | null;
      let time: number;
      if (at === "current") {
        video = findNodeVideo(key);
        if (!video) throw new Error("找不到节点里的视频");
        if (video.readyState < 2) {
          const el = video;
          await withTimeout(
            new Promise<void>((resolve) => el.addEventListener("loadeddata", () => resolve(), { once: true })),
            "视频还没加载出画面：请先播放一下再截当前帧",
          );
        }
        time = video.currentTime;
      } else {
        ({ video, time } = await seekOffscreen(src, at));
      }
      const base64Data = grab(video);
      const name = `${dto.name} · ${LABEL[at]} ${fmt(time)}`;
      const origin = options.nodePosition(key) ?? { x: 0, y: 0 };
      const position = { x: Math.round(origin.x + options.nodeWidth(key) + NODE_GAP), y: Math.round(origin.y) };
      const created = await canvasApi.upload({ projectId: projectId.value, base64Data, name, position });
      await canvasApi.addEdge(projectId.value, key, created.key);
      canvas.recordCreated(created.key, `截取${LABEL[at]}`);
      await canvas.refresh();
      window.$message.success(`已截取 ${fmt(time)} 的画面，加到了画布`);
      options.afterCreate?.(created.key);
    }, "截帧失败");
  }

  return { captureFrame };
}
