<template>
  <div class="ref-board">
    <div class="board-head">
      <span class="label">这一镜用到的素材</span>
      <span class="note">按编号喂给绘图模型，推理提示词也照这个编号写</span>
    </div>

    <section v-for="group in groups" :key="group.name" class="group">
      <h5>
        {{ group.name }}
        <span v-if="group.items.length">{{ group.items.length }}</span>
      </h5>
      <div class="tiles">
        <div v-for="item in group.items" :key="item.key" class="tile" :class="{ missing: item.missing }" :title="item.missing ? `${item.name}（素材已被删除）` : item.name">
          <img v-if="item.src" :src="item.src" :alt="item.name" loading="lazy" />
          <span v-else class="blank">{{ item.missing ? "已失效" : "未出图" }}</span>
          <span class="no">{{ item.label }}</span>
          <button class="drop" :aria-label="`移除 ${item.name}`" title="从这一镜移除" @click="emit('remove', item.key)"><i-close size="10" /></button>
          <span class="name">{{ item.name }}</span>
        </div>
        <button class="tile add" :aria-label="`添加${group.name}`" @click="emit('add', group.pick)">
          <i-plus size="16" />
          <span class="name">添加</span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { ShotRefDto } from "../types";

// 分镜信息里那串「关联资产ID: [13, 14, 16, 19]」对人没意义，这里把它摊成缩略图。
// 展示的是真正连进生成管线的参考（o_canvasEdge），增删立刻改变出图与推理提示词的结果。
const props = defineProps<{ refs: ShotRefDto[] }>();
const emit = defineEmits<{ add: [group: string | null]; remove: [sourceKey: string] }>();

const KIND_PREFIX: Record<string, string> = { image: "图", video: "视频", audio: "音频" };

/** 编号按同类型在参考顺序里的位次算，和输入面板、后端发图顺序一致 */
const labelled = computed(() =>
  props.refs.map((ref, i) => ({
    ...ref,
    label: `${KIND_PREFIX[ref.kind] ?? "图"}${props.refs.slice(0, i + 1).filter((r) => r.kind === ref.kind).length}`,
  })),
);

const GROUPS = [
  { name: "角色", pick: "角色", match: (r: ShotRefDto) => r.assetType === "role" },
  { name: "场景", pick: "场景", match: (r: ShotRefDto) => r.assetType === "scene" },
  { name: "道具", pick: "道具", match: (r: ShotRefDto) => r.assetType === "tool" },
  // 别的镜头已出的图、上传的素材、音色样本都归这里
  { name: "其它参考", pick: null, match: (r: ShotRefDto) => !r.assetType },
];
const groups = computed(() => GROUPS.map((g) => ({ name: g.name, pick: g.pick, items: labelled.value.filter(g.match) })));
</script>

<style lang="scss" scoped>
.ref-board {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--td-component-stroke);
}
.board-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  .label {
    font-size: 13px;
    font-weight: 600;
  }
  .note {
    color: var(--td-text-color-placeholder);
    font-size: 11px;
  }
}
.group h5 {
  margin: 0 0 4px;
  color: var(--td-text-color-secondary);
  font-size: 11px;
  font-weight: 400;
  span {
    color: var(--td-text-color-placeholder);
  }
}
.tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tile {
  position: relative;
  width: 72px;
  padding: 0;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  background: var(--td-bg-color-secondarycontainer);
  overflow: hidden;
  img,
  .blank {
    display: grid;
    place-items: center;
    width: 100%;
    height: 52px;
    object-fit: cover;
    font-size: 10px;
    color: var(--td-text-color-placeholder);
  }
  .name {
    display: block;
    padding: 2px 4px 3px;
    font-size: 10px;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  &.missing {
    border-color: var(--td-error-color);
  }
  &:hover .drop {
    opacity: 1;
  }
}
.no {
  position: absolute;
  top: 2px;
  left: 3px;
  padding: 0 4px;
  border-radius: 3px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.drop {
  position: absolute;
  top: 2px;
  right: 2px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  &:hover {
    background: var(--td-error-color);
  }
}
.add {
  display: grid;
  place-items: center;
  align-content: center;
  height: 70px;
  border-style: dashed;
  background: transparent;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
  &:hover {
    border-color: var(--td-brand-color);
    color: var(--td-brand-color);
  }
  .name {
    padding: 0;
  }
}
</style>
