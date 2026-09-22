<template>
  <t-dialog v-model:visible="visible" header="资产模型绑定" :confirm-btn="{ content: '保存', loading: saving }" attach="body" width="720px" @confirm="save">
    <t-radio-group v-model="scope" variant="default-filled" class="scope">
      <t-radio-button value="project">本项目</t-radio-button>
      <t-radio-button value="global">全局默认</t-radio-button>
    </t-radio-group>
    <p class="tip">
      {{ scope === "project" ? "只对当前项目生效，留空的项沿用全局默认。" : "新项目和未单独设置的项目都用这里的默认值；模型留空时跟随项目的图片模型。" }}
    </p>
    <table class="grid">
      <thead>
        <tr>
          <th>用途</th>
          <th>生成模型</th>
          <th>默认比例</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in ROWS" :key="row.key">
          <td>
            <div class="label">{{ row.label }}</div>
            <div class="desc">{{ row.desc }}</div>
          </td>
          <td><ModelSelect v-model="form[row.key].model" type="image" size="small" :placeholder="placeholderOf(row.key)" /></td>
          <td>
            <t-select v-model="form[row.key].aspectRatio" size="small" :clearable="scope === 'project'" :placeholder="global?.[row.key].aspectRatio">
              <t-option v-for="r in ASPECT_RATIOS" :key="r" :value="r" :label="r" />
            </t-select>
          </td>
        </tr>
      </tbody>
    </table>
  </t-dialog>
</template>

<script setup lang="ts">
import { canvasApi, errorMessage } from "../api";
import { ASPECT_RATIOS } from "../types";
import type { AssetModelKey, AssetModels } from "../types";

const ROWS: { key: AssetModelKey; label: string; desc: string }[] = [
  { key: "roleSheet", label: "角色多视图（无参考）", desc: "直接按人物需求文生多视图，如 Krea2 文生图" },
  { key: "roleSheetRef", label: "角色多视图（有参考图）", desc: "连入定妆照等参考图后，以它为身份参考生成多视图" },
  { key: "roleDerive", label: "角色衍生", desc: "换装/变身：以父角色多视图为参考生成新的多视图，如 Krea2 单图编辑" },
  { key: "scene", label: "场景（无参考）", desc: "基础场景图，直接按需求文生图" },
  { key: "sceneRef", label: "场景（有参考图）", desc: "连入截图或照片后，照它的样式重画场景，按目标尺寸出图" },
  { key: "sceneDerive", label: "场景状态", desc: "时段/状态变体，以场景主图为参考" },
  { key: "prop", label: "道具（无参考）", desc: "基础道具图，直接按需求文生图" },
  { key: "propRef", label: "道具（有参考图）", desc: "连入截图或照片后，照它的样式重画道具，按目标尺寸出图" },
  { key: "propDerive", label: "道具使用状态", desc: "以道具主图为参考" },
];

const visible = defineModel<boolean>("visible", { required: true });
const props = defineProps<{ projectId: number }>();
const emit = defineEmits<{ saved: [] }>();

const scope = ref<"project" | "global">("project");
const saving = ref(false);
const global = ref<AssetModels | null>(null);
const projectOverride = ref<Partial<AssetModels>>({});
const emptyForm = () => Object.fromEntries(ROWS.map((r) => [r.key, { model: "", aspectRatio: "" }])) as unknown as AssetModels;
const form = ref<AssetModels>(emptyForm());

function fillForm() {
  const source = scope.value === "global" ? global.value : projectOverride.value;
  form.value = Object.fromEntries(
    ROWS.map((r) => [r.key, { model: source?.[r.key]?.model ?? "", aspectRatio: source?.[r.key]?.aspectRatio ?? "" }]),
  ) as unknown as AssetModels;
}
const placeholderOf = (key: AssetModelKey) => (scope.value === "project" && global.value?.[key].model ? `默认：${global.value[key].model}` : "跟随项目图片模型");

watch(visible, async (open) => {
  if (!open) return;
  try {
    const res = await canvasApi.getAssetModels(props.projectId);
    global.value = res.global;
    projectOverride.value = res.project ?? {};
    fillForm();
  } catch (e) {
    window.$message.error(errorMessage(e, "读取模型绑定失败"));
  }
});
watch(scope, fillForm);

async function save() {
  saving.value = true;
  try {
    // 项目级只提交填了的项；全局默认比例必填
    const entries = ROWS.map((r) => [r.key, form.value[r.key]] as const).filter(([, v]) => scope.value === "global" || v.model || v.aspectRatio);
    const models = Object.fromEntries(
      entries.map(([k, v]) => [k, { model: v.model, aspectRatio: v.aspectRatio || global.value?.[k].aspectRatio || "16:9" }]),
    ) as Partial<AssetModels>;
    await canvasApi.setAssetModels(models, scope.value === "project" ? props.projectId : null);
    window.$message.success("已保存");
    emit("saved");
    visible.value = false;
  } catch (e) {
    window.$message.error(errorMessage(e, "保存失败"));
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.scope {
  margin-bottom: 6px;
}
.tip {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
.grid {
  width: 100%;
  border-collapse: collapse;
  th {
    text-align: left;
    font-weight: 500;
    font-size: 12px;
    color: var(--td-text-color-secondary);
    padding: 6px 8px;
    border-bottom: 1px solid var(--td-component-stroke);
  }
  td {
    padding: 8px;
    border-bottom: 1px solid var(--td-component-stroke);
    vertical-align: middle;
  }
  td:nth-child(2) {
    width: 260px;
  }
  td:nth-child(3) {
    width: 120px;
  }
  .label {
    font-size: 13px;
  }
  .desc {
    font-size: 11px;
    color: var(--td-text-color-placeholder);
  }
}
</style>
