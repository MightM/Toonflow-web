<template>
  <div class="video-player" :class="{ playing }" @mouseenter="onEnter" @mouseleave="onLeave">
    <video ref="videoEl" :src="src" muted playsinline preload="metadata" @loadedmetadata="onMeta" @timeupdate="onTime" @play="playing = true" @pause="playing = false" @ended="playing = false" />
    <!-- 自绘控制条：热区明确，拖动节点时只需避开这一条 -->
    <div class="bar nodrag nopan" @mousedown.stop @dblclick.stop>
      <button class="btn" :aria-label="playing ? '暂停' : '播放'" @click="toggle">
        <i-pause-one v-if="playing" size="14" theme="filled" />
        <i-play-one v-else size="14" theme="filled" />
      </button>
      <div ref="trackEl" class="track" @pointerdown="scrub" @pointermove="onScrubMove" @pointerup="endScrub" @pointercancel="endScrub">
        <span class="fill" :style="{ width: `${progress * 100}%` }" />
        <span class="knob" :style="{ left: `${progress * 100}%` }" />
      </div>
      <span class="time">{{ fmt(current) }} / {{ fmt(duration) }}</span>
      <button class="btn" :aria-label="muted ? '取消静音' : '静音'" @click="toggleMute">
        <i-volume-mute v-if="muted" size="14" />
        <i-volume-notice v-else size="14" />
      </button>
    </div>
    <span v-if="!playing" class="hint" aria-hidden="true"><i-play-one size="28" theme="filled" /></span>
  </div>
</template>

<script setup lang="ts">
// 视频节点的播放器：悬停 0.5 秒自动（静音）播放、移开暂停；自绘控制条（播放 / 进度 / 时间 / 静音）。
// 视频画面本身可拖动节点、双击看大图（由父级处理），只有控制条是 nodrag。
const HOVER_DELAY = 500;

const props = defineProps<{ src: string }>();
const videoEl = ref<HTMLVideoElement>();
const trackEl = ref<HTMLElement>();
const playing = ref(false);
const muted = ref(true);
const current = ref(0);
const duration = ref(0);
const progress = computed(() => (duration.value ? Math.min(1, current.value / duration.value) : 0));
const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

function onMeta() {
  duration.value = videoEl.value?.duration ?? 0;
}
function onTime() {
  current.value = videoEl.value?.currentTime ?? 0;
}
async function play() {
  try {
    await videoEl.value?.play();
  } catch {
    // 浏览器不允许时保持暂停
  }
}
function toggle() {
  const el = videoEl.value;
  if (!el) return;
  if (el.paused) void play();
  else el.pause();
}
function toggleMute() {
  const el = videoEl.value;
  if (!el) return;
  el.muted = !el.muted;
  muted.value = el.muted;
}

// 悬停 0.5 秒自动播放，移开暂停（手动点了播放的不受移开影响）
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let hoverStarted = false;
function onEnter() {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (videoEl.value?.paused) {
      hoverStarted = true;
      void play();
    }
  }, HOVER_DELAY);
}
function onLeave() {
  clearTimeout(hoverTimer);
  if (hoverStarted) {
    videoEl.value?.pause();
    hoverStarted = false;
  }
}

// 进度条：按下即定位，按住拖动连续定位
let scrubbing = false;
function seekTo(clientX: number) {
  const el = videoEl.value;
  const box = trackEl.value?.getBoundingClientRect();
  if (!el || !box || !duration.value) return;
  el.currentTime = Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * duration.value;
  current.value = el.currentTime;
}
function scrub(event: PointerEvent) {
  scrubbing = true;
  trackEl.value?.setPointerCapture(event.pointerId);
  seekTo(event.clientX);
}
function onScrubMove(event: PointerEvent) {
  if (scrubbing) seekTo(event.clientX);
}
function endScrub() {
  scrubbing = false;
}
watch(
  () => props.src,
  () => {
    playing.value = false;
    current.value = 0;
    duration.value = 0;
  },
);
onBeforeUnmount(() => {
  clearTimeout(hoverTimer);
  videoEl.value?.pause();
});
</script>

<style lang="scss" scoped>
.video-player {
  position: relative;
  line-height: 0;
  video {
    width: 100%;
    height: auto;
    display: block;
  }
}
.hint {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0.85;
}
.bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 8px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0));
  color: #fff;
  opacity: 0;
  transition: opacity 150ms;
  .video-player:hover &,
  .playing & {
    opacity: 1;
  }
}
.btn {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }
}
.track {
  position: relative;
  flex: 1;
  height: 20px;
  cursor: pointer;
  touch-action: none;
  &::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 3px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.35);
    transform: translateY(-50%);
  }
  .fill {
    position: absolute;
    left: 0;
    top: 50%;
    height: 3px;
    border-radius: 2px;
    background: #fff;
    transform: translateY(-50%);
  }
  .knob {
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #fff;
    transform: translate(-50%, -50%);
  }
}
.time {
  flex: none;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
</style>
