<template>
  <t-drawer v-model:visible="visible" :header="false" :footer="false" size="440px" attach="body" class="history-drawer">
    <div class="wrap">
      <header class="top">
        <h3>历史版本</h3>
        <t-radio-group v-model="scope" variant="default-filled" size="small">
          <t-radio-button value="node" :disabled="!target">{{ targetName || "当前节点" }}</t-radio-button>
          <t-radio-button value="all">全部</t-radio-button>
        </t-radio-group>
      </header>
      <div class="filters">
        <t-radio-group v-model="filter" size="small">
          <t-radio-button value="all">全部</t-radio-button>
          <t-radio-button value="image">图片</t-radio-button>
          <t-radio-button value="video">视频</t-radio-button>
          <t-radio-button value="audio">音频</t-radio-button>
        </t-radio-group>
        <span class="total">{{ total }} 条</span>
      </div>

      <div v-if="!list.length && !loading" class="empty">还没有生成记录</div>
      <div class="grid">
        <article v-for="item in list" :key="item.imageId" class="card" :class="{ current: item.isCurrent, failed: item.state === '生成失败' }">
          <div class="thumb" @dblclick="item.src && emit('preview', item.src.replace(/\?size=\d+$/, ''), item.kind)">
            <video v-if="item.kind === 'video' && item.src" :src="item.src" muted preload="metadata" />
            <audio v-else-if="item.kind === 'audio' && item.src" :src="item.src" controls preload="metadata" class="audio" />
            <img v-else-if="item.src" :src="item.src" alt="" />
            <div v-else class="placeholder">
              <t-loading v-if="item.state === '生成中'" size="small" />
              <span v-else :title="item.errorReason ?? ''">{{ item.errorReason || "失败" }}</span>
            </div>
            <div class="badges">
              <span v-if="STAGE_BADGE[item.stage ?? '']" class="badge">{{ STAGE_BADGE[item.stage ?? ""] }}</span>
              <span v-if="item.isCurrent" class="badge brand">当前</span>
            </div>
          </div>
          <div class="meta">
            <div class="owner" :title="item.ownerName">{{ scope === "all" ? item.ownerName : formatTime(item.createTime) }}</div>
            <div class="spec">{{ [item.model, item.resolution, item.aspectRatio].filter(Boolean).join(" · ") }}</div>
          </div>
          <div v-if="item.state === '已完成' && item.owner" class="ops">
            <t-button v-if="!item.isCurrent" size="small" variant="text" @click="apply(item)">设为当前</t-button>
          </div>
        </article>
      </div>
      <t-button v-if="list.length < total" block variant="text" :loading="loading" @click="loadMore">加载更多</t-button>
    </div>
  </t-drawer>
</template>

<script setup lang="ts">
import { canvasApi, errorMessage } from "../api";
import type { HistoryItem } from "../types";
import { useCanvasCtx } from "../context";

const PAGE_SIZE = 24;

const visible = defineModel<boolean>("visible", { required: true });
const props = defineProps<{ target: string | null }>();

// 旧版本记录上的阶段标记（角色曾经分定妆照 / 四视图两步）
const STAGE_BADGE: Record<string, string> = { sheet: "多视图", portrait: "定妆照", fourView: "四视图", role_outfit_edit: "换装定妆照" };
const emit = defineEmits<{ preview: [src: string, kind: "image" | "video" | "audio"] }>();
const ctx = useCanvasCtx();

const scope = ref<"node" | "all">("node");
const filter = ref<"all" | "image" | "video" | "audio">("all");
const list = ref<HistoryItem[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);

const targetName = computed(() => (props.target ? ctx.dtoByKey.value.get(props.target)?.name : ""));

async function fetchPage(reset: boolean) {
  loading.value = true;
  try {
    if (reset) page.value = 1;
    const res = await canvasApi.listHistory({
      projectId: ctx.projectId.value,
      target: scope.value === "node" ? props.target : null,
      kind: filter.value === "all" ? null : filter.value,
      page: page.value,
      limit: PAGE_SIZE,
    });
    total.value = res.total;
    list.value = reset ? res.list : [...list.value, ...res.list];
  } catch (e) {
    window.$message.error(errorMessage(e, "历史加载失败"));
  } finally {
    loading.value = false;
  }
}
function loadMore() {
  page.value += 1;
  void fetchPage(false);
}

watch(
  () => [visible.value, props.target] as const,
  ([open, target]) => {
    if (!open) return;
    scope.value = target ? "node" : "all";
    filter.value = "all";
    void fetchPage(true);
  },
);
watch([scope, filter], () => visible.value && fetchPage(true));

async function apply(item: HistoryItem) {
  try {
    await canvasApi.setCurrentVersion(ctx.projectId.value, item.owner!, item.imageId);
    window.$message.success("已切换当前版本");
    await Promise.all([ctx.refresh(), fetchPage(true)]);
  } catch (e) {
    window.$message.error(errorMessage(e, "切换失败"));
  }
}

const formatTime = (time: number | null) => (time ? new Date(time).toLocaleString() : "");
</script>

<style lang="scss" scoped>
.wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  h3 {
    margin: 0;
    font-size: 16px;
  }
}
.filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  .total {
    font-size: 12px;
    color: var(--td-text-color-placeholder);
  }
}
.empty {
  padding: 48px 0;
  text-align: center;
  color: var(--td-text-color-placeholder);
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.card {
  border-radius: 10px;
  border: 1px solid var(--td-component-stroke);
  overflow: hidden;
  background: var(--td-bg-color-container);
  &.current {
    border-color: var(--td-brand-color);
  }
  &.failed .thumb {
    opacity: 0.7;
  }
}
.thumb {
  position: relative;
  height: 150px;
  background: var(--td-bg-color-secondarycontainer);
  .audio {
    position: absolute;
    left: 8px;
    right: 8px;
    top: 50%;
    width: auto;
    transform: translateY(-50%);
  }
  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
}
.placeholder {
  height: 100%;
  display: grid;
  place-items: center;
  padding: 8px;
  font-size: 11px;
  text-align: center;
  color: var(--td-error-color);
}
.badges {
  position: absolute;
  top: 6px;
  left: 6px;
  display: flex;
  gap: 4px;
}
.badge {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  &.brand {
    background: var(--td-brand-color);
  }
}
.meta {
  padding: 6px 8px 0;
  .owner {
    font-size: 12px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .spec {
    font-size: 11px;
    color: var(--td-text-color-placeholder);
  }
}
.ops {
  display: flex;
  padding: 2px 4px 4px;
}
</style>
