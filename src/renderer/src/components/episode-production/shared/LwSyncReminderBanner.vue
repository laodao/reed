<template>
  <!--
    LwSyncReminderBanner · 长文同步提醒（FU5-A4 · spec §3.7）

    linked_lw 实体（角色 / 地点 / 物品）在长文项目里被改过，但本剧集 binding
    还没拉新基础值时，在编辑页顶部提示用户。原型 02-stage-asset-edit /
    02-stage-location-edit 都用同一视觉：warning 背景 + 左 warning border。

    数据由 caller 提供：
      - entityName     长文实体名（如"张三" / "茶馆"）
      - lwUpdatedAt    长文实体的 updatedAt（epoch ms）
      - bindingSyncedAt binding 上次同步时间（epoch ms；首次同步前为 0 / null）
    组件计算：lwUpdatedAt > bindingSyncedAt → 显示

    操作：
      - 查看变更链接 → emit('view-changes')
      - 同步基础值按钮 → emit('sync')

    用 var(--el-*) 主题变量；亮 / 暗主题都可读。
  -->
  <div v-if="visible" class="lw-sync-reminder-banner">
    <el-icon class="banner-icon">
      <InfoFilled />
    </el-icon>
    <div class="banner-text">
      长文中{{ entityKindLabel }}<strong>"{{ entityName }}"</strong>的设定
      <span class="elapsed">{{ elapsedText }}</span>更新过 —
      <a class="banner-link" @click.prevent="emit('view-changes')">查看变更</a>
      <span v-if="canSync"> / </span>
      <a v-if="canSync" class="banner-link" @click.prevent="emit('sync')">
        同步基础值
      </a>
    </div>
    <el-button
      v-if="canSync"
      type="primary"
      size="small"
      :loading="syncing"
      @click="emit('sync')"
    >
      <el-icon><Refresh /></el-icon>
      <span>同步基础值</span>
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { InfoFilled, Refresh } from '@element-plus/icons-vue'
import { formatElapsed } from './elapsed-time'

const props = withDefaults(
  defineProps<{
    /** 实体类型，决定文案前缀（"角色" / "地点" / "物品"） */
    entityKind: 'character' | 'location' | 'item'
    /** 长文实体名 */
    entityName: string
    /** 长文实体最后更新时间（epoch ms） */
    lwUpdatedAt: number | null
    /** binding 上次同步时间（epoch ms；null / 0 表示从未同步） */
    bindingSyncedAt: number | null
    /** 是否允许同步（默认 true）；false 时只显示链接，不显示按钮 */
    canSync?: boolean
    /** 同步进行中（loading 态） */
    syncing?: boolean
  }>(),
  {
    canSync: true,
    syncing: false,
  },
)

const emit = defineEmits<{
  (e: 'view-changes'): void
  (e: 'sync'): void
}>()

const KIND_LABEL: Record<typeof props.entityKind, string> = {
  character: '角色',
  location: '地点',
  item: '物品',
}

const entityKindLabel = computed(() => KIND_LABEL[props.entityKind])

/** lwUpdatedAt > bindingSyncedAt 才显示 */
const visible = computed(() => {
  if (!props.lwUpdatedAt) return false
  const synced = props.bindingSyncedAt ?? 0
  return props.lwUpdatedAt > synced
})

/** 相对时间文案：刚刚 / N 分钟前 / N 小时前 / N 天前（>30 天回退日期）*/
const elapsedText = computed(() => formatElapsed(props.lwUpdatedAt))
</script>

<style scoped>
.lw-sync-reminder-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: var(--el-color-warning-light-9);
  border-left: 3px solid var(--el-color-warning);
  border-radius: 0 4px 4px 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.banner-icon {
  color: var(--el-color-warning);
  font-size: 18px;
  flex-shrink: 0;
}

.banner-text {
  flex: 1;
  line-height: 1.6;
}

.banner-text strong {
  color: var(--el-text-color-primary);
}

.elapsed {
  color: var(--el-color-warning);
  font-weight: 500;
  margin: 0 2px;
}

.banner-link {
  color: var(--el-color-primary);
  cursor: pointer;
  text-decoration: none;
}

.banner-link:hover {
  text-decoration: underline;
}
</style>
