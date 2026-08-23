<template>
  <div class="app-detail">
    <div class="back-bar">
      <el-button text @click="router.push('/apps')"><el-icon><ArrowLeft /></el-icon> 返回应用列表</el-button>
    </div>

    <div class="detail-header" v-if="app">
      <span class="app-emoji">{{ app.icon || '📦' }}</span>
      <div class="info">
        <div class="page-title">{{ app.name }}
          <el-tag v-if="app.isBuiltin" type="warning" effect="plain" size="small" style="margin-left: 8px">内置</el-tag>
          <el-tag :type="app.enabled === 1 ? 'success' : 'info'" size="small" style="margin-left: 8px">{{ app.enabled === 1 ? '已启用' : '已停用' }}</el-tag>
        </div>
        <div class="page-desc">来自工作流 · v{{ app.sourceVersion ?? 0 }} · 会话数 {{ sessions.length }}</div>
        <div class="meta-row">
          <el-tag v-if="app.category" size="small" type="primary" effect="plain">{{ app.category }}</el-tag>
          <span v-for="t in app.tags" :key="t" class="tag">#{{ t }}</span>
          <el-button text size="small" :type="app.pinned === 1 ? 'warning' : 'primary'" @click="togglePinned">
            {{ app.pinned === 1 ? '📌 已固定到首页' : '📌 固定到首页' }}
          </el-button>
          <el-button v-if="!app.isBuiltin" text size="small" @click="openMetaEditor">✏️ 编辑分类/标签</el-button>
        </div>
      </div>
      <el-button v-if="app.isBuiltin" size="small" @click="handleCopyBuiltin">📋 复制为自有</el-button>
      <el-button v-if="app.channelSession === 1" type="primary" @click="newSession">▶ 开始会话</el-button>
      <el-button @click="router.push(`/workflow/editor/${app.sourceId}`)">查看工作流</el-button>
    </div>

    <!-- 分类/标签编辑弹窗 -->
    <el-dialog v-model="metaEditorVisible" title="编辑应用分类与标签" width="460px" append-to-body>
      <el-form label-width="72px" label-position="left">
        <el-form-item label="分类">
          <el-input v-model="metaDraft.category" placeholder="如 新闻资讯 / 文案写作 / 视频处理" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="metaDraft.tagsText" placeholder="逗号分隔，如 视频,文案" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="metaEditorVisible = false">取消</el-button>
        <el-button type="primary" @click="saveMeta">保存</el-button>
      </template>
    </el-dialog>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="渠道" name="channels">
        <div class="channel-row">
          <div class="c-info"><div class="c-name">💬 会话</div><div class="c-desc">在本机以对话方式使用：表单填写、审核确认、查看结果</div></div>
          <el-switch :model-value="app?.channelSession === 1" @change="v => toggleChannel('session', v)" />
        </div>
        <div class="channel-row">
          <div class="c-info"><div class="c-name">🔗 分享链接</div><div class="c-desc">任何人可通过链接填写运行（免登录独立页）</div></div>
          <template v-if="app?.shareToken">
            <span class="link-pill">…/app-share/{{ app.shareToken.slice(0, 10) }}…</span>
            <el-button size="small" @click="copyShareLink">复制</el-button>
            <el-button size="small" @click="disableShare">停用</el-button>
          </template>
          <el-button v-else size="small" type="primary" plain @click="enableShare">生成链接</el-button>
          <el-switch :model-value="app?.channelShare === 1" @change="v => toggleChannel('share', v)" />
        </div>
        <div class="channel-row">
          <div class="c-info">
            <div class="c-name">🔌 API</div>
            <div class="c-desc">外部系统调用（需登录鉴权）</div>
            <div v-if="app?.sourceId" class="api-endpoint">
              <code>POST /api/workflow/invoke/{{ app.sourceId.slice(-12) }}</code>
              <el-button text size="small" @click="copyApiUrl">复制</el-button>
            </div>
          </div>
          <el-switch :model-value="app?.channelApi === 1" @change="v => toggleChannel('api', v)" />
        </div>
        <div class="channel-row">
          <div class="c-info"><div class="c-name">⏰ 定时</div><div class="c-desc">在工作流编辑器中配置定时触发器</div></div>
          <el-button size="small" @click="router.push(`/workflow/editor/${app?.sourceId}`)">配置触发器</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="会话记录" name="sessions">
        <el-button size="small" type="primary" plain style="margin-bottom: 10px" @click="newSession">＋ 新会话</el-button>
        <el-table :data="pagedSessions" v-loading="sessionLoading" empty-text="暂无会话">
          <el-table-column type="index" label="#" width="52" align="center" :index="sessionIndex" />
          <el-table-column prop="title" label="标题" min-width="180" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="row.status === 'running' ? 'warning' : row.status === 'failed' ? 'danger' : 'info'" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="lastRunId" label="最近运行" min-width="200" show-overflow-tooltip />
          <el-table-column label="操作" width="220">
            <template #default="{ row }">
              <el-button text type="primary" size="small" @click="router.push(`/apps/${appId}/session/${row.id}`)">打开</el-button>
              <el-button text size="small" @click="renameSession(row)">重命名</el-button>
              <el-button text type="danger" size="small" @click="deleteSession(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="session-pager" v-if="sessions.length > 0">
          <el-pagination
            v-model:current-page="sessionPage"
            v-model:page-size="sessionPageSize"
            :total="sessions.length"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            background
          />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
/**
 * 应用详情页（片3b，对齐原型②）：渠道开关 + 分享令牌 + 会话记录 + 开始会话
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import type { AppRecord, AppSessionRecord } from '@shared/types/app.types'
import { electronApi } from '@/types/electron-api'

const route = useRoute()
const router = useRouter()
const appId = computed(() => String(route.params.id))
const api = electronApi()

const app = ref<AppRecord | null>(null)
const activeTab = ref('channels')
const sessions = ref<AppSessionRecord[]>([])
const sessionLoading = ref(false)

// ---- 会话记录分页（前端切片；会话量小，一次性拉取后本地分页） ----
const sessionPage = ref(1)
const sessionPageSize = ref(10)
/** 当前页会话（按 page/pageSize 切片） */
const pagedSessions = computed<AppSessionRecord[]>(() => {
  const start = (sessionPage.value - 1) * sessionPageSize.value
  return sessions.value.slice(start, start + sessionPageSize.value)
})
/** 序号列：跨页连续（`(page-1)*pageSize + index + 1`） */
function sessionIndex(index: number): number {
  return (sessionPage.value - 1) * sessionPageSize.value + index + 1
}

async function load(): Promise<void> {
  const resp = await api.app.get(appId.value)
  if (resp.success) app.value = resp.data ?? null
  else ElMessage.error(resp.error ?? '加载失败')
  await loadSessions()
}

async function loadSessions(): Promise<void> {
  sessionLoading.value = true
  try {
    const resp = await api.appSession.list(appId.value)
    if (resp.success) sessions.value = resp.data ?? []
    clampSessionPage()
  } finally { sessionLoading.value = false }
}

/** 修正页码越界（删除/刷新后总条数变化导致当前页超出） */
function clampSessionPage(): void {
  const maxPage = Math.max(1, Math.ceil(sessions.value.length / sessionPageSize.value))
  if (sessionPage.value > maxPage) sessionPage.value = maxPage
}

async function toggleChannel(kind: 'session' | 'share' | 'api', val: boolean): Promise<void> {
  const resp = await api.app.updateChannels({
    id: appId.value,
    channelSession: kind === 'session' ? val : undefined,
    channelShare: kind === 'share' ? val : undefined,
    channelApi: kind === 'api' ? val : undefined,
  })
  if (resp.success) app.value = resp.data ?? app.value
  else ElMessage.error(resp.error ?? '更新失败')
}

async function enableShare(): Promise<void> {
  const resp = await api.app.enableShare(appId.value)
  if (resp.success) { app.value = resp.data ?? app.value; ElMessage.success('分享链接已生成') }
  else ElMessage.error(resp.error ?? '生成失败')
}
async function disableShare(): Promise<void> {
  const resp = await api.app.disableShare(appId.value)
  if (resp.success) { app.value = resp.data ?? app.value; ElMessage.success('已停用分享') }
  else ElMessage.error(resp.error ?? '操作失败')
}
async function copyShareLink(): Promise<void> {
  if (!app.value?.shareToken) return
  const link = `${window.location.origin}/#/app-share/${app.value.shareToken}`
  await navigator.clipboard.writeText(link)
  ElMessage.success('链接已复制（面向 Web 部署；本机预览请用详情页）')
}

/** 复制 API invoke URL（P1：API 渠道补可复制入口） */
async function copyApiUrl(): Promise<void> {
  if (!app.value?.sourceId) return
  const url = `${window.location.origin}/api/workflow/invoke/${app.value.sourceId}`
  await navigator.clipboard.writeText(`POST ${url}`)
  ElMessage.success('API 调用地址已复制（需登录鉴权）')
}

/** 复制内置应用为自有：导出内置定义 → 导入副本草稿 → 发布 → 创建应用 */
async function handleCopyBuiltin(): Promise<void> {
  if (!app.value) return
  const wfApi = (window as unknown as { electronAPI: { workflow: any } }).electronAPI.workflow
  try {
    const exp = await wfApi.exportDefinition(app.value.sourceId)
    if (!exp.success || !exp.data?.content) { ElMessage.error(exp.error ?? '导出内置定义失败'); return }
    const imp = await wfApi.importDefinition({ content: exp.data.content, duplicatePolicy: 'copy' })
    if (!imp.success || !imp.data?.id) { ElMessage.error(imp.error ?? '创建副本失败'); return }
    const pub = await wfApi.publishDefinition({ id: imp.data.id })
    if (!pub.success) { ElMessage.error(pub.error ?? '发布副本失败'); return }
    const resp = await api.app.createFromWorkflow({ definitionId: imp.data.id, name: `${app.value.name}（我的）`, channelSession: true, channelShare: false, channelApi: false })
    if (resp.success) {
      ElMessage.success('已复制为自有应用（可自由修改/删除）')
      await load()
    } else ElMessage.error(resp.error ?? '创建应用失败')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '复制失败')
  }
}

async function newSession(): Promise<void> {
  const resp = await api.appSession.create({ appId: appId.value })
  if (resp.success) {
    ElMessage.success('会话已创建')
    await loadSessions()
    router.push(`/apps/${appId.value}/session/${resp.data?.id}`)
  } else ElMessage.error(resp.error ?? '创建失败')
}

/** 重命名会话（prompt 输入；空输入/取消不动作） */
async function renameSession(row: AppSessionRecord): Promise<void> {
  let title: string
  try {
    const r = await ElMessageBox.prompt('输入新的会话标题', '重命名会话', {
      inputValue: row.title,
      inputValidator: v => (v?.trim() ? true : '标题不能为空'),
    })
    title = r.value.trim()
  } catch {
    return // 取消
  }
  const resp = await api.appSession.rename(row.id, title)
  if (resp.success) { ElMessage.success('已重命名'); await loadSessions() }
  else ElMessage.error(resp.error ?? '重命名失败')
}

/** 删除会话（级联消息；运行中由后端拒绝） */
async function deleteSession(row: AppSessionRecord): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除会话「${row.title}」？其消息记录将一并删除，不可恢复。`, '删除会话', { type: 'warning' })
  } catch {
    return // 取消
  }
  const resp = await api.appSession.delete(row.id)
  if (resp.success) { ElMessage.success('已删除'); await loadSessions() }
  else ElMessage.error(resp.error ?? '删除失败')
}

// ---- 固定到首页 + 分类/标签编辑 ----
async function togglePinned(): Promise<void> {
  if (!app.value) return
  const next = app.value.pinned !== 1
  const resp = await api.app.setPinned(appId.value, next)
  if (resp.success) {
    app.value = resp.data ?? app.value
    ElMessage.success(next ? '已固定到首页（首页「我的应用」快捷启动）' : '已取消固定')
  } else ElMessage.error(resp.error ?? '操作失败')
}

const metaEditorVisible = ref(false)
const metaDraft = ref<{ category: string; tagsText: string }>({ category: '', tagsText: '' })

function openMetaEditor(): void {
  if (!app.value) return
  metaDraft.value = {
    category: app.value.category ?? '',
    tagsText: app.value.tags.join(','),
  }
  metaEditorVisible.value = true
}

async function saveMeta(): Promise<void> {
  const category = metaDraft.value.category.trim() || null
  const tags = metaDraft.value.tagsText.split(/[,，]/).map(t => t.trim()).filter(Boolean)
  const resp = await api.app.updateMeta({ id: appId.value, category, tags })
  if (resp.success) {
    app.value = resp.data ?? app.value
    metaEditorVisible.value = false
    ElMessage.success('已保存')
  } else ElMessage.error(resp.error ?? '保存失败')
}

onMounted(load)
</script>

<style scoped>
.app-detail { padding: 20px 26px; }
.back-bar { margin-bottom: 10px; }
.detail-header { display: flex; align-items: center; gap: 14px; background: var(--el-bg-color); border: 1px solid var(--el-border-color); border-radius: 8px; padding: 18px; margin-bottom: 16px; }
.app-emoji { font-size: 26px; width: 52px; height: 52px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--el-fill-color-light); }
.info { flex: 1; }
.page-title { font-size: 19px; font-weight: 600; }
.page-desc { color: var(--el-text-color-secondary); font-size: 13px; margin-top: 2px; }
.meta-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 8px; }
.tag { font-size: 11px; color: var(--el-color-primary); background: var(--el-color-primary-light-9); padding: 1px 6px; border-radius: 8px; }
.channel-row { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--el-border-color); border-radius: 8px; margin-bottom: 10px; }
.c-info { flex: 1; }
.c-name { font-weight: 600; }
.c-desc { color: var(--el-text-color-secondary); font-size: 12px; }
.link-pill { font-family: monospace; font-size: 12px; background: var(--el-fill-color); padding: 4px 8px; border-radius: 4px; }
.api-endpoint { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.api-endpoint code { font-size: 12px; background: var(--el-fill-color); padding: 3px 6px; border-radius: 4px; }
.session-pager { display: flex; justify-content: flex-end; padding-top: 14px; }
</style>