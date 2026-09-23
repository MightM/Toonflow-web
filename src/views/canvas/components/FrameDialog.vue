<template>
  <Teleport to="body">
    <Transition name="frame">
      <div v-if="visible" class="frame-dialog" role="dialog" aria-modal="true" aria-label="缩放画幅">
        <div class="stage">
          <div ref="stageEl" class="stage-inner">
            <div class="frame" :class="[`bg-${background}`, { loaded }]" :style="frameStyle">
              <img v-if="compareSrc" class="compare" :src="compareSrc" alt="" draggable="false" />
              <img
                ref="imgEl"
                class="subject"
                :src="src"
                alt=""
                draggable="false"
                crossorigin="anonymous"
                :style="subjectStyle"
                @load="onLoad"
                @error="onError"
                @pointerdown="startDrag" />
            </div>
          </div>
        </div>
        <footer class="bar">
          <span class="title"><i-zoom-out size="16" />缩放画幅「{{ name }}」</span>
          <div class="ratios" role="radiogroup" aria-label="画幅比例">
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
          <label class="pct">
            <span>主体占比</span>
            <input v-model.number="pct" type="range" :min="MIN_PCT" :max="100" step="1" :disabled="!loaded" />
            <b>{{ pct }}%</b>
          </label>
          <div class="ratios" role="radiogroup" aria-label="背景">
            <button
              v-for="option in BACKGROUNDS"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="background === option.value"
              :class="{ on: background === option.value }"
              @click="background = option.value">
              {{ option.label }}
            </button>
          </div>
          <select v-if="compare.length" v-model="compareKey" class="compare-pick" aria-label="对照图">
            <option value="">不对照</option>
            <option v-for="item in compare" :key="item.key" :value="item.key">对照：{{ item.name }}</option>
          </select>
          <button type="button" class="ghost" :disabled="!loaded" title="主体贴到画幅底边（人物站在地面上）" @click="alignBottom">贴底</button>
          <span class="size" :title="loaded ? `原图 ${natural.w} × ${natural.h}` : ''">{{ loaded ? `${outSize.w} × ${outSize.h}` : "加载中…" }}</span>
          <button type="button" class="ghost" :disabled="!loaded" @click="reset">重置</button>
          <button type="button" class="ghost" @click="close">取消</button>
          <button type="button" class="primary" :disabled="!loaded || !changed" title="Enter" @click="confirm">应用</button>
        </footer>
        <p class="hint">
          拖动图片调整它在画幅里的位置；主体占比越小、留白越多，双图合成时人物相对场景就越小。对照图只用来目测比例，不会画进结果。结果作为这个节点的新版本，原图留在历史里（⌘Z 可切回）
        </p>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// 缩放画幅：把图片缩小放进一个更大的画幅里（四周留白），让主体在参考图里占的比例和它在目标画面里应占的比例一致。
// 双图 / 多图合成的工作流会把每张参考图各自归一到同样的像素量，两张图之间没有相对比例，只能靠留白告诉模型「人物只有这么大」。
// 画幅与主体位置都按输出像素记，显示时按缩放比换算；确定后在前端用 canvas 画出交给父级上传成新版本。
interface RatioOption {
  label: string;
  value: number | "original" | "compare"; // original = 原图比例；compare = 对照图比例
}
type Background = "white" | "black" | "transparent" | "edge";
export interface CompareImage {
  key: string;
  name: string;
  src: string;
}

const RATIO_OPTIONS: RatioOption[] = [
  { label: "原图", value: "original" },
  { label: "1:1", value: 1 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
];
const BACKGROUNDS: { label: string; value: Background }[] = [
  { label: "白底", value: "white" },
  { label: "黑底", value: "black" },
  { label: "透明", value: "transparent" },
  { label: "边缘色", value: "edge" },
];
const MIN_PCT = 15;
const DEFAULT_PCT = 60;
const MAX_SIDE = 4096; // 输出长边上限：再大对生成没有意义，只是拖慢上传
const JPEG_QUALITY = 0.92;

const visible = defineModel<boolean>("visible", { default: false });
const props = withDefaults(defineProps<{ src: string; name: string; compare?: CompareImage[] }>(), { compare: () => [] });
const emit = defineEmits<{ confirm: [payload: { base64Data: string; width: number; height: number }] }>();

const imgEl = ref<HTMLImageElement>();
const stageEl = ref<HTMLDivElement>();
const loaded = ref(false);
const natural = reactive({ w: 0, h: 0 });
const ratioLabel = ref("原图");
const ratioValue = ref<RatioOption["value"]>("original");
const pct = ref(DEFAULT_PCT);
const background = ref<Background>("white");
const compareKey = ref("");
const compareNatural = reactive({ w: 0, h: 0 });
const offset = ref({ x: 0, y: 0 }); // 主体左上角相对画幅的位置（输出像素）；null 之前先居中
const userMoved = ref(false);
const stageSize = reactive({ w: 0, h: 0 });

const compareSrc = computed(() => props.compare.find((c) => c.key === compareKey.value)?.src ?? "");
const ratio = computed(() => {
  if (ratioValue.value === "original") return natural.w && natural.h ? natural.w / natural.h : 1;
  if (ratioValue.value === "compare") return compareNatural.w && compareNatural.h ? compareNatural.w / compareNatural.h : natural.w / natural.h || 1;
  return ratioValue.value;
});
/** 画幅尺寸（输出像素）：主体沿贴合边占 pct%，不放大原图，长边封顶 */
const frameSize = computed(() => {
  if (!natural.w || !natural.h) return { w: 0, h: 0, scale: 1 };
  const r = ratio.value;
  const p = Math.min(Math.max(pct.value, MIN_PCT), 100) / 100;
  // 主体在画幅里的最大贴合尺寸：先假设画幅高 = 主体高 / p，检查宽是否放得下
  let h = natural.h / p;
  let w = h * r;
  if (natural.w > w * p) {
    w = natural.w / p;
    h = w / r;
  }
  let scale = 1;
  const longest = Math.max(w, h);
  if (longest > MAX_SIDE) {
    scale = MAX_SIDE / longest;
    w *= scale;
    h *= scale;
  }
  return { w: Math.round(w), h: Math.round(h), scale };
});
const subjectSize = computed(() => ({ w: Math.round(natural.w * frameSize.value.scale), h: Math.round(natural.h * frameSize.value.scale) }));
const outSize = computed(() => ({ w: frameSize.value.w, h: frameSize.value.h }));
const changed = computed(() => loaded.value && (outSize.value.w !== natural.w || outSize.value.h !== natural.h));
// 显示缩放比：画幅放进舞台
const viewScale = computed(() => {
  const { w, h } = frameSize.value;
  if (!w || !h || !stageSize.w || !stageSize.h) return 1;
  return Math.min(stageSize.w / w, stageSize.h / h, 1);
});
const frameStyle = computed(() => ({ width: `${frameSize.value.w * viewScale.value}px`, height: `${frameSize.value.h * viewScale.value}px` }));
const subjectStyle = computed(() => ({
  left: `${offset.value.x * viewScale.value}px`,
  top: `${offset.value.y * viewScale.value}px`,
  width: `${subjectSize.value.w * viewScale.value}px`,
  height: `${subjectSize.value.h * viewScale.value}px`,
}));

// ─── 加载 / 尺寸 ──────────────────────────────────────
let observer: ResizeObserver | undefined;
function measureStage() {
  const el = stageEl.value;
  if (!el) return;
  stageSize.w = el.clientWidth;
  stageSize.h = el.clientHeight;
}
function onLoad() {
  const img = imgEl.value;
  if (!img) return;
  natural.w = img.naturalWidth;
  natural.h = img.naturalHeight;
  loaded.value = true;
  nextTick(() => {
    measureStage();
    observer?.disconnect();
    observer = new ResizeObserver(measureStage);
    if (stageEl.value) observer.observe(stageEl.value);
    center();
  });
}
function onError() {
  window.$message.error("图片加载失败，无法缩放");
  close();
}
watch(visible, (on) => {
  if (on) {
    loaded.value = false;
    ratioValue.value = "original";
    ratioLabel.value = "原图";
    pct.value = DEFAULT_PCT;
    background.value = "white";
    compareKey.value = "";
    userMoved.value = false;
    return;
  }
  observer?.disconnect();
  observer = undefined;
});
// 对照图：读它的原始尺寸，切到「对照」比例
watch(compareSrc, (src) => {
  if (!src) {
    if (ratioValue.value === "compare") setRatio(RATIO_OPTIONS[0]);
    return;
  }
  const probe = new Image();
  probe.onload = () => {
    compareNatural.w = probe.naturalWidth;
    compareNatural.h = probe.naturalHeight;
    ratioValue.value = "compare";
    ratioLabel.value = "对照图";
    clampOffset();
  };
  probe.src = src;
});
watch([frameSize, subjectSize], () => (userMoved.value ? clampOffset() : center()));

// ─── 位置 ─────────────────────────────────────────────
function center() {
  offset.value = { x: Math.round((frameSize.value.w - subjectSize.value.w) / 2), y: Math.round((frameSize.value.h - subjectSize.value.h) / 2) };
}
function clampOffset() {
  offset.value = {
    x: Math.min(Math.max(offset.value.x, 0), Math.max(0, frameSize.value.w - subjectSize.value.w)),
    y: Math.min(Math.max(offset.value.y, 0), Math.max(0, frameSize.value.h - subjectSize.value.h)),
  };
}
function alignBottom() {
  userMoved.value = true;
  offset.value = { x: offset.value.x, y: Math.max(0, frameSize.value.h - subjectSize.value.h) };
}
function setRatio(option: RatioOption) {
  ratioLabel.value = option.label;
  ratioValue.value = option.value;
}
function reset() {
  pct.value = DEFAULT_PCT;
  userMoved.value = false;
  center();
}

// ─── 拖动主体 ─────────────────────────────────────────
let drag: { start: { x: number; y: number }; px: number; py: number } | null = null;
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !loaded.value) return;
  event.preventDefault();
  drag = { start: { ...offset.value }, px: event.clientX, py: event.clientY };
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
  userMoved.value = true;
  offset.value = { x: drag.start.x + (event.clientX - drag.px) / viewScale.value, y: drag.start.y + (event.clientY - drag.py) / viewScale.value };
  clampOffset();
}

// ─── 确定 / 关闭 ──────────────────────────────────────
/** 边缘取色：采样原图四条边的像素求均值 */
function edgeColor(img: HTMLImageElement): string {
  const probe = document.createElement("canvas");
  const size = 64;
  probe.width = size;
  probe.height = size;
  const context = probe.getContext("2d");
  if (!context) return "#ffffff";
  context.drawImage(img, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x > 1 && x < size - 2 && y > 1 && y < size - 2) continue;
      const i = (y * size + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
function confirm() {
  const img = imgEl.value;
  if (!img || !loaded.value) return;
  const width = Math.max(1, outSize.value.w);
  const height = Math.max(1, outSize.value.h);
  const canvasEl = document.createElement("canvas");
  canvasEl.width = width;
  canvasEl.height = height;
  const context = canvasEl.getContext("2d");
  if (!context) return void window.$message.error("浏览器不支持画布缩放");
  let base64Data: string;
  try {
    if (background.value !== "transparent") {
      context.fillStyle = background.value === "white" ? "#ffffff" : background.value === "black" ? "#000000" : edgeColor(img);
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(img, Math.round(offset.value.x), Math.round(offset.value.y), subjectSize.value.w, subjectSize.value.h);
    // 透明底必须 png；原图是 png / webp（可能带透明）时也保留 png，否则用 jpg 省体积
    const keepPng = background.value === "transparent" || /\.(png|webp)(\?|$)/i.test(props.src);
    base64Data = keepPng ? canvasEl.toDataURL("image/png") : canvasEl.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return void window.$message.error("图片来自其它站点，浏览器不允许处理");
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
  } else if (event.key === "Enter" && loaded.value && changed.value && !(event.target instanceof HTMLSelectElement)) {
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
.frame-dialog {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  grid-template-rows: 1fr auto auto; // 图片在上，操作条在图片下方（顶部常被窗口标题栏 / 顶栏挡住）
  background: rgba(8, 9, 12, 0.94);
  color: #fff;
}
.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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
.pct {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  input {
    width: 140px;
    accent-color: var(--td-brand-color);
  }
  b {
    min-width: 36px;
    font-variant-numeric: tabular-nums;
    color: #fff;
  }
}
.compare-pick {
  height: 30px;
  max-width: 180px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  option {
    color: #000;
  }
}
.stage {
  min-height: 0;
  padding: 24px;
  overflow: hidden;
}
.stage-inner {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
}
.frame {
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  &.bg-white {
    background: #fff;
  }
  &.bg-black {
    background: #000;
  }
  &.bg-edge {
    background: #888;
  }
  &.bg-transparent {
    background: repeating-conic-gradient(#3a3d44 0% 25%, #22242a 0% 50%) 0 0 / 20px 20px;
  }
  .compare {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
    opacity: 0.4;
    pointer-events: none;
  }
  .subject {
    position: absolute;
    cursor: move;
    touch-action: none;
    user-select: none;
    -webkit-user-drag: none;
    outline: 1px dashed rgba(255, 255, 255, 0.6);
    outline-offset: -1px;
  }
}
.hint {
  margin: 0;
  padding: 10px 20px 14px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
.frame-enter-active,
.frame-leave-active {
  transition: opacity 160ms ease;
}
.frame-enter-from,
.frame-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .frame-enter-active,
  .frame-leave-active {
    transition: none;
  }
}
</style>
