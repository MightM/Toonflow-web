<template>
  <div class="filmstrip">
    <div class="strip-head">
      <span class="count">全部镜头 <b>{{ shots.length }}</b> · 已出图 <b>{{ done }}</b></span>
      <div class="grow" />
      <t-checkbox v-if="shots.length" :checked="allChecked" :indeterminate="someChecked" @change="toggleAll">全选</t-checkbox>
      <t-button v-if="checked.size" size="small" variant="outline" :loading="batching" @click="emit('batch', [...checked])">
        批量生成 {{ checked.size }} 张
      </t-button>
      <t-tooltip v-if="checked.size >= 2" :content="mergeable ? '合成一条 10~15 秒的视频，提示词按时间码分镜头' : '只能合并连续的镜头'">
        <t-button size="small" variant="outline" :disabled="!mergeable" @click="emit('segment', 'merge', [...checked])">合并为片段</t-button>
      </t-tooltip>
      <t-button v-if="splittable" size="small" variant="outline" @click="emit('segment', 'split', [...checked])">拆开片段</t-button>
      <t-button v-if="checked.size" size="small" variant="outline" theme="danger" @click="emit('remove', [...checked])">删除 {{ checked.size }} 镜</t-button>
    </div>

    <div ref="scroller" class="strip">
      <button
        v-for="shot in shots"
        :key="shot.key"
        class="cell"
        :class="{ active: shot.key === selectedKey, pending: shot.pendingImageIds.length, failed: shot.state === '生成失败' }"
        :data-key="shot.key"
        @click="emit('select', shot.key)">
        <span class="no">{{ shot.index + 1 }}</span>
        <t-checkbox class="pick" :checked="checked.has(shot.id)" @click.stop @change="toggle(shot.id)" />
        <img v-if="shot.current?.src" :src="shot.current.src" :alt="`镜头 ${shot.index + 1}`" loading="lazy" />
        <span v-else class="blank">
          <t-loading v-if="shot.pendingImageIds.length" size="small" />
          <template v-else>{{ shot.state === "生成失败" ? "失败" : "待生成" }}</template>
        </span>
        <span class="meta">{{ shot.duration }}s<i v-if="segmentOf(shot)" class="seg" :title="`片段：${segmentOf(shot)} 个镜头合成一条视频`">片段</i></span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ShotDto, TrackDto } from "../types";

const props = defineProps<{ shots: ShotDto[]; tracks: TrackDto[]; selectedKey: string | null; done: number; batching?: boolean }>();
const emit = defineEmits<{ select: [key: string]; batch: [ids: number[]]; segment: [action: "merge" | "split", ids: number[]]; remove: [ids: number[]] }>();

const checked = ref(new Set<number>());
const allChecked = computed(() => props.shots.length > 0 && checked.value.size === props.shots.length);
const someChecked = computed(() => checked.value.size > 0 && !allChecked.value);

function toggle(id: number) {
  const next = new Set(checked.value);
  next.has(id) ? next.delete(id) : next.add(id);
  checked.value = next;
}
function toggleAll() {
  checked.value = allChecked.value ? new Set() : new Set(props.shots.map((s) => s.id));
}
/** 勾选的镜头在序列里连续才能合并 */
const mergeable = computed(() => {
  const positions = props.shots.map((s, i) => (checked.value.has(s.id) ? i : -1)).filter((i) => i >= 0);
  return positions.length >= 2 && positions.every((p, i) => i === 0 || p === positions[i - 1]! + 1);
});
/** 勾选里有属于多镜片段的镜头，才给「拆开」 */
const splittable = computed(() => props.shots.some((s) => checked.value.has(s.id) && (segmentOf(s) ?? 0) > 1));

/** 这一镜所属片段里有几个镜头；1 个（一镜一段）不显示标记 */
function segmentOf(shot: ShotDto): number | null {
  const track = props.tracks.find((t) => t.id === shot.trackId);
  return track && track.shotIds.length > 1 ? track.shotIds.length : null;
}

// 选中的镜头滚进视野（键盘翻镜时需要）
const scroller = ref<HTMLElement | null>(null);
watch(
  () => props.selectedKey,
  (key) => {
    if (!key) return;
    nextTick(() => scroller.value?.querySelector(`[data-key="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" }));
  },
);

defineExpose({ clearSelection: () => (checked.value = new Set()) });
</script>

<style lang="scss" scoped>
.filmstrip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px 12px;
  border-top: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container);
}
.strip-head {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  b {
    color: var(--td-text-color-primary);
  }
}
.grow {
  flex: 1;
}
.strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}
.cell {
  position: relative;
  flex: 0 0 auto;
  width: 108px;
  padding: 0;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  background: var(--td-bg-color-secondarycontainer);
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.15s,
    transform 0.15s;
  &:hover {
    transform: translateY(-2px);
  }
  &.active {
    border-color: var(--td-brand-color);
    box-shadow: 0 0 0 1px var(--td-brand-color);
  }
  &.failed {
    border-color: var(--td-error-color);
  }
  img,
  .blank {
    display: grid;
    place-items: center;
    width: 100%;
    height: 72px;
    object-fit: cover;
    font-size: 11px;
    color: var(--td-text-color-placeholder);
  }
}
.no {
  position: absolute;
  top: 3px;
  left: 5px;
  z-index: 1;
  padding: 0 5px;
  border-radius: 4px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.pick {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 1;
}
.meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 2px 0 3px;
  font-size: 11px;
  color: var(--td-text-color-secondary);
  .seg {
    padding: 0 4px;
    border-radius: 3px;
    background: var(--td-warning-color-light);
    color: var(--td-warning-color);
    font-style: normal;
    font-size: 10px;
  }
}
.pending .blank {
  color: var(--td-brand-color);
}
</style>
