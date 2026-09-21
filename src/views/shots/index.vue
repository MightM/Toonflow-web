<template>
  <div class="shots-page">
    <header class="topbar">
      <button class="icon-btn" aria-label="返回" @click="router.back()"><i-left size="18" /></button>
      <div class="title">镜头台</div>
      <t-select v-model="episode" size="small" class="episode" :options="episodeOptions" placeholder="选择集数" borderless @change="onEpisodeChange" />
      <div class="grow" />
      <span class="progress">已出图 {{ shots.done.value }} / {{ shots.shots.value.length }}</span>
      <t-button size="small" variant="outline" @click="openEditor">
        <template #icon><i-film size="14" /></template>
        剪辑台
      </t-button>
    </header>

    <main class="body">
      <section class="stage">
        <div v-if="!current" class="stage-empty">{{ shots.loading.value ? "读取中…" : "这一集还没有分镜" }}</div>
        <template v-else>
          <!-- 预览跟着右侧页签走：出完图直接在同一块地方看成片，不满意再切回「分镜图」重出 -->
          <div class="stage-frame">
            <span class="stage-badge">
              镜头 {{ current.index + 1 }} · {{ current.duration }}s<i v-if="current.track">（{{ current.track }}）</i>
            </span>
            <template v-if="tab === 'video'">
              <video
                v-if="stageVideo?.src"
                ref="player"
                :key="stageVideo.id"
                :src="stageVideo.src"
                controls
                playsinline
                preload="auto"
                @loadeddata="onVideoReady"
                @ended="onVideoEnded" />
              <t-loading v-else-if="trackOfCurrent?.pendingImageIds.length" size="large" text="出片中…" />
              <div v-else class="stage-blank">
                <p>{{ trackOfCurrent ? "这一段还没有视频" : "这一镜还没有归到片段里" }}</p>
                <p v-if="stageVideoError" class="reason">{{ stageVideoError }}</p>
              </div>
            </template>
            <template v-else>
              <t-loading v-if="current.pendingImageIds.length" size="large" text="生成中…" />
              <!-- 选了别的版本就看那一版，没选看当前版 -->
              <img v-else-if="stageShotSrc" :src="stageShotSrc" :alt="`镜头 ${current.index + 1}`" />
              <div v-else class="stage-blank">
                <p>{{ current.state === "生成失败" ? "上一次生成失败" : "这一镜还没出图" }}</p>
                <p v-if="current.reason" class="reason">{{ current.reason }}</p>
              </div>
            </template>
          </div>

          <!-- 分镜图的版本：和视频那条一样，直接在预览下面切，不用开历史抽屉 -->
          <div v-if="tab !== 'video' && shotTakes.length > 1" class="take-strip">
            <button
              v-for="(t, i) in shotTakes"
              :key="t.imageId"
              class="take"
              :class="{ active: t.imageId === stageShot?.imageId, chosen: t.isCurrent }"
              @click="pickShotTake(t)">
              第 {{ i + 1 }} 版
              <i v-if="t.isCurrent">已选用</i>
              <em v-else-if="!t.src">{{ t.state === "生成中" ? "生成中" : "失败" }}</em>
            </button>
            <t-button v-if="stageShot?.src && !stageShot.isCurrent" size="small" variant="text" :loading="pickingShot" @click="useShotTake(stageShot)">
              选用这一版
            </t-button>
          </div>

          <div v-if="tab === 'video' && trackOfCurrent" class="take-strip">
            <button
              v-for="(v, i) in trackOfCurrent.videos"
              :key="v.id"
              class="take"
              :class="{ active: v.id === stageVideo?.id, chosen: v.id === trackOfCurrent.videoId }"
              @click="pickTake(v)">
              第 {{ i + 1 }} 版
              <i v-if="v.id === trackOfCurrent.videoId">已选用</i>
              <em v-else-if="!v.src">{{ v.state === "生成中" ? "生成中" : "失败" }}</em>
            </button>
            <t-button v-if="stageVideo?.src && stageVideo.id !== trackOfCurrent.videoId" size="small" variant="text" @click="useVideo(stageVideo)">
              选用这一版
            </t-button>
            <div class="grow" />
            <t-button v-if="playQueue.length > 1" size="small" :variant="playingAll ? 'base' : 'outline'" @click="playingAll ? stopPlayAll() : playAll()">
              <template #icon><i-play size="14" /></template>
              {{ playingAll ? "停止连播" : `连播 ${playQueue.length} 条` }}
            </t-button>
          </div>

        </template>
      </section>

      <aside class="panel">
        <t-tabs v-model="tab" class="panel-tabs">
          <t-tab-panel value="desc" label="分镜描述" />
          <t-tab-panel value="image" label="分镜图" />
          <t-tab-panel value="video" label="视频" />
        </t-tabs>
        <!-- 分镜描述（分镜表写的这一镜）：分镜图与视频提示词都从它推出来，所以放在第一页可直接改 -->
        <div v-if="tab === 'desc'" class="panel-body">
          <template v-if="current">
            <div class="desc-scroll">
              <p class="desc-hint">画面描述、场景、关联资产、时长、景别、运镜、动作、情绪、光影、台词、音效，按顿号分隔。</p>
              <t-textarea v-model="descDraft" class="desc-input" placeholder="画面描述、场景、…" :autosize="false" @blur="saveDesc" />
              <RefBoard :refs="shots.refsOf(current.key)" @add="openRefPicker(current.key, $event)" @remove="shots.removeRef(current.key, $event)" />
            </div>
            <div class="desc-actions">
              <t-button size="small" variant="outline" :disabled="!descDirty" @click="saveDesc">保存</t-button>
              <div class="grow" />
              <t-tooltip content="结合本集剧本、这一镜的分镜描述和已连入的角色 / 场景 / 道具，推出绘图提示词，覆盖「分镜图」页里的内容">
                <t-button size="small" theme="primary" variant="outline" :loading="inferring" @click="inferShotPrompt">
                  <template #icon><i-magic-wand size="14" /></template>
                  推理绘图提示词
                </t-button>
              </t-tooltip>
            </div>
          </template>
          <p v-else class="hint">选中一个镜头后可以在这里改分镜信息。</p>
        </div>
        <div v-else-if="tab === 'image'" class="panel-body">
          <NodeComposer v-if="ready && composerDto" :key="`${composerDto.key}#${composerSeq}`" :dto="composerDto" />
          <div class="panel-foot">
            <t-button size="small" variant="text" :disabled="!current" @click="openShotHistory">
              <template #icon><i-history size="14" /></template>
              历史版本
            </t-button>
          </div>
        </div>
        <div v-else class="panel-body">
          <template v-if="ready && videoDto && trackOfCurrent">
            <!-- 素材只有一份列表：就是下面 NodeComposer 的参考条。
                 这里只说明它的来源和音色，免得同一批东西在一页上摆两遍。
                 镜号与时长顶部大图的角标已经有了，不再重复 -->
            <p class="refs-note">
              <span v-if="trackOfCurrent.derived">参考自动跟随「分镜描述」页的素材板，改那边这里就变</span>
              <span v-else class="manual">参考已手动调整，不再跟随素材板</span>
              <button v-if="!trackOfCurrent.derived" class="link" @click="resetTrackRefs">重置为自动</button>
              <span v-if="trackOfCurrent.voices.length" class="voices">
                · 对白音色：{{ trackOfCurrent.voices.map((v) => v.name).join("、") }}
              </span>
              <span v-if="clampedDuration" class="manual">· 这一段 {{ trackOfCurrent.duration }}s 低于模型下限，实际出片 {{ clampedDuration }}s</span>
            </p>
            <NodeComposer :key="videoDto.key" :dto="videoDto" />
            <div class="panel-foot">
              <t-button size="small" variant="text" @click="openTrackHistory">
                <template #icon><i-history size="14" /></template>
                视频历史
              </t-button>
            </div>
          </template>
          <p v-else class="hint">{{ ready ? "这一镜还没有归到片段里。" : "读取中…" }}</p>
        </div>
      </aside>
    </main>

    <Filmstrip
      :shots="shots.shots.value"
      :tracks="shots.tracks.value"
      :selected-key="shots.selectedKey.value"
      :done="shots.done.value"
      :batching="batching"
      ref="filmstrip"
      @select="shots.select"
      @batch="batchGenerate"
      @segment="setSegment"
      @remove="removeShots" />

    <!-- 浮层统一放在这里：它们会渲染一个占位元素，留在 flex 流里会把中间区域挤没 -->
    <div class="overlays">
      <RefPicker
        v-model:visible="pickerVisible"
        v-model:group="pickerGroup"
        :pool="shots.pool.value"
        :used-keys="usedRefKeys"
        :self-key="pickerTarget"
        :project-id="projectId"
        @pick="onPickRef" />
      <HistoryDrawer v-model:visible="historyVisible" :target="historyTarget ?? shots.selectedKey.value" @preview="openPreview" />
      <t-image-viewer v-model:visible="previewVisible" :images="previewImages" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { DialogPlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import { canvasApi, errorMessage } from "../canvas/api";
import { CANVAS_CTX, type CanvasContext } from "../canvas/context";
import { getDraft, saveDraft } from "../canvas/composerDrafts";
import type { CanvasEdgeDto, CanvasNodeDto, HistoryItem, MediaNodeDto } from "../canvas/types";
import NodeComposer from "../canvas/components/NodeComposer.vue";
import HistoryDrawer from "../canvas/components/HistoryDrawer.vue";
import Filmstrip from "./components/Filmstrip.vue";
import RefPicker from "./components/RefPicker.vue";
import RefBoard from "./components/RefBoard.vue";
import { shotsApi } from "./api";
import { useShots } from "./useShots";
import type { PoolItem, ShotDto, TrackVideoDto } from "./types";

const route = useRoute();
const router = useRouter();
const { project } = storeToRefs(projectStore());
const projectId = computed(() => Number(project.value?.id ?? 0));
const scriptId = ref<number | null>(route.query.scriptId ? Number(route.query.scriptId) : null);
// 从生产页点某一镜进来时带上 ?shot=<id>，首次加载后定位过去
const initialShotId = route.query.shot ? Number(route.query.shot) : null;

const shots = useShots(projectId, scriptId);
const current = shots.current;
const trackOfCurrent = computed(() => shots.trackOf(current.value));
const tab = ref<"desc" | "image" | "video">("image");
// 首次加载完成前不渲染输入面板：面板在 setup 时就把默认值定下来了，
// 数据还没到就挂载会读到空的片段参数（模型回落成项目默认）
const ready = ref(false);
// 每个镜头上次用过的模板，只存在本地
const lastPreset = ref<Record<string, string>>(JSON.parse(localStorage.getItem("toonflow.shots.presets") || "{}"));

// ─── 把镜头包成画布节点，直接复用 NodeComposer / HistoryDrawer ──────────────
// 镜头的节点 key 是 s:<id>，后端 /api/canvas/* 已经认这种 key，所以输入面板、
// 目标模板、优化、模型 mode 校验、场景排图1 全部白拿，行为与资产画布一致。
const asNode = (shot: ShotDto): MediaNodeDto => ({
  key: shot.key,
  id: shot.id,
  kind: "image",
  name: `镜头 ${shot.index + 1}`,
  prompt: shot.prompt,
  current: shot.current,
  latest: shot.latest,
  pendingImageIds: shot.pendingImageIds,
  params: {},
  assetType: null,
  // 模型按参考形状自动选（后端 lib/modelLadder.ts），面板上只给一行结论
  auto: shot.auto,
});
const poolAsNode = (item: PoolItem): MediaNodeDto => ({
  key: item.key,
  id: Number(item.key.split(":")[1] ?? 0),
  kind: item.kind,
  name: item.name,
  prompt: null,
  current: item.src ? { imageId: 0, state: "已完成", stage: null, kind: item.kind, aspectRatio: null, errorReason: null, src: item.src } : null,
  latest: null,
  pendingImageIds: [],
  params: {},
  assetType: item.assetType,
});

const composerDto = computed(() => (current.value ? asNode(current.value) : null));

// 视频面板作用在「这一镜所属的片段」上（默认一镜一段）。
// 同样包成画布视频节点，NodeComposer 就给出模型、时长/分辨率/音频、@引用、按官方模板优化。
const videoDto = computed<MediaNodeDto | null>(() => {
  const track = trackOfCurrent.value;
  if (!track) return null;
  const chosen = track.videos.find((v) => v.id === track.videoId);
  return {
    key: track.key,
    id: track.id,
    kind: "video",
    name: `片段（${track.shotIds.length} 镜）`,
    prompt: track.prompt,
    current: chosen?.src ? { imageId: chosen.imageId ?? 0, state: "已完成", stage: null, kind: "video", aspectRatio: null, errorReason: null, src: chosen.src } : null,
    latest: null,
    pendingImageIds: track.pendingImageIds,
    params: { ...track.params, model: track.model ?? track.params.model },
    assetType: null,
    auto: track.auto,
    // 时长在分镜表里就定了（片段 = 组内各镜时长之和），不让用户再选一次；
    // 低于模型下限时 loadVideoOptions 会夹上去，面板上另有提示
    lockedDuration: track.duration ?? null,
  };
});
/** 分镜时长低于模型下限（H3 是 3 秒）时会被抬上去，得让用户知道 */
const clampedDuration = computed(() => {
  const d = trackOfCurrent.value?.duration ?? 0;
  return d > 0 && d < 3 ? 3 : null;
});

async function resetTrackRefs() {
  const track = trackOfCurrent.value;
  if (!track) return;
  try {
    await shotsApi.trackRefs({ projectId: projectId.value, trackId: track.id, action: "reset" });
    await shots.load();
    window.$message.success("已回到自动跟随各镜素材板");
  } catch (e) {
    window.$message.error(errorMessage(e, "操作失败"));
  }
}


// ─── 预览区的视频 ────────────────────────────────────
// 默认放这一段「已选用」的那条；点版本条可以临时看别的版本，换镜头后回到已选用
const player = ref<HTMLVideoElement | null>(null);
const stageTakeId = ref<number | null>(null);
const stageVideo = computed<TrackVideoDto | null>(() => {
  const list = trackOfCurrent.value?.videos ?? [];
  const picked = list.find((v) => v.id === stageTakeId.value);
  if (picked) return picked;
  return list.find((v) => v.id === trackOfCurrent.value?.videoId && v.src) ?? list.findLast((v) => v.src) ?? null;
});
const stageVideoError = computed(() => (trackOfCurrent.value?.videos ?? []).findLast((v) => v.errorReason)?.errorReason ?? null);
function pickTake(video: TrackVideoDto) {
  stopPlayAll();
  stageTakeId.value = video.id;
}
watch([() => trackOfCurrent.value?.key, tab], () => (stageTakeId.value = null));

// ─── 预览区的分镜图版本 ──────────────────────────────
// 和视频那条同一套交互。版本列表不放进 getShots（65 个镜头全带上太重），
// 只在选中的这一镜上按需拉一次。
const shotTakes = ref<HistoryItem[]>([]);
const shotTakeId = ref<number | null>(null);
const pickingShot = ref(false);
const stageShot = computed(() => shotTakes.value.find((t) => t.imageId === shotTakeId.value) ?? shotTakes.value.find((t) => t.isCurrent) ?? null);
/** 顶部大图：选了别的版本就看那一版（用缩略图源），否则用当前版的原图 */
const stageShotSrc = computed(() => (stageShot.value && !stageShot.value.isCurrent ? stageShot.value.src : (current.value?.current?.full ?? null)));

async function loadShotTakes() {
  const shot = current.value;
  if (!shot || tab.value === "video") return (shotTakes.value = []);
  try {
    const res = await canvasApi.listHistory({ projectId: projectId.value, target: shot.key, kind: "image", page: 1, limit: 30 });
    shotTakes.value = res.list;
  } catch {
    shotTakes.value = []; // 拉不到版本不该挡住出图，安静降级成只有当前版
  }
}
function pickShotTake(take: HistoryItem) {
  shotTakeId.value = take.imageId;
}
async function useShotTake(take: HistoryItem) {
  const shot = current.value;
  if (!shot) return;
  pickingShot.value = true;
  try {
    await canvasApi.setCurrentVersion(projectId.value, shot.key, take.imageId);
    await shots.load();
    await loadShotTakes();
    shotTakeId.value = null;
    window.$message.success("已选用这一版");
  } catch (e) {
    window.$message.error(errorMessage(e, "选用失败"));
  } finally {
    pickingShot.value = false;
  }
}
// 换镜头、换页签、或这一镜出了新图（pendingImageIds 变空）都要重新拉
watch(
  [() => current.value?.key, tab, () => current.value?.current?.imageId, () => current.value?.pendingImageIds.length],
  () => {
    shotTakeId.value = null;
    void loadShotTakes();
  },
  { immediate: true },
);

// ─── 连播：按胶片条顺序把各片段选用的那条挨个放完 ──────
// 一个片段可能跨好几镜，所以按片段去重，每段只播一条
const playQueue = computed(() => {
  const out: { shotKey: string; trackId: number }[] = [];
  const seen = new Set<number>();
  for (const shot of shots.shots.value) {
    const track = shots.trackOf(shot);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    if (track.videos.some((v) => v.id === track.videoId && v.src)) out.push({ shotKey: shot.key, trackId: track.id });
  }
  return out;
});
const playingAll = ref(false);
function playAll() {
  if (!playQueue.value.length) return;
  stageTakeId.value = null;
  playingAll.value = true;
  // 当前这一段没有可播的视频时，从队首开始
  if (!playQueue.value.some((q) => q.trackId === trackOfCurrent.value?.id)) shots.select(playQueue.value[0]!.shotKey);
  else void player.value?.play().catch(() => stopPlayAll());
}
function stopPlayAll() {
  playingAll.value = false;
}
function onVideoReady() {
  if (playingAll.value) void player.value?.play().catch(() => stopPlayAll());
}
function onVideoEnded() {
  if (!playingAll.value) return;
  const i = playQueue.value.findIndex((q) => q.trackId === trackOfCurrent.value?.id);
  const next = i >= 0 ? playQueue.value[i + 1] : null;
  if (!next) return stopPlayAll();
  stageTakeId.value = null;
  shots.select(next.shotKey);
}

async function useVideo(video: TrackVideoDto) {
  const track = trackOfCurrent.value;
  if (!track) return;
  try {
    if (video.imageId) await canvasApi.setCurrentVersion(projectId.value, track.key, video.imageId);
    else await shotsApi.selectLegacyVideo(track.id, video.id);
    await shots.load();
    window.$message.success("已选用这条视频");
  } catch (e) {
    window.$message.error(errorMessage(e, "选用失败"));
  }
}
function openTrackHistory() {
  historyTarget.value = trackOfCurrent.value?.key ?? null;
  historyVisible.value = true;
}
const dtoByKey = computed(() => {
  const map = new Map<string, CanvasNodeDto>();
  for (const item of shots.pool.value) map.set(item.key, poolAsNode(item));
  for (const shot of shots.shots.value) map.set(shot.key, asNode(shot)); // 镜头覆盖素材池里的同 key 条目
  return map;
});

const refEdgesOf = (key: string): CanvasEdgeDto[] =>
  shots.refsOf(key).map((r) => ({ id: `ref-${r.edgeId}`, edgeId: r.edgeId, source: r.key, target: key, kind: "ref", sort: r.sort }));

const pickerVisible = ref(false);
const pickerTarget = ref<string | null>(null);
const pickerGroup = ref<string | null>(null);
const usedRefKeys = computed(() => new Set((pickerTarget.value ? shots.refsOf(pickerTarget.value) : []).map((r) => r.key)));
/** group 由素材板某一组的「添加」带进来，选择器只列那一组 */
function openRefPicker(targetKey: string, group: string | null = null) {
  pickerTarget.value = targetKey;
  pickerGroup.value = group;
  pickerVisible.value = true;
}
function onPickRef(sourceKey: string) {
  if (pickerTarget.value) void shots.addRef(pickerTarget.value, sourceKey);
}

const ctx: CanvasContext = {
  projectId,
  defaults: computed(() =>
    shots.defaults.value
      ? {
          imageModel: shots.defaults.value.imageModel,
          imageQuality: shots.defaults.value.imageQuality,
          videoModel: shots.defaults.value.videoModel,
          videoRatio: shots.defaults.value.videoRatio,
          // 镜头不走资产模型绑定，模板与项目默认模型已经够用
          assetModels: {} as never,
        }
      : null,
  ),
  // 只放适用于镜头的模板（canvas_presets 里 targets 含 shot 的那些）；
  // 「人物四视图」「场景三视图」之类是资产用的，别出现在镜头面板里
  presets: computed(() => shots.presets.value.filter((p) => p.targets.includes("shot"))),
  lastPresetOf: (key) => lastPreset.value[key],
  // 镜头默认走「分镜图」模板（有优化）；连了别的镜头图时默认「换个角度」
  defaultPresetFor: (key, hasRefs) => {
    if (!key.startsWith("s:")) return null;
    const refs = shots.refsOf(key);
    return hasRefs && refs.some((r) => r.key.startsWith("s:")) ? "shot_variant" : "shot";
  },
  dtoByKey,
  refEdgesOf,
  reorderRefs: (targetKey, edgeIds) => shots.reorderRefs(targetKey, edgeIds),
  removeRef: (targetKey, sourceKey) => shots.removeRef(targetKey, sourceKey),
  openRefPicker,
  // 这里的「优化」其实是按剧本 + 画面描述 + 参考推提示词，所以另给文案
  polishLabel: (isVideo) => (isVideo ? "推理提示词" : "重新推理提示词"),
  selectedCount: computed(() => 1),
  renameNode: async () => window.$message.info("镜头的名字跟着序号走，不能改"),
  setAssetType: async () => window.$message.info("镜头没有类型标签，请给参考素材本身打标签"),
  track: shots.track,
  refresh: () => shots.load(),
  openCreateState: () => {},
  openHistory: () => openShotHistory(),
  openVoice: () => {},
  openSaveToAssets: () => {},
  openPreview,
  uploadTo: () => {},
  deleteNode: () => {},
};
provide(CANVAS_CTX, ctx);

// ─── 历史 / 预览 ─────────────────────────────────────
const historyVisible = ref(false);
const historyTarget = ref<string | null>(null);
const previewVisible = ref(false);
const previewImages = ref<string[]>([]);
function openShotHistory() {
  historyTarget.value = null;
  historyVisible.value = true;
}
function openPreview(src: string) {
  previewImages.value = [src];
  previewVisible.value = true;
}

// ─── 批量生成 ────────────────────────────────────────
const batching = ref(false);
async function batchGenerate(ids: number[]) {
  if (!scriptId.value || !ids.length) return;
  batching.value = true;
  try {
    const rows = await shotsApi.batchGenerateImage({ projectId: projectId.value, scriptId: scriptId.value, storyboardIds: ids, compulsory: true });
    for (const row of rows) if (row.imageId) shots.track(row.imageId);
    window.$message.success(`已开始生成 ${rows.filter((r) => r.imageId).length} 张`);
    await shots.load();
  } catch (e) {
    window.$message.error(errorMessage(e, "批量生成失败"));
  } finally {
    batching.value = false;
  }
}

// ─── 画面描述（第一个页签）───────────────────────────
const descDraft = ref("");
const descDirty = computed(() => descDraft.value !== (current.value?.videoDesc ?? ""));
watch(current, (shot) => (descDraft.value = shot?.videoDesc ?? ""), { immediate: true });
async function saveDesc() {
  if (!current.value || !descDirty.value) return;
  try {
    await shotsApi.editShot({ id: current.value.id, prompt: current.value.prompt ?? "", videoDesc: descDraft.value });
    await shots.load();
  } catch (e) {
    window.$message.error(errorMessage(e, "保存失败"));
  }
}

// 从剧本 + 分镜描述 + 已连入的参考推出绘图提示词，盖掉「分镜图」页里原有的内容。
// NodeComposer 的输入由它自己持有（还带本地草稿），所以外部改提示词要写进草稿再重挂一次。
const inferring = ref(false);
const composerSeq = ref(0);
/**
 * 把推出来的提示词塞进输入面板：NodeComposer 自己持有 prompt，只能走草稿再重挂。
 * 这里**不写**比例 / 画质 / 时长——以前硬写成 16:9 / 1K / 5s，会把项目设置
 * （这个项目是 9:16）和分镜表算出的片段时长盖掉，而且只要推理过一次就永久留在草稿里。
 */
function applyPrompt(key: string, text: string) {
  const draft = getDraft(projectId.value, key);
  saveDraft(projectId.value, key, {
    ...draft,
    audio: draft?.audio ?? false,
    prompt: text,
    undoText: draft?.prompt ?? current.value?.prompt ?? null, // 还能点「撤销」退回去
    polishedBy: "",
  });
  composerSeq.value += 1;
}
async function inferShotPrompt() {
  const shot = current.value;
  if (!shot) return;
  inferring.value = true;
  try {
    await saveDesc(); // 推理读的是库里的画面描述，没保存的改动先落盘
    const res = await canvasApi.polishPreset({ projectId: projectId.value, presetId: "shot", text: "", nodeKey: shot.key });
    applyPrompt(shot.key, res.text);
    tab.value = "image";
    window.$message.success("已推出绘图提示词，检查后点「生成」");
  } catch (e) {
    window.$message.error(errorMessage(e, "推理失败，请检查「通用 AI」文本模型配置"));
  } finally {
    inferring.value = false;
  }
}

// ─── 删除镜头 ────────────────────────────────────────
function removeShots(ids: number[]) {
  const dialog = DialogPlugin.confirm({
    header: "删除镜头",
    body: `确定删除选中的 ${ids.length} 个镜头？它们的分镜图版本和参考连线会一并清掉，不能撤销。`,
    theme: "warning",
    onConfirm: async () => {
      try {
        await shotsApi.removeShots(projectId.value, ids);
        filmstrip.value?.clearSelection();
        await shots.load(false);
        window.$message.success(`已删除 ${ids.length} 个镜头`);
      } catch (e) {
        window.$message.error(errorMessage(e, "删除失败"));
      }
      dialog.destroy();
    },
  });
}

// ─── 片段（多镜合一）────────────────────────────────
const filmstrip = ref<{ clearSelection: () => void } | null>(null);
async function setSegment(action: "merge" | "split", shotIds: number[]) {
  if (!scriptId.value || !shotIds.length) return;
  try {
    await shotsApi.setSegment({ projectId: projectId.value, scriptId: scriptId.value, action, shotIds });
    filmstrip.value?.clearSelection();
    await shots.load();
    window.$message.success(action === "merge" ? `已合并成一个片段（${shotIds.length} 镜）` : "已拆成一镜一段");
  } catch (e) {
    window.$message.error(errorMessage(e, action === "merge" ? "合并失败" : "拆开失败"));
  }
}

// ─── 集数 ───────────────────────────────────────────
const episode = ref<number | undefined>(scriptId.value ?? undefined);
const episodeOptions = ref<{ label: string; value: number }[]>([]);
async function loadEpisodes() {
  if (!projectId.value) return;
  try {
    const { data } = await axios.post("/script/getScrptApi", { projectId: projectId.value, name: "" });
    episodeOptions.value = (data ?? []).map((ep: { id: number; name: string }) => ({ label: ep.name, value: ep.id }));
    if (!episode.value && episodeOptions.value.length) {
      episode.value = episodeOptions.value[0].value;
      onEpisodeChange(episode.value);
    }
  } catch {
    episodeOptions.value = [];
  }
}
function onEpisodeChange(value: number) {
  ready.value = false;
  scriptId.value = value;
  void router.replace({ query: { ...route.query, scriptId: String(value) } });
  void shots.load(false).then(() => (ready.value = true));
}

function openEditor() {
  const query = new URLSearchParams({ projectId: String(projectId.value), scriptId: String(scriptId.value ?? "") });
  window.open(`${location.origin}${location.pathname}#/editor?${query}`, "_blank");
}

// ─── 快捷键：左右翻镜 ────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
  if (target?.isContentEditable) return;
  if (e.key === "ArrowLeft") shots.step(-1);
  if (e.key === "ArrowRight") shots.step(1);
}
onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  void loadEpisodes();
  void shots.loadPresets();
  void shots.load(false).then(() => {
    const target = initialShotId ? shots.shots.value.find((s) => s.id === initialShotId) : null;
    if (target) shots.select(target.key);
    ready.value = true;
  });
});
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
watch(projectId, () => {
  ready.value = false;
  void loadEpisodes();
  void shots.loadPresets();
  void shots.load(false).then(() => (ready.value = true));
});
</script>

<style lang="scss" scoped>
.shots-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--td-bg-color-page);
}
.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container);
}
.icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: var(--td-bg-color-secondarycontainer);
  color: inherit;
  cursor: pointer;
  &:hover {
    background: var(--td-bg-color-container-hover);
  }
}
.title {
  font-size: 14px;
  font-weight: 600;
}
.episode {
  width: 180px;
}
.grow {
  flex: 1;
}
.progress {
  color: var(--td-text-color-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 12px 16px;
}
.stage-empty {
  margin: auto;
  color: var(--td-text-color-placeholder);
}
.stage-frame {
  position: relative;
  display: grid;
  place-items: center;
  flex: 1;
  width: 100%;
  min-height: 0;
  border-radius: 10px;
  background: var(--td-bg-color-secondarycontainer);
  overflow: hidden;
  // 绝对定位 + contain：grid 子项的 max-height:100% 会和自动行高循环依赖，撑不住竖图
  img,
  video {
    position: absolute;
    inset: 8px;
    width: calc(100% - 16px);
    height: calc(100% - 16px);
    object-fit: contain;
  }
  video {
    background: #000;
  }
}
// 镜号压在画面左上角，不再单占一行（翻镜用下面的胶片条或左右方向键）
.stage-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 1;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  i {
    font-style: normal;
    opacity: 0.75;
  }
}
.take-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.take {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 6px;
  background: transparent;
  color: var(--td-text-color-secondary);
  font-size: 12px;
  cursor: pointer;
  &.active {
    border-color: var(--td-brand-color);
    color: var(--td-text-color-primary);
  }
  i {
    color: var(--td-brand-color);
    font-style: normal;
    font-size: 11px;
  }
  em {
    color: var(--td-text-color-placeholder);
    font-style: normal;
    font-size: 11px;
  }
}
.stage-blank {
  text-align: center;
  color: var(--td-text-color-placeholder);
  font-size: 13px;
  .reason {
    margin-top: 6px;
    color: var(--td-error-color);
    font-size: 12px;
  }
}
.desc-hint {
  margin: 0 0 8px;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  line-height: 1.6;
}
// 描述和素材板一起滚，操作行钉在底部
.desc-scroll {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.desc-input {
  flex: none;
  :deep(textarea) {
    height: 160px;
    resize: vertical;
    line-height: 1.9;
  }
}
.desc-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
}
.panel {
  display: flex;
  flex-direction: column;
  width: 420px;
  min-width: 420px;
  border-left: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container);
}
.panel-tabs {
  flex: 0 0 auto;
}
// 面板整体不滚动：让输入面板撑满可用高度，超长的提示词在编辑框里自己滚
.panel-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
  .hint {
    line-height: 1.7;
  }
}
.refs-note {
  margin: 0 0 8px;
  color: var(--td-text-color-placeholder);
  font-size: 11px;
  line-height: 1.7;
  .manual {
    color: var(--td-warning-color);
  }
  .voices {
    color: var(--td-text-color-secondary);
  }
  .link {
    margin-left: 6px;
    border: none;
    background: none;
    color: var(--td-brand-color);
    font-size: 11px;
    cursor: pointer;
  }
}
.overlays {
  position: fixed;
  // 弹窗渲染在这个容器里，不是挂到 body 上。胶片条的复选框是 position:absolute + z-index:1，
  // 而它的祖先都没建层叠上下文，等于直接跑到根层级；这里不给 z-index（auto = 0）就会被它压住。
  z-index: 3000;
  width: 0;
  height: 0;
}
// NodeComposer 在画布上是固定 500px 的浮动面板；侧栏里让它跟随宽度、并吃满剩余高度
.panel-body :deep(.composer) {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  // 画布上提示词框是固定 180px 的小格子，这里让它占满参考条与操作行之外的全部高度
  .prompt {
    flex: 1;
    min-height: 120px;
    max-height: none;
  }
}
.panel-foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}
</style>
