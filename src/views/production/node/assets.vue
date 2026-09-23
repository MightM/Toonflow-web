<template>
  <t-card class="assets">
    <Handle :id="props.handleIds.target" type="target" :position="Position.Top" />
    <div class="titleBar dragHandle f ac jb">
      <div class="title">{{ $t("workbench.production.node.assets.title") }}</div>
      <t-button size="small" variant="outline" class="openCanvas" @mousedown.stop @click.stop="openCanvas">
        <template #icon><i-mind-mapping /></template>
        {{ $t("workbench.menu.assetCanvas") }}
      </t-button>
    </div>
    <div class="content">
      <div class="cardGrid">
        <div v-for="asset in assets" :key="asset.id" class="assetItemBox">
          <t-card class="assetCard">
            <t-tooltip theme="primary" :content="$t('workbench.assets.replaceImageTip')">
              <div class="replace ac" @mousedown.stop @click.stop="replaceFn(asset)">
                <i-upload-one theme="outline" size="18" fill="#fff" />
              </div>
            </t-tooltip>
            <div v-if="asset.src" class="assetImageWrap">
              <t-image :src="asset.src" fit="contain" class="assetImage" :preview="true">
                <template #overlayContent>
                  <div class="imageToolsWrap show">
                    <ImageTools :src="asset.src" position="br" />
                  </div>
                </template>
              </t-image>
            </div>
            <div v-else class="assetImageWrap assetImagePlaceholder">
              <t-loading v-if="asset.state == '生成中'" size="small" />
              <span v-else-if="asset.state == '生成失败'" style="color: red">{{ $t("workbench.production.node.assets.generateFailed") }}</span>
              <t-empty v-else size="small" :title="$t('workbench.production.node.assets.notGenerated')" />
            </div>
            <div class="cardInfo">
              <div class="cardName">
                <span class="nameText">{{ asset.name }}</span>
                <t-tag theme="success">{{ $t("workbench.production.node.assets.originalAsset") }}</t-tag>
              </div>
              <div class="cardDesc">{{ asset.desc }}</div>
            </div>
          </t-card>
          <div class="divider">
            <i-right size="32"></i-right>
          </div>
          <div class="deriveAssets">
            <t-card v-for="(item, index) in asset.derive" :key="index" class="assetCard" @click="generateAssetsImage(item)">
              <div v-if="item.src && item.state == '已完成'" class="assetImageWrap">
                <t-image :src="item.src" fit="contain" class="assetImage" :preview="true">
                  <template #overlayContent>
                    <div class="imageToolsWrap show">
                      <ImageTools :src="item.src" position="br" />
                    </div>
                  </template>
                </t-image>
              </div>
              <div v-else class="assetImageWrap assetImagePlaceholder">
                <t-loading v-if="item.state == '生成中'" size="small" />
                <t-tooltip v-else-if="item.state == '生成失败'" :content="item?.errorReason">
                  <div style="color: red; cursor: pointer">{{ $t("workbench.novel.genFailed") }}</div>
                </t-tooltip>
                <t-empty v-else size="small" :title="$t('workbench.production.node.assets.notGenerated')" />
              </div>
              <t-tooltip theme="primary" :content="$t('workbench.assets.replaceImageTip')">
                <div class="replace ac" @mousedown.stop @click.stop="replaceFn(item)">
                  <i-upload-one theme="outline" size="18" fill="#fff" />
                </div>
              </t-tooltip>
              <t-tooltip theme="primary" :content="$t('workbench.production.node.storyboard.deleteNode')">
                <div class="remove ac" @click.stop="removeFn(item.id!)">
                  <i-delete theme="outline" size="18" fill="#fff" />
                </div>
              </t-tooltip>
              <div class="cardInfo">
                <div class="cardName">
                  <span class="nameText">{{ item.name }}</span>
                  <t-tag theme="warning">{{ $t("workbench.production.node.assets.derived") }}</t-tag>
                </div>
                <div class="cardDesc">{{ item.desc }}</div>
              </div>
            </t-card>
            <t-card v-if="asset.derive.length <= 0" class="assetCard emptyCard">
              <t-empty :title="$t('workbench.production.node.assets.noDerivedAssets')"></t-empty>
            </t-card>
          </div>
        </div>
      </div>
    </div>
  </t-card>
</template>

<script setup lang="ts">
import { Handle, Position, type Edge } from "@vue-flow/core";
import { type AssetItem, type DeriveAsset } from "../utils/flowBuilder";
import axios from "@/utils/axios";
import { pickImageFile, replaceAssetImage } from "@/views/assets/replaceImage";
import useProjectStore from "@/stores/project";
import type { Ref } from "vue";
const { project } = storeToRefs(useProjectStore());
const props = defineProps<{
  id: string;
  handleIds: {
    target: string;
  };
}>();

const assets = defineModel<AssetItem[]>({ required: true });
// 衍生资产的重绘已并入资产画布（有版本链、参考可自由挑），这里只负责跳过去定位
function generateAssetsImage(row: DeriveAsset) {
  const scriptId = canvasEpisodesId?.value;
  canvasRouter.push({ path: "/canvas", query: { ...(scriptId ? { scriptId: String(scriptId) } : {}), focus: `a:${row.id}` } });
}

// 换图：原资产 / 衍生资产都能选本地图片替换当前图，旧图留在画布的历史版本里
async function replaceFn(target: AssetItem | DeriveAsset) {
  const file = await pickImageFile();
  if (!file || !project.value?.id) return;
  try {
    target.src = await replaceAssetImage(project.value.id, target.id, file);
    target.state = "已完成";
    window.$message.success($t("workbench.assets.replaceSuccess", { name: target.name }));
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.assets.replaceFail"));
  }
}

async function removeFn(id: number) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.production.node.assets.confirmDeleteBody"),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      try {
        await axios.post("/production/assets/deleteAssetsDireve", {
          id,
          projectId: project.value?.id,
        });
        //找到对应子资产删除
        assets.value.forEach((item) => {
          const targetIndex = item.derive.findIndex((s) => s.id === id);
          if (targetIndex !== -1) {
            item.derive.splice(targetIndex, 1);
          }
        });
      } catch (e) {
        window.$message.error((e as any)?.message || $t("workbench.production.node.assets.removeFailed"));
      } finally {
        dialog.destroy();
      }
    },
  });
}

// 打开资产画布，带上当前集
const canvasEpisodesId = inject<Ref<number | undefined>>("episodesId");
const canvasRouter = useRouter();
function openCanvas() {
  const scriptId = canvasEpisodesId?.value;
  canvasRouter.push({ path: "/canvas", query: scriptId ? { scriptId: String(scriptId) } : {} });
}
</script>

<style lang="scss" scoped>
.assets {
  width: fit-content;
  user-select: text;
  cursor: default;

  .titleBar {
    cursor: grab;
    user-select: none;

    .openCanvas {
      margin-right: 8px;
    }

    .title {
      background-color: #000;
      width: fit-content;
      padding: 5px 10px;
      color: #fff;
      border-radius: 8px 0;
      font-size: 16px;
    }
  }

  .content {
    margin-top: 8px;

    .cardGrid {
      display: flex;
      flex-direction: column;

      .assetItemBox {
        display: flex;
        align-items: stretch;
        gap: 12px;
        padding: 10px;
        content-visibility: auto;
        contain-intrinsic-size: auto 250px;

        &:not(:first-child) {
          margin-top: 8px;
        }

        .assetCard {
          width: 200px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          &:hover {
            .remove,
            .replace {
              opacity: 1;
            }
          }
          .replace {
            position: absolute;
            top: 3px;
            left: 3px;
            z-index: 9999;
            padding: 5px;
            border-radius: 10px;
            background-color: color-mix(in srgb, var(--td-brand-color) 75%, transparent);
            cursor: pointer;
            opacity: 0;
            transition: opacity 150ms;
            &:hover {
              background-color: var(--td-brand-color);
            }
          }
          .assetImageWrap {
            width: 100%;
            aspect-ratio: 1 / 1;

            &.assetImagePlaceholder {
              display: flex;
              align-items: center;
              justify-content: center;
              background-color: var(--td-bg-color-container-hover, #f5f5f5);
              border-radius: 4px;
              overflow: hidden;
            }

            .assetImage {
              height: 100%;
              border-radius: 4px;

              .imageToolsWrap {
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
              }

              &:hover .imageToolsWrap {
                opacity: 1;
                pointer-events: auto;
              }
            }
          }

          .cardInfo {
            margin-top: 8px;

            .cardName {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 13px;
              font-weight: 600;
              color: #333;

              .nameText {
                text-overflow: ellipsis;
                white-space: nowrap;
                overflow: hidden;
                max-width: 120px;
              }
            }

            .cardDesc {
              font-size: 11px;
              color: #999;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
          }
        }

        .divider {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        .deriveAssets {
          display: flex;
          align-items: stretch;
          gap: 12px;

          .remove {
            position: absolute;
            top: 3px;
            right: 3px;
            z-index: 9999;
            padding: 5px;
            border-radius: 10px;
            background-color: rgba(220, 50, 50, 0.7);
            cursor: pointer;
            opacity: 0;
            &:hover {
              background-color: rgba(220, 50, 50, 1);
            }
          }
          .emptyCard {
            display: flex;
            align-items: center;
            justify-content: center;

            :deep(.t-card__body) {
              width: 100%;
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
            }
          }
        }
      }
    }
  }
}
</style>
