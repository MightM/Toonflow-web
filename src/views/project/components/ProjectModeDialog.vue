<template>
  <t-dialog v-model:visible="show" placement="center" width="820px" :footer="false" :header="$t('workbench.project.mode.title')" class="mode-dialog">
    <p class="subtitle">{{ $t("workbench.project.mode.subtitle") }}</p>
    <div class="modes">
      <button v-for="m in modes" :key="m.key" type="button" class="mode" :class="m.key" @click="pick(m.key)">
        <span class="stripe" aria-hidden="true" />
        <span class="head">
          <component :is="m.icon" size="26" />
          <span class="name">{{ $t(`workbench.project.mode.${m.key}.title`) }}</span>
        </span>
        <span class="tagline">{{ $t(`workbench.project.mode.${m.key}.tagline`) }}</span>
        <ul class="points">
          <li v-for="p in ['p1', 'p2', 'p3']" :key="p">{{ $t(`workbench.project.mode.${m.key}.${p}`) }}</li>
        </ul>
        <span class="fit">{{ $t(`workbench.project.mode.${m.key}.fit`) }}</span>
        <span class="cta">{{ $t("workbench.project.newProject") }} <i-arrow-right size="14" /></span>
      </button>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
// 新建项目的第一步：先选模式。无限画布 = 自由节点画布；短剧流水线 = 现有的小说 / 剧本 → 分镜 → 视频流程
export type ProjectMode = "canvas" | "pipeline";

const show = defineModel<boolean>();
const emit = defineEmits<{ (e: "pick", mode: ProjectMode): void }>();

const modes: { key: ProjectMode; icon: string }[] = [
  { key: "canvas", icon: "i-mind-mapping" },
  { key: "pipeline", icon: "i-carousel-video" },
];

function pick(mode: ProjectMode) {
  show.value = false;
  emit("pick", mode);
}
</script>

<style lang="scss" scoped>
.subtitle {
  margin: -4px 0 16px;
  color: var(--td-text-color-secondary);
  font-size: 13px;
}
.modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.mode {
  --accent: var(--td-brand-color);
  --accent-soft: var(--td-brand-color-light);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 22px 22px 18px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 16px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition:
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 180ms,
    border-color 180ms;
  &.pipeline {
    --accent: var(--td-warning-color);
    --accent-soft: var(--td-warning-color-light);
  }
  &:hover,
  &:focus-visible {
    transform: translateY(-3px);
    border-color: var(--accent);
    box-shadow: 0 18px 40px -18px var(--accent);
    outline: none;
    .cta {
      opacity: 1;
      transform: translateX(0);
    }
  }
  .stripe {
    position: absolute;
    inset: 0 auto 0 0;
    width: 5px;
    background: var(--accent);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--accent);
    .name {
      font-size: 20px;
      font-weight: 700;
      color: var(--td-text-color-primary);
      letter-spacing: 0.02em;
    }
  }
  .tagline {
    font-size: 14px;
    color: var(--td-text-color-primary);
  }
  .points {
    margin: 4px 0 0;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--accent-soft);
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: var(--td-text-color-primary);
    li::before {
      content: "·";
      margin-right: 6px;
      font-weight: 700;
      color: var(--accent);
    }
  }
  .fit {
    font-size: 12px;
    color: var(--td-text-color-secondary);
  }
  .cta {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-end;
    margin-top: 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    opacity: 0.6;
    transform: translateX(-4px);
    transition:
      opacity 180ms,
      transform 180ms;
  }
}
@media (max-width: 760px) {
  .modes {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mode,
  .mode .cta {
    transition: none;
  }
}
</style>
