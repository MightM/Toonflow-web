import type { Ref } from "vue";
import { canvasApi, errorMessage } from "../canvas/api";
import type { CanvasPreset } from "../canvas/types";
import { shotsApi } from "./api";
import type { PoolItem, ShotDto, ShotsData, TrackDto } from "./types";

const POLL_INTERVAL = 3000;

/**
 * 镜头台的数据层：读整集、跟踪生成中的版本、改参考。
 * 生成与版本接口复用 canvasApi（镜头的节点 key 是 s:<id>），所以这里只管状态与刷新。
 */
export function useShots(projectId: Ref<number>, scriptId: Ref<number | null>) {
  const loading = ref(false);
  const shots = ref<ShotDto[]>([]);
  const tracks = ref<TrackDto[]>([]);
  const pool = ref<PoolItem[]>([]);
  const defaults = ref<ShotsData["defaults"] | null>(null);
  const presets = ref<CanvasPreset[]>([]);
  const selectedKey = ref<string | null>(null);

  const shotByKey = computed(() => new Map(shots.value.map((s) => [s.key, s])));
  const trackByKey = computed(() => new Map(tracks.value.map((t) => [t.key, t])));
  /** 某个目标（镜头 s: 或片段 v:）当前的参考条 */
  const refsOf = (key: string) => shotByKey.value.get(key)?.refs ?? trackByKey.value.get(key)?.refs ?? [];
  const poolByKey = computed(() => new Map(pool.value.map((p) => [p.key, p])));
  const current = computed(() => (selectedKey.value ? (shotByKey.value.get(selectedKey.value) ?? null) : null));
  const trackOf = (shot: ShotDto | null) => (shot?.trackId ? (tracks.value.find((t) => t.id === shot.trackId) ?? null) : null);

  const done = computed(() => shots.value.filter((s) => s.current?.src).length);

  async function load(keepSelection = true) {
    if (!projectId.value || !scriptId.value) return;
    loading.value = true;
    try {
      const data = await shotsApi.get(projectId.value, scriptId.value);
      shots.value = data.shots;
      tracks.value = data.tracks;
      pool.value = data.pool;
      defaults.value = data.defaults;
      if (!keepSelection || !shotByKey.value.has(selectedKey.value ?? "")) selectedKey.value = data.shots[0]?.key ?? null;
      syncPolling();
    } catch (e) {
      window.$message.error(errorMessage(e, "读取镜头失败"));
    } finally {
      loading.value = false;
    }
  }

  async function loadPresets() {
    if (!projectId.value) return;
    try {
      presets.value = await canvasApi.getPresets(projectId.value);
    } catch {
      presets.value = [];
    }
  }

  // ─── 生成中的版本轮询 ────────────────────────────────
  const pending = ref<Set<number>>(new Set());
  let timer: ReturnType<typeof setInterval> | null = null;

  function track(imageId: number) {
    pending.value = new Set(pending.value).add(imageId);
    syncPolling();
  }
  /** 把后端已知的「生成中」补进轮询集合（刷新页面后也能接着转） */
  function syncPolling() {
    for (const s of shots.value) for (const id of s.pendingImageIds) pending.value.add(id);
    for (const t of tracks.value) for (const id of t.pendingImageIds) pending.value.add(id);
    if (pending.value.size && !timer) timer = setInterval(poll, POLL_INTERVAL);
    if (!pending.value.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  async function poll() {
    const ids = [...pending.value];
    if (!ids.length) return syncPolling();
    try {
      const rows = await canvasApi.pollVersions(ids);
      let changed = false;
      const seen = new Set(rows.map((r) => r.imageId));
      for (const id of ids) if (!seen.has(id)) pending.value.delete(id); // 记录被删了，别一直挂着
      for (const row of rows) {
        if (row.state === "生成中") continue;
        pending.value.delete(row.imageId);
        changed = true;
        if (row.state === "生成失败") window.$message.error(`${nameOf(row.owner)}生成失败：${row.errorReason ?? "未知原因"}`);
      }
      if (changed) await load();
    } catch {
      /* 网络抖动：下一轮再试 */
    }
    syncPolling();
  }
  const nameOf = (key: string | null) => {
    const shot = key ? shotByKey.value.get(key) : null;
    if (shot) return `镜头 ${shot.index + 1} `;
    const track = key ? trackByKey.value.get(key) : null;
    return track ? `片段（${track.shotIds.length} 镜）` : "";
  };

  onUnmounted(() => timer && clearInterval(timer));

  // ─── 参考 ───────────────────────────────────────────
  /**
   * 自动态的片段参考是推导出来的，没有真实的边，也就没有 edgeId 可删可排。
   * 用户第一次动它时先把推导结果落成边（转入手动态），这次编辑才有东西可改。
   * 返回 true 表示刚落过库，调用方需要重新读一次数据再操作。
   */
  async function ensureEditable(targetKey: string): Promise<boolean> {
    const track = trackByKey.value.get(targetKey);
    if (!track || !track.derived) return false;
    await shotsApi.trackRefs({ projectId: projectId.value, trackId: track.id, action: "take" });
    await load();
    return true;
  }
  async function addRef(targetKey: string, sourceKey: string) {
    if (targetKey === sourceKey) return window.$message.warning("不能把它自己当参考");
    if (refsOf(targetKey).some((r) => r.key === sourceKey)) return window.$message.warning("这个素材已经在参考里了");
    try {
      await ensureEditable(targetKey);
      await canvasApi.addEdge(projectId.value, sourceKey, targetKey);
      await load();
    } catch (e) {
      window.$message.error(errorMessage(e, "添加参考失败"));
    }
  }
  async function removeRef(targetKey: string, sourceKey: string) {
    try {
      await ensureEditable(targetKey);
      const edge = refsOf(targetKey).find((r) => r.key === sourceKey);
      if (!edge?.edgeId) return window.$message.error("这条参考没法单独移除，请点「重置为自动」");
      await canvasApi.removeEdge(projectId.value, edge.edgeId);
      await load();
    } catch (e) {
      window.$message.error(errorMessage(e, "移除参考失败"));
    }
  }
  async function reorderRefs(targetKey: string, edgeIds: number[]) {
    try {
      // 落库会换一批 edgeId，调用方传进来的那组就作废了，让它重算一次
      if (await ensureEditable(targetKey)) return false;
      await canvasApi.reorderEdges(projectId.value, targetKey, edgeIds);
      await load();
      return true;
    } catch (e) {
      window.$message.error(errorMessage(e, "调整顺序失败"));
      return false;
    }
  }

  // ─── 导航 ───────────────────────────────────────────
  function select(key: string) {
    selectedKey.value = key;
  }
  function step(delta: number) {
    const list = shots.value;
    const i = list.findIndex((s) => s.key === selectedKey.value);
    const next = list[Math.min(Math.max(i + delta, 0), list.length - 1)];
    if (next) selectedKey.value = next.key;
  }

  return {
    loading,
    shots,
    tracks,
    trackByKey,
    refsOf,
    pool,
    poolByKey,
    defaults,
    presets,
    selectedKey,
    current,
    shotByKey,
    trackOf,
    done,
    load,
    loadPresets,
    track,
    pending,
    addRef,
    removeRef,
    reorderRefs,
    select,
    step,
  };
}
