<template>
  <t-dialog v-model:visible="show" header="添加参考素材" width="720px" :footer="false" destroy-on-close>
    <div class="picker">
      <div class="bar">
        <t-input v-model="keyword" size="small" placeholder="搜索名称" clearable>
          <template #prefix-icon><i-search size="14" /></template>
        </t-input>
        <t-button size="small" variant="outline" :loading="uploading" @click="chooseFile">
          <template #icon><i-upload size="14" /></template>
          上传本地文件
        </t-button>
      </div>
      <!-- 上传的文件会先变成画布里的一个素材节点，再作为参考连上来 -->
      <input ref="fileInput" type="file" hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/mp4" @change="onFilePicked" />
      <p v-if="onlyGroup" class="scoped-tip">
        只看「{{ onlyGroup }}」
        <button class="link" @click="onlyGroup = null">显示全部素材</button>
      </p>
      <div class="groups">
        <section v-for="group in groups" :key="group.name">
          <h4>{{ group.name }} <span>{{ group.items.length }}</span></h4>
          <div class="grid">
            <button
              v-for="item in group.items"
              :key="item.key"
              class="item"
              :class="{ used: usedKeys.has(item.key) }"
              :disabled="usedKeys.has(item.key)"
              :title="usedKeys.has(item.key) ? `${item.name}（已在参考里）` : item.name"
              @click="pick(item.key)">
              <img v-if="item.src" :src="item.src" :alt="item.name" loading="lazy" />
              <span v-else class="blank">未出图</span>
              <span class="name">{{ item.name }}</span>
            </button>
          </div>
        </section>
        <p v-if="!groups.length" class="empty">没有匹配的素材</p>
      </div>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import { poolGroupOf, type PoolItem } from "../types";
import { canvasApi, errorMessage, readAsDataUrl } from "../../canvas/api";

const props = defineProps<{ pool: PoolItem[]; usedKeys: Set<string>; selfKey: string | null; projectId: number }>();
const emit = defineEmits<{ pick: [key: string] }>();
const show = defineModel<boolean>("visible", { default: false });
/** 从素材板某一组的「添加」进来时只看那一组，可以一键放开 */
const onlyGroup = defineModel<string | null>("group", { default: null });

const keyword = ref("");
const GROUP_ORDER = ["角色", "场景", "道具", "镜头", "素材"];

const groups = computed(() => {
  const word = keyword.value.trim().toLowerCase();
  const items = props.pool.filter((p) => p.key !== props.selfKey && (!word || p.name.toLowerCase().includes(word)));
  const order = onlyGroup.value ? GROUP_ORDER.filter((name) => name === onlyGroup.value) : GROUP_ORDER;
  return order.map((name) => ({ name, items: items.filter((p) => poolGroupOf(p) === name) })).filter((g) => g.items.length);
});

function pick(key: string) {
  emit("pick", key);
  show.value = false;
}

// ─── 上传本地文件 ─────────────────────────────────────
// 走画布那条既有的上传路径：target 传 null 会新建一个素材节点（n:<id>）并返回它的 key，
// 再按普通参考连上来。这样上传的图也进素材池，别的镜头可以复用。
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
function chooseFile() {
  if (!fileInput.value) return;
  fileInput.value.value = "";
  fileInput.value.click();
}
async function onFilePicked(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    const created = await canvasApi.upload({
      projectId: props.projectId,
      base64Data: await readAsDataUrl(file),
      name: file.name.replace(/\.[^.]+$/, ""),
      target: null,
    });
    pick(created.key);
    window.$message.success(`已上传「${file.name}」并加为参考`);
  } catch (e) {
    window.$message.error(errorMessage(e, "上传失败"));
  } finally {
    uploading.value = false;
  }
}
</script>

<style lang="scss" scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  :deep(.t-input__wrap) {
    flex: 1;
  }
}
.groups {
  max-height: 56vh;
  overflow-y: auto;
}
h4 {
  margin: 12px 0 8px;
  font-size: 13px;
  font-weight: 600;
  span {
    margin-left: 4px;
    color: var(--td-text-color-placeholder);
    font-weight: 400;
  }
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}
.item {
  padding: 0;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  cursor: pointer;
  overflow: hidden;
  &:hover:not(:disabled) {
    border-color: var(--td-brand-color);
  }
  &.used {
    opacity: 0.4;
    cursor: not-allowed;
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
  .name {
    display: block;
    padding: 3px 4px;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
.scoped-tip {
  margin: 0;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
.link {
  padding: 0;
  margin-left: 6px;
  border: none;
  background: none;
  color: var(--td-brand-color);
  font-size: 12px;
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
}
.empty {
  padding: 32px 0;
  text-align: center;
  color: var(--td-text-color-placeholder);
}
</style>
