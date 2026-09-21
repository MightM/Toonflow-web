<template>
  <t-popup v-model:visible="open" trigger="click" placement="top-left" :overlay-inner-style="{ padding: 0 }">
    <button v-if="current" class="style-chip on" :title="current.line || current.name">
      <img v-if="current.cover" :src="current.cover" alt="" />
      <i-platte v-else size="12" />
      <span class="name">{{ current.name }}</span>
      <i-switch size="11" class="swap" />
      <span class="x" role="button" aria-label="清除风格" title="清除风格" @click.stop="pick(null)"><i-close size="10" /></span>
    </button>
    <button v-else class="style-chip" title="给这个节点选一种画风"><i-platte size="12" />风格</button>
    <template #content>
      <div class="panel nodrag nowheel" @mousedown.stop @wheel.stop>
        <div class="panel-head">
          <strong>画风</strong>
          <span>优化时按该视觉手册写，生成时追加一行风格词</span>
        </div>
        <div class="grid">
          <button class="cell none" :class="{ on: !modelValue }" @click="pick(null)">
            <span class="thumb"><i-forbid size="20" /></span>
            <span class="label">不指定</span>
          </button>
          <button v-for="s in styles" :key="s.stylePath" class="cell" :class="{ on: s.stylePath === modelValue }" :title="s.line" @click="pick(s.stylePath)">
            <span class="thumb"><img v-if="s.cover" :src="s.cover" alt="" loading="lazy" /><i-platte v-else size="20" /></span>
            <span class="label">{{ s.name }}</span>
          </button>
        </div>
      </div>
    </template>
  </t-popup>
</template>

<script setup lang="ts">
// 图片节点的「风格」胶囊：选一本视觉手册，像参考一样显示在提示词上方；不是节点，只是节点的一个属性（params.artStyle）
import type { ArtStyleDto } from "../types";

const props = defineProps<{ modelValue: string | null; styles: ArtStyleDto[] }>();
const emit = defineEmits<{ "update:modelValue": [stylePath: string | null] }>();
const open = ref(false);
const current = computed(() => props.styles.find((s) => s.stylePath === props.modelValue) ?? null);
function pick(stylePath: string | null) {
  open.value = false;
  if (stylePath !== props.modelValue) emit("update:modelValue", stylePath);
}
</script>

<style lang="scss" scoped>
.style-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px 0 3px;
  border: 1px dashed var(--td-component-stroke);
  border-radius: 6px;
  background: transparent;
  color: var(--td-text-color-placeholder);
  font-size: 11px;
  cursor: pointer;
  transition: border-color 150ms, background-color 150ms;
  &:hover {
    border-color: var(--td-brand-color);
    color: var(--td-text-color-primary);
  }
  &.on {
    border-style: solid;
    border-color: color-mix(in srgb, #d6307a 55%, transparent);
    background: color-mix(in srgb, #d6307a 10%, var(--td-bg-color-secondarycontainer));
    color: var(--td-text-color-primary);
  }
  img {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    object-fit: cover;
  }
  .name {
    max-width: 140px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .swap {
    color: var(--td-text-color-placeholder);
  }
  .x {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    color: var(--td-text-color-placeholder);
    &:hover {
      background: var(--td-bg-color-container-hover);
      color: var(--td-error-color);
    }
  }
}
.panel {
  width: 420px;
  padding: 10px;
}
.panel-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
  strong {
    font-size: 13px;
  }
  span {
    font-size: 11px;
    color: var(--td-text-color-placeholder);
  }
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  max-height: 360px;
  overflow: auto;
}
.cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--td-text-color-primary);
  cursor: pointer;
  text-align: left;
  transition: border-color 150ms, transform 150ms;
  &:hover {
    border-color: var(--td-component-stroke);
    transform: translateY(-1px);
  }
  &.on {
    border-color: var(--td-brand-color);
    background: var(--td-brand-color-light);
  }
  .thumb {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    background: var(--td-bg-color-secondarycontainer);
    color: var(--td-text-color-placeholder);
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }
  .label {
    font-size: 11px;
    line-height: 1.3;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}
</style>
