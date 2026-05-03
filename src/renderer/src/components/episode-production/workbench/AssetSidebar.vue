<template>
  <aside class="ep-asset-sidebar">
    <el-collapse v-model="openSections" class="sidebar-collapse">
      <!-- 角色 -->
      <el-collapse-item name="character">
        <template #title>
          <span class="sidebar-section-title">
            <el-icon><User /></el-icon>
            <span>角色</span>
            <el-tag size="small" round>{{ characters.length }}</el-tag>
          </span>
        </template>
        <div
          v-for="c in characters"
          :key="c.id"
          class="sidebar-item"
          :class="{ active: c.id === props.activeCharacterId }"
          @click="emit('select-character', c.id)"
        >
          <div class="thumb thumb-character">
            <el-icon><Avatar /></el-icon>
          </div>
          <div class="meta">
            <div class="name">{{ effectiveCharacterName(c) }}</div>
            <el-tag
              :type="c.sourceType === 'linked_lw' ? 'primary' : 'warning'"
              size="small"
              effect="plain"
            >
              {{ c.sourceType === 'linked_lw' ? 'linked' : 'standalone' }}
            </el-tag>
          </div>
        </div>
        <el-empty
          v-if="characters.length === 0"
          description="暂无角色"
          :image-size="48"
        />
        <div class="sidebar-add-row">
          <el-button text size="small" @click="emit('add-character')">
            + 添加角色
          </el-button>
        </div>
      </el-collapse-item>

      <!-- 地点 -->
      <el-collapse-item name="location">
        <template #title>
          <span class="sidebar-section-title">
            <el-icon><Location /></el-icon>
            <span>地点</span>
            <el-tag size="small" round>{{ locations.length }}</el-tag>
          </span>
        </template>
        <div
          v-for="l in locations"
          :key="l.id"
          class="sidebar-item"
          :class="{ active: l.id === props.activeLocationId }"
          @click="emit('select-location', l.id)"
        >
          <div class="thumb thumb-location">
            <el-icon><Location /></el-icon>
          </div>
          <div class="meta">
            <div class="name">{{ effectiveLocationName(l) }}</div>
            <el-tag
              :type="l.sourceType === 'linked_lw' ? 'primary' : 'warning'"
              size="small"
              effect="plain"
            >
              {{ l.sourceType === 'linked_lw' ? 'linked' : 'standalone' }}
            </el-tag>
          </div>
        </div>
        <el-empty
          v-if="locations.length === 0"
          description="暂无地点"
          :image-size="48"
        />
        <div class="sidebar-add-row">
          <el-button text size="small" @click="emit('add-location')">
            + 添加地点
          </el-button>
        </div>
      </el-collapse-item>

      <!-- 物品 -->
      <el-collapse-item name="item">
        <template #title>
          <span class="sidebar-section-title">
            <el-icon><Box /></el-icon>
            <span>物品</span>
            <el-tag size="small" round>{{ items.length }}</el-tag>
          </span>
        </template>
        <div
          v-for="it in items"
          :key="it.id"
          class="sidebar-item"
          :class="{ active: it.id === props.activeItemId }"
          @click="emit('select-item', it.id)"
        >
          <div class="thumb thumb-item">
            <el-icon><Box /></el-icon>
          </div>
          <div class="meta">
            <div class="name">{{ effectiveItemName(it) }}</div>
            <el-tag
              :type="it.sourceType === 'linked_lw' ? 'primary' : 'warning'"
              size="small"
              effect="plain"
            >
              {{ it.sourceType === 'linked_lw' ? 'linked' : 'standalone' }}
            </el-tag>
          </div>
        </div>
        <el-empty
          v-if="items.length === 0"
          description="暂无物品"
          :image-size="48"
        />
        <div class="sidebar-add-row">
          <el-button text size="small" @click="emit('add-item')">
            + 添加物品
          </el-button>
        </div>
      </el-collapse-item>

      <!-- 语音（无 sourceType tag） -->
      <el-collapse-item name="voice">
        <template #title>
          <span class="sidebar-section-title">
            <el-icon><Microphone /></el-icon>
            <span>语音</span>
            <el-tag size="small" round>{{ voices.length }}</el-tag>
          </span>
        </template>
        <div
          v-for="v in voices"
          :key="v.id"
          class="sidebar-item"
          :class="{ active: v.id === props.activeVoiceId }"
          @click="emit('select-voice', v.id)"
        >
          <div class="thumb thumb-voice">
            <el-icon><Microphone /></el-icon>
          </div>
          <div class="meta">
            <div class="name">{{ effectiveVoiceName(v) }}</div>
          </div>
        </div>
        <el-empty
          v-if="voices.length === 0"
          description="暂无语音"
          :image-size="48"
        />
        <div class="sidebar-add-row">
          <el-button text size="small" @click="emit('add-voice')">
            + 添加语音
          </el-button>
        </div>
      </el-collapse-item>
    </el-collapse>
  </aside>
</template>

<script setup lang="ts">
/**
 * 资产侧边栏（P3a Task 10）
 * @module renderer/components/episode-production/workbench/AssetSidebar
 * @description 4 类资产（角色 / 地点 / 物品 / 语音）的折叠分组列表。
 *              数据源：useEpAssetStore 的新版字段（epAssetCharacters 等），
 *              不复用 V2 字段（characterBindings 等），避免污染 V2 老页面。
 */
import { computed, onMounted, ref, watch } from 'vue'
import {
  Avatar,
  Box,
  Location,
  Microphone,
  User,
} from '@element-plus/icons-vue'
import { useEpAssetStore } from '@/stores/episode-production/asset.store'

const props = defineProps<{
  projectId: string
  activeCharacterId?: string
  activeLocationId?: string
  activeItemId?: string
  activeVoiceId?: string
}>()

const emit = defineEmits<{
  'select-character': [id: string]
  'select-location': [id: string]
  'select-item': [id: string]
  'select-voice': [id: string]
  'add-character': []
  'add-location': []
  'add-item': []
  'add-voice': []
}>()

const assetStore = useEpAssetStore()

// 默认 4 个分组全部展开
const openSections = ref<string[]>(['character', 'location', 'item', 'voice'])

const characters = computed(() => assetStore.epAssetCharacters)
const locations = computed(() => assetStore.epAssetLocations)
const items = computed(() => assetStore.epAssetItems)
const voices = computed(() => assetStore.epAssetVoices)

/**
 * 角色名称选取：
 * - standalone → standaloneName
 * - linked_lw → overrideName ?? '(未命名 lw)'
 *   注：当前 IPC 仅返回 binding 实体，不携带 longWriting.character.name；
 *   后续如需展示 lw 真实名，要单独 IPC 拉取，不在本 task 范围。
 */
function effectiveCharacterName(c: any): string {
  if (!c) return '(未命名)'
  if (c.sourceType === 'standalone') {
    return c.standaloneName || '(未命名)'
  }
  if (c.sourceType === 'linked_lw') {
    return c.overrideName || '(未命名 lw)'
  }
  return c.name || c.standaloneName || c.overrideName || '(未命名)'
}

function effectiveLocationName(l: any): string {
  if (!l) return '(未命名)'
  if (l.sourceType === 'standalone') {
    return l.standaloneName || '(未命名)'
  }
  if (l.sourceType === 'linked_lw') {
    return l.overrideName || '(未命名 lw)'
  }
  return l.name || l.standaloneName || l.overrideName || '(未命名)'
}

function effectiveItemName(it: any): string {
  if (!it) return '(未命名)'
  if (it.sourceType === 'standalone') {
    return it.standaloneName || '(未命名)'
  }
  if (it.sourceType === 'linked_lw') {
    return it.overrideName || '(未命名 lw)'
  }
  return it.name || it.standaloneName || it.overrideName || '(未命名)'
}

/** 语音不区分 sourceType；name 字段直接来自 voice_asset 实体 */
function effectiveVoiceName(v: any): string {
  if (!v) return '(未命名)'
  return v.name || v.voiceName || '(未命名)'
}

onMounted(() => {
  if (props.projectId) {
    void assetStore.loadAssetsByProject(props.projectId)
  }
})

watch(
  () => props.projectId,
  (next, prev) => {
    if (next && next !== prev) {
      void assetStore.loadAssetsByProject(next)
    }
  }
)
</script>

<style scoped>
.ep-asset-sidebar {
  width: 240px;
  height: 100%;
  border-right: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-bg-color);
  overflow-y: auto;
  box-sizing: border-box;
}

.sidebar-collapse {
  border: none;
}

.sidebar-collapse :deep(.el-collapse-item__header) {
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
  height: 36px;
  line-height: 36px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.sidebar-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.sidebar-collapse :deep(.el-collapse-item__content) {
  padding: 4px 0;
}

.sidebar-section-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sidebar-section-title .el-icon {
  font-size: 14px;
  color: var(--el-color-primary);
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  height: 40px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  box-sizing: border-box;
}

.sidebar-item:hover {
  background-color: var(--el-fill-color-light);
}

.sidebar-item.active {
  background-color: var(--el-color-primary-light-9);
  border-left: 2px solid var(--el-color-primary);
  padding-left: 10px;
}

.thumb {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 14px;
}

.thumb-character {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.thumb-location {
  background-color: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.thumb-item {
  background-color: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.thumb-voice {
  background-color: var(--el-color-info-light-9);
  color: var(--el-color-info);
}

.meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name {
  font-size: 13px;
  line-height: 1.2;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-add-row {
  padding: 4px 12px 8px;
}
</style>
