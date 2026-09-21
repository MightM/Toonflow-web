<template>
  <t-dialog v-model:visible="visible" header="存入资产库" :confirm-btn="{ content: '存入', loading: saving }" attach="body" width="480px" @confirm="submit">
    <t-form label-align="top">
      <t-form-item label="资产名称" required-mark>
        <t-input v-model="name" :maxlength="30" />
      </t-form-item>
      <t-form-item label="挂到已有资产下（作为它的一个状态）">
        <t-select v-model="parentAssetId" clearable filterable placeholder="不挂载，作为独立资产">
          <t-option v-for="a in roots" :key="a.id" :value="a.id" :label="`${TYPE_LABEL[a.assetType]} · ${a.name}`" />
        </t-select>
      </t-form-item>
      <t-form-item v-if="!parentAssetId" label="资产类型">
        <t-radio-group v-model="type">
          <t-radio-button value="role">角色</t-radio-button>
          <t-radio-button value="scene">场景</t-radio-button>
          <t-radio-button value="tool">道具</t-radio-button>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="描述">
        <t-textarea v-model="describe" :autosize="{ minRows: 2, maxRows: 5 }" />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<script setup lang="ts">
import { canvasApi, errorMessage } from "../api";
import { TYPE_LABEL, useCanvasCtx } from "../context";
import type { AssetNodeDto } from "../types";
import { assetTypeOf, isAssetNode } from "../types";

const visible = defineModel<boolean>("visible", { required: true });
const props = defineProps<{ nodeKey: string | null }>();
const ctx = useCanvasCtx();

const name = ref("");
const describe = ref("");
const type = ref<"role" | "scene" | "tool">("scene");
const parentAssetId = ref<number | undefined>(undefined);
const saving = ref(false);

const roots = computed(() => [...ctx.dtoByKey.value.values()].filter((n): n is AssetNodeDto => isAssetNode(n) && !n.parentKey));

watch(visible, (open) => {
  if (!open || !props.nodeKey) return;
  const dto = ctx.dtoByKey.value.get(props.nodeKey);
  name.value = dto?.name ?? "";
  type.value = assetTypeOf(dto) ?? "scene"; // 已打标签的节点默认用它的类型
  describe.value = "";
  parentAssetId.value = undefined;
});

async function submit() {
  if (!props.nodeKey) return;
  if (!name.value.trim()) return window.$message.warning("请填写资产名称");
  saving.value = true;
  try {
    await canvasApi.saveNodeToAssets({
      projectId: ctx.projectId.value,
      nodeId: Number(props.nodeKey.slice(2)),
      type: type.value,
      name: name.value.trim(),
      describe: describe.value,
      parentAssetId: parentAssetId.value ?? null,
    });
    window.$message.success("已存入资产库，分镜可以直接引用它了");
    visible.value = false;
    await ctx.refresh();
  } catch (e) {
    window.$message.error(errorMessage(e, "存入失败"));
  } finally {
    saving.value = false;
  }
}
</script>
