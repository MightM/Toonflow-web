<template>
  <t-tooltip v-if="locked" content="状态跟随根资产的类型，请在根资产上修改">
    <span class="type-tag" :class="value">{{ TYPE_LABEL[value!] }}</span>
  </t-tooltip>
  <t-dropdown v-else :options="options" trigger="click" :min-column-width="100" @click="pick">
    <button class="type-tag nodrag" :class="value ?? 'none'" :title="value ? '修改类型' : '标注类型：人物 / 场景 / 道具'" @mousedown.stop @dblclick.stop>
      {{ value ? TYPE_LABEL[value] : "标注类型" }}
      <i-down size="10" />
    </button>
  </t-dropdown>
</template>

<script setup lang="ts">
import type { DropdownOption } from "tdesign-vue-next";
import { TYPE_LABEL, useCanvasCtx } from "../context";
import type { AssetType, CanvasNodeDto } from "../types";
import { isAssetNode } from "../types";

// 节点类型标签：资产必有类型（改了连同状态一起改）；自由图片节点可标注或取消标注
const props = defineProps<{ dto: CanvasNodeDto }>();
const ctx = useCanvasCtx();

const TYPES: AssetType[] = ["role", "scene", "tool"];
const NONE = "none";

const value = computed(() => props.dto.assetType ?? null);
const locked = computed(() => isAssetNode(props.dto) && !!props.dto.parentKey);
const options = computed<DropdownOption[]>(() => [
  ...TYPES.map((t) => ({ content: TYPE_LABEL[t], value: t, active: t === value.value })),
  ...(isAssetNode(props.dto) ? [] : [{ content: "不标注", value: NONE, active: value.value === null }]),
]);

async function pick(item: DropdownOption) {
  const next = item.value === NONE ? null : (item.value as AssetType);
  if (next === value.value) return;
  const states = isAssetNode(props.dto) ? [...ctx.dtoByKey.value.values()].filter((d) => isAssetNode(d) && d.parentKey === props.dto.key).length : 0;
  const changed = await ctx.setAssetType(props.dto.key, next);
  if (changed && states) window.$message.success(`「${props.dto.name}」和它的 ${states} 个状态已改为${TYPE_LABEL[next!]}`);
}
</script>

<style lang="scss" scoped>
.type-tag {
  --tag: var(--td-brand-color);
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border: none;
  border-radius: 4px;
  font-size: 10px;
  line-height: 16px;
  color: #fff;
  background: var(--tag);
  cursor: pointer;
  transition: filter 120ms, box-shadow 120ms;
  &.scene {
    --tag: var(--td-success-color);
  }
  &.tool {
    --tag: var(--td-warning-color);
  }
  &.none {
    color: var(--td-text-color-secondary);
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--td-component-border);
    border: none;
  }
  &:hover,
  &:focus-visible {
    filter: brightness(1.08);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--tag) 30%, transparent);
    outline: none;
  }
  &.none:hover,
  &.none:focus-visible {
    color: var(--td-brand-color);
    box-shadow: inset 0 0 0 1px var(--td-brand-color);
  }
}
span.type-tag {
  cursor: default;
}
</style>
