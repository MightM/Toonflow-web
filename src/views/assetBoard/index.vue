<template>
  <div class="asset-board">
    <div class="top">
      <AssetViewSwitch current="board" :script-id="scriptId" />
    </div>

    <header class="hero">
      <div>
        <h1>统一管理角色、场景与道具</h1>
        <p>检查资产状态，进入画布补全形象与音色。角色直接生成人物多视图；想先定脸，可在画布上把定妆照连到角色再重新生成。</p>
      </div>
      <div class="hero-tools">
        <t-select v-model="episodeFilter" size="small" class="episode" :options="episodeOptions" placeholder="全部集" clearable @change="board.load()" />
        <t-button size="small" :variant="batchMode ? 'base' : 'outline'" @click="toggleBatch">
          <template #icon><i-check-one size="14" /></template>
          {{ batchMode ? "退出批量" : "批量操作" }}
        </t-button>
      </div>
    </header>

    <div class="tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab.value"
        role="tab"
        class="tab"
        :class="{ active: activeTab === tab.value }"
        :aria-selected="activeTab === tab.value"
        @click="activeTab = tab.value">
        <component :is="tab.icon" size="15" />
        {{ tab.label }}
        <span class="count">{{ board.groups.value[tab.value].length }}</span>
      </button>
    </div>

    <Transition name="slide">
      <div v-if="batchMode" class="batch-bar">
        <span class="picked">已选 {{ picked.size }} 个资产（{{ pickedLooks }} 个形象）</span>
        <t-button size="small" variant="text" @click="pickBy('empty')">选未生成</t-button>
        <t-button size="small" variant="text" @click="pickBy('failed')">选失败</t-button>
        <t-button size="small" variant="text" @click="pickBy('all')">全选</t-button>
        <t-button size="small" variant="text" :disabled="!picked.size" @click="picked.clear()">清空</t-button>
        <span class="grow" />
        <t-button size="small" variant="outline" :disabled="!picked.size" :loading="acting === 'polish'" @click="act('polish')">
          <template #icon><i-magic-wand size="14" /></template>批量润色
        </t-button>
        <t-button size="small" :disabled="!picked.size" :loading="acting === 'generate'" @click="act('generate')">
          <template #icon><i-pic size="14" /></template>批量生成
        </t-button>
        <t-button v-if="activeTab === 'role'" size="small" variant="outline" :disabled="!picked.size" :loading="acting === 'voice'" @click="act('voice')">
          <template #icon><i-voice size="14" /></template>AI 配音色
        </t-button>
      </div>
    </Transition>

    <main class="grid-wrap">
      <div v-if="board.loading.value && !board.data.value" class="state"><t-loading /></div>
      <div v-else-if="!currentGroups.length" class="state empty">
        <component :is="TABS.find((t) => t.value === activeTab)!.icon" size="40" />
        <p>还没有{{ TABS.find((t) => t.value === activeTab)!.label }}资产。先在剧本里提取资产，或去画布里新建。</p>
      </div>
      <div v-else class="grid">
        <AssetCard
          v-for="group in currentGroups"
          :key="group.root.key"
          :group="group"
          :selectable="batchMode"
          :picked="picked.has(group.root.key)"
          @open="openCanvas(group.root.key)"
          @expand="expanded = group"
          @toggle="toggle(group.root.key)" />
      </div>
    </main>

    <footer class="actions">
      <t-button size="large" variant="outline" shape="round" @click="openCanvas(null)">去画布编辑</t-button>
      <t-button size="large" shape="round" @click="router.push('/production')">下一步：视频生产</t-button>
    </footer>

    <LooksDrawer v-model:visible="looksVisible" :group="expanded" @open="openCanvas" />
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import { errorMessage } from "@/views/canvas/api";
import type { AssetType } from "@/views/canvas/types";
import AssetCard from "./AssetCard.vue";
import LooksDrawer from "./LooksDrawer.vue";
import AssetViewSwitch from "./AssetViewSwitch.vue";
import { useAssetBoard, type AssetGroup, type LookStatus } from "./useAssetBoard";

const TABS: { value: AssetType; label: string; icon: string }[] = [
  { value: "role", label: "角色", icon: "i-people" },
  { value: "scene", label: "场景", icon: "i-landscape" },
  { value: "tool", label: "道具", icon: "i-cube" },
];

const router = useRouter();
const route = useRoute();
const { project } = storeToRefs(projectStore());
const projectId = computed(() => Number(project.value?.id ?? 0));
const scriptId = ref<number | null>(route.query.scriptId ? Number(route.query.scriptId) : null); // 从画布切过来时沿用当前集
const episodeFilter = computed({
  get: () => scriptId.value ?? undefined,
  set: (value: number | undefined) => (scriptId.value = value ?? null),
});
const board = useAssetBoard(projectId, scriptId);

const activeTab = ref<AssetType>("role");
const currentGroups = computed(() => board.groups.value[activeTab.value]);

const episodeOptions = ref<{ label: string; value: number }[]>([]);
onMounted(async () => {
  if (!projectId.value) {
    window.$message.warning("请先打开一个项目");
    return router.replace("/project");
  }
  await board.load();
  try {
    const { data } = await axios.post("/script/getScrptApi", { projectId: projectId.value, name: "" });
    episodeOptions.value = (data ?? []).map((ep: { id: number; name: string }) => ({ label: ep.name, value: ep.id }));
  } catch {
    episodeOptions.value = [];
  }
});

// ─── 跳画布（角色落在四视图节点上；形象抽屉里的状态同理） ─────────────
function openCanvas(key: string | null) {
  const query: Record<string, string> = {};
  if (key) query.focus = key;
  if (scriptId.value) query.scriptId = String(scriptId.value);
  router.push({ path: "/canvas", query });
}

// ─── 形象展开 ────────────────────────────────────────
const expanded = ref<AssetGroup | null>(null);
const looksVisible = computed({
  get: () => !!expanded.value,
  set: (value: boolean) => {
    if (!value) expanded.value = null;
  },
});
watch(board.groups, (groups) => {
  // 轮询刷新后同步抽屉里的数据
  if (!expanded.value) return;
  const key = expanded.value.root.key;
  expanded.value = Object.values(groups).flat().find((g) => g.root.key === key) ?? null;
});

// ─── 批量 ────────────────────────────────────────────
const batchMode = ref(false);
const picked = reactive(new Set<string>());
const pickedGroups = computed(() => currentGroups.value.filter((g) => picked.has(g.root.key)));
const pickedLooks = computed(() => pickedGroups.value.reduce((n, g) => n + g.looks.length, 0));
watch(activeTab, () => picked.clear());

function toggleBatch() {
  batchMode.value = !batchMode.value;
  picked.clear();
}
function toggle(key: string) {
  if (picked.has(key)) picked.delete(key);
  else picked.add(key);
}
function pickBy(kind: LookStatus | "all") {
  picked.clear();
  currentGroups.value.filter((g) => kind === "all" || g.looks.some((l) => l.status === kind)).forEach((g) => picked.add(g.root.key));
}

const acting = ref<"" | "polish" | "generate" | "voice">("");
async function act(kind: "polish" | "generate" | "voice") {
  acting.value = kind;
  try {
    const groups = pickedGroups.value;
    if (kind === "polish") await board.batchPolish(groups);
    if (kind === "generate") await board.batchGenerate(groups);
    if (kind === "voice") await board.batchBindVoice(groups);
  } catch (e) {
    window.$message.error(errorMessage(e, "批量操作失败"));
  } finally {
    acting.value = "";
  }
}
</script>

<style lang="scss" scoped>
.asset-board {
  position: relative;
  height: 100%;
  overflow: auto;
  padding: 24px 56px 120px;
  background:
    radial-gradient(1200px 400px at 50% -120px, color-mix(in srgb, var(--td-brand-color) 14%, transparent), transparent),
    var(--td-bg-color-page);
}
.top {
  display: flex;
  margin-bottom: 20px;
}
.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  h1 {
    margin: 0;
    font-size: 28px;
    letter-spacing: 0.02em;
  }
  p {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--td-text-color-secondary);
  }
}
.hero-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  .episode {
    width: 150px;
  }
}
.tabs {
  display: flex;
  gap: 28px;
  margin: 26px 0 18px;
  border-bottom: 1px solid var(--td-component-stroke);
}
.tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 2px;
  border: none;
  background: transparent;
  color: var(--td-text-color-secondary);
  font-size: 15px;
  cursor: pointer;
  &::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    border-radius: 2px;
    background: var(--td-brand-color);
    transform: scaleX(0);
    transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  &.active {
    color: var(--td-text-color-primary);
    font-weight: 600;
    &::after {
      transform: scaleX(1);
    }
  }
  &:focus-visible {
    outline: 2px solid var(--td-brand-color-focus);
  }
  .count {
    min-width: 20px;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 400;
    background: var(--td-bg-color-secondarycontainer);
    color: var(--td-text-color-secondary);
  }
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container);
  .picked {
    margin-right: 8px;
    font-size: 13px;
  }
  .grow {
    flex: 1;
  }
}
.slide-enter-active,
.slide-leave-active {
  transition: opacity 180ms, transform 180ms;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 18px;
}
.state {
  padding: 80px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--td-text-color-placeholder);
  &.empty p {
    margin: 0;
    font-size: 13px;
  }
}
.actions {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: center;
  gap: 14px;
  margin-top: 36px;
  padding: 16px 0 0;
}
</style>
