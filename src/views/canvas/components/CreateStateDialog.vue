<template>
  <t-dialog v-model:visible="visible" :header="`新建状态 · ${parentName}`" :confirm-btn="{ content: '创建', loading: saving }" attach="body" width="480px" @confirm="submit">
    <t-form label-align="top">
      <t-form-item label="状态名称" required-mark>
        <t-input v-model="name" :placeholder="namePlaceholder" :maxlength="20" autofocus @enter="submit" />
      </t-form-item>
      <t-form-item label="与默认态的差异">
        <t-textarea v-model="describe" :placeholder="describePlaceholder" :autosize="{ minRows: 3, maxRows: 6 }" />
      </t-form-item>
    </t-form>
    <p class="tip">新状态会挂在根资产下，默认以父资产的图为参考生成{{ isRole ? "（角色：先出衍生定妆照，再出四视图）" : "" }}。</p>
  </t-dialog>
</template>

<script setup lang="ts">
import { useCanvasCtx } from "../context";
import { isAssetNode } from "../types";

const visible = defineModel<boolean>("visible", { required: true });
const props = defineProps<{ parentKey: string | null }>();
const emit = defineEmits<{ create: [payload: { parentKey: string; name: string; describe: string }] }>();
const ctx = useCanvasCtx();

const name = ref("");
const describe = ref("");
const saving = ref(false);

const parent = computed(() => (props.parentKey ? ctx.dtoByKey.value.get(props.parentKey) : undefined));
const parentName = computed(() => parent.value?.name ?? "");
const assetType = computed(() => (parent.value && isAssetNode(parent.value) ? parent.value.assetType : "role"));
const isRole = computed(() => assetType.value === "role");
const namePlaceholder = computed(() => ({ role: "如：晚礼服、战斗服", scene: "如：夜景、火灾后", tool: "如：碎裂、打开" })[assetType.value]);
const describePlaceholder = computed(
  () =>
    ({
      role: "换成什么服装 / 妆容 / 发型 / 鞋款，越具体越好",
      scene: "时段、光线、陈设或损毁程度的变化",
      tool: "道具外观的变化，如：屏幕碎裂、盖子打开、刀刃染血",
    })[assetType.value],
);

watch(visible, (open) => {
  if (!open) return;
  name.value = "";
  describe.value = "";
});

async function submit() {
  if (!props.parentKey) return;
  const trimmed = name.value.trim();
  if (!trimmed) return window.$message.warning("请填写状态名称");
  saving.value = true;
  emit("create", { parentKey: props.parentKey, name: `${rootName()}·${trimmed}`, describe: describe.value.trim() });
  saving.value = false;
  visible.value = false;
}

function rootName() {
  const p = parent.value;
  if (!p || !isAssetNode(p)) return "";
  const root = p.parentKey ? ctx.dtoByKey.value.get(p.parentKey) : p;
  return root?.name ?? p.name;
}
</script>

<style scoped>
.tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
