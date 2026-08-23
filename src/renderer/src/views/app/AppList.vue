<template>
  <div class="app-list">
    <div class="toolbar">
      <div>
        <div class="page-title">应用</div>
        <div class="page-desc">已发布的工作流应用——可搜索、按分类筛选、固定常用应用到首页；点卡片可直接启动会话</div>
      </div>
      <div class="toolbar-right">
        <el-button v-if="activeCategory" text type="primary" size="small" @click="activeCategory = ''; page = 1; load()">✕ 清除分类</el-button>
        <el-input v-model="keyword" placeholder="搜索名称 / 分类 / 标签" clearable class="search" :prefix-icon="Search" @keyup.enter="handleSearch" @clear="handleSearch" />
      </div>
    </div>

    <!-- 分类筛选（带计数） -->
    <div v-if="categoryTabs.length" class="cat-bar">
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

    <!-- 卡片网格：内部滚动，分页固定底部 -->
    <div class="grid-wrap" v-loading="loading">
      <div v-if="apps.length" class="app-grid">
        <div v-for="app in apps" :key="app.id" class="app-card" :class="{ disabled: app.enabled !== 1 }">
          <div class="card-head">
            <span class="app-emoji">{{ app.icon || '📦' }}</span>
            <div class="card-info">
              <div class="app-name" :title="app.name">{{ app.name }}
                <el-tag v-if="app.isBuiltin" size="small" type="warning" effect="plain" style="margin-left: 6px">内置</el-tag>
                <el-tag v-if="app.pinned === 1" size="small" type="danger" effect="plain" style="margin-left: 6px">📌 首页</el-tag>
              </div>
              <div class="app-ver">工作流 · v{{ app.sourceVersion ?? 0 }} · {{ app.sessionCount ?? 0 }} 会话</div>
            </div>
            <el-tag :type="app.enabled === 1 ? 'success' : 'info'" size="small">{{ app.enabled === 1 ? '启用' : '停用' }}</el-tag>
          </div>

          <!-- 分类 + 标签 -->
          <div class="meta-row">
            <el-tag v-if="app.category" size="small" type="primary" effect="plain">{{ app.category }}</el-tag>
            <span v-for="t in app.tags" :key="t" class="tag">#{{ t }}</span>
            <span v-if="!app.category && !app.tags.length" class="meta-empty">未分类</span>
          </div>

          <div class="channels">
            <span class="cdot" :class="{ on: app.channelSession === 1 }">💬 会话</span>
            <span class="cdot" :class="{ on: app.channelShare === 1 }">🔗 分享</span>
            <span class="cdot" :class="{ on: app.channelApi === 1 }">🔌 API</span>
          </div>

          <div class="card-actions">
            <el-button type="primary" size="small" :disabled="app.enabled !== 1 || app.channelSession !== 1" @click="launch(app)">
              ▶ 启动
            </el-button>
            <div class="icon-actions">
              <el-tooltip content="详情" placement="top">
                <el-button text size="small" @click="router.push(`/apps/${app.id}`)"><el-icon><View /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip :content="app.pinned === 1 ? '取消固定到首页' : '固定到首页'" placement="top">
                <el-button text size="small" :type="app.pinned === 1 ? 'warning' : ''" @click="togglePinned(app)"><el-icon><Star /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip v-if="app.isBuiltin" content="复制为自有" placement="top">
                <el-button text size="small" @click="handleCopyBuiltin(app)"><el-icon><CopyDocument /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button text type="danger" size="small" :disabled="app.isBuiltin" @click="handleDelete(app)"><el-icon><Delete /></el-icon></el-button>
              </el-tooltip>
            </div>
          </div>
          <div v-if="app.enabled === 1 && app.channelSession !== 1" class="launch-tip">未开启会话渠道，无法直接启动</div>
        </div>
      </div>
      <div v-else-if="!loading" class="empty">
        <p>暂无应用</p>
        <p class="hint">在工作流编辑器点击「发布为应用」创建；固定常用应用到首页快捷启动</p>
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
  </div>
</template>

<script setup lang="ts">
/**
 * 应用列表页：搜索 + 分类筛选（带计数）+ 卡片网格 + 固定到首页 + 直接启动
 */
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, View, Star, CopyDocument, Delete } from '@element-plus/icons-vue'
import type { AppRecord } from '@shared/types/app.types'
import { electronApi } from '@/types/electron-api'

const router = useRouter()
const api = electronApi()

const apps = ref<Array<AppRecord & { sessionCount: number }>>([])
const loading = ref(false)
const keyword = ref('')
const activeCategory = ref('')
const categoryStats = ref<Array<{ category: string; count: number }>>([])

// ---- 分页（卡片网格滚动 + 底部固定分页） ----
const page = ref(1)
const pageSize = ref(12)
const total = ref(0)

/** 分类筛选 tabs（全部 + 各分类带计数；分类从现有应用聚合，新分类自动出现） */
const categoryTabs = computed<Array<{ value: string; label: string; count: number }>>(() => {
  const totalCount = categoryStats.value.reduce((a, s) => a + s.count, 0)
  return [
    { value: '', label: '全部', count: totalCount },
    ...categoryStats.value.map(s => ({ value: s.category, label: s.category, count: s.count })),
  ]
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const [listResp, catResp] = await Promise.all([
      api.app.list({ keyword: keyword.value || undefined, category: activeCategory.value || undefined, page: page.value, pageSize: pageSize.value }),
      api.app.categories(),
    ])
    if (listResp.success) {
      apps.value = listResp.data?.items ?? []
      total.value = listResp.data?.total ?? 0
    } else ElMessage.error(listResp.error ?? '加载失败')
    if (catResp.success) categoryStats.value = catResp.data ?? []
  } finally {
    loading.value = false
  }
}

function handlePageChange(): void {
  void load()
}

function handleSearch(): void {
  page.value = 1
  void load()
}

function switchCategory(cat: string): void {
  activeCategory.value = cat
  page.value = 1
  void load()
}

/** 卡片直接启动：创建会话并进入会话页（无需先进详情） */
async function launch(app: AppRecord): Promise<void> {
  if (app.enabled !== 1 || app.channelSession !== 1) {
    ElMessage.warning('该应用未开启会话渠道，请到详情页开启')
    return
  }
  const resp = await api.appSession.create({ appId: app.id })
  if (resp.success) {
    ElMessage.success('会话已创建')
    // from=list：会话页返回时回到应用列表（而非详情）
    router.push(`/apps/${app.id}/session/${resp.data?.id}?from=list`)
  } else ElMessage.error(resp.error ?? '启动失败')
}

/** 固定/取消固定到首页（首页快捷入口） */
async function togglePinned(app: AppRecord & { sessionCount: number }): Promise<void> {
  const next = app.pinned !== 1
  const resp = await api.app.setPinned(app.id, next)
  if (resp.success) {
    app.pinned = next ? 1 : 0
    ElMessage.success(next ? `已固定「${app.name}」到首页` : `已取消固定「${app.name}」`)
  } else ElMessage.error(resp.error ?? '操作失败')
}

async function handleDelete(row: AppRecord): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除应用「${row.name}」？其会话与记录将一并删除，不可恢复。`, '删除应用', { type: 'warning' })
  } catch {
    return // 用户取消
  }
  const resp = await api.app.delete(row.id)
  if (resp.success) { ElMessage.success('已删除'); await load() }
  else ElMessage.error(resp.error ?? '删除失败')
}

/** 复制内置应用为自有：导出内置定义 → 导入副本草稿 → 发布 → 创建应用 */
async function handleCopyBuiltin(row: AppRecord): Promise<void> {
  const wfApi = (window as unknown as { electronAPI: { workflow: any } }).electronAPI.workflow
  try {
    const exp = await wfApi.exportDefinition(row.sourceId)
    if (!exp.success || !exp.data?.content) { ElMessage.error(exp.error ?? '导出内置定义失败'); return }
    const imp = await wfApi.importDefinition({ content: exp.data.content, duplicatePolicy: 'copy' })
    if (!imp.success || !imp.data?.id) { ElMessage.error(imp.error ?? '创建副本失败'); return }
    const pub = await wfApi.publishDefinition({ id: imp.data.id })
    if (!pub.success) { ElMessage.error(pub.error ?? '发布副本失败'); return }
    const appResp = await api.app.createFromWorkflow({ definitionId: imp.data.id, name: `${row.name}（我的）`, category: row.category ?? undefined, tags: row.tags, channelSession: true, channelShare: false, channelApi: false })
    if (appResp.success) {
      ElMessage.success('已复制为自有应用（可自由修改/删除）')
      await load()
    } else ElMessage.error(appResp.error ?? '创建应用失败')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '复制失败')
  }
}

onMounted(load)
</script>

<style scoped>
/* 三区固定布局：toolbar 固定 / 分类条固定 / 卡片网格内部滚动 / 分页固定底部 */
.app-list { padding: 20px 26px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; flex-shrink: 0; gap: 12px; }
.page-title { font-size: 20px; font-weight: 600; }
.page-desc { color: var(--el-text-color-secondary); font-size: 13px; margin-top: 4px; }
.toolbar-right { display: flex; gap: 10px; align-items: center; }
.search { width: 240px; }

/* 分类条 */
.cat-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; flex-shrink: 0; }
.cat-tab { padding: 5px 12px; border-radius: 14px; font-size: 13px; cursor: pointer; color: var(--el-text-color-regular); background: var(--el-fill-color); transition: all .15s; }
.cat-tab:hover { color: var(--el-color-primary); }
.cat-tab.active { background: var(--el-color-primary); color: #fff; }
.cat-count { font-size: 11px; opacity: .75; margin-left: 4px; }

.grid-wrap { flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px; }
.app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.app-card { border: 1px solid var(--el-border-color-lighter); border-radius: 10px; padding: 14px 16px; background: var(--el-bg-color); display: flex; flex-direction: column; gap: 10px; transition: border-color .15s, box-shadow .15s; }
.app-card:hover { border-color: var(--el-color-primary-light-5); box-shadow: 0 2px 10px rgba(0,0,0,.06); }
.app-card.disabled { opacity: .6; }
.card-head { display: flex; align-items: center; gap: 10px; }
.app-emoji { font-size: 30px; width: 52px; height: 52px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--el-fill-color-light); flex-shrink: 0; }
.card-info { flex: 1; min-width: 0; }
.app-name { font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app-ver { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.meta-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 22px; }
.tag { font-size: 11px; color: var(--el-color-primary); background: var(--el-color-primary-light-9); padding: 1px 6px; border-radius: 8px; }
.meta-empty { font-size: 11px; color: var(--el-text-color-placeholder); }
.channels { display: flex; gap: 6px; }
.cdot { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: var(--el-fill-color); color: var(--el-text-color-secondary); }
.cdot.on { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.card-actions { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.icon-actions { display: flex; align-items: center; gap: 2px; }
.icon-actions :deep(.el-button) { padding: 4px; }
.launch-tip { font-size: 11px; color: var(--el-text-color-secondary); margin-top: -6px; }
.pager { flex-shrink: 0; display: flex; justify-content: flex-end; padding-top: 14px; }
.empty { color: var(--el-text-color-secondary); text-align: center; padding: 60px 0; }
.empty .hint { font-size: 12px; margin-top: 6px; }
</style>
