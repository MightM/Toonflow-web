<template>
  <t-popup trigger="click" placement="top-left" :overlay-inner-style="{ padding: 0 }">
    <button class="trigger">
      <i-setting-config size="13" />
      <template v-if="kind === 'image'">{{ size }} · {{ ratio }}</template>
      <template v-else>{{ resolution }} · {{ ratio }} · {{ duration }}s{{ audioOptional && audio ? " · 有声" : "" }}</template>
    </button>
    <template #content>
      <div class="panel nodrag nowheel" @mousedown.stop>
        <div class="section-title">比例</div>
        <div class="ratios" :class="{ two: kind === 'video' }">
          <button v-for="r in ratios" :key="r" class="ratio" :class="{ active: r === ratio }" @click="emit('update:ratio', r)">
            <span class="shape" :style="shapeStyle(r)" />
            {{ r }}
          </button>
        </div>
        <template v-if="kind === 'image'">
          <div class="section-title">分辨率</div>
          <div class="chips">
            <button v-for="s in IMAGE_SIZES" :key="s" class="chip" :class="{ active: s === size }" @click="emit('update:size', s)">{{ s }}</button>
          </div>
        </template>
        <template v-else>
          <div class="section-title">分辨率</div>
          <div class="chips">
            <button v-for="s in videoOptions.resolutions" :key="s" class="chip" :class="{ active: s === resolution }" @click="emit('update:resolution', s)">
              {{ s }}
            </button>
          </div>
          <div class="section-title duration-title">
            时长
            <output class="duration-value">{{ duration }}s</output>
          </div>
          <div v-if="durationRange" class="slider-row">
            <span class="bound">{{ durationRange[0] }}s</span>
            <t-slider
              class="slider"
              :model-value="duration"
              :min="durationRange[0]"
              :max="durationRange[1]"
              :step="1"
              aria-label="视频时长（秒）"
              @update:model-value="(v: number | number[]) => emit('update:duration', Array.isArray(v) ? v[0] : v)" />
            <span class="bound">{{ durationRange[1] }}s</span>
          </div>
          <div v-else class="chips">
            <button v-for="d in videoOptions.durations" :key="d" class="chip" :class="{ active: d === duration }" @click="emit('update:duration', d)">{{ d }}s</button>
          </div>
          <label v-if="audioOptional" class="audio-row">
            <span>
              生成声音
              <small>环境音、动作音和对白</small>
            </span>
            <t-switch size="small" :model-value="audio" @update:model-value="(v: unknown) => emit('update:audio', !!v)" />
          </label>
        </template>
      </div>
    </template>
  </t-popup>
</template>

<script setup lang="ts">
import { ASPECT_RATIOS, IMAGE_SIZES } from "../types";
import type { ImageSize } from "../types";

const props = defineProps<{
  kind: "image" | "video";
  ratio: string;
  size: ImageSize;
  duration: number;
  resolution: string;
  videoOptions: { durations: number[]; resolutions: string[] };
  audio?: boolean;
  audioOptional?: boolean;
}>();
const emit = defineEmits<{
  "update:ratio": [string];
  "update:size": [ImageSize];
  "update:duration": [number];
  "update:resolution": [string];
  "update:audio": [boolean];
}>();

// 模型给出连续整秒（如 H3 的 3~15 秒）时用滑块，否则用按钮
const SLIDER_MIN_STEPS = 4;
const durationRange = computed<[number, number] | null>(() => {
  const list = [...new Set(props.videoOptions.durations)].sort((a, b) => a - b);
  if (list.length < SLIDER_MIN_STEPS || !list.every((d, i) => i === 0 || d - list[i - 1] === 1)) return null;
  return [list[0], list[list.length - 1]];
});

// 视频模型只支持横竖两种画幅
const ratios = computed(() => (props.kind === "video" ? ["16:9", "9:16"] : [...ASPECT_RATIOS]));

const SHAPE_MAX = 16;
function shapeStyle(ratio: string) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = SHAPE_MAX / Math.max(w, h);
  return { width: `${Math.round(w * scale)}px`, height: `${Math.round(h * scale)}px` };
}
</script>

<style lang="scss" scoped>
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-primary);
  font-size: 12px;
  cursor: pointer;
  &:hover {
    border-color: var(--td-brand-color);
  }
}
.panel {
  width: 280px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section-title {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
.ratios {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}
.ratio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: 52px;
  padding: 6px 0;
  border-radius: 8px;
  border: 1px solid var(--td-component-stroke);
  background: transparent;
  color: var(--td-text-color-secondary);
  font-size: 11px;
  cursor: pointer;
  .shape {
    display: block;
    border: 1.5px solid currentColor;
    border-radius: 2px;
  }
  &.active {
    border-color: var(--td-brand-color);
    color: var(--td-brand-color);
    background: var(--td-brand-color-light);
  }
}
.ratios.two {
  grid-template-columns: repeat(2, 1fr);
}
.duration-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.duration-value {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--td-text-color-primary);
}
.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 4px 4px;
}
.slider {
  flex: 1;
}
.bound {
  flex: none;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
  font-variant-numeric: tabular-nums;
}
.audio-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px solid var(--td-component-stroke);
  font-size: 12px;
  color: var(--td-text-color-primary);
  cursor: pointer;
  small {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: var(--td-text-color-placeholder);
  }
}
.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.chip {
  min-width: 52px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--td-component-stroke);
  background: transparent;
  color: var(--td-text-color-primary);
  font-size: 12px;
  cursor: pointer;
  &.active {
    border-color: var(--td-brand-color);
    color: var(--td-brand-color);
    background: var(--td-brand-color-light);
  }
}
</style>
