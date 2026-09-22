<template>
  <Teleport to="body">
    <Transition name="crop">
      <div v-if="visible" class="crop-dialog" role="dialog" aria-modal="true" aria-label="裁剪图片">
        <header class="bar">
          <span class="title"><i-cutting-one size="16" />裁剪「{{ name }}」</span>
          <div class="ratios" role="radiogroup" aria-label="裁剪比例">
            <button
              v-for="option in RATIO_OPTIONS"
              :key="option.label"
              type="button"
              role="radio"
              :aria-checked="ratioLabel === option.label"
              :class="{ on: ratioLabel === option.label }"
              @click="setRatio(option)">
              {{ option.label }}
            </button>
          </div>
          <span class="size" :title="loaded ? `原图 ${natural.w} × ${natural.h}` : ''">{{ loaded ? `${outSize.w} × ${outSize.h}` : "加载中…" }}</span>
          <button type="button" class="ghost" :disabled="!loaded" @click="reset">重置</button>
          <button type="button" class="ghost" @click="close">取消</button>
          <button type="button" class="primary" :disabled="!loaded || !changed" title="Enter" @click="confirm">裁剪</button>
        </header>
        <div class="stage">
          <div ref="frameEl" class="frame" :class="{ loaded }">
            <img ref="imgEl" :src="src" alt="" draggable="false" crossorigin="anonymous" @load="onLoad" @error="onError" />
            <div v-if="loaded" class="box" :style="boxStyle" @pointerdown="startDrag('move', $event)">
              <span v-for="handle in HANDLES" :key="handle" :class="['handle', handle]" @pointerdown.stop="startDrag(handle, $event)" />
            </div>
          </div>
        </div>
        <p class="hint">拖动裁剪框内部移动，拖边或角调整大小；裁出的图作为这个节点的新版本，原图留在历史里（⌘Z 可切回）</p>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// 图片裁剪：全屏展示原图，裁剪框按原图像素记位置，显示时按缩放比换算；确定后在前端用 canvas 裁出并交给父级上传成新版本。
type Rect = { x: number; y: number; w: number; h: number };
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type DragMode = Handle | "move";
interface RatioOption {
  label: string;
  value: number | null | "original"; // null = 自由；original = 原图比例
}

const RATIO_OPTIONS: RatioOption[] = [
  { label: "自由", value: null },
  { label: "原图", value: "original" },
  { label: "1:1", value: 1 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
];
const HANDLES: Handle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const MIN_SIZE = 16; // 裁剪框最小边长（原图像素）
const JPEG_QUALITY = 0.92;

const visible = defineModel<boolean>("visible", { default: false });
const props = defineProps<{ src: string; name: string }>();
const emit = defineEmits<{ confirm: [payload: { base64Data: string; width: number; height: number }] }>();

const imgEl = ref<HTMLImageElement>();
const frameEl = ref<HTMLDivElement>();
const loaded = ref(false);
const natural = reactive({ w: 0, h: 0 });
const scale = ref(1); // 显示像素 / 原图像素
const rect = ref<Rect>({ x: 0, y: 0, w: 0, h: 0 });
const ratioLabel = ref("自由");
const ratio = ref<number | null>(null);

const outSize = computed(() => ({ w: Math.round(rect.value.w), h: Math.round(rect.value.h) }));
const changed = computed(() => outSize.value.w !== natural.w || outSize.value.h !== natural.h || Math.round(rect.value.x) !== 0 || Math.round(rect.value.y) !== 0);
const boxStyle = computed(() => ({
  left: `${rect.value.x * scale.value}px`,
  top: `${rect.value.y * scale.value}px`,
  width: `${rect.value.w * scale.value}px`,
  height: `${rect.value.h * scale.value}px`,
}));

// ─── 加载 / 缩放 ───────────────────────────────────────
let observer: ResizeObserver | undefined;
function measure() {
  const img = imgEl.value;
  if (!img || !natural.w) return;
  scale.value = img.clientWidth / natural.w || 1;
}
function onLoad() {
  const img = imgEl.value;
  if (!img) return;
  natural.w = img.naturalWidth;
  natural.h = img.naturalHeight;
  loaded.value = true;
  nextTick(() => {
    measure();
    reset();
    observer?.disconnect();
    observer = new ResizeObserver(measure);
    observer.observe(img);
  });
}
function onError() {
  window.$message.error("图片加载失败，无法裁剪");
  close();
}
watch(visible, (on) => {
  if (on) {
    loaded.value = false;
    ratio.value = null;
    ratioLabel.value = "自由";
    return;
  }
  observer?.disconnect();
  observer = undefined;
});

// ─── 比例 ─────────────────────────────────────────────
/** 以某点为中心、给定比例、能放进原图的最大矩形 */
function largestRect(target: number | null, center = { x: natural.w / 2, y: natural.h / 2 }): Rect {
  if (!target) return { x: 0, y: 0, w: natural.w, h: natural.h };
  let w = natural.w;
  let h = w / target;
  if (h > natural.h) {
    h = natural.h;
    w = h * target;
  }
  return clampRect({ x: center.x - w / 2, y: center.y - h / 2, w, h });
}
function clampRect(r: Rect): Rect {
  const w = Math.min(r.w, natural.w);
  const h = Math.min(r.h, natural.h);
  return { x: Math.min(Math.max(r.x, 0), natural.w - w), y: Math.min(Math.max(r.y, 0), natural.h - h), w, h };
}
function setRatio(option: RatioOption) {
  ratioLabel.value = option.label;
  ratio.value = option.value === "original" ? natural.w / natural.h : option.value;
  if (!loaded.value) return;
  const cur = rect.value;
  rect.value = ratio.value ? fitRatioInside(cur, ratio.value) : cur;
}
/** 当前框换比例：尽量保住中心与面积，放不下就缩 */
function fitRatioInside(cur: Rect, target: number): Rect {
  const center = { x: cur.x + cur.w / 2, y: cur.y + cur.h / 2 };
  const area = cur.w * cur.h;
  let w = Math.sqrt(area * target);
  let h = w / target;
  const max = largestRect(target, center);
  if (w > max.w || h > max.h) {
    w = max.w;
    h = max.h;
  }
  return clampRect({ x: center.x - w / 2, y: center.y - h / 2, w, h });
}
function reset() {
  rect.value = largestRect(ratio.value);
}

// ─── 拖动 ─────────────────────────────────────────────
let drag: { mode: DragMode; start: Rect; px: number; py: number } | null = null;
function startDrag(mode: DragMode, event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  drag = { mode, start: { ...rect.value }, px: event.clientX, py: event.clientY };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
}
function endDrag() {
  drag = null;
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
}
function onMove(event: PointerEvent) {
  if (!drag) return;
  const dx = (event.clientX - drag.px) / scale.value;
  const dy = (event.clientY - drag.py) / scale.value;
  rect.value = drag.mode === "move" ? clampRect({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy }) : resize(drag.start, drag.mode, dx, dy);
}
/** 按拖的把手改框：对边 / 对角固定；锁比例时另一维跟着算，放不下就以能放下的为准 */
function resize(start: Rect, handle: Handle, dx: number, dy: number): Rect {
  const moveW = handle.includes("w");
  const moveE = handle.includes("e");
  const moveN = handle.includes("n");
  const moveS = handle.includes("s");
  const left = start.x;
  const right = start.x + start.w;
  const top = start.y;
  const bottom = start.y + start.h;
  // 自由比例：各边独立
  if (!ratio.value) {
    const x1 = moveW ? Math.min(Math.max(left + dx, 0), right - MIN_SIZE) : left;
    const x2 = moveE ? Math.max(Math.min(right + dx, natural.w), left + MIN_SIZE) : right;
    const y1 = moveN ? Math.min(Math.max(top + dy, 0), bottom - MIN_SIZE) : top;
    const y2 = moveS ? Math.max(Math.min(bottom + dy, natural.h), top + MIN_SIZE) : bottom;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  const r = ratio.value;
  // 锚点：与把手相对的边 / 角；单边把手时另一维居中缩放
  const anchorX = moveW ? right : left;
  const anchorY = moveN ? bottom : top;
  const centerX = left + start.w / 2;
  const centerY = top + start.h / 2;
  let w: number;
  let h: number;
  if (moveW || moveE) {
    w = moveW ? start.w - dx : start.w + dx;
    if (moveN || moveS) {
      const hFromY = moveN ? start.h - dy : start.h + dy;
      // 角把手：取拖得更多的那一维为准
      if (Math.abs(hFromY - start.h) * r > Math.abs(w - start.w)) w = hFromY * r;
    }
  } else {
    w = (moveN ? start.h - dy : start.h + dy) * r;
  }
  w = Math.max(w, MIN_SIZE, MIN_SIZE * r);
  // 可用空间：水平方向从锚点到图边；垂直方向单边把手时是以中心为准的两倍余量
  const maxW = moveW ? anchorX : moveE ? natural.w - anchorX : Math.min(centerX, natural.w - centerX) * 2;
  const maxH = moveN ? anchorY : moveS ? natural.h - anchorY : Math.min(centerY, natural.h - centerY) * 2;
  w = Math.min(w, maxW, maxH * r);
  h = w / r;
  const x = moveW ? anchorX - w : moveE ? anchorX : centerX - w / 2;
  const y = moveN ? anchorY - h : moveS ? anchorY : centerY - h / 2;
  return clampRect({ x, y, w, h });
}

// ─── 确定 / 关闭 ──────────────────────────────────────
function confirm() {
  const img = imgEl.value;
  if (!img || !loaded.value) return;
  const { x, y, w, h } = rect.value;
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  const canvasEl = document.createElement("canvas");
  canvasEl.width = width;
  canvasEl.height = height;
  const context = canvasEl.getContext("2d");
  if (!context) return void window.$message.error("浏览器不支持画布裁剪");
  context.drawImage(img, Math.round(x), Math.round(y), width, height, 0, 0, width, height);
  // 原图是 png / webp（可能带透明）时保留 png，否则用 jpg 省体积
  const keepPng = /\.(png|webp)(\?|$)/i.test(props.src);
  let base64Data: string;
  try {
    base64Data = keepPng ? canvasEl.toDataURL("image/png") : canvasEl.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return void window.$message.error("图片来自其它站点，浏览器不允许裁剪");
  }
  emit("confirm", { base64Data, width, height });
  close();
}
const close = () => (visible.value = false);
function onKeydown(event: KeyboardEvent) {
  if (!visible.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
  } else if (event.key === "Enter" && loaded.value && changed.value) {
    event.preventDefault();
    event.stopPropagation();
    confirm();
  }
}
// 捕获阶段：画布自己的快捷键也在捕获阶段监听，先于它处理
watch(
  visible,
  (on) => {
    if (on) window.addEventListener("keydown", onKeydown, true);
    else window.removeEventListener("keydown", onKeydown, true);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown, true);
  endDrag();
  observer?.disconnect();
});
</script>

<style lang="scss" scoped>
.crop-dialog {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: rgba(8, 9, 12, 0.94);
  backdrop-filter: blur(6px);
  color: #fff;
}
.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  .title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-right: auto;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .size {
    min-width: 96px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
  button {
    height: 30px;
    padding: 0 12px;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    cursor: pointer;
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
    transition: background-color 150ms;
    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.2);
    }
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    &:focus-visible {
      outline: 2px solid #fff;
    }
    &.primary {
      background: var(--td-brand-color);
      &:hover:not(:disabled) {
        background: var(--td-brand-color-hover);
      }
    }
  }
}
.ratios {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  button {
    height: 26px;
    padding: 0 10px;
    background: transparent;
    color: rgba(255, 255, 255, 0.75);
    &.on {
      background: rgba(255, 255, 255, 0.22);
      color: #fff;
    }
  }
}
.stage {
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 24px;
  overflow: hidden;
}
.frame {
  position: relative;
  display: inline-block;
  line-height: 0;
  overflow: hidden; // 裁剪框的巨大阴影只遮住图片本身
  border-radius: 4px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  img {
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 150px);
    width: auto;
    height: auto;
    user-select: none;
    -webkit-user-drag: none;
  }
}
.box {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  cursor: move;
  touch-action: none;
  // 三分线
  background-image: linear-gradient(rgba(255, 255, 255, 0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.35) 1px, transparent 1px);
  background-size: 100% calc(100% / 3), calc(100% / 3) 100%;
  background-position: 0 -1px, -1px 0;
}
.handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  touch-action: none;
  // 透明外圈扩大可点区域
  &::after {
    content: "";
    position: absolute;
    inset: -8px;
  }
  &.n,
  &.s {
    left: 50%;
    width: 28px;
    height: 8px;
    transform: translateX(-50%);
    cursor: ns-resize;
  }
  &.e,
  &.w {
    top: 50%;
    width: 8px;
    height: 28px;
    transform: translateY(-50%);
    cursor: ew-resize;
  }
  &.n {
    top: -4px;
  }
  &.s {
    bottom: -4px;
  }
  &.e {
    right: -4px;
  }
  &.w {
    left: -4px;
  }
  &.nw,
  &.se {
    cursor: nwse-resize;
  }
  &.ne,
  &.sw {
    cursor: nesw-resize;
  }
  &.nw {
    top: -6px;
    left: -6px;
  }
  &.ne {
    top: -6px;
    right: -6px;
  }
  &.sw {
    bottom: -6px;
    left: -6px;
  }
  &.se {
    bottom: -6px;
    right: -6px;
  }
}
.hint {
  margin: 0;
  padding: 10px 20px 14px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
.crop-enter-active,
.crop-leave-active {
  transition: opacity 160ms ease;
}
.crop-enter-from,
.crop-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .crop-enter-active,
  .crop-leave-active {
    transition: none;
  }
}
</style>
