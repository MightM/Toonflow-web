<template>
  <div class="audio-composer nodrag nowheel nopan" @mousedown.stop @wheel="onWheel" @keydown.stop>
    <div v-if="refs.length" class="ref-strip">
      <span class="ref-label">参考</span>
      <span v-for="r in refs" :key="r.key" class="ref-chip" :title="r.type === 'audio' ? `${r.name}：作为音色参考` : `${r.name}：文本可用 @文本N 引用`">
        <i-text v-if="r.type === 'text'" size="12" />
        <i-voice v-else-if="r.type === 'audio'" size="12" />
        <i-pic v-else size="12" />
        <em>{{ refLabel(r.type, r.index) }}</em>
        <span class="ref-name">{{ r.name }}</span>
      </span>
    </div>
    <PromptEditor v-model="text" class="prompt" :references="editorRefs" placeholder="要朗读的文本；输入 @ 引用连入的文本节点" />
    <div class="controls">
      <div class="model"><ModelSelect v-model="model" type="tts" size="small" @change="onModelChange" /></div>
      <t-select v-model="voice" size="small" class="voice" :options="voiceOptions" placeholder="音色" :disabled="!voiceOptions.length" />
      <t-popup trigger="click" placement="top-left">
        <button class="param-btn" type="button">{{ paramSummary }}<i-down size="12" /></button>
        <template #content>
          <div class="params nowheel" @wheel.stop>
            <label v-for="p in PARAMS" :key="p.key">
              <span>{{ p.label }}</span>
              <t-slider v-model="params[p.key]" :min="p.min" :max="p.max" :step="0.1" class="slider" />
              <b>{{ params[p.key].toFixed(1) }}</b>
            </label>
          </div>
        </template>
      </t-popup>
      <div class="grow" />
      <t-button size="small" shape="round" :loading="submitting" :disabled="!model || !text.trim()" @click="generate">
        <template #icon><i-arrow-up size="14" /></template>
        生成语音
      </t-button>
    </div>
    <div v-if="!hasTtsModel" class="warning">还没有可用的语音模型：请在「设置 → 供应商」里启用带 TTS 模型的供应商</div>
  </div>
</template>

<script setup lang="ts">
// 音频节点的输入面板：文本（可 @ 引用文本节点）+ 语音模型 + 音色 + 语速 / 音调 / 音量；连入的音频节点作为音色参考
import axios from "@/utils/axios";
import ModelSelect from "@/components/modelSelect.vue";
import { canvasApi, errorMessage } from "../api";
import { useCanvasCtx } from "../context";
import { useComposerWheel } from "../composerWheel";
import { getDraft, saveDraft } from "../composerDrafts";
import type { MediaKind, MediaNodeDto } from "../types";
import { isAssetNode } from "../types";

const props = defineProps<{ dto: MediaNodeDto }>();
const ctx = useCanvasCtx();
const onWheel = useComposerWheel();

const PARAMS = [
  { key: "speechRate", label: "语速", min: 0.5, max: 2 },
  { key: "pitchRate", label: "音调", min: 0.5, max: 2 },
  { key: "volume", label: "音量", min: 0.1, max: 2 },
] as const;
type ParamKey = (typeof PARAMS)[number]["key"];

const refs = computed(() =>
  ctx.refEdgesOf(props.dto.key).map((e, index) => {
    const src = ctx.dtoByKey.value.get(e.source);
    const kind = src?.current?.kind ?? (src && !isAssetNode(src) ? src.kind : "image");
    return { key: e.source, name: src?.name ?? e.source, type: kind as MediaKind, src: src?.current?.src ?? null, index };
  }),
);
const refLabel = (type: string, index: number) => {
  const sameType = refs.value.slice(0, index + 1).filter((r) => r.type === type).length;
  return `${{ image: "图", video: "视频", audio: "音频", text: "文本" }[type] ?? type}${sameType}`;
};
const editorRefs = computed(() => refs.value.filter((r) => r.src || r.type === "text").map((r) => ({ type: r.type, src: r.src ?? "" })));

const saved = props.dto.params ?? {};
const draft = getDraft(ctx.projectId.value, props.dto.key);
const text = ref<string>(draft?.prompt ?? props.dto.prompt ?? "");
const model = ref<string>((draft?.model as string | undefined) ?? (saved.model as string | undefined) ?? "");
const voice = ref<string>((saved.voice as string | undefined) ?? "");
const params = reactive<Record<ParamKey, number>>({
  speechRate: Number(saved.speechRate ?? 1),
  pitchRate: Number(saved.pitchRate ?? 1),
  volume: Number(saved.volume ?? 1),
});
const paramSummary = computed(() => `语速 ${params.speechRate.toFixed(1)} · 音调 ${params.pitchRate.toFixed(1)} · 音量 ${params.volume.toFixed(1)}`);

// 音色列表来自模型详情（供应商脚本里 TTSModel.voices）
const voiceOptions = ref<{ label: string; value: string }[]>([]);
const hasTtsModel = ref(true);
async function loadVoices() {
  voiceOptions.value = [];
  if (!model.value) return;
  try {
    const { data } = await axios.post("/modelSelect/getModelDetail", { modelId: model.value });
    voiceOptions.value = (data?.voices ?? []).map((v: { title: string; voice: string }) => ({ label: v.title, value: v.voice }));
    if (voiceOptions.value.length && !voiceOptions.value.some((v) => v.value === voice.value)) voice.value = voiceOptions.value[0].value;
  } catch {
    voiceOptions.value = [];
  }
}
function onModelChange() {
  void loadVoices();
}
onMounted(async () => {
  try {
    const { data } = await axios.post("/modelSelect/getModelList", { type: "tts" });
    hasTtsModel.value = Array.isArray(data) && data.length > 0;
  } catch {
    hasTtsModel.value = false;
  }
  await loadVoices();
});

// 草稿：输入随时保存，面板卸载也不丢
let draftTimer: ReturnType<typeof setTimeout> | undefined;
watch([text, model], () => {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveDraft(ctx.projectId.value, props.dto.key, { prompt: text.value, model: model.value || undefined }), 400);
});
onBeforeUnmount(() => {
  clearTimeout(draftTimer);
  saveDraft(ctx.projectId.value, props.dto.key, { prompt: text.value, model: model.value || undefined });
});

const submitting = ref(false);
async function generate() {
  if (submitting.value || !model.value || !text.value.trim()) return;
  submitting.value = true;
  try {
    const res = await canvasApi.generateAudio({
      projectId: ctx.projectId.value,
      target: props.dto.key,
      model: model.value,
      text: text.value,
      voice: voice.value,
      speechRate: params.speechRate,
      pitchRate: params.pitchRate,
      volume: params.volume,
    });
    ctx.track(res.imageId);
    window.$message.success("已开始生成语音");
  } catch (e) {
    window.$message.error(errorMessage(e, "生成失败"));
  } finally {
    submitting.value = false;
  }
}
</script>

<style lang="scss" scoped>
.audio-composer {
  width: 420px;
  padding: 10px;
  border-radius: 14px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ref-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  .ref-label {
    color: var(--td-text-color-placeholder);
  }
  .ref-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 160px;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--td-bg-color-secondarycontainer);
    em {
      font-style: normal;
      font-weight: 600;
      color: #0ea5e9;
    }
    .ref-name {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
}
.prompt {
  min-height: 90px;
  max-height: 200px;
}
.controls {
  display: flex;
  align-items: center;
  gap: 6px;
  .model {
    width: 150px;
  }
  .voice {
    width: 110px;
  }
  .grow {
    flex: 1;
  }
}
.param-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--td-component-stroke);
  background: transparent;
  color: var(--td-text-color-secondary);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  &:hover {
    border-color: var(--td-brand-color);
    color: var(--td-text-color-primary);
  }
}
.params {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 260px;
  padding: 6px 4px;
  label {
    display: grid;
    grid-template-columns: 34px 1fr 34px;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    b {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  }
}
.warning {
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--td-warning-color-light);
  color: var(--td-warning-color-8, var(--td-warning-color));
  font-size: 11px;
}
</style>
