<template>
  <!--
    PrototypeAssetPanel · 原型左侧资产面板

    调用 episodeProduction.asset.projectSummary 一次性拿全角色/物品/场景，
    分类折叠展示缩略图 + 名字。点击资产 emit 给主组件（可拖入提示词 / 引用）。
  -->
  <aside class="proto-asset-panel">
    <header class="panel-header">
      <span class="panel-title">资产</span>
      <el-icon v-if="loading" class="is-loading"><Loading /></el-icon>
      <el-button text size="small" :icon="Refresh" @click="reload" :loading="loading" />
    </header>

    <div class="panel-body">
      <el-collapse v-model="activeGroups">
        <!-- 角色 -->
        <el-collapse-item name="character">
          <template #title>
            <span class="group-title">🎭 角色</span>
            <span class="group-count">{{ characters.length }}</span>
          </template>
          <div v-if="characters.length === 0" class="group-empty">暂无角色</div>
          <div v-else class="asset-grid">
            <div
              v-for="c in characters"
              :key="c.bindingId"
              class="asset-card"
              :class="{ 'is-selected': selectedId === c.bindingId }"
              @click="$emit('select-asset', { kind: 'character', asset: c })"
            >
              <div class="asset-thumb">
                <img v-if="c.mainImagePath" :src="toImageUrl(c.mainImagePath)" :alt="c.name" @error="onImgError" />
                <el-icon v-else class="thumb-placeholder"><User /></el-icon>
              </div>
              <div class="asset-name" :title="c.name">{{ c.name }}</div>
            </div>
          </div>
        </el-collapse-item>

        <!-- 物品 -->
        <el-collapse-item name="item">
          <template #title>
            <span class="group-title">🎁 物品</span>
            <span class="group-count">{{ items.length }}</span>
          </template>
          <div v-if="items.length === 0" class="group-empty">暂无物品</div>
          <div v-else class="asset-grid">
            <div
              v-for="it in items"
              :key="it.bindingId"
              class="asset-card"
              :class="{ 'is-selected': selectedId === it.bindingId }"
              @click="$emit('select-asset', { kind: 'item', asset: it })"
            >
              <div class="asset-thumb">
                <img v-if="it.mainImagePath" :src="toImageUrl(it.mainImagePath)" :alt="it.name" @error="onImgError" />
                <el-icon v-else class="thumb-placeholder"><Box /></el-icon>
              </div>
              <div class="asset-name" :title="it.name">{{ it.name }}</div>
            </div>
          </div>
        </el-collapse-item>

        <!-- 场景 -->
        <el-collapse-item name="location">
          <template #title>
            <span class="group-title">🏞️ 场景</span>
            <span class="group-count">{{ locations.length }}</span>
          </template>
          <div v-if="locations.length === 0" class="group-empty">暂无场景</div>
          <div v-else class="asset-grid">
            <div
              v-for="l in locations"
              :key="l.bindingId"
              class="asset-card"
              :class="{ 'is-selected': selectedId === l.bindingId }"
              @click="$emit('select-asset', { kind: 'location', asset: l })"
            >
              <div class="asset-thumb">
                <img v-if="l.mainImagePath" :src="toImageUrl(l.mainImagePath)" :alt="l.name" @error="onImgError" />
                <el-icon v-else class="thumb-placeholder"><Picture /></el-icon>
              </div>
              <div class="asset-name" :title="l.name">{{ l.name }}</div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Loading, Refresh, User, Box, Picture } from '@element-plus/icons-vue'
import { toImageUrl } from '@/utils/asset-url'

/** 资产摘要（与后端 BindingSummary 对齐） */
interface BindingSummary {
  bindingId: string
  name: string
  sourceType?: 'linked_lw' | 'standalone'
  hasMain?: boolean
  mainImagePath?: string | null
  galleryCount?: number
}

const props = defineProps<{
  projectId: string | null | undefined
  /** 当前选中资产 ID（高亮） */
  selectedId?: string | null
}>()

defineEmits<{
  'select-asset': [{ kind: 'character' | 'item' | 'location'; asset: BindingSummary }]
}>()

const loading = ref(false)
const characters = ref<BindingSummary[]>([])
const locations = ref<BindingSummary[]>([])
const items = ref<BindingSummary[]>([])
const activeGroups = ref<string[]>(['character', 'location', 'item'])

async function reload(): Promise<void> {
  if (!props.projectId) return
  loading.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    const resp = await api.projectSummary(props.projectId)
    const data = resp?.data ?? resp
    characters.value = data?.characters ?? []
    locations.value = data?.locations ?? []
    items.value = data?.items ?? []
  } catch (err) {
    console.error('[PrototypeAssetPanel] 加载资产失败:', err)
  } finally {
    loading.value = false
  }
}

function onImgError(e: Event): void {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}

watch(() => props.projectId, () => void reload(), { immediate: true })
</script>

<style scoped lang="scss">
.proto-asset-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);

  .panel-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    flex: 1;
  }

  .is-loading {
    animation: rotate 1.2s linear infinite;
  }
}

@keyframes rotate {
  to { transform: rotate(360deg); }
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0;
}

:deep(.el-collapse) {
  border: none;
}

:deep(.el-collapse-item__header) {
  padding: 0 12px;
  font-size: 13px;
  background: transparent;
}

:deep(.el-collapse-item__content) {
  padding: 8px 12px 12px;
}

.group-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.group-count {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  border-radius: 999px;
  padding: 0 8px;
}

.group-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 8px 0;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.asset-card {
  cursor: pointer;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: var(--el-bg-color);

  &:hover {
    border-color: var(--el-color-primary-light-5);
  }

  &.is-selected {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 2px var(--el-color-primary-light-8);
  }
}

.asset-thumb {
  width: 100%;
  aspect-ratio: 1;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumb-placeholder {
    font-size: 24px;
    color: var(--el-text-color-placeholder);
  }
}

.asset-name {
  font-size: 12px;
  color: var(--el-text-color-primary);
  padding: 4px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}
</style>
