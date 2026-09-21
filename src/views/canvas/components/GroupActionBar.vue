<template>
  <div v-if="selection.length >= 2" class="group-bar glass">
    <span class="picked">已选 {{ selection.length }} 个节点</span>
    <button v-if="images.length >= 2" class="accent" @click="emit('derive', images, 'video')"><i-video-two size="14" />{{ images.length }} 图生视频</button>
    <button v-else class="accent" @click="emit('derive', selection, 'video')"><i-video-two size="14" />生成视频</button>
    <button @click="emit('derive', selection, 'image')"><i-pic size="14" />生成图片</button>
    <button v-if="texts.length" @click="emit('derive', texts, 'audio')"><i-voice size="14" />生成语音</button>
    <span class="hint">按选中顺序排成 图1、图2…</span>
  </div>
</template>

<script setup lang="ts">
// 多选 ≥2 个节点时的整组生成栏（两张画布共用）：以选中的节点为参考新建下游节点，按选中顺序连线
import { useCanvasCtx } from "../context";
import type { MediaKind } from "../types";
import { isAssetNode } from "../types";

const props = defineProps<{ selection: string[] }>();
const emit = defineEmits<{ derive: [sourceKeys: string[], kind: MediaKind] }>();
const ctx = useCanvasCtx();
// 资产节点（角色 / 场景 / 道具）的当前图就是参考图，按图片算
const kindOf = (key: string) => {
  const dto = ctx.dtoByKey.value.get(key);
  return dto ? (isAssetNode(dto) ? "image" : dto.kind) : undefined;
};
const images = computed(() => props.selection.filter((k) => kindOf(k) === "image"));
const texts = computed(() => props.selection.filter((k) => kindOf(k) === "text"));
</script>
