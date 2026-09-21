<template>
  <div class="view-switch" role="group" aria-label="资产展示方式">
    <t-tooltip v-for="v in VIEWS" :key="v.id" :content="v.label" placement="bottom" :show-arrow="false" destroy-on-close>
      <button type="button" class="seg" :class="{ active: v.id === current }" :aria-pressed="v.id === current" :aria-label="v.label" @click="go(v)">
        <component :is="v.icon" size="16" />
      </button>
    </t-tooltip>
  </div>
</template>

<script setup lang="ts">
import { ASSET_VIEW_KEY, type AssetView } from "./assetView";

// 资产的两种展示：列表（/assetBoard）与画布（/canvas），同一份数据；切换时带上当前集
const props = defineProps<{ current: AssetView; scriptId?: number | null }>();
const router = useRouter();

const VIEWS: { id: AssetView; label: string; icon: string; path: string }[] = [
  { id: "board", label: "列表", icon: "i-grid-four", path: "/assetBoard" },
  { id: "canvas", label: "画布", icon: "i-mind-mapping", path: "/canvas" },
];

function go(view: (typeof VIEWS)[number]) {
  if (view.id === props.current) return;
  try {
    localStorage.setItem(ASSET_VIEW_KEY, view.id);
  } catch {
    // 拿不到存储时只影响「下次默认打开哪种」
  }
  void router.push({ path: view.path, query: props.scriptId ? { scriptId: String(props.scriptId) } : {} });
}
</script>

<style lang="scss" scoped>
.view-switch {
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 32px;
  border: 0.5px solid var(--td-component-stroke);
  border-radius: 8px;
  background: color-mix(in srgb, var(--td-bg-color-container) 80%, transparent);
  backdrop-filter: blur(12px);
}
.seg {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 3px;
  border: none;
  border-radius: 8px;
  background-clip: content-box;
  background-color: transparent;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
  transition: background-color 150ms, color 150ms;
  &:hover {
    color: var(--td-text-color-primary);
    background-color: var(--td-bg-color-container-hover);
  }
  &:focus-visible {
    outline: 2px solid var(--td-brand-color-focus);
    outline-offset: -2px;
  }
  &.active {
    color: var(--td-text-color-primary);
    background-color: var(--td-bg-color-component);
  }
}
</style>
