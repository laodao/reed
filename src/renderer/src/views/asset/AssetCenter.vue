<template>
  <div class="asset-center">
    <!-- 顶部：标题 + 导入 + 搜索 -->
    <div class="toolbar">
      <div>
        <div class="page-title">资产管理</div>
        <div class="page-desc">工作流「保存资产」节点的成果统一沉淀在这里——按分类查看、预览、复用、删除；「模板」类资产供工作流报告渲染引用</div>
      </div>
      <div class="toolbar-right">
        <el-button v-if="activeCategory === 'template'" type="primary" plain @click="openTemplateEditor()">✏️ 新建模板</el-button>
        <el-button v-if="activeCategory === 'template'" @click="handleUploadTemplate">📄 上传模板</el-button>
        <el-button type="primary" @click="handleImport">📥 导入文件</el-button>
        <el-input v-model="keyword" placeholder="搜索名称 / 描述 / 标签" clearable class="search" :prefix-icon="Search" @keyup.enter="handleSearch" @clear="handleSearch" />
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

    <!-- 二级子分类（选择大类后展示） -->
    <div v-if="activeCategory && subCategoryTabs.length > 1" class="sub-cat-bar">
      <div
        v-for="sub in subCategoryTabs"
        :key="sub.value"
        class="sub-cat-tab"
        :class="{ active: activeSubCategory === sub.value }"
        @click="switchSubCategory(sub.value)"
      >
        {{ sub.label }}<span class="cat-count">{{ sub.count }}</span>
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
            <div v-else-if="asset.category === 'template'" class="template-preview">{{ (asset.textContent ?? '').slice(0, 200) }}</div>
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
              <el-tag v-if="asset.isBuiltin" size="small" type="warning" effect="plain">内置</el-tag>
              <el-tag size="small" type="info">{{ categoryLabel(asset.category) }}</el-tag>
            </div>
            <div class="meta">{{ formatSize(asset.sizeBytes) }} · {{ formatDate(asset.createdAt) }}</div>
            <div v-if="asset.subCategory" class="meta sub-meta">📁 {{ asset.subCategory }}</div>
            <div v-if="asset.tags.length" class="tags">
              <span v-for="t in asset.tags" :key="t" class="tag">#{{ t }}</span>
            </div>
            <div v-if="asset.description" class="desc" :title="asset.description">{{ asset.description }}</div>
          </div>

          <!-- 操作区 -->
          <div class="card-actions">
            <el-button size="small" :disabled="!previewUrl(asset)" @click="openPreview(asset)">预览</el-button>
            <el-button v-if="asset.category === 'template'" size="small" @click="openTemplateEditor(asset)">编辑</el-button>
            <el-button size="small" :disabled="asset.kind !== 'file'" @click="openFolder(asset)">打开目录</el-button>
            <el-button size="small" :disabled="!previewUrl(asset)" @click="copyUrl(asset)">复制链接</el-button>
            <el-button text type="danger" size="small" :disabled="asset.isBuiltin" @click="handleDelete(asset)">删除</el-button>
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
        <pre v-else-if="previewAsset?.category === 'text' || previewAsset?.category === 'template'" class="big-text">{{ previewAsset?.textContent }}</pre>
        <pre v-else-if="previewAsset?.category === 'json'" class="big-text">{{ previewAsset?.jsonContent }}</pre>
        <div v-else-if="previewAsset?.url" class="big-url">
          <a :href="previewAsset.url" target="_blank" rel="noopener">{{ previewAsset.url }}</a>
        </div>
        <div v-else class="big-hint">该资产无可预览内容</div>
      </div>
    </el-dialog>

    <!-- 模板编辑弹窗（新建/编辑：名称 + 子分类 + markdown 内容 + 实时预览） -->
    <el-dialog v-model="templateEditorVisible" :title="templateEditing?.id ? '编辑模板' : '新建模板'" width="760px" append-to-body>
      <div class="tpl-editor">
        <div class="tpl-fields">
          <el-input v-model="templateDraft.name" placeholder="模板名称" style="width: 300px" />
          <el-input v-model="templateDraft.subCategory" placeholder="子分类（如 报告模板/海报模板）" style="width: 240px" />
        </div>
        <div class="tpl-body">
          <div class="tpl-pane">
            <div class="tpl-pane-title">Markdown 内容（支持 {{占位}} 变量）</div>
            <el-input v-model="templateDraft.content" type="textarea" :rows="14" placeholder="# 报告标题\n\n{{llm1.content}}" />
          </div>
          <div class="tpl-pane">
            <div class="tpl-pane-title">预览</div>
            <div class="tpl-render" v-html="renderedTemplate"></div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="templateEditorVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate">保存模板</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 资产中心页（/assets）
 * 通用资产库的统一视图：分类筛选（带计数）+ 二级子分类 + 内嵌预览 / 搜索 / 打开目录 / 复制链接 / 删除 / 导入
 * 模板资产（category=template）：新建/上传/编辑/预览，供工作流 read-asset 引用渲染
 */
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { toFileUrl, toImageUrl, toVideoUrl } from '@/utils/asset-url'
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS, type AssetCategory, type AssetRecord } from '@shared/types/asset.types'
import { electronApi } from '@/types/electron-api'
import { marked } from 'marked'

const api = electronApi()

const items = ref<AssetRecord[]>([])
const loading = ref(false)
const activeCategory = ref<AssetCategory | ''>('')
const activeSubCategory = ref<string>('')
const keyword = ref('')
const page = ref(1)
const pageSize = ref(12)
const total = ref(0)
const stats = ref<Record<string, number>>({})
const subStats = ref<Array<{ subCategory: string | null; count: number }>>([])

/** 分类标签（全部 + 各分类带计数） */
const categoryTabs = computed<Array<{ value: AssetCategory | ''; label: string; count: number }>>(() => [
  { value: '', label: '全部', count: stats.value.total ?? 0 },
  ...(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map(c => ({
    value: c,
    label: ASSET_CATEGORY_LABELS[c],
    count: stats.value[c] ?? 0,
  })),
])

/** 二级子分类标签（当前大类下；含"全部"） */
const subCategoryTabs = computed<Array<{ value: string; label: string; count: number }>>(() => {
  const groups = new Map<string, number>()
  for (const s of subStats.value) {
    const key = s.subCategory ?? '未分组'
    groups.set(key, (groups.get(key) ?? 0) + s.count)
  }
  const totalInCat = groups.size ? Array.from(groups.values()).reduce((a, b) => a + b, 0) : 0
  return [
    { value: '', label: '全部', count: totalInCat },
    ...Array.from(groups.entries()).map(([label, count]) => ({ value: label, label, count })),
  ]
})

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
  if (asset.category === 'template') return '📋'
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
      api.assets.list({ category: activeCategory.value, subCategory: activeSubCategory.value, keyword: keyword.value, page: page.value, pageSize: pageSize.value }),
      api.assets.stats(),
    ])
    if (listResp.success) {
      items.value = listResp.data?.items ?? []
      total.value = listResp.data?.total ?? 0
    } else ElMessage.error(listResp.error ?? '加载失败')
    if (statsResp.success) stats.value = statsResp.data?.byCategory ?? {}
    // 二级子分类计数（当前大类）
    if (activeCategory.value) {
      const subResp = await api.assets.subCategoryStats(activeCategory.value)
      if (subResp.success) subStats.value = subResp.data ?? []
    } else {
      subStats.value = []
    }
  } finally {
    loading.value = false
  }
}

function switchCategory(cat: AssetCategory | ''): void {
  activeCategory.value = cat
  activeSubCategory.value = ''
  page.value = 1
  void load()
}

function switchSubCategory(sub: string): void {
  activeSubCategory.value = sub
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

/** 上传模板：.md/.html/.txt 文件 → 以 text 形态 template 类入库 */
async function handleUploadTemplate(): Promise<void> {
  const pick = await api.file.openDialog({ filters: [{ name: '模板文件', extensions: ['md', 'html', 'txt'] }] })
  if (!pick.success || !pick.files?.length) return
  const filePath = pick.files[0].filePath
  const name = pick.files[0].fileName
  const read = await api.file.readTextFile?.({ path: filePath })
  const content = read?.success ? read.data : ''
  const resp = await api.assets.create({ content: { kind: 'text', text: content || '' }, category: 'template', subCategory: '报告模板', name: name.replace(/\.(md|html|txt)$/i, '') })
  if (resp.success) {
    ElMessage.success('模板已上传')
    await load()
  } else ElMessage.error(resp.error ?? '上传失败')
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
  if (asset.isBuiltin) {
    ElMessage.warning('内置资产不可删除（可复制为自有后修改）')
    return
  }
  try {
    await ElMessageBox.confirm(`删除资产「${asset.name}」？文件将一并删除，不可恢复。`, '删除资产', { type: 'warning' })
  } catch {
    return // 用户取消
  }
  const resp = await api.assets.delete(asset.id)
  if (resp.success) { ElMessage.success('已删除'); await load() }
  else ElMessage.error(resp.error ?? '删除失败')
}

// ---- 模板编辑器（新建/编辑/保存） ----
const templateEditorVisible = ref(false)
const templateEditing = ref<AssetRecord | null>(null)
const templateDraft = ref<{ name: string; subCategory: string; content: string }>({ name: '', subCategory: '报告模板', content: '' })

const renderedTemplate = computed(() => {
  try {
    return marked.parse(templateDraft.value.content || '*(空白模板)*') as string
  } catch {
    return '<p>模板渲染失败</p>'
  }
})

function openTemplateEditor(asset?: AssetRecord): void {
  if (asset?.isBuiltin) {
    ElMessage.warning('内置模板不可编辑（可复制为自有后修改）')
    return
  }
  templateEditing.value = asset ?? null
  templateDraft.value = asset
    ? { name: asset.name, subCategory: asset.subCategory ?? '', content: asset.textContent ?? '' }
    : { name: '', subCategory: '报告模板', content: '' }
  templateEditorVisible.value = true
}

async function saveTemplate(): Promise<void> {
  const name = templateDraft.value.name.trim()
  if (!name) { ElMessage.warning('请输入模板名称'); return }
  const subCategory = templateDraft.value.subCategory.trim() || null
  if (templateEditing.value?.id) {
    const resp = await api.assets.update({ id: templateEditing.value.id, name, subCategory })
    if (!resp.success) { ElMessage.error(resp.error ?? '保存失败'); return }
    // 内容更新（assets.update 不更新 textContent → 用 create 语义：删旧建新？不——这里直接调 create 会新建。
    // 方案：编辑内容时走「另存为新模板」，避免破坏引用；改名/子分类走 update。
    if (templateDraft.value.content !== (templateEditing.value.textContent ?? '')) {
      const dup = await api.assets.create({ content: { kind: 'text', text: templateDraft.value.content }, category: 'template', subCategory, name: `${name}（编辑版）` })
      if (!dup.success) { ElMessage.error(dup.error ?? '内容保存失败'); return }
      ElMessage.success('已保存为「编辑版」新模板（原模板内容不变）')
    } else {
      ElMessage.success('模板已更新')
    }
  } else {
    const resp = await api.assets.create({ content: { kind: 'text', text: templateDraft.value.content }, category: 'template', subCategory, name })
    if (!resp.success) { ElMessage.error(resp.error ?? '创建失败'); return }
    ElMessage.success('模板已创建')
  }
  templateEditorVisible.value = false
  await load()
}

// ---- 大图预览 ----
const previewVisible = ref(false)
const previewAsset = ref<AssetRecord | null>(null)
function openPreview(asset: AssetRecord): void {
  if (!previewUrl(asset) && asset.category !== 'text' && asset.category !== 'template' && asset.category !== 'json') return
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
.cat-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; flex-shrink: 0; }
.cat-tab { padding: 5px 12px; border-radius: 14px; font-size: 13px; cursor: pointer; color: var(--el-text-color-regular); background: var(--el-fill-color); transition: all .15s; }
.cat-tab:hover { color: var(--el-color-primary); }
.cat-tab.active { background: var(--el-color-primary); color: #fff; }
.cat-count { font-size: 11px; opacity: .75; margin-left: 4px; }

/* 二级子分类条 */
.sub-cat-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; flex-shrink: 0; padding-left: 4px; }
.sub-cat-tab { padding: 3px 10px; border-radius: 12px; font-size: 12px; cursor: pointer; color: var(--el-text-color-regular); border: 1px dashed var(--el-border-color); transition: all .15s; }
.sub-cat-tab:hover { color: var(--el-color-primary); border-color: var(--el-color-primary); }
.sub-cat-tab.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); border-color: var(--el-color-primary); }

/* 模板预览（文本摘录） */
.template-preview { width: 100%; height: 100%; padding: 10px 12px; font-size: 12px; color: var(--el-text-color-regular); white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; cursor: zoom-in; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--el-fill-color-lighter); }

.sub-meta { margin-top: 2px; }

/* 模板编辑器 */
.tpl-editor { display: flex; flex-direction: column; gap: 12px; }
.tpl-fields { display: flex; gap: 10px; }
.tpl-body { display: flex; gap: 12px; }
.tpl-pane { flex: 1; min-width: 0; }
.tpl-pane-title { font-size: 12px; font-weight: 600; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.tpl-render { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 10px 12px; height: 300px; overflow-y: auto; font-size: 13px; background: var(--el-bg-color); }
.tpl-render :deep(h1) { font-size: 18px; } .tpl-render :deep(h2) { font-size: 16px; } .tpl-render :deep(h3) { font-size: 14px; }
.tpl-render :deep(pre) { background: var(--el-fill-color-lighter); padding: 8px; border-radius: 4px; overflow-x: auto; }

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
