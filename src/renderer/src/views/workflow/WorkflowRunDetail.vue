<template>
  <div class="run-detail page-container">
    <div class="page-header">
      <div>
        <h2>运行详情</h2>
        <span class="meta" v-if="run">
          状态：<el-tag :type="statusTag(run.status)" size="small">{{ run.status }}</el-tag>
          <span class="sep">触发：{{ run.triggerType }}</span>
          <span class="sep">开始：{{ formatTime(run.startedAt) }}</span>
          <span class="sep">耗时：{{ run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—' }}</span>
        </span>
      </div>
      <div class="actions" v-if="run">
        <el-button v-if="canCancel" type="danger" @click="doCancel">取消</el-button>
        <el-button v-if="canResume" @click="doResume">断点续跑</el-button>
        <el-button @click="router.back()">返回</el-button>
      </div>
    </div>

    <el-alert v-if="run?.error" :title="run.error" type="error" :closable="false" style="margin-bottom: 12px" />

    <!-- 工作流执行图（只读：可点击节点看详情，不可编辑） -->
    <div class="run-graph-section">
      <div class="section-head">
        <h3>工作流执行图</h3>
        <span class="section-hint">只读展示，按执行状态着色；点击节点查看「环节详情」</span>
      </div>
      <ReadonlyRunGraph
        :graph="graphData"
        :node-runs="nodeRuns"
        :selected-node-id="selectedNodeId"
        @node-click="onNodeClick"
      />
    </div>

    <!-- 图下方信息区：Tab 布局（节点详情 / 执行日志 / 用户提交数据 / 节点执行记录）。
         「节点详情」可见性由 selectedNodeId 单一来源驱动：点击图上任一节点必然置位并自动切到该 tab；
         「关闭」仅清空 selectedNodeId（面板回空态 + 节点高亮取消），不切换 tab。:key 保证切换/重开节点时面板干净重建。 -->
    <div class="run-tabs">
      <el-tabs v-model="activeTab">
        <!-- 1 节点详情 -->
        <el-tab-pane label="节点详情" name="node">
          <RunNodeDetail
            v-if="selectedNodeId"
            :key="selectedNodeId"
            :selected-node-id="selectedNodeId"
            :node="selectedGraphNode"
            :runs="selectedNodeRuns"
            :logs="selectedNodeLogs"
            @close="selectedNodeId = null"
          />
          <div v-else class="tab-empty">
            <el-empty :image-size="60" description="点击上方节点查看环节详情" />
          </div>
        </el-tab-pane>

        <!-- 2 执行日志 -->
        <el-tab-pane label="执行日志" name="logs">
          <div class="logs-count">🕒 共 {{ runLogs.length }} 条执行日志</div>
          <div v-if="runLogs.length === 0" class="log-empty">暂无执行日志（运行刚开始或环境不支持）</div>
          <div v-else class="log-list">
            <div v-for="(l, i) in runLogs" :key="i" class="log-row">
              <span class="log-time">{{ formatLogTime(l.ts) }}</span>
              <el-tag :type="logTag(l.level)" size="small" class="log-lv">{{ l.level }}</el-tag>
              <span class="log-type">{{ l.type }}</span>
              <span class="log-msg">{{ l.message }}</span>
              <el-button v-if="l.detail" text size="small" @click="showLogDetail(l)">详情</el-button>
            </div>
          </div>
        </el-tab-pane>

        <!-- 3 用户提交数据 -->
        <el-tab-pane label="用户提交数据" name="inputs">
          <div v-if="run?.startInputs && Object.keys(run.startInputs).length">
            <pre class="io-json">{{ formatJson(run.startInputs) }}</pre>
          </div>
          <div v-else class="tab-empty">暂无用户提交数据</div>
        </el-tab-pane>

        <!-- 4 节点执行记录 -->
        <el-tab-pane label="节点执行记录" name="records">
          <el-table :data="nodeRuns" size="small" empty-text="暂无执行记录" :row-key="rowKeyOf">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="node-io">
            <!-- 素材板（逐镜图文）预览：waiting human-review 且 payload 含 cards -->
            <div v-if="reviewCards(row).length" class="board-preview">
              <div class="board-title">素材板（{{ reviewCards(row).length }} 镜）——可在「修改后批准」中按 cards JSON 逐条调整</div>
              <div class="board-grid">
                <div v-for="(c, i) in reviewCards(row)" :key="i" class="board-card">
                  <img v-if="cardImage(c)" :src="cardImage(c)" class="board-img" alt="" />
                  <div v-else class="board-noimg">无图（底图待生成/直用）</div>
                  <div class="board-meta">
                    <div class="board-caption"><b>镜头{{ i + 1 }}</b> {{ String(c.caption ?? '') }}</div>
                    <div class="board-extra">时长 {{ String(c.duration ?? '') }}s</div>
                    <div v-if="c.baseImagePath" class="board-extra">（底图：{{ String(c.imageAssetName ?? '') }}）</div>
                    <div class="board-visual">{{ String(c.visual ?? '').slice(0, 120) }}</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="io-block" v-if="row.input && Object.keys(row.input).length">
              <div class="io-title">输入</div>
              <pre class="io-json">{{ formatJson(row.input) }}</pre>
            </div>
            <div class="io-block" v-if="row.output && Object.keys(row.output).length">
              <div class="io-title">输出</div>
              <pre class="io-json">{{ formatJson(row.output) }}</pre>
            </div>
            <div v-if="(!row.input || !Object.keys(row.input).length) && (!row.output || !Object.keys(row.output).length)" class="io-empty">无输入输出</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="#" width="56">
        <template #default="{ $index }">{{ $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="nodeName" label="节点" min-width="140" />
      <el-table-column label="迭代" width="60">
        <template #default="{ row }">{{ row.iterationIndex > 0 ? `#${row.iterationIndex}` : '—' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <el-tag :type="nodeStatusTag(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="error" label="错误" min-width="160" show-overflow-tooltip />
      <el-table-column label="路由" width="110">
        <template #default="{ row }">{{ row.routeTaken ?? '—' }}</template>
      </el-table-column>
      <el-table-column label="耗时" width="90">
        <template #default="{ row }">{{ row.durationMs != null ? `${(row.durationMs / 1000).toFixed(1)}s` : '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <template v-if="isFormRow(row)">
            <el-button text type="primary" size="small" @click="openForm(row)">填写表单</el-button>
          </template>
          <template v-else-if="row.status === 'waiting_review'">
            <el-button text type="success" size="small" @click="doReview(row, 'approve')">批准</el-button>
            <el-button text type="warning" size="small" @click="doReviewEdit(row)">修改后批准</el-button>
            <el-button text type="danger" size="small" @click="doReview(row, 'reject')">驳回</el-button>
          </template>
          <template v-else-if="isReportRow(row)">
            <el-button text type="primary" size="small" @click="previewReport(row)">预览</el-button>
            <el-button text size="small" :loading="exporting" @click="printReport(row)">导出PDF</el-button>
          </template>
          <el-button v-else text size="small" @click="showOutput(row)">输出</el-button>
        </template>
      </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- E1 form-collect 挂起表单 -->
    <el-dialog v-model="formDialogVisible" :title="formRow?.input?.formTitle || '请填写'" width="520px" :close-on-click-modal="false">
      <RunInputForm ref="formInputRef" :inputs="formRow?.input?.fields ?? []" @valid="v => formValid = v" />
      <template #footer>
        <el-button @click="cancelForm">取消流程</el-button>
        <el-button type="primary" :disabled="!formValid" :loading="formSubmitting" @click="submitForm">提交并继续</el-button>
      </template>
    </el-dialog>

    <!-- 执行日志「详情」：大尺寸 el-dialog + 内容区足够高可滚动 + JSON 格式化放大展示 -->
    <el-dialog v-model="logDetailVisible" :title="logDetailTitle" width="min(900px, 94vw)" top="6vh" class="log-detail-dialog">
      <div class="log-detail-body">
        <pre class="log-detail-pre">{{ logDetailText }}</pre>
      </div>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'WorkflowRunDetail' })
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWorkflowStore } from '@/stores/workflow'
import { saveBlobAs } from '@/utils/file-saver'
import { toImageUrl } from '../../utils/asset-url'
import RunInputForm from '@/components/workflow/RunInputForm.vue'
import ReadonlyRunGraph from '@/components/workflow/ReadonlyRunGraph.vue'
import RunNodeDetail from '@/components/workflow/RunNodeDetail.vue'
import { WORKFLOW_RUN_TERMINAL_STATUSES } from '@shared/types/workflow.types'

const route = useRoute()
const router = useRouter()
const store = useWorkflowStore()
const run = ref<any>(null)
const nodeRuns = ref<any[]>([])
const runLogs = ref<Array<Record<string, unknown>>>([])
const exporting = ref(false)

// 图数据（run.graphSnapshot 优先；空/缺时用 definition.publishedGraph 兜底）
const graphData = ref<any>(null)
// 当前选中节点（点击只读图节点 → 显示环节详情面板）
const selectedNodeId = ref<string | null>(null)
// 图下方信息区当前激活的 Tab（默认「节点详情」）
const activeTab = ref<'node' | 'logs' | 'inputs' | 'records'>('node')

// 执行日志「详情」对话框（放大 + JSON 格式化）
const logDetailVisible = ref(false)
const logDetailTitle = ref('日志详情')
const logDetailText = ref('')

// E1 form-collect：挂起表单
const formDialogVisible = ref(false)
const formRow = ref<any>(null)
const formInputRef = ref<InstanceType<typeof RunInputForm>>()
const formValid = ref(false)
const formSubmitting = ref(false)

function isFormRow(row: any): boolean {
  // form schema 在 node_run.input（已解析 config：formTitle/fields）；payload 只在引擎内存态
  return row.status === 'waiting_review' && row.nodeType === 'form-collect'
}
function openForm(row: any): void {
  formRow.value = row
  formDialogVisible.value = true
  formInputRef.value?.setFileUploadContext({ runId: String(route.params.runId), nodeId: row.nodeId })
}
async function submitForm(): Promise<void> {
  if (!formRow.value || !formInputRef.value) return
  formSubmitting.value = true
  try {
    const edited = formInputRef.value.getValues()
    const resp = await api().reviewDecide({
      runId: String(route.params.runId),
      nodeId: formRow.value.nodeId,
      decision: 'approve_with_changes',
      editedValues: edited,
    })
    if (resp.success) { ElMessage.success('已提交，流程继续'); formDialogVisible.value = false; await load() }
    else ElMessage.error(resp.error ?? '提交失败')
  } finally {
    formSubmitting.value = false
  }
}
async function cancelForm(): Promise<void> {
  if (!formRow.value) return
  await ElMessageBox.confirm('取消后流程走「取消」分支，确认？', '取消表单')
  const resp = await api().reviewDecide({
    runId: String(route.params.runId),
    nodeId: formRow.value.nodeId,
    decision: 'reject',
  })
  if (resp.success) { ElMessage.success('已取消'); formDialogVisible.value = false; await load() }
  else ElMessage.error(resp.error ?? '操作失败')
}
let pollTimer: ReturnType<typeof setInterval> | null = null

const runId = computed(() => route.params.runId as string)
const canCancel = computed(() => ['pending', 'running', 'waiting_review'].includes(run.value?.status))
const canResume = computed(() => ['failed', 'cancelled', 'interrupted', 'timed_out', 'waiting_review'].includes(run.value?.status))

const api = () => (window as never as { electronAPI: any }).electronAPI.workflow

// 选中节点的详情数据（图节点 + 其各次迭代记录 + 日志行）
const selectedGraphNode = computed(() => graphData.value?.nodes?.find((n: any) => n.id === selectedNodeId.value) ?? null)
const selectedNodeRuns = computed(() => nodeRuns.value.filter((r: any) => r.nodeId === selectedNodeId.value))
const selectedNodeLogs = computed(() => runLogs.value.filter((l: any) => (l as any).nodeId === selectedNodeId.value))

async function load() {
  const resp = await api().getRun(runId.value)
  if (resp.success && resp.data) {
    run.value = resp.data.run
    nodeRuns.value = resp.data.nodeRuns
    await loadGraphData()
  } else if (resp.error) ElMessage.error(resp.error)
  // 执行日志（失败不阻断主视图）
  try {
    const lr = await api().listRunLogs(runId.value)
    if (lr.success && lr.data) runLogs.value = (lr.data.logs ?? []).slice(-500)
  } catch { /* 忽略 */ }
}

/** 加载图数据：run.graphSnapshot 优先；空/缺时用 definition.publishedGraph 兜底 */
async function loadGraphData(): Promise<void> {
  const snap = run.value?.graphSnapshot
  if (snap?.nodes?.length) {
    graphData.value = snap
    return
  }
  const defId = run.value?.definitionId
  if (!defId) { graphData.value = null; return }
  try {
    const d = await api().getDefinition(defId)
    graphData.value = (d.success && d.data?.publishedGraph) || null
  } catch { graphData.value = null }
}

/** 点击只读图节点：选中并自动切到「节点详情」tab；未执行时提示 */
function onNodeClick(payload: { nodeId: string; node: any; state: string; label: string; runs: any[]; executed: boolean }) {
  selectedNodeId.value = payload.nodeId
  activeTab.value = 'node'
  if (!payload.executed) {
    ElMessage.info(`节点「${payload.node?.name ?? payload.nodeId}」本次运行未执行（未走到此环节）`)
  }
}

function formatLogTime(ts: unknown): string {
  if (!ts) return '—'
  const d = new Date(String(ts))
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleTimeString('zh-CN', { hour12: false })
}
function logTag(level: unknown): 'info' | 'warning' | 'error' | 'success' {
  return level === 'error' ? 'error' : level === 'warn' ? 'warning' : level === 'info' ? 'info' : 'info'
}
/**
 * 格式化单条日志为可读文本：对象型字段（data/payload/extra/args 等）用 JSON.stringify(,2) 缩进；
 * 字符串字段若可被 JSON.parse 也格式化为缩进 JSON（try/catch）；普通文本原样展示。
 * 结果放入 <pre log-detail-pre>（等宽 + 自动换行 + 内滚动），以大尺寸 el-dialog 承载。
 */
function formatLogValue(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') {
    try {
      return JSON.stringify(JSON.parse(v), null, 2)
    } catch {
      return v
    }
  }
  return JSON.stringify(v, null, 2)
}
function showLogDetail(l: Record<string, unknown>): void {
  logDetailTitle.value = `日志详情 · ${String(l.type ?? '')}`
  const out: string[] = []
  const appendMeta = (label: string, val: unknown) => {
    if (val === undefined || val === null || val === '') return
    out.push(`${label}：${formatLogValue(val)}`)
  }
  appendMeta('时间', l.ts ?? l.time)
  appendMeta('类型', l.type)
  appendMeta('级别', l.level)
  appendMeta('节点', l.nodeId)
  if (l.iterationIndex != null) appendMeta('迭代', l.iterationIndex)
  appendMeta('状态', l.status)
  appendMeta('运行', l.runId)
  if (out.length && (l.message != null || l.detail != null)) out.push('')
  // 消息 / 详情：可能内嵌 JSON 文本，尽量格式化
  if (l.message != null) {
    out.push('消息：')
    out.push(formatLogValue(l.message))
  }
  if (l.detail != null) {
    if (l.message != null) out.push('')
    out.push('详情：')
    out.push(formatLogValue(l.detail))
  }
  // 其它可能含对象/JSON 的字段（node-log / run-status / notify 等）
  for (const key of ['data', 'payload', 'extra', 'args', 'result', 'body', 'response', 'content', 'event']) {
    if (l[key] !== undefined && l[key] !== null) {
      if (out.length && out[out.length - 1] !== '') out.push('')
      out.push(`${key}：`)
      out.push(formatLogValue(l[key]))
    }
  }
  logDetailText.value = out.join('\n')
  logDetailVisible.value = true
}

async function doCancel() {
  const resp = await api().cancelRun(runId.value)
  if (resp.success) { ElMessage.success('已取消'); await load() }
  else ElMessage.error(resp.error)
}

async function doResume() {
  const resp = await api().resumeRun({ runId: runId.value })
  if (resp.success) {
    ElMessage.success('已创建续跑运行')
    router.replace(`/workflow/run/${resp.data.id}`)
  } else ElMessage.error(resp.error)
}

async function doReview(row: any, decision: 'approve' | 'reject', editedValues?: Record<string, unknown>) {
  const resp = await api().reviewDecide({
    runId: runId.value,
    nodeId: row.nodeId,
    decision,
    editedValues,
  })
  if (resp.success) { ElMessage.success('已提交'); await load() }
  else ElMessage.error(resp.error)
}

async function doReviewEdit(row: any) {
  // 送审内容：优先取挂起 payload（内存态），回退 row.output
  const current = row.input?.payload ?? row.output ?? {}
  const { value } = await ElMessageBox.prompt(
    '修改后的 JSON（浅覆盖送审内容顶层字段；素材板在 cards 数组中逐条改 visual/caption/duration）',
    '修改后批准',
    { inputValue: JSON.stringify(current) }
  )
  try {
    await doReview(row, 'approve_with_changes', JSON.parse(value) as Record<string, unknown>)
  } catch {
    ElMessage.error('不是有效 JSON')
  }
}

/** 审核 payload 中的素材板卡片（cards 数组；兼容字符串化存储） */
function reviewCards(row: any): Array<Record<string, unknown>> {
  if (row.nodeType !== 'human-review') return []
  const raw = row.input?.payload?.cards ?? row.output?.cards
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : []
    } catch { return [] }
  }
  return []
}

function cardImage(card: Record<string, unknown>): string {
  return toImageUrl(String(card.imageUrl ?? card.imageLocalUrl ?? '') || '')
}

async function showOutput(row: any) {
  await ElMessageBox.alert(`<pre style="max-height:400px;overflow:auto">${escapeHtml(JSON.stringify(row.output ?? {}, null, 2))}</pre>`, `${row.nodeName} 输出`, { dangerouslyUseHTMLString: true })
}

function isReportRow(row: any): boolean {
  // report（markdown/docx）与 report-image（长图）共用报告操作区
  return ['report', 'report-image'].includes(row.nodeType) && !!row.output?.markdown
}
/** 打开带标题的报告窗口（修复：原实现无 <title> 导致窗口全部"未命名"） */
async function openReportWindow(row: any): Promise<Window | null> {
  const w = window.open('', '_blank')
  if (!w) return null
  const title = `${row.output?.title || row.nodeName || '报告'} - The Bot`
  const markdown = row.output.markdown as string
  const bodyHtml = await renderMarkdown(markdown)
  // 安全：marked v17 不消毒原始 HTML，报告 markdown 可来自 LLM/知识库/网页抓取
  // （提示注入污染）。把正文放进 sandbox iframe 的 srcdoc——无 allow-scripts /
  // allow-same-origin，恶意 <script>/事件属性无法执行，也无法访问外层窗口的
  // electronAPI（堵死 XSS→任意文件写/RCE 链）。srcdoc 内嵌内容需做属性转义。
  const srcdoc = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Microsoft YaHei', sans-serif; max-width: 860px; margin: 0 auto; padding: 32px 24px; line-height: 1.8; color: #2c3e50; }
  pre { background: #f6f8fa; padding: 14px; border-radius: 8px; overflow-x: auto; }
  code { background: #f6f8fa; padding: 0.15em 0.4em; border-radius: 4px; }
  table { border-collapse: collapse; } th, td { border: 1px solid #ddd; padding: 6px 12px; }
  img { max-width: 100%; }
  blockquote { border-left: 4px solid #ddd; margin: 12px 0; padding: 4px 16px; color: #666; }
</style></head><body>
${bodyHtml}
</body></html>`
  const escapedSrcdoc = srcdoc.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  w.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>html, body { margin: 0; height: 100%; } iframe { width: 100%; height: 100%; border: 0; display: block; }</style></head><body>
<iframe sandbox="" srcdoc="${escapedSrcdoc}" title="报告内容"></iframe>
</body></html>`)
  w.document.close()
  w.document.title = title
  return w
}

/** markdown → HTML（报告预览/打印共用；marked 动态加载） */
async function renderMarkdown(md: string): Promise<string> {
  try {
    const { marked } = await import('marked')
    return await marked.marked(md, { gfm: true, breaks: true, async: true })
  } catch {
    return `<pre style="white-space:pre-wrap">${escapeHtml(md)}</pre>`
  }
}

async function previewReport(row: any) {
  const output = row.output ?? {}
  // report-image 桌面端：展示完整 PNG 长图（不截断、无 JSON 滚动条）
  if (row.nodeType === 'report-image' && output.filePath) {
    openImageWindow(output)
    return
  }
  if (!(await openReportWindow(row))) ElMessage.error('弹窗被拦截，请允许弹窗后重试')
}

/** 打开完整长图预览窗口（整图加载，无内容截断；窗口内按宽度适配展示） */
function openImageWindow(output: any): void {
  const w = window.open('', '_blank')
  if (!w) { ElMessage.error('弹窗被拦截，请允许弹窗后重试'); return }
  const title = `${output.title || '长图报告'} - The Bot`
  const imgUrl = toImageUrl(output.filePath as string)
  w.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; padding: 0; background: #ececec; }
  .wrap { display: flex; justify-content: center; }
  .long-img { display: block; width: 100%; height: auto; max-width: 900px; box-shadow: 0 2px 12px rgba(0,0,0,.15); }
</style></head><body>
<div class="wrap"><img class="long-img" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(title)}" /></div>
</body></html>`)
  w.document.close()
  w.document.title = title
}
/** 导出 PDF：文档工具层排版（中文字体/表格/代码块），saveBlobAs 落盘 */
async function printReport(row: any) {
  exporting.value = true
  try {
    const resp = await api().reportToPdf({ markdown: row.output.markdown, title: row.output.title })
    if (!resp.success) { ElMessage.error(resp.error ?? 'PDF 生成失败'); return }
    const bin = atob(resp.data.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const name = (row.output.title || '报告').replace(/[\/:*?"<>|]/g, '_')
    const saved = await saveBlobAs(new Blob([bytes], { type: 'application/pdf' }), { defaultName: `${name}.pdf` })
    if (saved.success) ElMessage.success('PDF 已保存')
  } finally {
    exporting.value = false
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function statusTag(s: string): 'success' | 'danger' | 'warning' | 'info' {
  return s === 'succeeded' ? 'success' : ['failed', 'timed_out'].includes(s) ? 'danger'
    : ['running', 'pending'].includes(s) ? 'warning' : 'info'
}
function nodeStatusTag(s: string): 'success' | 'danger' | 'warning' | 'info' | 'primary' {
  if (s === 'succeeded') return 'success'
  if (['failed', 'timed_out'].includes(s)) return 'danger'
  if (s === 'failed_recovered') return 'warning'
  if (['running', 'waiting_review'].includes(s)) return 'primary'
  return 'info'
}
function formatTime(t: string | null) {
  return t ? new Date(t).toLocaleString('zh-CN') : '—'
}

/** 表格行唯一键（同节点多迭代区分） */
function rowKeyOf(row: any): string {
  return `${row.nodeId}:${row.iterationIndex ?? 0}`
}

/** JSON 格式化展示（大对象截断防卡顿；文件字段显示文件名） */
function formatJson(v: unknown): string {
  if (v === undefined || v === null) return ''
  const pretty = JSON.stringify(v, (_k, val) => {
    // 文件输入 {path,name,text} → 显示文件名
    if (val && typeof val === 'object' && typeof val.path === 'string' && typeof val.name === 'string' && 'text' in val) {
      return `[文件] ${val.name}`
    }
    return val
  }, 2)
  return pretty && pretty.length > 20000 ? pretty.slice(0, 20000) + '\n…（已截断）' : pretty
}

onMounted(() => {
  store.subscribe()
  void load()
  // 终态后停止轮询（事件驱动为主，轮询兜底）
  pollTimer = setInterval(() => {
    if (!run.value || !WORKFLOW_RUN_TERMINAL_STATUSES.has(run.value.status)) {
      void load()
    }
  }, 3000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  store.clearRun(runId.value)
  // 离开页面取消实时事件订阅（否则监听器累积，同事件触发 N 次通知）
  store.unsubscribeAll()
})
</script>

<style scoped>
.page-container { padding: 20px; height: 100%; overflow: auto; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.meta { color: var(--el-text-color-secondary); font-size: 13px; }
.sep { margin-left: 12px; }
h4 { margin: 12px 0 8px; }
/* 只读工作流执行图 + 环节详情区块 */
.run-graph-section { margin-bottom: 14px; }
.section-head { display: flex; align-items: baseline; gap: 10px; margin: 4px 0 10px; }
.section-head h3 { margin: 0; }
.section-hint { font-size: 12px; color: var(--el-text-color-secondary); }
/* 图下方信息区 Tab */
.run-tabs { margin-top: 4px; }
.run-tabs :deep(.el-tabs__content) { padding-top: 10px; }
.run-tabs :deep(.el-tabs__header) { margin-bottom: 4px; }
.tab-empty { padding: 20px 0; color: var(--el-text-color-placeholder); font-size: 13px; text-align: center; }
.logs-count { font-size: 13px; font-weight: 600; color: var(--el-text-color-regular); margin-bottom: 8px; }
.node-io { padding: 4px 8px 8px 16px; }
.io-block { margin-bottom: 8px; }
.io-title { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 4px; }
.io-json {
  margin: 0; padding: 10px 12px; background: var(--el-fill-color-light);
  border-radius: 6px; font-size: 12px; line-height: 1.6;
  max-height: 320px; overflow: auto; white-space: pre-wrap; word-break: break-all;
}
.io-empty { font-size: 12px; color: var(--el-text-color-placeholder); padding: 8px 0; }
/* 执行日志时间线 */
.log-empty { font-size: 12px; color: var(--el-text-color-placeholder); padding: 8px 0; }
.log-list { max-height: 360px; overflow: auto; font-size: 12px; line-height: 1.8; }
.log-row { display: flex; align-items: baseline; gap: 8px; padding: 2px 4px; border-bottom: 1px dashed var(--el-border-color-lighter); }
.log-time { color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.log-lv { flex: none; }
.log-type { color: var(--el-color-primary); flex: none; min-width: 90px; }
.log-msg { flex: 1; word-break: break-all; }
/* 执行日志「详情」大尺寸对话框 */
.log-detail-dialog :deep(.el-dialog__body) { padding-top: 8px; }
.log-detail-body { max-height: 70vh; min-height: 200px; overflow: auto; }
.log-detail-pre {
  margin: 0; padding: 12px 14px; background: var(--el-fill-color-light); border-radius: 8px;
  font-family: var(--el-font-family-mono, ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace);
  font-size: 12px; line-height: 1.7; color: var(--el-text-color-regular);
  white-space: pre-wrap; word-break: break-word;
}
/* 素材板卡片预览 */
.board-preview { margin-bottom: 10px; }
.board-title { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.board-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 8px; }
.board-card { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; background: var(--el-bg-color); }
.board-img { width: 100%; height: 150px; object-fit: cover; display: block; background: #f2f3f5; }
.board-noimg { width: 100%; height: 150px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--el-text-color-placeholder); background: var(--el-fill-color-light); }
.board-meta { padding: 6px 8px; font-size: 12px; line-height: 1.5; }
.board-caption { font-weight: 500; }
.board-extra { color: var(--el-text-color-secondary); }
.board-visual { color: var(--el-text-color-regular); margin-top: 2px; }
</style>
