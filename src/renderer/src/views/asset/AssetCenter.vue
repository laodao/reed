<template>
  <div class="asset-center">
    <!-- 顶部：标题 + 导入 + 搜索 -->
    <div class="toolbar">
      <div>
        <div class="page-title">资产管理</div>
        <div class="page-desc">工作流「保存资产」节点的成果统一沉淀在这里——按分类查看、预览、复用、删除</div>
      </div>
      <div class="toolbar-right">
        <el-input v-model="keyword" placeholder="搜索名称 / 描述 / 标签" clearable class="search" :prefix-icon="Search" @keyup.enter="handleSearch" @clear="handleSearch" />
        <el-button type="primary" @click="handleImport">📥 导入文件</el-button>
      </div>
    </div>

    <!-- 分类筛选（带计数） -->
    <div class="cat-bar">
      <div
        v-for="cat in categoryTabs"
        :key="cat.value"
        class="cat-tab"
        :class="{ active: activeCategory === cat.value }"
        @click="switchCategory(cat.value)"
      >
        {{ cat.label }}<span class="cat-count">{{ cat.count }}</span>
      </div>
    </div>

    <!-- 资产网格 -->
    <div class="grid-wrap" v-loading="loading">
      <div v-if="items.length" class="asset-grid">
        <div v-for="asset in items" :key="asset.id" class="asset-card">
          <!-- 预览区 -->
          <div class="preview" @click="openPreview(asset)">
            <img v-if="asset.category === 'image' && previewUrl(asset)" :src="previewUrl(asset)" loading="lazy" alt="" />
            <audio v-else-if="asset.category === 'audio' && previewUrl(asset)" :src="previewUrl(asset)" controls preload="none" @click.stop />
            <video v-else-if="asset.category === 'video' && previewUrl(asset)" :src="previewUrl(asset)" controls preload="none" @click.stop />
            <div v-else-if="asset.category === 'text'" class="text-preview">{{ asset.textContent ?? '' }}</div>
            <div v-else-if="asset.category === 'json'" class="text-preview json">{{ asset.jsonContent ?? '' }}</div>
            <div v-else-if="asset.kind === 'url' && asset.url" class="url-preview">
              <span class="url-icon">🔗</span>
              <span class="url-text">{{ asset.url }}</span>
            </div>
            <div v-else class="doc-preview">
              <span class="doc-icon">{{ docIcon(asset) }}</span>
            </div>
          </div>

          <!-- 信息区 -->
          <div class="card-body">
            <div class="name-row">
              <span class="asset-name" :title="asset.name">{{ asset.name }}</span>
              <el-tag size="small" type="info">{{ categoryLabel(asset.category) }}</el-tag>
            </div>
            <div class="meta">{{ formatSize(asset.sizeBytes) }} · {{ formatDate(asset.createdAt) }}</div>
            <div v-if="asset.tags.length" class="tags">
              <span v-for="t in asset.tags" :key="t" class="tag">#{{ t }}</span>
            </div>
            <div v-if="asset.description" class="desc" :title="asset.description">{{ asset.description }}</div>
          </div>

          <!-- 操作区 -->
          <div class="card-actions">
            <el-button size="small" :disabled="!previewUrl(asset)" @click="openPreview(asset)">预览</el-button>
            <el-button size="small" :disabled="asset.kind !== 'file'" @click="openFolder(asset)">打开目录</el-button>
            <el-button size="small" :disabled="!previewUrl(asset)" @click="copyUrl(asset)">复制链接</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(asset)">删除</el-button>
          </div>
        </div>
      </div>
      <div v-else-if="!loading" class="empty">
        <p>暂无资产</p>
        <p class="hint">在工作流里加一个「保存资产」节点，生成的结果会自动出现在这里；也可点右上角「导入文件」</p>
      </div>
    </div>

    <!-- 分页固定底部 -->
    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[12, 24, 48]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="handlePageChange"
        @size-change="handlePageChange"
      />
    </div>

    <!-- 图片大图预览 -->
    <el-dialog v-model="previewVisible" :title="previewAsset?.name ?? '预览'" width="640px" append-to-body>
      <div class="big-preview">
        <img v-if="previewAsset?.category === 'image'" :src="previewUrl(previewAsset)" alt="" />
        <audio v-else-if="previewAsset?.category === 'audio'" :src="previewUrl(previewAsset)" controls autoplay />
        <video v-else-if="previewAsset?.category === 'video'" :src="previewUrl(previewAsset)" controls autoplay style="width:100%" />
        <pre v-else-if="previewAsset?.category === 'text'" class="big-text">{{ previewAsset?.textContent }}</pre>
        <pre v-else-if="previewAsset?.category === 'json'" class="big-text">{{ previewAsset?.jsonContent }}</pre>
        <div v-else-if="previewAsset?.url" class="big-url">
          <a :href="previewAsset.url" target="_blank" rel="noopener">{{ previewAsset.url }}</a>
        </div>
        <div v-else class="big-hint">该资产无可预览内容</div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 资产中心页（/assets）
 * 通用资产库的统一视图：分类筛选（带计数）/ 内嵌预览 / 搜索 / 打开目录 / 复制链接 / 删除 / 导入
 */
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { toFileUrl, toImageUrl, toVideoUrl } from '@/utils/asset-url'
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS, type AssetCategory, type AssetRecord } from '@shared/types/asset.types'
import { electronApi } from '@/types/electron-api'

const api = electronApi()

const items = ref<AssetRecord[]>([])
const loading = ref(false)
const activeCategory = ref<AssetCategory | ''>('')
const keyword = ref('')
const page = ref(1)
const pageSize = ref(12)
const total = ref(0)
const stats = ref<Record<string, number>>({})

/** 分类标签（全部 + 各分类带计数） */
const categoryTabs = computed<Array<{ value: AssetCategory | ''; label: string; count: number }>>(() => [
  { value: '', label: '全部', count: stats.value.total ?? 0 },
  ...(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map(c => ({
    value: c,
    label: ASSET_CATEGORY_LABELS[c],
    count: stats.value[c] ?? 0,
  })),
])

function categoryLabel(c: AssetCategory): string {
  return ASSET_CATEGORY_LABELS[c] ?? c
}

/** 资产可预览 URL（文件型经渲染端协议转换；链接型原样） */
function previewUrl(asset: AssetRecord): string {
  if (asset.kind === 'file' && asset.storagePath) {
    if (asset.category === 'image') return toImageUrl(asset.storagePath)
    if (asset.category === 'video') return toVideoUrl(asset.storagePath)
    return toFileUrl(asset.storagePath)
  }
  if (asset.kind === 'url' && asset.url) return asset.url
  return ''
}

function docIcon(asset: AssetRecord): string {
  if (asset.category === 'document') return '📄'
  if (asset.category === 'other') return '📦'
  return '📎'
}

function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const [listResp, statsResp] = await Promise.all([
      api.assets.list({ category: activeCategory.value, keyword: keyword.value, page: page.value, pageSize: pageSize.value }),
      api.assets.stats(),
    ])
    if (listResp.success) {
      items.value = listResp.data?.items ?? []
      total.value = listResp.data?.total ?? 0
    } else ElMessage.error(listResp.error ?? '加载失败')
    if (statsResp.success) stats.value = statsResp.data?.byCategory ?? {}
  } finally {
    loading.value = false
  }
}

function switchCategory(cat: AssetCategory | ''): void {
  activeCategory.value = cat
  page.value = 1
  void load()
}

function handleSearch(): void {
  page.value = 1
  void load()
}

function handlePageChange(): void {
  void load()
}

/** 导入文件：系统对话框选文件 → 以 file 形态入库 */
async function handleImport(): Promise<void> {
  const pick = await api.file.openDialog({ filters: [{ name: '所有文件', extensions: ['*'] }] })
  if (!pick.success || !pick.files?.length) return
  const filePath = pick.files[0].filePath
  const name = pick.files[0].fileName
  const resp = await api.assets.create({ content: { kind: 'file', path: filePath }, name })
  if (resp.success) {
    ElMessage.success('已导入资产')
    await load()
  } else ElMessage.error(resp.error ?? '导入失败')
}

async function openFolder(asset: AssetRecord): Promise<void> {
  const resp = await api.assets.openFolder(asset.id)
  if (!resp.success) ElMessage.error(resp.error ?? '打开目录失败')
}

async function copyUrl(asset: AssetRecord): Promise<void> {
  const url = previewUrl(asset)
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('链接已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function handleDelete(asset: AssetRecord): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除资产「${asset.name}」？文件将一并删除，不可恢复。`, '删除资产', { type: 'warning' })
  } catch {
    return // 用户取消
  }
  const resp = await api.assets.delete(asset.id)
  if (resp.success) { ElMessage.success('已删除'); await load() }
  else ElMessage.error(resp.error ?? '删除失败')
}

// ---- 大图预览 ----
const previewVisible = ref(false)
const previewAsset = ref<AssetRecord | null>(null)
function openPreview(asset: AssetRecord): void {
  if (!previewUrl(asset)) return
  previewAsset.value = asset
  previewVisible.value = true
}

onMounted(load)
</script>

<style scoped>
.asset-center { padding: 20px 26px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; flex-shrink: 0; gap: 12px; }
.page-title { font-size: 20px; font-weight: 600; }
.page-desc { color: var(--el-text-color-secondary); font-size: 13px; margin-top: 4px; }
.toolbar-right { display: flex; gap: 10px; align-items: center; }
.search { width: 240px; }

/* 分类条 */
.cat-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; flex-shrink: 0; }
.cat-tab { padding: 5px 12px; border-radius: 14px; font-size: 13px; cursor: pointer; color: var(--el-text-color-regular); background: var(--el-fill-color); transition: all .15s; }
.cat-tab:hover { color: var(--el-color-primary); }
.cat-tab.active { background: var(--el-color-primary); color: #fff; }
.cat-count { font-size: 11px; opacity: .75; margin-left: 4px; }

/* 资产网格 */
.grid-wrap { flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px; }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.asset-card { border: 1px solid var(--el-border-color-lighter); border-radius: 10px; overflow: hidden; background: var(--el-bg-color); display: flex; flex-direction: column; transition: border-color .15s, box-shadow .15s; }
.asset-card:hover { border-color: var(--el-color-primary-light-5); box-shadow: 0 2px 10px rgba(0,0,0,.06); }

.preview { height: 150px; background: var(--el-fill-color-lighter); display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: zoom-in; }
.preview img { width: 100%; height: 100%; object-fit: cover; }
.preview audio { width: 92%; }
.preview video { width: 100%; height: 100%; object-fit: contain; background: #000; }
.text-preview { width: 100%; height: 100%; padding: 10px 12px; font-size: 12px; color: var(--el-text-color-regular); white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; cursor: zoom-in; }
.text-preview.json { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }
.url-preview { display: flex; align-items: center; gap: 8px; padding: 0 14px; color: var(--el-color-primary); font-size: 12px; }
.url-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.doc-preview { font-size: 44px; opacity: .55; }

.card-body { padding: 10px 14px; flex: 1; min-width: 0; }
.name-row { display: flex; align-items: center; gap: 8px; }
.asset-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.meta { font-size: 11px; color: var(--el-text-color-secondary); margin-top: 3px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.tag { font-size: 11px; color: var(--el-color-primary); background: var(--el-color-primary-light-9); padding: 1px 6px; border-radius: 8px; }
.desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.card-actions { display: flex; align-items: center; gap: 4px; padding: 8px 10px; border-top: 1px solid var(--el-border-color-lighter); }

.pager { flex-shrink: 0; display: flex; justify-content: flex-end; padding-top: 14px; }
.empty { color: var(--el-text-color-secondary); text-align: center; padding: 60px 0; }
.empty .hint { font-size: 12px; margin-top: 6px; max-width: 460px; margin-left: auto; margin-right: auto; }

/* 大图预览 */
.big-preview { display: flex; align-items: center; justify-content: center; min-height: 120px; }
.big-preview img { max-width: 100%; max-height: 70vh; }
.big-preview audio { width: 90%; }
.big-text { max-height: 60vh; overflow: auto; width: 100%; white-space: pre-wrap; word-break: break-all; font-size: 13px; }
.big-url { word-break: break-all; }
.big-hint { color: var(--el-text-color-secondary); }
</style>
