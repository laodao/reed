<template>
  <div class="asset-center">
    <!-- 顶部：标题 + 分类管理 + 导入 + 搜索 -->
    <div class="toolbar">
      <div>
        <div class="page-title">资产管理</div>
        <div class="page-desc">工作流「保存资产」节点的成果统一沉淀在这里——按业务分类查看、预览、复用、删除；「模板」类资产供工作流报告渲染引用。分类可自定义（每类业务一个分类），预览方式由分类定义驱动</div>
      </div>
      <div class="toolbar-right">
        <el-button v-if="activeCategory === 'template'" type="primary" plain @click="openTemplateEditor()">✏️ 新建模板</el-button>
        <el-button v-if="activeCategory === 'template'" @click="handleUploadTemplate">📄 上传模板</el-button>
        <el-button @click="openCategoryManager">🗂️ 分类管理</el-button>
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

    <!-- 二级业务分类（选择大类后展示；由分类定义 + 资产聚合驱动，未定义的标「未定义」） -->
    <div v-if="activeCategory && subCategoryTabs.length > 1" class="sub-cat-bar">
      <div
        v-for="sub in subCategoryTabs"
        :key="sub.value"
        class="sub-cat-tab"
        :class="{ active: activeSubCategory === sub.value, undefined: !sub.defined }"
        :title="sub.defined ? '' : '该子分类尚无定义（可在「分类管理」中定义预览行为）'"
        @click="switchSubCategory(sub.value)"
      >
        {{ sub.label }}<span v-if="sub.count != null" class="cat-count">{{ sub.count }}</span>
      </div>
    </div>

    <!-- 资产网格 -->
    <div class="grid-wrap" v-loading="loading">
      <div v-if="items.length" class="asset-grid">
        <div v-for="asset in items" :key="asset.id" class="asset-card">
          <!-- 预览区 -->
          <div class="preview" @click="openPreview(asset)">
            <!-- 分类驱动：report 模式 → 渲染长图缩略图（异步） -->
            <img v-if="previewModeOf(asset) === 'report' && previewImageUrl(asset.id)" :src="previewImageUrl(asset.id)!" loading="lazy" alt="" />
            <div v-else-if="previewModeOf(asset) === 'report'" class="report-placeholder">
              <span class="report-icon">📋</span>
              <span class="report-hint">{{ previewCache[asset.id]?.mode === 'html' ? '渲染 HTML 预览' : '报告 · 点击预览渲染效果' }}</span>
            </div>
            <img v-else-if="asset.category === 'image' && previewUrl(asset)" :src="previewUrl(asset)" loading="lazy" alt="" />
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
            <div v-if="asset.subCategory" class="meta sub-meta">📁 {{ asset.subCategory }}<el-tag v-if="previewModeOf(asset) !== 'auto'" size="small" type="success" effect="plain" class="mode-tag">{{ previewModeLabelOf(asset) }}</el-tag></div>
            <div v-if="asset.tags.length" class="tags">
              <span v-for="t in asset.tags" :key="t" class="tag">#{{ t }}</span>
            </div>
            <div v-if="asset.description" class="desc" :title="asset.description">{{ asset.description }}</div>
          </div>

          <!-- 操作区 -->
          <div class="card-actions">
            <el-button size="small" type="primary" plain :disabled="!canPreview(asset)" @click="openPreview(asset)">预览</el-button>
            <div class="icon-actions">
              <el-tooltip v-if="asset.category === 'template'" content="编辑模板" placement="top">
                <el-button text size="small" @click="openTemplateEditor(asset)"><el-icon><EditPen /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip content="打开所在目录" placement="top">
                <el-button text size="small" :disabled="asset.kind !== 'file'" @click="openFolder(asset)"><el-icon><FolderOpened /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip content="复制链接" placement="top">
                <el-button text size="small" :disabled="!previewUrl(asset)" @click="copyUrl(asset)"><el-icon><Link /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button text type="danger" size="small" :disabled="asset.isBuiltin" @click="handleDelete(asset)"><el-icon><Delete /></el-icon></el-button>
              </el-tooltip>
            </div>
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

    <!-- 大图预览（分类驱动：report/markdown/html 显示渲染结果，其余按存储形态） -->
    <el-dialog v-model="previewVisible" :title="previewAsset?.name ?? '预览'" width="760px" append-to-body>
      <div class="big-preview" v-loading="previewRendering">
        <img v-if="previewAsset && previewUrl(previewAsset) && previewModeOf(previewAsset) === 'auto' && previewAsset.category === 'image'" :src="previewUrl(previewAsset)" alt="" />
        <audio v-else-if="previewAsset && previewModeOf(previewAsset) === 'auto' && previewAsset.category === 'audio'" :src="previewUrl(previewAsset)" controls autoplay />
        <video v-else-if="previewAsset && previewModeOf(previewAsset) === 'auto' && previewAsset.category === 'video'" :src="previewUrl(previewAsset)" controls autoplay style="width:100%" />
        <iframe v-else-if="previewCache[previewAsset?.id ?? '']?.mode === 'html'" class="big-iframe" :srcdoc="previewCache[previewAsset!.id]!.html" sandbox="allow-same-origin"></iframe>
        <img v-else-if="previewImageUrl(previewAsset?.id ?? '')" class="big-render-img" :src="previewImageUrl(previewAsset!.id)!" alt="" />
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
            <div class="tpl-pane-title">Markdown 内容（支持 <span v-pre>{{占位}}</span> 变量）</div>
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

    <!-- 分类管理弹窗（业务分类实体：每类业务一个分类，定义预览行为） -->
    <el-dialog v-model="categoryManagerVisible" title="🗂️ 资产分类管理" width="860px" append-to-body>
      <div class="cat-mgr">
        <div class="cat-mgr-desc">每增加一类业务就增加一个分类（如「每日早报」「行业周报」）；预览方式由分类定义驱动——报告类资产预览渲染后的长图效果而非原始 markdown。</div>
        <el-table :data="allCategories" size="small" max-height="360" border>
          <el-table-column prop="name" label="分类名" width="130" />
          <el-table-column prop="code" label="编码" width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.code ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="允许形态" width="110">
            <template #default="{ row }">
              <el-tag v-if="!row.allowedKinds.length" size="small" type="info" effect="plain">不限</el-tag>
              <el-tag v-for="k in row.allowedKinds" :key="k" size="small" class="kind-tag">{{ KIND_LABELS[k] ?? k }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="可预览" width="80">
            <template #default="{ row }">
              <el-tag :type="row.previewable ? 'success' : 'info'" size="small" effect="plain">{{ row.previewable ? '是' : '否' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="预览模式" width="150">
            <template #default="{ row }">
              <el-tag size="small" type="warning" effect="plain">{{ PREVIEW_MODE_LABELS[row.previewMode as AssetPreviewMode] ?? row.previewMode }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="渲染模板" width="130" show-overflow-tooltip>
            <template #default="{ row }">{{ templateNameOf(row.previewTemplateId) }}</template>
          </el-table-column>
          <el-table-column label="资产数" width="70" align="right">
            <template #default="{ row }">{{ row.count ?? 0 }}</template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" :disabled="row.isBuiltin" @click="openCategoryEditor(row)">编辑</el-button>
              <el-button size="small" text type="danger" :disabled="row.isBuiltin" @click="handleDeleteCategory(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="cat-mgr-footer">
          <el-button type="primary" plain @click="openCategoryEditor()">＋ 新建分类</el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 分类编辑弹窗 -->
    <el-dialog v-model="categoryEditorVisible" :title="categoryEditing?.id ? '编辑分类' : '新建分类'" width="480px" append-to-body>
      <div class="cat-form">
        <el-form label-width="96px" label-position="left">
          <el-form-item label="分类名" required>
            <el-input v-model="categoryDraft.name" placeholder="如：每日早报 / 行业周报 / 海报" />
          </el-form-item>
          <el-form-item label="业务编码">
            <el-input v-model="categoryDraft.code" placeholder="可选，如 morning_report" />
          </el-form-item>
          <el-form-item label="预览模式">
            <el-select v-model="categoryDraft.previewMode" style="width: 100%">
              <el-option v-for="(label, value) in PREVIEW_MODE_LABELS" :key="value" :label="label" :value="value" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="categoryDraft.previewMode === 'report'" label="渲染模板" required>
            <el-select v-model="categoryDraft.previewTemplateId" style="width: 100%" placeholder="选择报告排版模板">
              <el-option v-for="t in previewTemplateOptions" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="允许形态">
            <el-select v-model="categoryDraft.allowedKinds" multiple clearable style="width: 100%" placeholder="留空 = 不限">
              <el-option v-for="(label, value) in KIND_LABELS" :key="value" :label="label" :value="value" />
            </el-select>
          </el-form-item>
          <el-form-item label="可预览">
            <el-switch v-model="categoryDraft.previewable" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="categoryEditorVisible = false">取消</el-button>
        <el-button type="primary" @click="saveCategory">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 资产中心页（/assets）
 * 通用资产库的统一视图：大类筛选（带计数）+ 二级业务分类（分类定义驱动，带计数）
 * + 内嵌预览 / 搜索 / 打开目录 / 复制链接 / 删除 / 导入 + 分类管理
 *
 * 分类驱动预览：资产按 subCategory 命中分类定义后，按 previewMode 呈现——
 * report → 渲染长图（桌面端 PNG / Web 端 HTML）；markdown/html → 渲染排版 HTML；
 * auto/其他 → 按存储形态原生呈现。
 */
import { ref, onMounted, computed, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, EditPen, FolderOpened, Link, Delete } from '@element-plus/icons-vue'
import { toFileUrl, toImageUrl, toVideoUrl } from '@/utils/asset-url'
import {
  ASSET_CATEGORY_LABELS, ASSET_PREVIEW_MODES, ASSET_PREVIEW_MODE_LABELS,
  type AssetCategory, type AssetCategoryDef, type AssetPreviewMode, type AssetPreviewResult, type AssetPreviewTemplateOption, type AssetRecord,
} from '@shared/types/asset.types'
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

/** 当前大类下的已定义分类（带资产计数；listCategories 返回） */
const definedCategories = ref<AssetCategoryDef[]>([])
/** 全量分类定义（分类管理弹窗 + 预览模式查询共用） */
const allCategories = ref<AssetCategoryDef[]>([])
/** 分类名 → 定义（预览模式查询缓存） */
const categoryMap = computed(() => new Map(allCategories.value.map(c => [c.name, c])))
/** 分类渲染预览结果缓存：assetId → 渲染结果 */
const previewCache = reactive<Record<string, AssetPreviewResult>>({})
/** 大图预览渲染中标记 */
const previewRendering = ref(false)

/** 渲染结果为图片时取 data URL（TS 窄化辅助） */
function previewImageUrl(assetId: string): string | null {
  const r = previewCache[assetId]
  return r?.mode === 'image' ? r.url : null
}

const KIND_LABELS: Record<string, string> = { file: '文件', url: '链接', text: '文本', json: '数据' }
const PREVIEW_MODE_LABELS = ASSET_PREVIEW_MODE_LABELS

/** 分类标签（全部 + 各大类带计数） */
const categoryTabs = computed<Array<{ value: AssetCategory | ''; label: string; count: number }>>(() => [
  { value: '', label: '全部', count: stats.value.total ?? 0 },
  ...(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map(c => ({
    value: c,
    label: ASSET_CATEGORY_LABELS[c],
    count: stats.value[c] ?? 0,
  })),
])

/** 二级业务分类标签：已定义分类（带计数）+ 未定义但有资产的子分类（标未定义） */
const subCategoryTabs = computed<Array<{ value: string; label: string; count: number | null; defined: boolean }>>(() => {
  const definedNames = new Set(definedCategories.value.map(c => c.name))
  const tabs: Array<{ value: string; label: string; count: number | null; defined: boolean }> = []
  for (const c of definedCategories.value) {
    if ((c.count ?? 0) > 0) tabs.push({ value: c.name, label: c.name, count: c.count ?? 0, defined: true })
  }
  for (const s of subStats.value) {
    const key = s.subCategory ?? '未分组'
    if (!definedNames.has(key)) {
      tabs.push({ value: key, label: `${key}（未定义）`, count: s.count, defined: false })
    }
  }
  const totalInCat = tabs.reduce((a, t) => a + (t.count ?? 0), 0)
  return [
    { value: '', label: '全部', count: totalInCat, defined: true },
    ...tabs,
  ]
})

function categoryLabel(c: AssetCategory): string {
  return ASSET_CATEGORY_LABELS[c] ?? c
}

/** 资产命中的分类定义（未命中 → null） */
function categoryDefOf(asset: AssetRecord): AssetCategoryDef | null {
  return asset.subCategory ? categoryMap.value.get(asset.subCategory) ?? null : null
}

/** 资产预览模式（未命中分类定义 → auto 沿用旧逻辑） */
function previewModeOf(asset: AssetRecord): string {
  return categoryDefOf(asset)?.previewMode ?? ASSET_PREVIEW_MODES.auto
}

/** 资产预览模式中文标签（信息区展示） */
function previewModeLabelOf(asset: AssetRecord): string {
  const mode = previewModeOf(asset) as AssetPreviewMode
  return PREVIEW_MODE_LABELS[mode] ?? mode
}

/** 资产是否可预览（分类定义 previewable=false 或 none → 不可） */
function canPreview(asset: AssetRecord): boolean {
  const def = categoryDefOf(asset)
  if (def && (!def.previewable || def.previewMode === ASSET_PREVIEW_MODES.none)) return false
  return !!previewUrl(asset) || ['text', 'template', 'json'].includes(asset.category)
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
    const [listResp, statsResp, catsResp] = await Promise.all([
      api.assets.list({ category: activeCategory.value, subCategory: activeSubCategory.value, keyword: keyword.value, page: page.value, pageSize: pageSize.value }),
      api.assets.stats(),
      api.assets.listCategories({ category: activeCategory.value || undefined }),
    ])
    if (listResp.success) {
      items.value = listResp.data?.items ?? []
      total.value = listResp.data?.total ?? 0
    } else ElMessage.error(listResp.error ?? '加载失败')
    if (statsResp.success) stats.value = statsResp.data?.byCategory ?? {}
    // 二级业务分类：当前大类下的已定义分类（带计数）+ 资产聚合补差
    if (catsResp.success) definedCategories.value = catsResp.data ?? []
    else definedCategories.value = []
    if (activeCategory.value) {
      const subResp = await api.assets.subCategoryStats(activeCategory.value)
      if (subResp.success) subStats.value = subResp.data ?? []
    } else {
      subStats.value = []
    }
    // 全量分类定义（预览模式查询 + 分类管理共用）
    const allResp = await api.assets.listCategories()
    if (allResp.success) allCategories.value = allResp.data ?? []
  } finally {
    loading.value = false
  }
  // 当前页 report 类资产：后台预渲染缩略图（渲染器全局串行，不阻塞列表）
  void warmPreviewThumbs()
}

/** 当前页 report 类资产后台预渲染（串行渲染队列由主进程保证，前端并行发起） */
async function warmPreviewThumbs(): Promise<void> {
  const targets = items.value.filter(a => previewModeOf(a) === ASSET_PREVIEW_MODES.report && !previewCache[a.id])
  await Promise.all(targets.map(a => renderPreviewFor(a)))
}

/** 渲染分类预览（report/markdown/html 模式；结果缓存） */
async function renderPreviewFor(asset: AssetRecord): Promise<void> {
  if (previewCache[asset.id]) return
  const resp = await api.assets.previewRender(asset.id)
  if (resp.success && resp.data) {
    previewCache[asset.id] = resp.data
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
    // 内容更新（assets.update 不更新 textContent → 编辑内容时另存为「编辑版」，避免破坏引用）
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

// ---- 大图预览（分类驱动渲染） ----
const previewVisible = ref(false)
const previewAsset = ref<AssetRecord | null>(null)
async function openPreview(asset: AssetRecord): Promise<void> {
  if (!canPreview(asset)) return
  previewAsset.value = asset
  previewVisible.value = true
  // 分类驱动模式（report/markdown/html）→ 渲染后展示；其余按存储形态原生呈现
  const mode = previewModeOf(asset)
  if ((mode === ASSET_PREVIEW_MODES.report || mode === ASSET_PREVIEW_MODES.markdown || mode === ASSET_PREVIEW_MODES.html)
    && !previewCache[asset.id]) {
    previewRendering.value = true
    try {
      await renderPreviewFor(asset)
      if (!previewCache[asset.id]) {
        ElMessage.info('该资产暂无渲染内容，已按原始内容展示')
      }
    } finally {
      previewRendering.value = false
    }
  }
}

// ---- 分类管理（业务分类实体） ----
const categoryManagerVisible = ref(false)
const previewTemplateOptions = ref<AssetPreviewTemplateOption[]>([])

async function openCategoryManager(): Promise<void> {
  categoryManagerVisible.value = true
  const [catsResp, tplResp] = await Promise.all([api.assets.listCategories(), api.assets.previewTemplates()])
  if (catsResp.success) allCategories.value = catsResp.data ?? []
  if (tplResp.success) previewTemplateOptions.value = tplResp.data ?? []
}

function templateNameOf(templateId: string | null | undefined): string {
  if (!templateId) return '—'
  return previewTemplateOptions.value.find(t => t.value === templateId)?.label ?? templateId
}

// ---- 分类编辑 ----
const categoryEditorVisible = ref(false)
const categoryEditing = ref<AssetCategoryDef | null>(null)
const categoryDraft = ref<{
  name: string
  code: string
  previewMode: string
  previewTemplateId: string
  previewable: boolean
  allowedKinds: string[]
}>({ name: '', code: '', previewMode: 'auto', previewTemplateId: '', previewable: true, allowedKinds: [] })

function openCategoryEditor(cat?: AssetCategoryDef): void {
  categoryEditing.value = cat ?? null
  categoryDraft.value = cat
    ? {
        name: cat.name,
        code: cat.code ?? '',
        previewMode: cat.previewMode,
        previewTemplateId: cat.previewTemplateId ?? '',
        previewable: cat.previewable,
        allowedKinds: [...cat.allowedKinds],
      }
    : { name: '', code: '', previewMode: 'auto', previewTemplateId: '', previewable: true, allowedKinds: [] }
  categoryEditorVisible.value = true
}

async function saveCategory(): Promise<void> {
  const name = categoryDraft.value.name.trim()
  if (!name) { ElMessage.warning('请输入分类名'); return }
  const previewMode = categoryDraft.value.previewMode
  if (previewMode === ASSET_PREVIEW_MODES.report && !categoryDraft.value.previewTemplateId) {
    ElMessage.warning('报告预览模式必须选择渲染模板'); return
  }
  const payload = {
    name,
    code: categoryDraft.value.code.trim() || undefined,
    previewMode,
    previewTemplateId: previewMode === ASSET_PREVIEW_MODES.report ? categoryDraft.value.previewTemplateId : null,
    previewable: categoryDraft.value.previewable,
    allowedKinds: categoryDraft.value.allowedKinds,
  }
  if (categoryEditing.value?.id) {
    const resp = await api.assets.updateCategory({ id: categoryEditing.value.id, ...payload })
    if (!resp.success) { ElMessage.error(resp.error ?? '保存失败'); return }
    ElMessage.success('分类已更新')
  } else {
    const resp = await api.assets.createCategory(payload)
    if (!resp.success) { ElMessage.error(resp.error ?? '创建失败'); return }
    ElMessage.success('分类已创建')
  }
  categoryEditorVisible.value = false
  await openCategoryManager()
  await load()
}

async function handleDeleteCategory(cat: AssetCategoryDef): Promise<void> {
  if (cat.isBuiltin) {
    ElMessage.warning('内置分类不可删除')
    return
  }
  try {
    await ElMessageBox.confirm(`删除分类「${cat.name}」？仅删除分类定义，分类下的资产保留（子分类文本不变）。`, '删除分类', { type: 'warning' })
  } catch {
    return
  }
  const resp = await api.assets.deleteCategory(cat.id)
  if (resp.success) { ElMessage.success('分类已删除'); await openCategoryManager(); await load() }
  else ElMessage.error(resp.error ?? '删除失败')
}

onMounted(load)
</script>

<style scoped>
.asset-center { padding: 20px 26px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; flex-shrink: 0; gap: 12px; }
.page-title { font-size: 20px; font-weight: 600; }
.page-desc { color: var(--el-text-color-secondary); font-size: 13px; margin-top: 4px; max-width: 640px; }
.toolbar-right { display: flex; gap: 10px; align-items: center; }
.search { width: 220px; }

/* 分类条 */
.cat-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; flex-shrink: 0; }
.cat-tab { padding: 5px 12px; border-radius: 14px; font-size: 13px; cursor: pointer; color: var(--el-text-color-regular); background: var(--el-fill-color); transition: all .15s; }
.cat-tab:hover { color: var(--el-color-primary); }
.cat-tab.active { background: var(--el-color-primary); color: #fff; }
.cat-count { font-size: 11px; opacity: .75; margin-left: 4px; }

/* 二级业务分类条 */
.sub-cat-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; flex-shrink: 0; padding-left: 4px; }
.sub-cat-tab { padding: 3px 10px; border-radius: 12px; font-size: 12px; cursor: pointer; color: var(--el-text-color-regular); border: 1px dashed var(--el-border-color); transition: all .15s; }
.sub-cat-tab:hover { color: var(--el-color-primary); border-color: var(--el-color-primary); }
.sub-cat-tab.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); border-color: var(--el-color-primary); }
.sub-cat-tab.undefined { opacity: .55; }

/* 模板预览（文本摘录） */
.template-preview { width: 100%; height: 100%; padding: 10px 12px; font-size: 12px; color: var(--el-text-color-regular); white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; cursor: zoom-in; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--el-fill-color-lighter); }

.sub-meta { margin-top: 2px; }
.mode-tag { margin-left: 6px; }

/* 报告类占位（渲染长图异步加载前） */
.report-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 100%; width: 100%; color: var(--el-text-color-secondary); cursor: zoom-in; }
.report-icon { font-size: 34px; opacity: .7; }
.report-hint { font-size: 11px; }

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

.card-actions { display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 6px 8px 6px 12px; border-top: 1px solid var(--el-border-color-lighter); }
.icon-actions { display: flex; align-items: center; gap: 2px; }
.icon-actions :deep(.el-button) { padding: 4px; }

.pager { flex-shrink: 0; display: flex; justify-content: flex-end; padding-top: 14px; }
.empty { color: var(--el-text-color-secondary); text-align: center; padding: 60px 0; }
.empty .hint { font-size: 12px; margin-top: 6px; max-width: 460px; margin-left: auto; margin-right: auto; }

/* 大图预览 */
.big-preview { display: flex; align-items: center; justify-content: center; min-height: 120px; }
.big-preview img { max-width: 100%; max-height: 70vh; }
.big-preview audio { width: 90%; }
.big-iframe { width: 100%; height: 62vh; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: #fff; }
.big-render-img { max-width: 100%; max-height: 70vh; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
.big-text { max-height: 60vh; overflow: auto; width: 100%; white-space: pre-wrap; word-break: break-all; font-size: 13px; }
.big-url { word-break: break-all; }
.big-hint { color: var(--el-text-color-secondary); }

/* 分类管理 */
.cat-mgr { display: flex; flex-direction: column; gap: 10px; }
.cat-mgr-desc { font-size: 12px; color: var(--el-text-color-secondary); }
.kind-tag { margin-right: 4px; }
.cat-mgr-footer { display: flex; justify-content: flex-end; }
.cat-form { padding: 4px 0; }
</style>
