<template>
  <t-popup v-model:visible="open" trigger="click" placement="top-left" :overlay-inner-style="{ padding: 0 }">
    <button class="trigger" :class="{ active: !!current && current.id !== 'free' }" :title="current?.desc">
      <i-magic size="13" />
      {{ current ? current.name : "目标模板" }}
      <i-down size="12" />
    </button>
    <template #content>
      <div class="panel nodrag nowheel" @mousedown.stop>
        <div class="panel-head">
          <strong>选择目标</strong>
          <span>自动套用模型、比例和提示词模板</span>
        </div>
        <section v-for="group in groups" :key="group.name" class="group">
          <div class="group-name">{{ group.name }}</div>
          <button
            v-for="p in group.items"
            :key="p.id"
            class="item"
            :class="{ on: p.id === modelValue, locked: p.requiresRef && !hasRefs }"
            :disabled="p.requiresRef && !hasRefs"
            :title="p.requiresRef && !hasRefs ? '先把参考图连到这个节点' : p.desc"
            @click="choose(p.id)">
            <span class="icon"><component :is="`i-${p.icon}`" size="16" /></span>
            <span class="text">
              <span class="name">
                {{ p.name }}
                <span v-if="p.requiresRef" class="tag">需要参考图</span>
              </span>
              <span class="desc">{{ p.desc }}</span>
              <span v-if="p.steps.length" class="flow">自动两步：{{ p.steps.join(" → ") }}</span>
              <span v-if="modelLabel(p)" class="model">推荐：{{ modelLabel(p) }}</span>
            </span>
          </button>
        </section>
        <div class="foot">模板文件在数据目录 <code>skills/canvas_presets/</code>，可自行增改，重新打开画布生效</div>
      </div>
    </template>
  </t-popup>
</template>

<script setup lang="ts">
import type { CanvasPreset } from "../types";

const props = defineProps<{ modelValue: string | null; presets: CanvasPreset[]; hasRefs: boolean }>();
const emit = defineEmits<{ "update:modelValue": [id: string] }>();

const open = ref(false);
const current = computed(() => props.presets.find((p) => p.id === props.modelValue));
const GROUP_ORDER = ["人物", "场景", "道具", "通用"];
const groups = computed(() => {
  const names = [...new Set(props.presets.map((p) => p.group))].sort((a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
  return names.map((name) => ({ name, items: props.presets.filter((p) => p.group === name) }));
});

// 「comfyui:krea2_4view」→「krea2_4view」
const modelLabel = (p: CanvasPreset) => {
  const model = props.hasRefs ? p.modelWithRef : p.modelNoRef;
  return model ? model.split(/:(.+)/)[1] ?? model : "";
};

function choose(id: string) {
  emit("update:modelValue", id);
  open.value = false;
}
</script>

<style lang="scss" scoped>
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 150px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-primary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  &:hover {
    border-color: var(--td-brand-color);
  }
  &.active {
    border-color: var(--td-brand-color);
    color: var(--td-brand-color);
    background: var(--td-brand-color-light);
  }
}
.panel {
  width: 340px;
  max-height: 460px;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.panel-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 4px;
  strong {
    font-size: 13px;
  }
  span {
    font-size: 11px;
    color: var(--td-text-color-placeholder);
  }
}
.group-name {
  padding: 4px 4px 2px;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
.item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--td-text-color-primary);
  text-align: left;
  cursor: pointer;
  transition: background-color 150ms, border-color 150ms;
  &:hover:not(:disabled) {
    background: var(--td-bg-color-container-hover);
  }
  &.on {
    border-color: var(--td-brand-color);
    background: var(--td-brand-color-light);
  }
  &.locked {
    opacity: 0.45;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid var(--td-brand-color-focus);
  }
}
.icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-brand-color);
}
.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
.tag {
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 400;
  color: var(--td-warning-color);
  border: 1px solid var(--td-warning-color);
}
.desc {
  font-size: 11px;
  color: var(--td-text-color-secondary);
}
.flow {
  font-size: 10px;
  color: var(--td-brand-color);
}
.model {
  font-size: 10px;
  color: var(--td-text-color-placeholder);
}
.foot {
  padding: 6px 4px 0;
  border-top: 1px solid var(--td-component-stroke);
  font-size: 10px;
  color: var(--td-text-color-placeholder);
  code {
    font-size: 10px;
  }
}
</style>
