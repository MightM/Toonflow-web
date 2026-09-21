import type { Ref } from "vue";
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import { canvasApi, errorMessage } from "@/views/canvas/api";
import type { AssetNodeDto, AssetType, CanvasData, VersionDto } from "@/views/canvas/types";
import { isAssetNode } from "@/views/canvas/types";

// ─── 资产列表：按根资产分组（一个根资产 = 一张卡片，它的状态 = 形象） ───────────

export type LookStatus = "done" | "pending" | "failed" | "empty";

export interface Look {
  dto: AssetNodeDto;
  cover: VersionDto | null; // 资产当前图（角色即多视图）
  status: LookStatus;
}

export interface AssetGroup {
  root: AssetNodeDto;
  looks: Look[]; // 第一个是根资产本身
  status: LookStatus;
  doneCount: number;
}

const POLL_INTERVAL = 3000;

function lookOf(dto: AssetNodeDto): Look {
  const cover = dto.current?.src ? dto.current : null;
  const pending = dto.pendingImageIds.length > 0 || dto.promptState === "生成中" || dto.audioBindState === "生成中";
  const failed = dto.latest?.state === "生成失败";
  const status: LookStatus = pending ? "pending" : cover ? "done" : failed ? "failed" : "empty";
  return { dto, cover, status };
}

function aggregate(looks: Look[]): LookStatus {
  if (looks.some((l) => l.status === "pending")) return "pending";
  if (looks.every((l) => l.status === "done")) return "done";
  if (looks.some((l) => l.status === "failed")) return "failed";
  return "empty";
}

export const STATUS_TEXT: Record<LookStatus, string> = { done: "已完成", pending: "生成中", failed: "有失败", empty: "待生成" };

export function useAssetBoard(projectId: Ref<number>, scriptId: Ref<number | null>) {
  const data = ref<CanvasData | null>(null);
  const loading = ref(false);

  const groups = computed(() => {
    const assets = (data.value?.nodes ?? []).filter(isAssetNode);
    const byType: Record<AssetType, AssetGroup[]> = { role: [], scene: [], tool: [] };
    for (const root of assets.filter((a) => !a.parentKey)) {
      const looks = [root, ...assets.filter((a) => a.parentKey === root.key)].map(lookOf);
      byType[root.assetType]?.push({ root, looks, status: aggregate(looks), doneCount: looks.filter((l) => l.status === "done").length });
    }
    return byType;
  });
  const busy = computed(() => Object.values(groups.value).some((list) => list.some((g) => g.status === "pending")));

  async function load(silent = false) {
    if (!projectId.value) return;
    if (!silent) loading.value = true;
    try {
      data.value = await canvasApi.get(projectId.value, scriptId.value);
    } catch (e) {
      if (!silent) window.$message.error(errorMessage(e, "资产加载失败"));
    } finally {
      loading.value = false;
    }
  }

  // 有生成 / 润色 / 配音色在进行时持续刷新
  let timer: ReturnType<typeof setInterval> | undefined;
  watch(busy, (value) => {
    if (value && !timer) timer = setInterval(() => load(true), POLL_INTERVAL);
    if (!value && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  });
  onBeforeUnmount(() => clearInterval(timer));

  // ─── 批量操作（作用于所选卡片的全部形象） ─────────────────────
  const { otherSetting } = storeToRefs(settingStore());
  const concurrentCount = () => Number(otherSetting.value?.assetsBatchGenereateSize ?? 5) || 5;
  const looksOf = (selected: AssetGroup[]) => selected.flatMap((g) => g.looks.map((l) => l.dto));

  async function batchPolish(selected: AssetGroup[]) {
    const items = looksOf(selected).map((a) => ({ assetsId: a.id, type: a.assetType, name: a.name, describe: a.describe || a.name }));
    if (!items.length) return;
    await axios.post("/assetsGenerate/batchPolishAssetsPrompt", { projectId: projectId.value, items, concurrentCount: concurrentCount(), otherTextPrompt: "" });
    window.$message.success(`已开始润色 ${items.length} 个形象的提示词`);
    await load(true);
  }

  async function batchGenerate(selected: AssetGroup[]) {
    const all = looksOf(selected);
    const ready = all.filter((a) => a.prompt?.trim());
    const skipped = all.length - ready.length;
    if (!ready.length) return window.$message.warning("所选形象都还没有提示词，请先批量润色");
    const d = data.value?.defaults;
    await axios.post("/assetsGenerate/batchGenerateImageAssets", {
      projectId: projectId.value,
      model: d?.imageModel ?? "",
      resolution: d?.imageQuality || "1K",
      concurrentCount: concurrentCount(),
      items: ready.map((a) => ({ id: a.id, type: a.assetType, name: a.name, prompt: a.prompt })),
    });
    window.$message.success(`已开始生成 ${ready.length} 个形象${skipped ? `，${skipped} 个没有提示词已跳过` : ""}`);
    await load(true);
  }

  async function batchBindVoice(selected: AssetGroup[]) {
    const roles = looksOf(selected).filter((a) => a.assetType === "role");
    if (!roles.length) return window.$message.warning("只有角色可以配音色");
    if (!data.value?.voices.length) return window.$message.warning("项目里还没有音色资产，请先在资产中心添加音色");
    await axios.post("/cornerScape/batchBindAudio", { projectId: projectId.value, assetsIds: roles.map((a) => a.id), concurrentCount: concurrentCount() });
    window.$message.success(`AI 正在为 ${roles.length} 个角色形象匹配音色`);
    await load(true);
  }

  return { data, loading, groups, busy, load, batchPolish, batchGenerate, batchBindVoice };
}
