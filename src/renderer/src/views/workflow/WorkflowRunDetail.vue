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

    <h4>节点执行记录</h4>
    <el-table :data="nodeRuns" size="small" empty-text="暂无执行记录">
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
    <!-- E1 form-collect 挂起表单 -->
    <el-dialog v-model="formDialogVisible" :title="formRow?.payload?.formTitle || '请填写'" width="520px" :close-on-click-modal="false">
      <RunInputForm ref="formInputRef" :inputs="formRow?.payload?.fields ?? []" @valid="v => formValid = v" />
      <template #footer>
        <el-button @click="cancelForm">取消流程</el-button>
        <el-button type="primary" :disabled="!formValid" :loading="formSubmitting" @click="submitForm">提交并继续</el-button>
      </template>
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
import RunInputForm from '@/components/workflow/RunInputForm.vue'

const route = useRoute()
const router = useRouter()
const store = useWorkflowStore()
const run = ref<any>(null)
const nodeRuns = ref<any[]>([])
const exporting = ref(false)

// E1 form-collect：挂起表单
const formDialogVisible = ref(false)
const formRow = ref<any>(null)
const formInputRef = ref<InstanceType<typeof RunInputForm>>()
const formValid = ref(false)
const formSubmitting = ref(false)

function isFormRow(row: any): boolean {
  return row.status === 'waiting_review' && !!row.payload?.form
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

async function load() {
  const resp = await api().getRun(runId.value)
  if (resp.success && resp.data) {
    run.value = resp.data.run
    nodeRuns.value = resp.data.nodeRuns
  } else if (resp.error) ElMessage.error(resp.error)
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
  const current = row.output ?? {}
  const { value } = await ElMessageBox.prompt(
    '修改后的 JSON（浅覆盖送审内容顶层字段）',
    '修改后批准',
    { inputValue: JSON.stringify(current) }
  )
  try {
    await doReview(row, 'approve_with_changes', JSON.parse(value) as Record<string, unknown>)
  } catch {
    ElMessage.error('不是有效 JSON')
  }
}

async function showOutput(row: any) {
  await ElMessageBox.alert(`<pre style="max-height:400px;overflow:auto">${escapeHtml(JSON.stringify(row.output ?? {}, null, 2))}</pre>`, `${row.nodeName} 输出`, { dangerouslyUseHTMLString: true })
}

function isReportRow(row: any): boolean {
  return row.nodeType === 'report' && !!row.output?.markdown
}
/** 打开带标题的报告窗口（修复：原实现无 <title> 导致窗口全部"未命名"） */
async function openReportWindow(row: any): Promise<Window | null> {
  const w = window.open('', '_blank')
  if (!w) return null
  const title = `${row.output?.title || row.nodeName || '报告'} - The Bot`
  const markdown = row.output.markdown as string
  w.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Microsoft YaHei', sans-serif; max-width: 860px; margin: 0 auto; padding: 32px 24px; line-height: 1.8; color: #2c3e50; }
  pre { background: #f6f8fa; padding: 14px; border-radius: 8px; overflow-x: auto; }
  code { background: #f6f8fa; padding: 0.15em 0.4em; border-radius: 4px; }
  table { border-collapse: collapse; } th, td { border: 1px solid #ddd; padding: 6px 12px; }
  img { max-width: 100%; }
  blockquote { border-left: 4px solid #ddd; margin: 12px 0; padding: 4px 16px; color: #666; }
</style></head><body>
${await renderMarkdown(markdown)}
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
  if (!(await openReportWindow(row))) ElMessage.error('弹窗被拦截，请允许弹窗后重试')
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

onMounted(() => {
  store.subscribe()
  void load()
  // 终态后停止轮询（事件驱动为主，轮询兜底）
  pollTimer = setInterval(() => {
    if (!run.value || !['succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted'].includes(run.value.status)) {
      void load()
    }
  }, 3000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  store.clearRun(runId.value)
})
</script>

<style scoped>
.page-container { padding: 20px; height: 100%; overflow: auto; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.meta { color: var(--el-text-color-secondary); font-size: 13px; }
.sep { margin-left: 12px; }
h4 { margin: 12px 0 8px; }
</style>
