<template>
  <t-drawer v-model:visible="visible" :header="false" :footer="false" size="520px" attach="body">
    <div v-if="group" class="wrap">
      <header>
        <h3>{{ group.root.name }}</h3>
        <p>{{ group.looks.length }} 个形象 · {{ group.doneCount }} 个已完成</p>
      </header>
      <ol class="looks">
        <li v-for="(look, index) in group.looks" :key="look.dto.key" class="look" :class="`status-${look.status}`">
          <div class="thumbs">
            <figure class="main" @dblclick="look.cover?.src && preview(look.cover.src)">
              <img v-if="look.cover?.src" :src="look.cover.src" :alt="look.dto.name" loading="lazy" />
              <div v-else class="empty">待生成</div>
            </figure>
          </div>
          <div class="info">
            <div class="name">
              <span class="badge">{{ index === 0 ? "基础形象" : "状态" }}</span>
              {{ look.dto.name }}
            </div>
            <div class="desc" :title="look.dto.describe ?? ''">{{ look.dto.describe || "（无描述）" }}</div>
            <div class="row">
              <span class="state">{{ STATUS_TEXT[look.status] }}</span>
              <t-button size="small" variant="text" @click="emit('open', look.dto.key)">在画布中打开</t-button>
            </div>
          </div>
        </li>
      </ol>
    </div>
    <t-image-viewer v-model:visible="viewer.visible" :images="[viewer.src]" />
  </t-drawer>
</template>

<script setup lang="ts">
import type { AssetGroup } from "./useAssetBoard";
import { STATUS_TEXT } from "./useAssetBoard";

const visible = defineModel<boolean>("visible", { required: true });
const props = defineProps<{ group: AssetGroup | null }>();
const emit = defineEmits<{ open: [key: string] }>();

const viewer = reactive({ visible: false, src: "" });

function preview(src: string) {
  Object.assign(viewer, { visible: true, src: src.replace(/\?size=\d+$/, "") });
}
</script>

<style lang="scss" scoped>
.wrap header {
  margin-bottom: 16px;
  h3 {
    margin: 0;
    font-size: 20px;
  }
  p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--td-text-color-placeholder);
  }
}
.looks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.look {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 14px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container);
}
.thumbs {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  figure {
    position: relative;
    margin: 0;
    height: 140px;
    border-radius: 10px;
    overflow: hidden;
    background: var(--td-bg-color-secondarycontainer);
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    &.main img {
      object-fit: contain;
      background: var(--td-bg-color-component);
    }
  }
  figcaption {
    position: absolute;
    left: 6px;
    bottom: 6px;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
  }
}
.empty {
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
.info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  .name {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .badge {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 400;
    background: var(--td-bg-color-secondarycontainer);
    color: var(--td-text-color-secondary);
  }
  .desc {
    font-size: 12px;
    color: var(--td-text-color-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .row {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
}
.state {
  font-size: 12px;
}
.status-done .state {
  color: var(--td-success-color);
}
.status-pending .state {
  color: var(--td-brand-color);
}
.status-failed .state {
  color: var(--td-error-color);
}
.status-empty .state {
  color: var(--td-text-color-placeholder);
}
</style>
