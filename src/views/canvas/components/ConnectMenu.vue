<template>
  <Teleport to="body">
  <div v-if="state" ref="root" class="connect-menu nodrag nowheel" :style="style" role="menu" @mousedown.stop @keydown.esc="close">
    <template v-if="!naming">
      <div class="head">{{ headText }}</div>
      <button v-for="item in items" :key="item.kind" class="item" role="menuitem" :style="{ '--dot': item.color }" @click="choose(item)">
        <span class="icon"><component :is="`i-${item.icon}`" size="15" /></span>
        <span class="text">
          <span class="name">{{ item.label }}</span>
          <span class="desc">{{ item.desc }}</span>
        </span>
      </button>
    </template>
    <form v-else class="naming" @submit.prevent="confirmName">
      <label class="head" :for="inputId">{{ naming.label }}名称</label>
      <input :id="inputId" ref="input" v-model="name" class="name-input" maxlength="40" :placeholder="naming.placeholder" @keydown.stop @keydown.esc="close" />
      <div class="actions">
        <button type="button" class="ghost" @click="naming = null">返回</button>
        <button type="submit" class="primary" :disabled="!name.trim()">创建</button>
      </div>
    </form>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { CanvasNodeDto } from "../types";
import { isAssetNode } from "../types";

export type ConnectMenuKind = "state" | "role" | "scene" | "tool" | "image" | "video" | "audio" | "text" | "upload";

export interface ConnectMenuState {
  clientX: number;
  clientY: number;
  /** 拖出连线的节点；双击空白处打开时为 null（只新建，不连线） */
  from: CanvasNodeDto | null;
  /** 该节点在新连线里的位置：source = 新节点引用它；target = 新节点作它的参考 */
  role: "source" | "target" | null;
}

interface MenuItem {
  kind: ConnectMenuKind;
  label: string;
  desc: string;
  icon: string;
  color: string;
}

const props = withDefaults(defineProps<{ state: ConnectMenuState | null; variant?: "asset" | "free" }>(), { variant: "asset" });
const emit = defineEmits<{ pick: [kind: ConnectMenuKind, name: string]; close: [] }>();

const MENU_WIDTH = 248;
const MENU_EDGE = 12;
const MENU_MAX_HEIGHT = 380;
const ASSET_ITEMS: MenuItem[] = [
  { kind: "role", label: "角色", desc: "新角色，生成人物多视图", icon: "people", color: "var(--td-brand-color)" },
  { kind: "scene", label: "场景", desc: "新场景，空镜无人物", icon: "landscape", color: "var(--td-success-color)" },
  { kind: "tool", label: "道具", desc: "新道具，单体纯净背景", icon: "box", color: "var(--td-warning-color)" },
];
const DEFAULT_NAME: Record<string, string> = { role: "新角色", scene: "新场景", tool: "新道具" };

const headText = computed(() => {
  const s = props.state;
  if (!s?.from) return "在这里新建";
  return s.role === "source" ? `用「${s.from.name}」作参考，新建` : `新建素材，连到「${s.from.name}」`;
});
// 顺序：图片节点、视频节点在前，其余类型往后
const items = computed<MenuItem[]>(() => {
  const s = props.state;
  if (!s) return [];
  const media = (kind: "image" | "video" | "audio" | "text"): MenuItem => ({
    kind,
    label: { image: "图片节点", video: "视频节点", audio: "音频节点", text: "文本节点" }[kind],
    desc: { image: "自由出图，可套用目标模板", video: "图生视频 / 多素材参考", audio: "文本转语音，或上传音色", text: "便签：灵感、台词、大纲" }[kind],
    icon: { image: "pic", video: "video-two", audio: "voice", text: "text" }[kind],
    color: { image: "#8b5cf6", video: "#8b5cf6", audio: "#0ea5e9", text: "#f59e0b" }[kind],
  });
  const upload: MenuItem = { kind: "upload", label: "上传本地文件", desc: s.from ? "图片 / 视频 / 音频作参考" : "图片 / 视频 / 音频", icon: "upload", color: "#8b5cf6" };
  // 无限画布：文本 / 图片 / 音频 / 视频 + 上传，没有资产
  if (props.variant === "free") {
    if (!s.from) return [media("text"), media("image"), media("video"), media("audio"), upload];
    if (s.role === "source") return [media("image"), media("video"), media("audio"), media("text")];
    return [media("text"), media("image"), media("video"), media("audio"), upload];
  }
  if (!s.from) return [media("text"), media("image"), media("video"), media("audio"), ...ASSET_ITEMS, upload];
  if (s.role === "source") {
    const state: MenuItem[] = isAssetNode(s.from)
      ? [{ kind: "state", label: "新建状态", desc: "换装、时段、使用状态…", icon: "branch-one", color: "var(--td-brand-color)" }]
      : [];
    return [media("image"), media("video"), media("audio"), media("text"), ...state, ...ASSET_ITEMS];
  }
  const video = s.from.kind === "video" ? [media("video")] : [];
  return [media("text"), media("image"), ...video, media("audio"), upload, ...ASSET_ITEMS];
});

// 贴着松手位置出现，靠近窗口边缘时往里收
const style = computed(() => {
  const s = props.state;
  if (!s) return {};
  const left = Math.min(s.clientX + 8, window.innerWidth - MENU_WIDTH - MENU_EDGE);
  const top = Math.min(s.clientY + 8, window.innerHeight - MENU_MAX_HEIGHT);
  return { left: `${Math.max(MENU_EDGE, left)}px`, top: `${Math.max(MENU_EDGE, top)}px`, width: `${MENU_WIDTH}px` };
});

const naming = ref<{ kind: ConnectMenuKind; label: string; placeholder: string } | null>(null);
const name = ref("");
const input = ref<HTMLInputElement>();
const inputId = "connect-menu-name";

function choose(item: MenuItem) {
  if (item.kind === "role" || item.kind === "scene" || item.kind === "tool") {
    naming.value = { kind: item.kind, label: item.label, placeholder: DEFAULT_NAME[item.kind] };
    name.value = DEFAULT_NAME[item.kind];
    void nextTick(() => input.value?.select());
    return;
  }
  emit("pick", item.kind, "");
}
function confirmName() {
  if (!naming.value || !name.value.trim()) return;
  emit("pick", naming.value.kind, name.value.trim());
}
function close() {
  emit("close");
}

// 打开时重置；点菜单外面关闭
const root = ref<HTMLElement>();
function onPointerDown(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) close();
}
watch(
  () => props.state,
  (value) => {
    naming.value = null;
    name.value = "";
    if (value) setTimeout(() => window.addEventListener("pointerdown", onPointerDown, true));
    else window.removeEventListener("pointerdown", onPointerDown, true);
  },
);
onBeforeUnmount(() => window.removeEventListener("pointerdown", onPointerDown, true));
</script>

<style lang="scss" scoped>
.connect-menu {
  position: fixed;
  z-index: 3000;
  background: color-mix(in srgb, var(--td-bg-color-container) 88%, transparent);
  backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid var(--td-component-stroke);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes menu-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
}
.head {
  padding: 2px 6px 6px;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--td-text-color-primary);
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms;
  &:hover,
  &:focus-visible {
    background: var(--td-bg-color-container-hover);
    outline: none;
  }
  &:hover .icon {
    background: var(--dot);
    color: #fff;
  }
}
.icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--dot) 14%, transparent);
  color: var(--dot);
  transition: background-color 120ms, color 120ms;
}
.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.name {
  font-size: 13px;
  font-weight: 600;
}
.desc {
  font-size: 11px;
  color: var(--td-text-color-secondary);
}
.naming {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px;
}
.name-input {
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  font-size: 13px;
  &:focus {
    outline: none;
    border-color: var(--td-brand-color);
    box-shadow: 0 0 0 2px var(--td-brand-color-focus);
  }
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  button {
    height: 26px;
    padding: 0 12px;
    border-radius: 7px;
    border: none;
    font-size: 12px;
    cursor: pointer;
  }
  .ghost {
    background: transparent;
    color: var(--td-text-color-secondary);
    &:hover {
      background: var(--td-bg-color-container-hover);
    }
  }
  .primary {
    background: var(--td-brand-color);
    color: #fff;
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}
</style>
