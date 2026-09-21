<template>
  <!-- 整个框可以按住拖动节点；只有播放键是 nodrag，波形用 click 定位（拖动时不会触发 click） -->
  <div class="audio-player nowheel" :class="{ playing }">
    <button class="play nodrag" :aria-label="playing ? '暂停' : '播放'" :disabled="!ready && !error" @mousedown.stop @click="toggle">
      <i-pause-one v-if="playing" size="16" theme="filled" />
      <i-play-one v-else size="16" theme="filled" />
    </button>
    <div class="wave" ref="waveEl" title="点击定位 · 按住拖动节点" @click="seekAt">
      <span v-for="(h, i) in bars" :key="i" class="bar" :class="{ past: i / bars.length < progress }" :style="{ '--h': h }" />
      <span class="cursor" :style="{ left: `${progress * 100}%` }" />
    </div>
    <span class="time">{{ fmt(current) }} / {{ fmt(duration) }}</span>
    <audio ref="audioEl" :src="src" preload="metadata" @loadedmetadata="onMeta" @timeupdate="onTime" @ended="playing = false" @pause="playing = false" @play="playing = true" @error="error = true" />
  </div>
</template>

<script setup lang="ts">
// 音频节点的播放器：播放 / 暂停、波形进度条（点击定位）、时间。波形用 Web Audio 解码后按 BARS 段取峰值，按 src 缓存
const BARS = 48;
const waveCache = new Map<string, number[]>();

const props = defineProps<{ src: string }>();
const audioEl = ref<HTMLAudioElement>();
const waveEl = ref<HTMLElement>();
const playing = ref(false);
const ready = ref(false);
const error = ref(false);
const current = ref(0);
const duration = ref(0);
const bars = ref<number[]>(Array.from({ length: BARS }, () => 0.15));
const progress = computed(() => (duration.value ? Math.min(1, current.value / duration.value) : 0));

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};
function onMeta() {
  ready.value = true;
  duration.value = audioEl.value?.duration ?? 0;
}
function onTime() {
  current.value = audioEl.value?.currentTime ?? 0;
}
async function toggle() {
  const el = audioEl.value;
  if (!el) return;
  try {
    if (el.paused) await el.play();
    else el.pause();
  } catch (e) {
    window.$message.error("无法播放这段音频");
  }
}
function seekAt(event: MouseEvent) {
  const el = audioEl.value;
  const box = waveEl.value?.getBoundingClientRect();
  if (!el || !box || !duration.value) return;
  el.currentTime = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * duration.value;
  current.value = el.currentTime;
}

// 波形：解码整段音频取峰值。文件大时可能要一两秒，失败就保持平直的占位条
async function loadWave(src: string) {
  const cached = waveCache.get(src);
  if (cached) return void (bars.value = cached);
  try {
    const buffer = await (await fetch(src)).arrayBuffer();
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(buffer);
    void ctx.close();
    const data = decoded.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / BARS));
    const peaks = Array.from({ length: BARS }, (_, i) => {
      let peak = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 8) peak = Math.max(peak, Math.abs(data[j]));
      return peak;
    });
    const max = Math.max(0.05, ...peaks);
    const normalized = peaks.map((p) => Math.max(0.08, p / max));
    waveCache.set(src, normalized);
    bars.value = normalized;
  } catch {
    // 解码失败（格式不支持等）：留占位条，不影响播放
  }
}
watch(
  () => props.src,
  (src) => {
    playing.value = false;
    ready.value = false;
    error.value = false;
    current.value = 0;
    if (src) void loadWave(src);
  },
  { immediate: true },
);
onBeforeUnmount(() => audioEl.value?.pause());
</script>

<style lang="scss" scoped>
.audio-player {
  --accent: #0ea5e9;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 10px 0 8px;
}
.play {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  transition: transform 150ms, filter 150ms;
  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  &:active:not(:disabled) {
    transform: scale(0.94);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
.wave {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 36px;
  cursor: grab;
}
.bar {
  flex: 1;
  height: calc(var(--h) * 100%);
  min-height: 3px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--accent) 30%, var(--td-component-stroke));
  transition: background-color 120ms;
  &.past {
    background: var(--accent);
  }
}
.cursor {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: 1.5px;
  background: var(--td-text-color-primary);
  opacity: 0;
  transition: opacity 150ms;
  .playing & {
    opacity: 0.8;
  }
}
.time {
  flex: none;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--td-text-color-secondary);
}
audio {
  display: none;
}
</style>
