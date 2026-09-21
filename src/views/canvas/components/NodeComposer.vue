<template>
  <div class="composer nodrag nowheel nopan" @mousedown.stop @wheel="onWheel" @keydown.stop>
    <div v-if="refs.length || parentRef || ctx.openRefPicker || showStyle" class="ref-strip">
      <!-- 画风胶囊：像参考一样挂在提示词上方，不是节点 -->
      <StyleChip v-if="showStyle" :model-value="artStyle" :styles="ctx.artStyles!.value" @update:model-value="onStyleChange" />
      <span v-if="refs.length || parentRef || ctx.openRefPicker" class="ref-label">参考</span>
      <span
        v-for="(r, i) in refs"
        :key="r.key"
        class="ref-chip"
        :class="{ scene: r.key === sceneSlotKey }"
        :title="r.key === sceneSlotKey ? `${r.name}（场景）：发图时会排到图1` : r.assetType ? `${r.name}（${TYPE_LABEL[r.assetType]}）` : r.name"
      >
        <i v-if="r.assetType" class="type-dot" :class="r.assetType" />
        <button v-if="refs.length > 1 && i > 0" class="move" title="前移" aria-label="前移" @click="moveRef(i, -1)"><i-left size="10" /></button>
        <!-- 光有「图2」看不出是什么，名字要露出来；有图就能点开大图 -->
        <button class="peek" :disabled="!r.src" :title="r.src ? `点开看 ${r.name}` : r.type === 'text' ? `${r.name}：文本内容会拼进提示词` : `${r.name}：还没出图`" @click="r.src && r.type !== 'text' && ctx.openPreview(r.src, r.type)">
          <img v-if="r.type === 'image' && r.src" :src="r.src" alt="" />
          <i-video v-else-if="r.type === 'video'" size="12" />
          <i-voice v-else-if="r.type === 'audio'" size="12" />
          <i-text v-else-if="r.type === 'text'" size="12" />
          <i-pic v-else size="12" />
          <em>{{ refLabel(r.type, i) }}</em>
          <span class="ref-name">{{ r.name }}</span>
        </button>
        <button v-if="refs.length > 1 && i < refs.length - 1" class="move" title="后移" aria-label="后移" @click="moveRef(i, 1)"><i-right size="10" /></button>
        <button v-if="ctx.removeRef" class="drop" title="移除这个参考" aria-label="移除" @click="ctx.removeRef(props.dto.key, r.key)"><i-close size="10" /></button>
      </span>
      <span v-if="parentRef" class="ref-chip" :title="`没有连线时自动以父资产「${parentRef.name}」为参考`">
        <img v-if="parentRef.current?.src" :src="parentRef.current.src" alt="" />
        父资产（自动）
      </span>
      <button v-if="ctx.openRefPicker" class="ref-add" title="添加参考素材" @click="ctx.openRefPicker(props.dto.key)"><i-plus size="12" />参考</button>
    </div>

    <PromptEditor v-model="prompt" class="prompt" :class="{ tall: polishedBy }" :references="editorRefs" :placeholder="placeholder" />

    <div class="controls">
      <!-- 自动选模型时常规面板只给一行结论，模型 / 比例 / 时长收进「高级」 -->
      <button v-if="autoModel && !advanced" class="auto-line" :title="`${autoModel.reason}。点这里可以手动改`" @click="advanced = true">
        <i-magic-wand size="12" />
        <b>{{ modelLabel }}</b>
        <span>{{ autoSummary }}</span>
        <i-down size="12" />
      </button>
      <template v-else>
        <div class="model">
          <ModelSelect v-model="model" :type="isVideo ? 'video' : 'image'" size="small" @change="onModelChange" />
        </div>
        <RatioPopover
          v-model:ratio="ratio"
          v-model:size="size"
          v-model:duration="duration"
          v-model:resolution="resolution"
          v-model:audio="audio"
          :audio-optional="isVideo && audioOptional"
          :kind="isVideo ? 'video' : 'image'"
          :video-options="videoOptions"
          @update:ratio="paramsTouched = true"
          @update:size="paramsTouched = true"
          @update:duration="paramsTouched = true"
          @update:resolution="paramsTouched = true" />
      </template>
      <PresetPicker v-if="!isVideo && availablePresets.length" v-model="presetId" :presets="availablePresets" :has-refs="hasRefs" @update:model-value="presetTouched = true" />
      <div class="grow" />
      <t-tooltip v-if="canPolish" :content="polishTip">
        <t-button size="small" variant="text" :loading="polishing" @click="polish">
          <template #icon><i-magic-wand size="14" /></template>
          {{ polishLabel }}
        </t-button>
      </t-tooltip>
      <t-button size="small" shape="round" :loading="submitting" :disabled="blocked" @click="generate">
        <template #icon><i-arrow-up size="14" /></template>
        {{ isVideo ? (polishedBy ? "确认并生成" : "生成视频") : "生成" }}
      </t-button>
    </div>

    <div v-if="polishedBy" class="polished" role="status">
      <i-check-one size="13" />
      <span>已按「{{ polishedBy }}」改写成官方模板格式，请检查参考编号和内容，确认无误后点「确认并生成」</span>
    </div>
    <div v-else-if="h3Hint" class="h3-hint">
      <i-info size="12" />
      <span>{{ h3Hint }}</span>
    </div>
    <div v-if="(preset && !isVideo) || undoText !== null" class="sub-actions">
      <t-popup v-if="!isVideo && preset && preset.id !== 'free'" trigger="click" placement="bottom-left">
        <button class="link">预览完整提示词</button>
        <template #content>
          <pre class="preview nowheel" @wheel.stop>{{ previewWithStyle }}</pre>
        </template>
      </t-popup>
      <button v-if="undoText !== null" class="link" @click="undoPolish">撤销，退回上一版</button>
    </div>
    <div v-if="sceneFirstIssue" class="scene-first">
      <i-caution size="12" />
      <span>{{ sceneFirstIssue.text }}</span>
      <button v-if="sceneFirstIssue.tagKey" class="link" @click="ctx.setAssetType(sceneFirstIssue.tagKey, 'scene')">把它标为场景</button>
    </div>
    <div v-if="layoutWarning" class="warning">
      <i-caution size="12" />
      <span>{{ layoutWarning }}</span>
    </div>
    <div v-if="blockedReason" class="blocked">{{ blockedReason }}</div>
    <div v-else-if="modelWarning" class="warning">{{ modelWarning }}</div>
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import { canvasApi, errorMessage } from "../api";
import { TYPE_LABEL, useCanvasCtx } from "../context";
import { useComposerWheel } from "../composerWheel";
import { getDraft, saveDraft } from "../composerDrafts";
import RatioPopover from "./RatioPopover.vue";
import PresetPicker from "./PresetPicker.vue";
import StyleChip from "./StyleChip.vue";
import type { AssetModelKey, CanvasNodeDto, ImageSize, MediaKind, MediaNodeDto } from "../types";
import { artStyleOf, assetTypeOf, isAssetNode } from "../types";

interface VideoOptions {
  durations: number[];
  resolutions: string[];
}

const props = defineProps<{ dto: CanvasNodeDto }>();
const ctx = useCanvasCtx();
const onWheel = useComposerWheel();

const asset = computed(() => (isAssetNode(props.dto) ? props.dto : null));
const isVideo = computed(() => props.dto.kind === "video");

// ─── 画风（自由图片节点，存 params.artStyle） ─────────────────
const showStyle = computed(() => !isVideo.value && !asset.value && !!ctx.artStyles && !!ctx.setArtStyle);
const artStyle = computed(() => artStyleOf(props.dto));
const onStyleChange = (stylePath: string | null) => void ctx.setArtStyle?.(props.dto.key, stylePath);

// ─── 参考（入边，按 sort；衍生资产没连线时自动带父资产） ─────────────────
const refs = computed(() =>
  ctx.refEdgesOf(props.dto.key).map((e) => {
    const src = ctx.dtoByKey.value.get(e.source);
    const kind = src?.current?.kind ?? (src && !isAssetNode(src) ? src.kind : "image");
    return { key: e.source, name: src?.name ?? e.source, type: kind as MediaKind, src: src?.current?.src ?? null, assetType: assetTypeOf(src) };
  }),
);
const parentRef = computed(() => {
  if (refs.value.length || !asset.value?.parentKey) return null;
  const parent = ctx.dtoByKey.value.get(asset.value.parentKey);
  return parent?.current?.src ? parent : null;
});
const hasRefs = computed(() => refs.value.length > 0 || !!parentRef.value);
// 文本参考没有 src，也要进 @ 列表（后端会把 @文本N 替换成内容）
const editorRefs = computed(() => refs.value.filter((r) => r.src || r.type === "text").map((r) => ({ type: r.type, src: r.src ?? "" })));
const imageRefs = computed(() => refs.value.filter((r) => r.type === "image"));
const refLabel = (type: string, index: number) => {
  const sameType = refs.value.slice(0, index + 1).filter((r) => r.type === type).length;
  return `${{ image: "图", video: "视频", audio: "音频", text: "文本" }[type] ?? type}${sameType}`;
};

// ─── 目标模板 ─────────────────────────────────────────
const nodeTarget = computed(() => (asset.value ? asset.value.assetType : "image"));
const availablePresets = computed(() => ctx.presets.value.filter((p) => p.targets.includes(nodeTarget.value)));
function defaultPresetId(): string | null {
  const remembered = ctx.lastPresetOf(props.dto.key) ?? (!asset.value ? (params.value.presetId as string | undefined) : undefined);
  if (remembered && availablePresets.value.some((p) => p.id === remembered)) return remembered;
  // 页面自己指定的默认（镜头台的镜头默认用「分镜图」而不是「自由描述」）
  const injected = ctx.defaultPresetFor?.(props.dto.key, hasRefs.value);
  if (injected && availablePresets.value.some((p) => p.id === injected)) return injected;
  const byType: Record<string, [string, string]> = {
    role: ["role_sheet", "role_outfit"],
    scene: ["scene", "scene_variant"],
    tool: ["prop", "prop_variant"],
    image: ["free", "free"],
  };
  const [plain, derived] = byType[nodeTarget.value] ?? ["free", "free"];
  const id = asset.value?.parentKey && hasRefs.value ? derived : plain;
  return availablePresets.value.some((p) => p.id === id) ? id : null;
}
const params = computed(() => (!isAssetNode(props.dto) ? ((props.dto as MediaNodeDto).params ?? {}) : {}));
const presetId = ref<string | null>(null);
const preset = computed(() => availablePresets.value.find((p) => p.id === presetId.value) ?? null);
const canPolish = computed(() => (isVideo.value ? !!model.value : !!preset.value?.canPolish));
const polishLabel = computed(() => ctx.polishLabel?.(isVideo.value) ?? "优化");
const polishTip = computed(() =>
  isVideo.value
    ? "按视频模型绑定的官方提示词模板（如 MiniMax H3 多参考六字段格式），结合连入的参考素材把简短描述改写成完整提示词"
    : `按「${preset.value?.name}」模板和视觉手册，把简短描述优化成完整需求`,
);

// 兼容没有模板时的资产默认绑定（模板列表加载失败的兜底）
function bindingKey(): AssetModelKey | null {
  const a = asset.value;
  if (!a) return null;
  const derived = !!a.parentKey;
  if (a.assetType === "role") return refs.value.length ? "roleSheetRef" : derived ? "roleDerive" : "roleSheet";
  if (a.assetType === "scene") return derived ? "sceneDerive" : "scene";
  return derived ? "propDerive" : "prop";
}

const prompt = ref(props.dto.prompt ?? "");
const model = ref("");
const modelTouched = ref(false); // 用户手动选过模型后，不再随模板 / 连线自动切换
const presetTouched = ref(false); // 用户手动选过模板（只有这时才记进草稿）
const ratio = ref("16:9");
const size = ref<ImageSize>(ctx.defaults.value?.imageQuality ?? "1K");
const duration = ref(5);
const resolution = ref("720P");
const audio = ref(false);
const audioOptional = ref(false);
const videoOptions = ref<VideoOptions>({ durations: [5], resolutions: ["720P"] });
/** 镜头台把分镜表算出的片段时长传下来；有值时常规面板不再显示时长选择器 */
const lockedDuration = computed(() => (isAssetNode(props.dto) ? null : (props.dto.lockedDuration ?? null)));
/** 模型 / 比例 / 时长收进「高级」：自动选得准时用户不该每次都面对一排选择器 */
const advanced = ref(false);
/** 用户在「高级」里自己动过比例 / 画质 / 时长；没动过就一直跟着项目默认和分镜时长走 */
const paramsTouched = ref(false);
/** 一行结论：用了哪个模型、什么画幅画质时长 */
const modelLabel = computed(() => MODEL_LABEL[modelNameOf(model.value)] ?? modelNameOf(model.value) ?? "");
const autoSummary = computed(() =>
  isVideo.value ? `${duration.value}s · ${resolution.value} · ${ratio.value}` : `${ratio.value} · ${size.value}`,
);
// 一行结论上的短名；下拉里的完整名字在 vendor 配置里
const MODEL_LABEL: Record<string, string> = {
  krea2_t2i: "文生图",
  krea2_portrait: "人物定妆照",
  krea2_4view: "人物多视图",
  krea2_edit: "改图",
  krea2_dual: "双图合成",
  krea2_multi: "多图合成",
  h3_t2v: "文生视频",
  h3_i2v: "首帧生视频",
  h3_flf: "首尾帧生视频",
  h3_ref2v: "参考生视频",
  h3_ref2v_multi: "多参考生视频",
};

/** 模板 / 连线决定的默认模型 */
function presetModel(): string {
  const p = preset.value;
  if (p) return (hasRefs.value ? p.modelWithRef : p.modelNoRef) || "";
  const key = bindingKey();
  return (key ? ctx.defaults.value?.assetModels[key]?.model : "") || "";
}

/** 后端按参考形状定的模型（镜头台提供）。用户手选过就不再动它 */
const autoModel = computed(() => (isAssetNode(props.dto) ? null : (props.dto.auto ?? null)));

function applyDefaults(resetRatio: boolean) {
  const d = ctx.defaults.value;
  if (isVideo.value) {
    // 顺序：用户手选 > 自动选 > 上次生成用的 > 项目默认。
    // 以前这一支完全不看 modelTouched，params 里存着上次生成的模型，
    // 于是第一次生成之后自动选就再也生效不了了
    if (!modelTouched.value) model.value = String(autoModel.value?.model ?? params.value.model ?? d?.videoModel ?? "");
    ratio.value = String(params.value.aspectRatio ?? d?.videoRatio ?? "16:9");
    // 时长以分镜表算出来的片段时长为准，不让它被上次生成的值盖掉
    duration.value = Number(lockedDuration.value ?? params.value.duration ?? 5);
    resolution.value = String(params.value.resolution ?? "720P");
    audio.value = Boolean(params.value.audio);
    if (model.value) void loadVideoOptions(model.value);
    return;
  }
  if (!modelTouched.value) model.value = presetModel() || autoModel.value?.model || model.value || d?.imageModel || "";
  // 比例与画质在新建项目时就定过了，镜头台不再问第二遍
  if (autoModel.value && d?.videoRatio) ratio.value = d.videoRatio;
  if (autoModel.value && d?.imageQuality) size.value = d.imageQuality;
  if (!resetRatio) return;
  const p = preset.value;
  if (p?.ratio) ratio.value = p.ratio;
  else if (!p) ratio.value = (bindingKey() && d?.assetModels[bindingKey()!]?.aspectRatio) || ratio.value;
  if (p?.size === "1K" || p?.size === "2K" || p?.size === "4K") size.value = p.size;
}

presetId.value = defaultPresetId();
applyDefaults(true);
// 上次没生成就关掉的输入：盖在默认值上（在下面的 watch 注册前恢复，免得又被默认值覆盖）
const draft = getDraft(ctx.projectId.value, props.dto.key);
if (draft) {
  prompt.value = draft.prompt;
  if (draft.presetId !== undefined && (draft.presetId === null || availablePresets.value.some((p) => p.id === draft.presetId) || !availablePresets.value.length)) {
    presetId.value = draft.presetId;
    presetTouched.value = true;
  }
  if (draft.model) {
    model.value = draft.model;
    modelTouched.value = true;
  }
  if (draft.ratio || draft.size || draft.duration || draft.resolution) paramsTouched.value = true;
  ratio.value = draft.ratio || ratio.value;
  if (draft.size === "1K" || draft.size === "2K" || draft.size === "4K") size.value = draft.size;
  duration.value = draft.duration || duration.value;
  resolution.value = draft.resolution || resolution.value;
  audio.value = !!draft.audio;
  if (isVideo.value && draft.model) void loadVideoOptions(draft.model);
}
// 模板列表是异步加载的：到了之后补一次默认值
watch(availablePresets, (list, prev) => {
  if (prev.length || !list.length || presetId.value) return;
  presetId.value = defaultPresetId();
  applyDefaults(!draft); // 有草稿时保留草稿里的比例 / 分辨率
});
// 用户换模板：模型、比例、分辨率一起换
watch(presetId, () => {
  modelTouched.value = false;
  applyDefaults(true);
});
// 连线增减：有参考 / 无参考的默认模型不同，自动选的档位也会变
watch([hasRefs, () => refs.value.length, autoModel], () => applyDefaults(false));

async function onModelChange(value: string) {
  modelTouched.value = true;
  if (!isVideo.value) {
    if (SCENE_FIRST_MODELS.includes(modelNameOf(value))) window.$message.info("这个工作流的图1 单独占一位：连了场景时会自动把它排到图1");
    return;
  }
  await loadVideoOptions(value);
}
async function loadVideoOptions(value: string) {
  if (!value) return;
  try {
    const { data } = await axios.post("/modelSelect/getModelDetail", { modelId: value });
    if (model.value !== value) return; // 已经换了别的模型，丢掉过期结果
    const map: { duration: number[]; resolution: string[] }[] = data?.durationResolutionMap ?? [];
    const durations = [...new Set(map.flatMap((m) => m.duration))];
    const resolutions = [...new Set(map.flatMap((m) => m.resolution))];
    videoOptions.value = { durations: durations.length ? durations : [5], resolutions: resolutions.length ? resolutions : ["720P"] };
    if (!durations.includes(duration.value)) duration.value = videoOptions.value.durations[0];
    if (!resolutions.includes(resolution.value)) resolution.value = videoOptions.value.resolutions[0];
    audioOptional.value = data?.audio === "optional" || data?.audio === true;
  } catch {
    if (model.value !== value) return;
    videoOptions.value = { durations: [5], resolutions: ["720P"] };
    duration.value = 5;
    resolution.value = "720P";
  }
}

// ─── 图片模型与参考是否匹配（mode：text / singleImage / multiReference） ─────────
const modeCache = new Map<string, string[]>();
const imageModes = ref<string[] | null>(null);
watch(
  model,
  async (value) => {
    if (isVideo.value || !value) return (imageModes.value = null);
    if (!modeCache.has(value)) {
      try {
        const { data } = await axios.post("/modelSelect/getModelDetail", { modelId: value });
        modeCache.set(value, Array.isArray(data?.mode) ? data.mode.flat() : []);
      } catch {
        modeCache.set(value, []);
      }
    }
    if (model.value === value) imageModes.value = modeCache.get(value) ?? null;
  },
  { immediate: true },
);
// 换装类模板连的是角色多视图时，模型会照搬参考图里的原服装（实测），建议改连单人定妆照
const sheetRefWarning = computed(() => {
  if (presetId.value !== "role_outfit") return "";
  const sheetRef = refs.value.find((r) => {
    const dto = ctx.dtoByKey.value.get(r.key);
    return !!dto && isAssetNode(dto) && dto.assetType === "role";
  });
  return sheetRef ? `参考「${sheetRef.name}」是一张多视图，第一步换装会沿用多视图版式、效果打折；换装建议连一张单人定妆照作参考` : "";
});

const modelWarning = computed(() => {
  if (sheetRefWarning.value) return sheetRefWarning.value;
  const modes = imageModes.value;
  if (isVideo.value || !modes?.length) return "";
  const takesRefs = modes.some((m) => m !== "text");
  if (hasRefs.value && !takesRefs) return "当前模型只支持文生图，连入的参考图不会生效";
  if (!hasRefs.value && !modes.includes("text")) return "当前模型需要参考图，请先连入参考图或换一个模型";
  return "";
});

// ─── 场景必须是图1的工作流：krea2_dual / krea2_multi 按固定槽位把图1当场景底图 ─────────
const SCENE_FIRST_MODELS = ["krea2_dual", "krea2_multi"];
const modelNameOf = (value: string) => value.split(/:(.+)/)[1] ?? value; // 「comfyui:krea2_multi」→「krea2_multi」
const isSceneFirst = computed(() => !isVideo.value && SCENE_FIRST_MODELS.includes(modelNameOf(model.value)));
const isSceneRef = (key: string) => assetTypeOf(ctx.dtoByKey.value.get(key)) === "scene";
// 排序只发生在后端发图的那一刻（顺带把提示词里的 @图N 重编号），界面上的顺序不动。
// 别在这里持久化重排：那样后端拿到的库内顺序已经是场景优先，remapRefTokens 判定「没变化」
// 直接原样返回，提示词还写着「@图1 为某某角色」，实际图1 却成了场景。
// 图1 只是「单独占一位」的槽，不强制是场景：两张人物、两张道具、任意两张都能合。
// 唯一值得提醒的情况是参考里有没标类型的图——它可能是张没打标签的场景，
// 漏标就不会被自动排到图1。全部标注过的角色 / 道具不提示。
const sceneFirstIssue = computed<{ level: "warn"; text: string; tagKey: string | null } | null>(() => {
  if (!isSceneFirst.value) return null;
  const first = imageRefs.value[0];
  if (!first || isSceneRef(first.key)) return null;
  if (imageRefs.value.some((r) => isSceneRef(r.key))) return null; // 有场景，发图时会自动排到图1
  const untagged = imageRefs.value.find((r) => !r.assetType);
  if (!untagged) return null; // 全是标好的角色 / 道具，本来就不需要场景
  return { level: "warn", text: `「${untagged.name}」没标类型。如果它是场景，标一下才会被排到图1。`, tagKey: untagged.key };
});
/** 发图时场景会排到图1，这里算出它实际占的编号，给参考条上做标记 */
const sceneSlotKey = computed(() => (isSceneFirst.value ? (imageRefs.value.find((r) => isSceneRef(r.key))?.key ?? null) : null));

// 参考顺序决定图1、图2…：直接改边的 sort
const reordering = ref(false);
async function applyRefOrder(keys: string[]): Promise<boolean> {
  const edges = ctx.refEdgesOf(props.dto.key);
  const ids = keys.map((key) => edges.find((e) => e.source === key)?.edgeId).filter((id): id is number => typeof id === "number");
  if (ids.length !== edges.length) return false;
  reordering.value = true;
  try {
    return (await ctx.reorderRefs(props.dto.key, ids)) === true;
  } finally {
    reordering.value = false;
  }
}
function moveRef(index: number, delta: number) {
  const keys = refs.value.map((r) => r.key);
  const to = index + delta;
  if (to < 0 || to >= keys.length || reordering.value) return;
  const next = [...keys];
  [next[index], next[to]] = [next[to], next[index]];
  void applyRefOrder(next);
}

const placeholder = computed(() => {
  if (isVideo.value) return "描述镜头内容与运动，输入 @ 引用连入的素材";
  if (preset.value?.hint) return preset.value.hint;
  return "描述画面内容，输入 @ 引用连入的素材";
});

const previewText = computed(() => {
  const body = preset.value?.body ?? "";
  const [w, h] = ratio.value.split(":").map(Number);
  const orientation = !w || !h || w === h ? "" : w > h ? "横向" : "竖向";
  return body
    .split("{{需求}}")
    .join(prompt.value.trim() || "（这里是你的输入）")
    .split("{{ratio}}")
    .join(ratio.value)
    .split("{{orientation}}")
    .join(orientation);
});
// 选了画风时，发出去的提示词末尾会追加一行风格词，预览里也带上
const styleLine = computed(() => (artStyle.value ? (ctx.artStyles?.value.find((s) => s.stylePath === artStyle.value)?.line ?? "") : ""));
const previewWithStyle = computed(() => (styleLine.value ? `${previewText.value.trim()}\n${styleLine.value}` : previewText.value));

/** 模板正文里有 {{需求}} 占位符时，不填就等于只把格式说明发给模型 */
const needsPrompt = computed(() => !preset.value || preset.value.body.includes("{{需求}}"));
const blockedReason = computed(() => {
  if (!model.value) return "请选择生成模型";
  if (!isVideo.value && preset.value?.requiresRef && !hasRefs.value) return `「${preset.value.name}」需要先把参考图连到这个节点`;
  // 需求为空时发出去的只有模板的排版要求，没有任何内容，出来的图必然不是想要的
  if (!prompt.value.trim() && needsPrompt.value) {
    return preset.value?.canPolish ? "先写一句要什么，或点「优化」让模型补全" : "先写一句要什么";
  }
  return "";
});
const blocked = computed(() => !!blockedReason.value);

// ─── 工作流能力与模板目标不匹配 ────────────────────────
// 编辑类工作流保留原图、输出尺寸跟随原图，排不出模板要的新版式
// （vendor-comfyui/README.md 里早就记过这一条，当时是角色多视图）
const EDIT_MODELS = ["krea2_edit"];
/** 只连 1 张参考时会退化成单图编辑（没传的 @imageN 被适配器移除） */
const DEGRADE_WITH_ONE_REF = ["krea2_dual", "krea2_multi"];
/** 不吃参考图，从零构图 */
const TEXT_ONLY_MODELS = ["krea2_t2i", "krea2_portrait"];
const layoutWarning = computed(() => {
  if (isVideo.value) return "";
  const picked = modelNameOf(model.value);
  const wants = modelNameOf(preset.value?.modelWithRef || preset.value?.modelNoRef || "");
  if (EDIT_MODELS.includes(picked) && TEXT_ONLY_MODELS.includes(wants)) {
    return `「${preset.value?.name}」要从零排出模板里的版式，而「改图」只在原图上修改、输出尺寸也跟着原图走，排不出来。把模型换回「${MODEL_LABEL[wants] ?? wants}」，参考图的内容改用文字写进需求里。`;
  }
  if (DEGRADE_WITH_ONE_REF.includes(picked) && imageRefs.value.length === 1) {
    return "只连 1 张参考时这个工作流会退化成改图（保留原图、尺寸跟随原图）。再连一张参考，或换成模板默认的模型。";
  }
  return "";
});

// ─── 动作 ────────────────────────────────────────────
const submitting = ref(false);
async function generate() {
  if (blocked.value) return;
  submitting.value = true;
  try {
    const projectId = ctx.projectId.value;
    if (isVideo.value) {
      const res = await canvasApi.generateVideo({
        projectId,
        target: props.dto.key,
        model: model.value,
        prompt: prompt.value,
        duration: duration.value,
        resolution: resolution.value,
        aspectRatio: ratio.value === "9:16" ? "9:16" : "16:9",
        audio: audio.value,
      });
      ctx.track(res.imageId);
      polishedBy.value = "";
      undoText.value = null;
      window.$message.success(`已开始生成，使用 ${res.usedRefs.length} 个参考素材`);
      return;
    }
    // 场景排图1 交给后端：它在内存里排序并同步重编号提示词里的 @图N。
    // 这里不能先持久化重排，否则后端看不出顺序变过，提示词就会和实际发出的图错位。
    const res = await canvasApi.generateImage({
      projectId,
      target: props.dto.key,
      model: model.value,
      size: size.value,
      aspectRatio: ratio.value,
      prompt: prompt.value,
      presetId: presetId.value,
      promptMode: presetId.value ? undefined : asset.value ? "template" : "raw",
    });
    ctx.track(res.imageId);
    if (res.steps?.length) window.$message.info(`已开始：${preset.value?.steps.join(" → ")}，全程自动完成，中间图可在历史里查看`);
  } catch (e) {
    window.$message.error(errorMessage(e, "生成失败"));
  } finally {
    submitting.value = false;
  }
}

const polishing = ref(false);
const undoText = ref<string | null>(null);
async function polish() {
  if (isVideo.value) return polishVideo();
  if (!preset.value) return;
  polishing.value = true;
  try {
    const res = await canvasApi.polishPreset({ projectId: ctx.projectId.value, presetId: preset.value.id, text: prompt.value, nodeKey: props.dto.key, artStyle: artStyle.value });
    undoText.value = prompt.value;
    prompt.value = res.text;
  } catch (e) {
    window.$message.error(errorMessage(e, "优化失败，请检查「通用 AI」文本模型配置"));
  } finally {
    polishing.value = false;
  }
}
function undoPolish() {
  if (undoText.value === null) return;
  prompt.value = undoText.value;
  undoText.value = null;
  polishedBy.value = "";
}

// ─── 视频：按模型绑定的官方模板优化，用户确认后再生成 ─────────────────
const polishedBy = ref(""); // 优化所用的规则文件名；用户改了文本也保留，生成后清空
async function polishVideo() {
  polishing.value = true;
  try {
    const res = await canvasApi.polishVideoPrompt({
      projectId: ctx.projectId.value,
      nodeKey: props.dto.key,
      model: model.value,
      text: prompt.value,
      duration: duration.value,
      aspectRatio: ratio.value === "9:16" ? "9:16" : "16:9",
    });
    undoText.value = prompt.value;
    prompt.value = res.text;
    polishedBy.value = res.rules.replace(/\.md$/, "");
  } catch (e) {
    window.$message.error(errorMessage(e, "优化失败，请检查「通用 AI」文本模型配置"));
  } finally {
    polishing.value = false;
  }
}
// 优化后换了模型或参考：编号 / 格式可能对不上了，撤掉「已确认」状态并提醒重新优化
watch([model, () => refs.value.map((r) => r.key).join(",")], () => {
  if (!polishedBy.value) return;
  polishedBy.value = "";
  window.$message.warning("模型或参考素材变了，优化结果里的参考编号可能对不上，建议重新优化");
});
// H3 多参考只认 <Picture N>：没按模板写时提醒先优化，否则人物容易丢
const isH3Reference = computed(() => isVideo.value && /^h3_ref2v/.test(modelNameOf(model.value)));
const h3Hint = computed(() => {
  if (!isH3Reference.value || !refs.value.some((r) => r.type === "image")) return "";
  if (/subject_definitions\s*:/i.test(prompt.value)) return "";
  return "H3 多参考要用 <Picture N> 把人物、场景和参考图一一绑定；直接写一句中文容易丢人物或换装，建议先写简短描述再点「优化」";
});
if (draft) {
  undoText.value = draft.undoText ?? null;
  polishedBy.value = draft.polishedBy ?? "";
}

// ─── 草稿：输入随时记下，关掉面板（点空白处取消选中）再打开时原样恢复 ─────────
const DRAFT_SAVE_DELAY = 400;
// 比例 / 画质 / 时长 / 分辨率只在用户自己动过时才进草稿。
// 无条件存的话，任何打开过的节点都会留下一份旧值，把项目默认和自动推导的时长盖掉。
const draftSnapshot = computed(() => ({
  prompt: prompt.value,
  undoText: undoText.value,
  polishedBy: polishedBy.value,
  presetId: presetTouched.value ? presetId.value : undefined,
  model: modelTouched.value ? model.value : undefined,
  ratio: paramsTouched.value ? ratio.value : undefined,
  size: paramsTouched.value ? size.value : undefined,
  duration: paramsTouched.value ? duration.value : undefined,
  resolution: paramsTouched.value ? resolution.value : undefined,
  audio: audio.value,
}));
let draftTimer: ReturnType<typeof setTimeout> | null = null;
let draftDirty = false;
function flushDraft() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = null;
  if (!draftDirty) return;
  draftDirty = false;
  saveDraft(ctx.projectId.value, props.dto.key, draftSnapshot.value);
}
watch(draftSnapshot, () => {
  draftDirty = true;
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(flushDraft, DRAFT_SAVE_DELAY);
});
onBeforeUnmount(flushDraft);
</script>

<style lang="scss" scoped>
// 宽度由底部操作行决定（至少 500px）：模型、比例、模板按钮多了就整体加宽，「生成」始终在最右边
.composer {
  width: max-content;
  min-width: 500px;
  max-width: calc(100vw - 32px);
  padding: 12px;
  border-radius: 14px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: default;
  // 其余内容不参与撑宽，只铺满操作行定下的宽度（不然输入长文本时面板会跟着变宽）
  > :not(.controls) {
    width: 0;
    min-width: 100%;
  }
}
.auto-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 14px;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary);
  font-size: 12px;
  cursor: pointer;
  b {
    color: var(--td-text-color-primary);
    font-weight: 600;
  }
  span {
    color: var(--td-text-color-placeholder);
    font-variant-numeric: tabular-nums;
  }
  &:hover {
    border-color: var(--td-brand-color);
    color: var(--td-brand-color);
  }
}
.ref-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.ref-label {
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
.ref-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 2px;
  border-radius: 6px;
  background: var(--td-bg-color-secondarycontainer);
  font-size: 11px;
  img {
    width: 20px;
    height: 20px;
    object-fit: cover;
    border-radius: 4px;
  }
}
.peek {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 150px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  em {
    color: var(--td-text-color-placeholder);
    font-style: normal;
    font-variant-numeric: tabular-nums;
  }
  .ref-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  &:disabled {
    cursor: default;
    .ref-name {
      color: var(--td-text-color-placeholder);
      text-decoration: line-through dotted;
    }
  }
  &:not(:disabled):hover .ref-name {
    color: var(--td-brand-color);
  }
}
.type-dot {
  width: 6px;
  height: 6px;
  margin-left: 2px;
  border-radius: 50%;
  background: var(--td-brand-color);
  &.scene {
    background: var(--td-success-color);
  }
  &.tool {
    background: var(--td-warning-color);
  }
}
.ref-chip.scene {
  box-shadow: inset 0 0 0 1px var(--td-success-color);
}
.ref-add {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border: 1px dashed var(--td-component-stroke);
  border-radius: 6px;
  background: transparent;
  color: var(--td-text-color-placeholder);
  font-size: 11px;
  cursor: pointer;
  &:hover {
    border-color: var(--td-brand-color);
    color: var(--td-brand-color);
  }
}
.drop {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
  &:hover {
    background: var(--td-error-color-light);
    color: var(--td-error-color);
  }
}
.move {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
  &:hover {
    background: var(--td-bg-color-container-hover);
    color: var(--td-brand-color);
  }
}
.scene-first {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--td-warning-color);
  .link {
    margin-left: 4px;
  }
}
.prompt {
  min-height: 72px;
  max-height: 180px;
  overflow: auto;
  &.tall {
    max-height: 300px;
  }
}
.polished,
.h3-hint {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  font-size: 11px;
  line-height: 1.5;
  svg,
  :deep(.i-icon) {
    flex: none;
    margin-top: 2px;
  }
}
.polished {
  padding: 6px 8px;
  border-radius: 8px;
  color: var(--td-success-color);
  background: color-mix(in srgb, var(--td-success-color) 10%, transparent);
}
.h3-hint {
  color: var(--td-text-color-secondary);
}
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  // 镜头台的面板只有 400px，放不下一行时换行，别把「优化 / 生成」挤出去
  flex-wrap: wrap;
  > * {
    flex: none;
  }
  > .grow {
    flex: 1;
    min-width: 0;
  }
}
.model {
  width: 150px;
}
.sub-actions {
  display: flex;
  gap: 12px;
  margin-top: -2px;
}
.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--td-brand-color);
  font-size: 11px;
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
}
.preview {
  width: 520px;
  max-height: 360px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
}
.warning {
  font-size: 11px;
  color: var(--td-warning-color);
}
.mode-toggle {
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px dashed var(--td-component-stroke);
  background: transparent;
  color: var(--td-text-color-secondary);
  font-size: 11px;
  cursor: pointer;
  &.raw {
    border-style: solid;
    color: var(--td-warning-color);
    border-color: var(--td-warning-color);
  }
}
.blocked {
  font-size: 11px;
  color: var(--td-warning-color);
}
</style>
