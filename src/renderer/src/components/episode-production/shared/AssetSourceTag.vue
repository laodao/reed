<template>
  <!--
    AssetSourceTag · 资产来源 5 状态标签（FU5-A5）

    spec §1.2 双来源 + §3.4 语音域系统/复刻 + §3.3 地点 3D 占位。
    统一组件让所有 stage（②③④⑤⑥）的卡片 / sidebar / banner / 行内描述
    渲染来源标签时视觉一致。

    5 种 source：
      linked_lw  → 来自长文项目          → primary 蓝
      standalone → 剧集独立              → warning 橙
      3d         → 地点 3D 升级（占位）  → danger 红
      system     → 系统预设音色          → info 灰
      cloned     → 用户复刻音色          → success 绿

    variant：
      tag    → el-tag size 控制（默认 small）；用于卡片标题旁 / 行内文字
      badge  → 卡片缩略图右下角浮层（黑色半透明 + 白字 + 绝对定位）

    用 var(--el-*) 主题变量，亮 / 暗主题都可读。
  -->
  <span
    v-if="variant === 'badge'"
    class="asset-source-badge"
  >
    {{ label }}
  </span>
  <el-tag
    v-else
    :type="elTagType"
    :size="size"
    :round="round"
    :effect="effect"
    class="asset-source-tag"
  >
    {{ label }}
  </el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  ASSET_SOURCE_LABEL,
  ASSET_SOURCE_EL_TAG_TYPE,
  type AssetSource,
} from './asset-source-meta'

const props = withDefaults(
  defineProps<{
    source: AssetSource
    /** tag 视觉风格：tag（el-tag）/ badge（缩略图角） */
    variant?: 'tag' | 'badge'
    /** el-tag size，仅 variant='tag' 生效 */
    size?: 'large' | 'default' | 'small'
    /** el-tag round */
    round?: boolean
    /** el-tag effect */
    effect?: 'light' | 'plain' | 'dark'
    /** 自定义文字（覆盖默认 label） */
    customLabel?: string
  }>(),
  {
    variant: 'tag',
    size: 'small',
    round: false,
    effect: 'light',
  },
)

const label = computed(() => props.customLabel ?? ASSET_SOURCE_LABEL[props.source])
const elTagType = computed(() => ASSET_SOURCE_EL_TAG_TYPE[props.source])
</script>

<style scoped>
.asset-source-tag {
  /* el-tag 默认间距已合理；这里只做最低限度调整 */
  user-select: none;
}

.asset-source-badge {
  position: absolute;
  bottom: 6px;
  right: 6px;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  background: rgba(0, 0, 0, 0.55);
  color: var(--el-color-white, #fff);
  pointer-events: none;
}
</style>
