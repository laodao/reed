<template>
  <!--
    UserAssetLibraryDialog · 跨项目角色库浏览（spec 2026-05-09 ep-redesign §3.2 D2 · P-7）

    用户从我的库引用资产到当前项目。可按 assetType 过滤 / 关键词搜索。
    支持单击选中 → "引用到当前项目" 按钮调 createBinding IPC。
  -->
  <el-dialog
    v-model="visible"
    title="📚 我的资产库"
    width="780px"
    destroy-on-close
    append-to-body
  >
    <div class="library-body">
      <!-- 过滤器 -->
      <div class="filter-row">
        <el-radio-group v-model="filterType" size="small" @change="loadLibrary">
          <el-radio-button :value="undefined">全部</el-radio-button>
          <el-radio-button value="character">角色</el-radio-button>
          <el-radio-button value="location">地点</el-radio-button>
          <el-radio-button value="item">物品</el-radio-button>
        </el-radio-group>
        <el-input
          v-model="keyword"
          placeholder="搜索名称 / 描述"
          size="small"
          clearable
          class="search-input"
          @input="onSearchInput"
        />
        <span class="header-spacer" />
        <el-button v-if="targetProjectId" size="small" type="primary" :disabled="!selectedId || creating" :loading="creating" @click="onUseToProject">
          → 引用到当前项目
        </el-button>
      </div>

      <!-- 列表 -->
      <div v-if="loading" class="loading-hint">加载中...</div>
      <div v-else-if="library.length === 0" class="empty-hint">
        我的库为空。在角色 / 地点 / 物品的资产卡上点 "⭐ 加入我的库" 添加。
      </div>
      <div v-else class="library-grid">
        <article
          v-for="ua in library"
          :key="ua.id"
          class="ua-cell"
          :class="{ 'is-selected': selectedId === ua.id }"
          @click="selectedId = ua.id"
        >
          <div class="ua-thumb">
            <img v-if="firstImage(ua)" :src="toImageUrl(firstImage(ua))" :alt="ua.name" />
            <span v-else class="ua-placeholder">{{ assetTypeEmoji(ua.assetType) }}</span>
          </div>
          <div class="ua-meta">
            <div class="ua-name">{{ ua.name }}</div>
            <div class="ua-desc">{{ ua.description || '—' }}</div>
            <div class="ua-info">
              <el-tag size="small" :type="assetTypeColor(ua.assetType)">{{ assetTypeLabel(ua.assetType) }}</el-tag>
              <span v-if="ua.imagePaths" class="ua-imgs">📷 {{ ua.imagePaths.length }}</span>
            </div>
          </div>
          <div class="ua-actions" @click.stop>
            <el-popconfirm
              title="确认删除？关联此库的项目 binding 不受影响。"
              @confirm="onDelete(ua)"
            >
              <template #reference>
                <el-button size="small" text type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </div>
        </article>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { toImageUrl } from '@/utils/asset-url'

interface UserAsset {
  id: string
  assetType: 'character' | 'location' | 'item'
  name: string
  description: string | null
  imagePaths: string[] | null
  sourceBindingId: string | null
  createdAt: number
}

const props = defineProps<{
  modelValue: boolean
  /** 可选：当前项目 ID；非空时显示"引用到当前项目"按钮 */
  targetProjectId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  /** 用户引用到当前项目后触发，让父组件刷新资产列表 */
  'binding-created': [{ bindingId: string; assetType: string }]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const filterType = ref<'character' | 'location' | 'item' | undefined>(undefined)
const keyword = ref('')
const library = ref<UserAsset[]>([])
const loading = ref(false)
const selectedId = ref<string>('')
const creating = ref(false)

let searchTimer: any = null

function onSearchInput(): void {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadLibrary, 300)
}

watch(visible, (v) => {
  if (v) {
    selectedId.value = ''
    loadLibrary()
  }
})

async function loadLibrary(): Promise<void> {
  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api?.userAsset?.list) {
    ElMessage.error('userAsset IPC 未暴露（请重启）')
    return
  }
  loading.value = true
  try {
    const resp = await api.userAsset.list({
      assetType: filterType.value,
      keyword: keyword.value || undefined,
    })
    if (resp?.success && Array.isArray(resp.data)) {
      library.value = resp.data
    } else {
      library.value = []
      if (!resp?.success) ElMessage.error(resp?.error || '加载库失败')
    }
  } finally {
    loading.value = false
  }
}

async function onUseToProject(): Promise<void> {
  if (!selectedId.value || !props.targetProjectId) return
  const ua = library.value.find((x) => x.id === selectedId.value)
  if (!ua) return
  creating.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    const resp = await api.userAsset.createBinding({
      userAssetId: selectedId.value,
      targetProjectId: props.targetProjectId,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '引用失败')
      return
    }
    ElMessage.success(`已引用到当前项目（${ua.name}）`)
    emit('binding-created', { bindingId: resp.data.bindingId, assetType: ua.assetType })
    visible.value = false
  } finally {
    creating.value = false
  }
}

async function onDelete(ua: UserAsset): Promise<void> {
  const api = (window as any).electronAPI?.episodeProduction?.asset
  const resp = await api?.userAsset?.delete({ userAssetId: ua.id })
  if (!resp?.success) {
    ElMessage.error(resp?.error || '删除失败')
    return
  }
  ElMessage.success('已从库中删除')
  await loadLibrary()
}

function firstImage(ua: UserAsset): string | null {
  return Array.isArray(ua.imagePaths) && ua.imagePaths.length > 0 ? ua.imagePaths[0] : null
}

function assetTypeLabel(t: string): string {
  return t === 'character' ? '角色' : t === 'location' ? '地点' : t === 'item' ? '物品' : t
}

function assetTypeEmoji(t: string): string {
  return t === 'character' ? '👤' : t === 'location' ? '🏛️' : t === 'item' ? '🗡️' : '?'
}

function assetTypeColor(t: string): 'primary' | 'success' | 'warning' | 'info' {
  return t === 'character' ? 'primary' : t === 'location' ? 'success' : 'warning'
}
</script>

<style scoped lang="scss">
.library-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  width: 200px;
}

.header-spacer {
  flex: 1;
}

.loading-hint,
.empty-hint {
  text-align: center;
  padding: 30px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  max-height: 480px;
  overflow-y: auto;
}

.ua-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 2px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
  }

  &.is-selected {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
}

.ua-thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ua-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ua-placeholder {
  font-size: 32px;
  color: var(--el-text-color-placeholder);
}

.ua-meta {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ua-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.ua-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ua-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.ua-imgs {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.ua-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 3px;
  display: none;
}

.ua-cell:hover .ua-actions {
  display: block;
}
</style>
