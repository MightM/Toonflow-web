import { useCanvasCtx } from "./context";

// 输入面板 / 便签面板里的滚轮：普通滚动留给面板自己（不传给画布），
// 但 ⌘/Ctrl + 滚轮和触控板捏合（浏览器发成 ctrlKey 的 wheel）应当缩放画布，而不是让浏览器缩放整个页面
// 与 vue-flow（d3-zoom）在画布空白处的滚轮缩放同一套换算：deltaMode 行 / 页 / 像素，ctrlKey（捏合）放大 10 倍灵敏度
const wheelDelta = (event: WheelEvent) => -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002) * (event.ctrlKey ? 10 : 1);

export function useComposerWheel() {
  const ctx = useCanvasCtx();
  return (event: WheelEvent) => {
    event.stopPropagation();
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    ctx.zoomAt?.(event.clientX, event.clientY, Math.pow(2, wheelDelta(event)));
  };
}
