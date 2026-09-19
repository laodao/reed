<template>
  <div class="asset-tree">
    <div class="tree-toolbar">
      <span class="tree-title">资产</span>
      <el-button text size="small" @click="$emit('create')">
        <el-icon><Plus /></el-icon>
        新建
      </el-button>
    </div>
    <div class="tree-list">
      <!-- 角色 -->
      <div class="group">
        <div class="group-title">角色 ({{ characters.length }})</div>
        <div
          v-for="c in characters"
          :key="idOf(c)"
          class="tree-item"
          :class="{ active: selected.kind === 'character' && selected.id === idOf(c) }"
          @click="$emit('select', { kind: 'character', id: idOf(c), name: nameOf(c) })"
        >
          <el-icon class="item-icon"><User /></el-icon>
          <span class="item-name">{{ nameOf(c) }}</span>
          <el-tag v-if="statusOf(c) === 'done'" size="small" effect="light" type="success" round class="done-tag">已定妆</el-tag>
          <el-tag v-else-if="statusOf(c) === 'unconfirmed'" size="small" effect="plain" type="warning" round class="done-tag">未确认</el-tag>
          <el-tag v-else size="small" effect="plain" type="info" round class="done-tag">待生成</el-tag>
        </div>
      </div>

      <!-- 地点 -->
      <div class="group">
        <div class="group-title">地点 ({{ locations.length }})</div>
        <div
          v-for="l in locations"
          :key="idOf(l)"
          class="tree-item"
          :class="{ active: selected.kind === 'location' && selected.id === idOf(l) }"
          @click="$emit('select', { kind: 'location', id: idOf(l), name: nameOf(l) })"
        >
          <el-icon class="item-icon"><Location /></el-icon>
          <span class="item-name">{{ nameOf(l) }}</span>
          <el-tag v-if="statusOf(l) === 'done'" size="small" effect="light" type="success" round class="done-tag">已定妆</el-tag>
          <el-tag v-else-if="statusOf(l) === 'unconfirmed'" size="small" effect="plain" type="warning" round class="done-tag">未确认</el-tag>
          <el-tag v-else size="small" effect="plain" type="info" round class="done-tag">待生成</el-tag>
        </div>
      </div>

      <!-- 物品 -->
      <div class="group">
        <div class="group-title">物品 ({{ items.length }})</div>
        <div
          v-for="i in items"
          :key="idOf(i)"
          class="tree-item"
          :class="{ active: selected.kind === 'item' && selected.id === idOf(i) }"
          @click="$emit('select', { kind: 'item', id: idOf(i), name: nameOf(i) })"
        >
          <el-icon class="item-icon"><Goods /></el-icon>
          <span class="item-name">{{ nameOf(i) }}</span>
          <el-tag v-if="statusOf(i) === 'done'" size="small" effect="light" type="success" round class="done-tag">已定妆</el-tag>
          <el-tag v-else-if="statusOf(i) === 'unconfirmed'" size="small" effect="plain" type="warning" round class="done-tag">未确认</el-tag>
          <el-tag v-else size="small" effect="plain" type="info" round class="done-tag">待生成</el-tag>
        </div>
      </div>

      <div v-if="empty" class="tree-empty">
        暂无资产<br />可在右侧让助手识别或生成
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * M3 资产页 · 左侧资产树（角色/地点/物品分组 + 选中态 + 定妆三态标注）。
 * 三态判定（与 AssetGallery 图集导航口径一致）：有主图且 confirmed=1 → 已定妆；
 * 有主图未确认 → 未确认；无主图 → 待生成。
 */
import { computed } from 'vue'
import { Plus, User, Location, Goods } from '@element-plus/icons-vue'

const props = defineProps<{
  characters: any[]
  locations: any[]
  items: any[]
  selected: { kind: string; id: string }
}>()

defineEmits<{
  (e: 'select', asset: { kind: 'character' | 'location' | 'item'; id: string; name: string }): void
  (e: 'create'): void
}>()

function idOf(binding: any): string {
  return binding.bindingId || binding.id
}

function nameOf(binding: any): string {
  return binding.name || binding.standaloneName || binding.overrideName || binding.locationName || binding.itemName || '(未命名)'
}

function statusOf(binding: any): 'done' | 'unconfirmed' | 'pending' {
  // projectSummary 的 BindingSummary 带 hasMain/mainConfirmed；raw 行用 referenceImagePath 兜底
  const hasMain = typeof binding.hasMain === 'boolean' ? binding.hasMain : !!(binding as any).referenceImagePath
  if (!hasMain) return 'pending'
  if (typeof binding.mainConfirmed === 'boolean') return binding.mainConfirmed ? 'done' : 'unconfirmed'
  // raw 行没有 mainConfirmed 字段：保持旧行为，有主图即视为已定妆
  return 'done'
}

const empty = computed(() =>
  props.characters.length === 0 && props.locations.length === 0 && props.items.length === 0,
)
</script>

<style lang="scss" scoped>
.asset-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color-lighter);
  .tree-title { font-size: 13px; font-weight: 600; color: var(--text-color-primary); }
}

.tree-list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px; }

.group { margin-bottom: 10px; }
.group-title {
  padding: 6px 10px 4px;
  font-size: 11px;
  color: var(--text-color-placeholder);
  letter-spacing: .3px;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color-regular);
  transition: all var(--transition-fast);
  &:hover { background: var(--fill-color-light); }
  &.active { background: var(--color-primary-light-9); color: var(--color-primary); }
  .item-icon { font-size: 14px; color: var(--text-color-secondary); flex-shrink: 0; }
  &.active .item-icon { color: var(--color-primary); }
  .item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .done-tag { flex-shrink: 0; font-size: 10px; }
}

.tree-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-color-placeholder);
  line-height: 1.7;
}
</style>
