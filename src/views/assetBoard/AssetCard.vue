<template>
  <article
    class="asset-card"
    :class="[`status-${group.status}`, group.root.assetType, { picked }]"
    tabindex="0"
    :aria-label="`${group.root.name}，${group.looks.length} 个形象，${STATUS_TEXT[group.status]}`"
    @click="activate"
    @keydown.enter="activate">
    <div class="art">
      <img v-if="cover" :src="cover" :alt="group.root.name" loading="lazy" draggable="false" />
      <div v-else class="placeholder">
        <component :is="placeholderIcon" size="34" />
        <span>{{ STATUS_TEXT[group.status] }}</span>
      </div>
      <div v-if="group.status === 'pending'" class="busy"><t-loading size="small" /></div>
    </div>

    <div class="shade" />
    <div class="caption">
      <div class="name">{{ group.root.name }}</div>
      <div class="meta">
        <span>{{ group.looks.length }} 个形象</span>
        <span class="dot">·</span>
        <span class="status">{{ group.status === "done" || group.looks.length === 1 ? STATUS_TEXT[group.status] : `${group.doneCount}/${group.looks.length} 已完成` }}</span>
        <span v-if="voice" class="voice" :title="`音色：${voice}`"><i-voice size="11" />{{ voice }}</span>
      </div>
    </div>

    <button v-if="!selectable" class="looks-btn" :aria-label="`展开 ${group.root.name} 的全部形象`" title="展开全部形象" @click.stop="emit('expand')">
      <i-application-two size="14" />
    </button>
    <span v-else class="check" :class="{ on: picked }" aria-hidden="true"><i-check v-if="picked" size="12" /></span>
  </article>
</template>

<script setup lang="ts">
import type { AssetGroup } from "./useAssetBoard";
import { STATUS_TEXT } from "./useAssetBoard";

const props = defineProps<{ group: AssetGroup; selectable: boolean; picked: boolean }>();
const emit = defineEmits<{ open: []; expand: []; toggle: [] }>();

function activate() {
  if (props.selectable) emit("toggle");
  else emit("open");
}
const cover = computed(() => props.group.looks[0].cover?.src ?? null);
const voice = computed(() => props.group.root.voices[0]?.name);
const placeholderIcon = computed(() => ({ role: "i-people", scene: "i-landscape", tool: "i-cube" })[props.group.root.assetType]);
</script>

<style lang="scss" scoped>
.asset-card {
  position: relative;
  aspect-ratio: 19 / 28;
  border-radius: 18px;
  overflow: hidden;
  cursor: pointer;
  background: var(--td-bg-color-secondarycontainer);
  border: 1px solid var(--td-component-stroke);
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms, border-color 150ms;
  &:hover,
  &:focus-visible {
    transform: translateY(-4px);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
    outline: none;
  }
  &:focus-visible {
    border-color: var(--td-brand-color);
  }
  &.picked {
    border: 2px solid var(--td-brand-color);
  }
}
.art {
  position: absolute;
  inset: 0;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}
// 角色多视图是横图：靠左显示，露出主大头照
.role .art > img:first-child {
  object-position: 18% center;
}
.placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
.busy {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
}
.shade {
  position: absolute;
  inset: 45% 0 0;
  background: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.78));
  pointer-events: none;
}
.caption {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 14px;
  color: #fff;
  .name {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.02em;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.72);
    flex-wrap: wrap;
  }
  .status {
    color: var(--status);
  }
  .voice {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 4px;
    padding: 0 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
  }
}
.status-done {
  --status: #9be15d;
}
.status-pending {
  --status: #7cc4ff;
}
.status-failed {
  --status: #ff8a80;
}
.status-empty {
  --status: rgba(255, 255, 255, 0.6);
}
.looks-btn,
.check {
  position: absolute;
  top: 10px;
  right: 10px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(6px);
}
.looks-btn {
  opacity: 0;
  transition: opacity 150ms;
}
.asset-card:hover .looks-btn,
.asset-card:focus-visible .looks-btn {
  opacity: 1;
}
.check {
  border: 2px solid rgba(255, 255, 255, 0.8);
  &.on {
    background: var(--td-brand-color);
    border-color: var(--td-brand-color);
  }
}
</style>
