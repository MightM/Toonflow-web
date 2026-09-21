<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div v-if="visible" class="lightbox" role="dialog" aria-modal="true" @click="onBackdrop">
        <button class="close" type="button" aria-label="关闭" title="关闭（Esc）" @click.stop="close"><i-close size="20" /></button>
        <img v-if="kind === 'image'" :src="src" alt="" class="media" draggable="false" @click.stop />
        <video v-else-if="kind === 'video'" :src="src" class="media" controls autoplay playsinline @click.stop />
        <audio v-else :src="src" class="audio" controls autoplay @click.stop />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// 双击节点后的全屏预览：内容 contain 在屏幕内、居中；点空白处、右上角关闭或 Esc 退出
const visible = defineModel<boolean>("visible", { default: false });
defineProps<{ src: string; kind: "image" | "video" | "audio" }>();

const close = () => (visible.value = false);
function onBackdrop(event: MouseEvent) {
  // 媒体元素自己 @click.stop，落到这里的都是空白处
  if (event.target === event.currentTarget) close();
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && visible.value) {
    event.preventDefault();
    event.stopPropagation();
    close();
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
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));
</script>

<style lang="scss" scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(8, 9, 12, 0.92);
  backdrop-filter: blur(6px);
  cursor: zoom-out;
}
.media {
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  cursor: default;
}
.audio {
  width: min(720px, calc(100vw - 48px));
  cursor: default;
}
.close {
  position: absolute;
  top: 16px;
  right: 16px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  transition: background-color 150ms, transform 150ms;
  &:hover {
    background: rgba(255, 255, 255, 0.24);
    transform: scale(1.05);
  }
  &:focus-visible {
    outline: 2px solid #fff;
  }
}
.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 160ms ease;
  .media {
    transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
  }
}
.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
  .media {
    transform: scale(0.96);
  }
}
@media (prefers-reduced-motion: reduce) {
  .lightbox-enter-active,
  .lightbox-leave-active,
  .lightbox-enter-active .media,
  .lightbox-leave-active .media {
    transition: none;
  }
}
</style>
