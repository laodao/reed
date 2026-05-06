<template>
  <!--
    EntityColumn · ① 内容 stage v2 单列要素卡（FU5-B2）

    一列对应一类资产（角色 / 地点 / 物品）。
    每张卡：checkbox 取舍 + name + role/type + desc + AssetSourceTag + 改 source / 编辑 / 删除 操作。

    交互事件由父组件 (StageContentViewV2) 处理：
    - toggle(idx)        — 切换 confirmed
    - toggle-source(idx) — 切换 sourceType
    - add                — 弹"+ 手动加" dialog
    - edit(idx)          — 弹编辑 dialog
    - delete(idx)        — 弹删除确认
  -->
  <div class="entity-col">
    <header class="col-header">
      <span class="col-title">
        <span class="col-icon">{{ icon }}</span>
        <span>{{ title }}</span>
        <el-tag size="small" round class="col-count">
          {{ entities.length }}
          <template v-if="confirmedInCol < entities.length">
            （已选 {{ confirmedInCol }}）
          </template>
        </el-tag>
      </span>
      <span class="col-actions">
        <el-button
          v-if="canReidentify"
          size="small"
          :loading="reidentifying"
          :title="`仅重新识别${title}`"
          @click="emit('reidentify')"
        >
          <el-icon><Refresh /></el-icon>
          <span>重新识别</span>
        </el-button>
        <el-button size="small" @click="emit('add')">
          <el-icon><Plus /></el-icon>
          <span>手动加</span>
        </el-button>
      </span>
    </header>

    <div v-if="entities.length === 0" class="empty-hint">
      未识别到{{ title }}，可点上方"AI 识别要素"或"+ 手动加"。
    </div>

    <ul v-else class="entity-list">
      <li
        v-for="(e, idx) in entities"
        :key="e.id ?? idx"
        class="entity-card"
        :class="{ confirmed: e.confirmed, dimmed: !e.confirmed }"
      >
        <el-checkbox
          :model-value="!!e.confirmed"
          class="entity-check"
          @change="emit('toggle', idx)"
        />
        <div class="entity-body">
          <div class="entity-name-row">
            <span class="entity-name">{{ e.name }}</span>
            <AssetSourceTag
              :source="(e.sourceType ?? 'standalone') as 'linked_lw' | 'standalone'"
              size="small"
              effect="light"
            />
          </div>
          <div v-if="getSubtitle(e)" class="entity-subtitle">
            {{ getSubtitle(e) }}
          </div>
          <div v-if="e.description" class="entity-desc">
            {{ e.description }}
          </div>
          <div class="entity-actions">
            <a
              v-if="e.sourceType === 'linked_lw'"
              class="action-link"
              @click="emit('toggle-source', idx)"
            >改为 standalone</a>
            <a v-else class="action-link" @click="emit('toggle-source', idx)">
              改为 linked_lw
            </a>
            <span class="action-sep">·</span>
            <a class="action-link" @click="emit('edit', idx)">编辑</a>
            <span class="action-sep">·</span>
            <a class="action-link danger" @click="emit('delete', idx)">移除</a>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Refresh } from '@element-plus/icons-vue'
import AssetSourceTag from '../shared/AssetSourceTag.vue'
import type {
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
} from '../../../../../shared/types/episode-production'

type AnyEntity = UploadedCharacter | UploadedLocation | UploadedItem

const props = defineProps<{
  kind: 'character' | 'location' | 'item'
  icon: string
  title: string
  entities: AnyEntity[]
  /** 是否允许"重新识别" — 由父组件控制（uploaded 模式 + 未确认 + 有原文） */
  canReidentify?: boolean
  /** 当前列正在重新识别（loading 态） */
  reidentifying?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', idx: number): void
  (e: 'toggle-source', idx: number): void
  (e: 'add'): void
  (e: 'edit', idx: number): void
  (e: 'delete', idx: number): void
  (e: 'reidentify'): void
}>()

const confirmedInCol = computed(
  () => props.entities.filter((e) => e.confirmed).length,
)

function getSubtitle(e: AnyEntity): string {
  const role = (e as UploadedCharacter).role
  const type =
    (e as UploadedLocation).type ?? (e as UploadedItem).type ?? undefined
  return role || type || ''
}
</script>

<style scoped>
.entity-col {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 200px;
}

.col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  gap: 6px;
}

.col-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.col-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
}

.col-icon {
  font-size: 16px;
}

.col-count {
  margin-left: 4px;
}

.empty-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
  padding: 16px 8px;
}

.entity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.entity-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  transition: background 0.15s, opacity 0.15s;
}

.entity-card.confirmed {
  background: var(--el-color-success-light-9);
}

.entity-card.dimmed {
  opacity: 0.6;
}

.entity-check {
  margin-top: 1px;
  flex-shrink: 0;
}

.entity-body {
  flex: 1;
  min-width: 0;
}

.entity-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.entity-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.entity-subtitle {
  font-size: 11px;
  color: var(--el-color-primary);
  margin-top: 2px;
}

.entity-desc {
  font-size: 11px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
  margin-top: 3px;
}

.entity-actions {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  flex-wrap: wrap;
}

.action-link {
  color: var(--el-color-primary);
  cursor: pointer;
  text-decoration: none;
}

.action-link:hover {
  text-decoration: underline;
}

.action-link.danger {
  color: var(--el-color-danger);
}

.action-sep {
  color: var(--el-text-color-placeholder);
}
</style>
