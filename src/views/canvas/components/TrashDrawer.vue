<template>
  <t-drawer v-model:visible="visible" :header="false" :footer="false" size="440px" attach="body" class="trash-drawer">
    <div class="wrap">
      <header class="top">
        <h3><i-recycle-bin size="18" />回收站</h3>
        <span class="hint">删除的节点保留 24 小时</span>
      </header>
      <div v-if="!list.length && !loading" class="empty">回收站是空的</div>
      <div class="list">
        <article v-for="item in list" :key="item.trashId" class="card">
          <div class="thumb">
            <img v-if="item.src && !['audio', 'video', 'text'].includes(item.kind)" :src="item.src" alt="" />
            <video v-else-if="item.kind === 'video' && item.src" :src="item.src" muted preload="metadata" />
            <span v-else class="placeholder"><component :is="iconOf(item)" size="20" /></span>
          </div>
          <div class="meta">
            <div class="name" :title="item.name">{{ item.name }}</div>
            <div class="spec">
              <span class="tag" :class="tagClass(item)">{{ typeLabel(item) }}</span>
              <span v-if="item.states">含 {{ item.states }} 个状态</span>
            </div>
            <div class="time">{{ formatTime(item.deletedAt) }} 删除 · {{ expiresIn(item.expiresAt) }}</div>
          </div>
          <t-button size="small" theme="primary" variant="outline" :loading="restoring === item.trashId" @click="restore(item)">恢复</t-button>
        </article>
      </div>
    </div>
  </t-drawer>
</template>

<script setup lang="ts">
// 画布回收站：24 小时内删除的节点（连同状态、连线、位置一起恢复）。列表由后端 listTrash 给，恢复由页面处理（选中 + 定位 + 可撤销）。
import { canvasApi, errorMessage } from "../api";
import { TYPE_LABEL, useCanvasCtx } from "../context";
import type { TrashItem } from "../types";

const visible = defineModel<boolean>("visible", { default: false });
const emit = defineEmits<{ restore: [trashId: number, name: string] }>();
const ctx = useCanvasCtx();
const list = ref<TrashItem[]>([]);
const loading = ref(false);
const restoring = ref<number | null>(null);

async function load() {
  loading.value = true;
  try {
    list.value = await canvasApi.listTrash(ctx.projectId.value);
  } catch (e) {
    window.$message.error(errorMessage(e, "读取回收站失败"));
  } finally {
    loading.value = false;
  }
}
watch(visible, (on) => on && load());

const typeLabel = (item: TrashItem) => TYPE_LABEL[item.assetType ?? item.kind] ?? item.kind;
const tagClass = (item: TrashItem) => (item.assetType ? `t-${item.assetType}` : `t-${item.kind}`);
const iconOf = (item: TrashItem) => ({ audio: "i-voice", video: "i-video", text: "i-text" })[item.kind] ?? "i-pic";
const formatTime = (t: number) => {
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const expiresIn = (t: number) => {
  const left = t - Date.now();
  if (left <= 0) return "即将清理";
  const hours = Math.floor(left / 3600000);
  return hours >= 1 ? `${hours} 小时后清理` : `${Math.max(1, Math.round(left / 60000))} 分钟后清理`;
};
// 恢复交给页面（要选中、定位、记撤销）；成功后从列表里去掉
async function restore(item: TrashItem) {
  restoring.value = item.trashId;
  try {
    emit("restore", item.trashId, item.name);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await load();
  } finally {
    restoring.value = null;
  }
}
</script>

<style lang="scss" scoped>
.wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  h3 {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 16px;
  }
  .hint {
    font-size: 12px;
    color: var(--td-text-color-placeholder);
  }
}
.empty {
  padding: 48px 0;
  text-align: center;
  color: var(--td-text-color-placeholder);
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}
.card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 10px;
  background: var(--td-bg-color-container);
}
.thumb {
  flex: none;
  width: 72px;
  height: 54px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--td-bg-color-secondarycontainer);
  display: grid;
  place-items: center;
  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .placeholder {
    color: var(--td-text-color-placeholder);
  }
}
.meta {
  flex: 1;
  min-width: 0;
  .name {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .spec {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    font-size: 11px;
    color: var(--td-text-color-secondary);
  }
  .time {
    margin-top: 2px;
    font-size: 11px;
    color: var(--td-text-color-placeholder);
  }
}
.tag {
  padding: 0 6px;
  border-radius: 4px;
  font-size: 10px;
  background: var(--td-bg-color-secondarycontainer);
  &.t-role {
    color: #d6307a;
    background: color-mix(in srgb, #d6307a 12%, transparent);
  }
  &.t-scene {
    color: #0ea5e9;
    background: color-mix(in srgb, #0ea5e9 12%, transparent);
  }
  &.t-tool {
    color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 12%, transparent);
  }
}
</style>
