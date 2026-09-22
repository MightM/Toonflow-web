<template>
  <t-card class="script">
    <div class="titleBar dragHandle pr">
      <div class="title c">{{ $t("workbench.production.node.script.title") }}</div>
      <t-button size="small" variant="text" @click="openEdit">{{ $t("workbench.production.edit") }}</t-button>
      <Handle :id="props.handleIds.source" type="source" :position="Position.Right" style="right: calc(-1 * var(--td-comp-paddingLR-xl))" />
    </div>
    <div class="content">
      <MdPreview v-model="script" :theme="themeSetting.mode" />
    </div>
    <Handle :id="props.handleIds.assets" type="source" :position="Position.Bottom" />
  </t-card>

  <t-dialog
    v-model:visible="dialogVisible"
    :header="$t('workbench.production.node.script.editDialog')"
    :width="'90vw'"
    :confirm-btn="$t('workbench.production.save')"
    :cancel-btn="$t('workbench.production.cancel')"
    @confirm="onConfirm"
    @cancel="onCancel"
    @close="onCancel"
    :close-on-overlay-click="false"
    placement="center"
    attach="body">
    <MdEditor
      v-model="editContent"
      :theme="themeSetting.mode"
      :toolbars="toolbars"
      :footers="[]"
      style="height: 72vh"
      @onUploadImg="() => {}"
      @drop.prevent
      @paste="onPaste" />
  </t-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { MdEditor, MdPreview } from "md-editor-v3";
import type { ToolbarNames } from "md-editor-v3";
import settingStore from "@/stores/setting";
import productionAgentStore from "@/stores/productionAgent";
import axios from "@/utils/axios";
const { themeSetting } = storeToRefs(settingStore());

const props = defineProps<{
  id: string;
  handleIds: {
    assets: string;
    source: string;
  };
}>();

const script = defineModel<string>({ required: true });
const editContent = ref("");
const dialogVisible = ref(false);

const toolbars: ToolbarNames[] = [
  "bold",
  "underline",
  "italic",
  "strikeThrough",
  "-",
  "title",
  "sub",
  "sup",
  "quote",
  "unorderedList",
  "orderedList",
  "task",
  "-",
  "codeRow",
  "code",
  "table",
  "-",
  "revoke",
  "next",
  "=",
  "preview",
];

function openEdit() {
  editContent.value = script.value ?? "";
  dialogVisible.value = true;
}

// 剧本正文的权威表是 o_script，不是 flowData 快照：setFlowData 只写 o_agentWorkData，
// 而 getFlowData 每次都用 o_script.content 覆盖 flowData.script，所以只存快照的话刷新就丢，
// 剧本 Agent 的剧本 Tab 和视频提示词也永远看不到这次修改。这里先写回 o_script 再存快照。
// 只在用户点「保存」时写，不放进 setFlowData——否则画布上任何别的操作都会把内存里
// 可能已经过期的剧本推回库里，反过来把剧本 Agent 那边的新内容冲掉。
async function onConfirm() {
  const store = productionAgentStore();
  const scriptId = store.episodesId;
  if (!scriptId) {
    window.$message.error("没有当前剧集，无法保存剧本");
    return;
  }
  try {
    await axios.post("/script/updateScript", { id: scriptId, content: editContent.value });
  } catch (e) {
    window.$message.error("剧本保存失败，请重试");
    return;
  }
  script.value = editContent.value;
  store.setFlowData();
  dialogVisible.value = false;
}

function onCancel() {
  dialogVisible.value = false;
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/") || item.type.startsWith("video/")) {
      e.preventDefault();
      return;
    }
  }
}
</script>

<style lang="scss" scoped>
.script {
  max-width: 100vw;
  width: fit-content;
  min-width: 200px;
  user-select: text;
  cursor: default;

  .titleBar {
    cursor: grab;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    background-color: #000;
    width: fit-content;
    padding: 5px 10px;
    color: #fff;
    border-radius: 8px 0;
    font-size: 16px;
  }

  .content {
    margin-top: 8px;

    :deep(.md-editor) {
      border: none;
      box-shadow: none;
    }

    :deep(.md-editor-preview-wrapper) {
      padding: 0;
    }
  }
}
</style>
