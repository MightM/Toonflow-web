<template>
  <t-dialog v-model:visible="visible" :header="`为「${name}」绑定音色`" width="460px" :footer="false" attach="body" destroy-on-close>
    <div class="voice-picker">
      <p v-if="current" class="current">当前：{{ current.name }}<span class="from">（{{ current.kind === "node" ? "画布音频节点" : "音色库" }}）</span></p>
      <p v-else class="current muted">还没有绑定音色</p>
      <button class="option" @click="fromLibrary">
        <i-folder-open size="18" />
        <span><b>从音色库选</b><small>资产中心里的音色资产，与短剧流水线用的是同一个库</small></span>
      </button>
      <div v-if="audioNodes.length" class="option column">
        <span class="row"><i-voice size="18" /><b>用画布上的音频节点</b></span>
        <t-select v-model="pickedNode" :options="audioNodes" placeholder="选一个音频节点（上传或文字转语音生成的）" size="small" />
        <div class="row end"><t-button size="small" :disabled="!pickedNode" @click="fromNode">用这个音频</t-button></div>
      </div>
      <p v-else class="muted small">画布上还没有带声音的音频节点；上传一段音频或用文字转语音生成一个，就能在这里选。</p>
      <div class="foot">
        <button v-if="current" class="unbind" @click="emit('bind', null)"><i-close size="12" />解绑</button>
      </div>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
// 音色选择：音色库资产，或画布上的音频节点。资产角色只支持音色库（绑定表只认资产），自由节点两种都行
import openAssetsSelector from "@/utils/assetsCheck";
import { useCanvasCtx } from "../context";
import { isAssetNode } from "../types";
import type { NodeVoice } from "../types";

const visible = defineModel<boolean>("visible", { default: false });
const props = defineProps<{ nodeKey: string | null }>();
const emit = defineEmits<{ bind: [voice: NodeVoice | null] }>();
const ctx = useCanvasCtx();

const dto = computed(() => (props.nodeKey ? ctx.dtoByKey.value.get(props.nodeKey) : undefined));
const name = computed(() => dto.value?.name ?? "");
const current = computed(() => {
  const d = dto.value;
  if (!d) return null;
  if (isAssetNode(d)) return d.voices[0] ? { kind: "asset" as const, name: d.voices[0].name } : null;
  return d.voice ?? null;
});
const allowNodes = computed(() => !!dto.value && !isAssetNode(dto.value));
const audioNodes = computed(() =>
  allowNodes.value ? [...ctx.dtoByKey.value.values()].filter((d) => !isAssetNode(d) && d.kind === "audio" && d.current?.src).map((d) => ({ label: d.name, value: d.key })) : [],
);
const pickedNode = ref<string>("");

async function fromLibrary() {
  visible.value = false;
  const picked = await openAssetsSelector({ title: `为「${name.value}」选择音色`, types: ["audio"], selectorMode: true, multiple: false });
  if (picked.length) emit("bind", { kind: "asset", id: picked[0].id, name: picked[0].name });
}
function fromNode() {
  if (!pickedNode.value) return;
  const node = ctx.dtoByKey.value.get(pickedNode.value);
  visible.value = false;
  emit("bind", { kind: "node", key: pickedNode.value, name: node?.name ?? "" });
}
watch(visible, (on) => {
  if (on) pickedNode.value = "";
});
</script>

<style lang="scss" scoped>
.voice-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.current {
  margin: 0 0 4px;
  font-size: 13px;
  .from {
    color: var(--td-text-color-placeholder);
  }
}
.muted {
  color: var(--td-text-color-placeholder);
}
.small {
  margin: 0;
  font-size: 12px;
}
.option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 12px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms;
  &:hover {
    border-color: var(--td-brand-color);
  }
  &.column {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    cursor: default;
    &:hover {
      border-color: var(--td-component-stroke);
    }
  }
  span {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  small {
    font-size: 11px;
    color: var(--td-text-color-placeholder);
  }
  .row {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    &.end {
      justify-content: flex-end;
    }
  }
}
.foot {
  display: flex;
  justify-content: flex-end;
}
.unbind {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--td-error-color);
  font-size: 12px;
  cursor: pointer;
}
</style>
