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
          <template v-if="row.status === 'waiting_review'">
            <el-button text type="success" size="small" @click="doReview(row, 'approve')">批准</el-button>
            <el-button text type="warning" size="small" @click="doReviewEdit(row)">修改后批准</el-button>
            <el-button text type="danger" size="small" @click="doReview(row, 'reject')">驳回</el-button>
          </template>
          <template v-else-if="isReportRow(row)">
            <el-button text type="primary" size="small" @click="previewReport(row)">预览</el-button>
            <el-button text size="small" @click="printReport(row)">打印/PDF</el-button>
          </template>
          <el-button v-else text size="small" @click="showOutput(row)">输出</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'WorkflowRunDetail' })
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWorkflowStore } from '@/stores/workflow'

const route = useRoute()
const router = useRouter()
const store = useWorkflowStore()
const run = ref<any>(null)
const nodeRuns = ref<any[]>([])
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
function previewReport(row: any) {
  const w = window.open('', '_blank')
  if (!w) { ElMessage.error('弹窗被拦截，请允许弹窗后重试'); return }
  w.document.write(`<pre style="white-space:pre-wrap;font-family:inherit;padding:24px">${escapeHtml(row.output.markdown)}</pre>`)
  w.document.close()
}
function printReport(row: any) {
  const w = window.open('', '_blank')
  if (!w) { ElMessage.error('弹窗被拦截'); return }
  w.document.write(`<pre style="white-space:pre-wrap;font-family:inherit;padding:24px">${escapeHtml(row.output.markdown)}</pre>`)
  w.document.close()
  w.print()
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
