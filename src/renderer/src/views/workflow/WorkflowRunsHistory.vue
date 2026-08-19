<template>
  <div class="wf-runs-history">
    <div class="toolbar">
      <el-button text @click="router.push('/workflow')">
        <el-icon><ArrowLeft /></el-icon>
      </el-button>
      <span class="title">运行历史{{ defName ? `：${defName}` : '' }}</span>
      <div class="spacer" />
      <el-button size="small" :loading="loading" @click="load">刷新</el-button>
    </div>

    <el-table :data="runs" v-loading="loading" style="width: 100%">
      <el-table-column label="#" width="56">
        <template #default="{ $index }">{{ (page - 1) * pageSize + $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="id" label="运行 ID" min-width="220" show-overflow-tooltip />
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <el-tag :type="STATUS_TONE[row.status] ?? 'info'" size="small">{{ STATUS_LABEL[row.status] ?? row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="触发" width="110">
        <template #default="{ row }">
          <span>{{ TRIGGER_LABEL[row.triggerType] ?? row.triggerType }}</span>
        </template>
      </el-table-column>
      <el-table-column label="开始时间" min-width="170">
        <template #default="{ row }">{{ formatTime(row.startedAt ?? row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="耗时" width="110">
        <template #default="{ row }">{{ formatDuration(row.stats, row) }}</template>
      </el-table-column>
      <el-table-column label="错误" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="err" :title="row.error">{{ row.error || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="router.push(`/workflow/run/${row.id}`)">详情</el-button>
          <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination layout="prev, pager, next, total" :total="total" :page-size="pageSize"
        :current-page="page" @current-change="p => { page = p; load() }" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 工作流运行历史列表（修复：handleHistory 跳转 /workflow/runs/:definitionId 原本无路由——空白页）
 */
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'

const STATUS_LABEL: Record<string, string> = {
  pending: '排队中', running: '运行中', waiting_review: '待审核', succeeded: '成功',
  failed: '失败', cancelled: '已取消', interrupted: '已中断', skipped: '跳过', timed_out: '超时',
}
const STATUS_TONE: Record<string, string> = {
  running: 'primary', waiting_review: 'warning', succeeded: 'success',
  failed: 'danger', cancelled: 'info', interrupted: 'info', skipped: 'info', timed_out: 'danger',
}
const TRIGGER_LABEL: Record<string, string> = { manual: '手动', cron: '定时', event: '事件', resume: '续跑', api: 'API' }

const route = useRoute()
const router = useRouter()
const api = () => (window as never as { electronAPI: any }).electronAPI.workflow

const runs = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const defName = ref('')

async function load(): Promise<void> {
  loading.value = true
  try {
    const resp = await api().listRuns({ definitionId: String(route.params.definitionId), page: page.value, pageSize })
    if (resp.success) {
      runs.value = resp.data.items ?? []
      total.value = resp.data.total ?? 0
    } else ElMessage.error(resp.error ?? '加载失败')
  } finally {
    loading.value = false
  }
}

async function handleDelete(row: any): Promise<void> {
  await ElMessageBox.confirm(`删除运行 ${row.id} 的记录？`, '删除')
  const resp = await api().deleteRun(row.id)
  if (resp.success) { ElMessage.success('已删除'); await load() }
  else ElMessage.error(resp.error ?? '删除失败')
}

function formatTime(t?: string | null): string {
  if (!t) return '—'
  try { return new Date(t).toLocaleString('zh-CN') } catch { return String(t) }
}
function formatDuration(stats: any, row: any): string {
  // 优先引擎统计里的时长；否则由 started/finished 推算
  const start = row.startedAt ?? row.createdAt
  const end = row.finishedAt
  if (start && end) {
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (Number.isFinite(ms) && ms >= 0) return ms < 60_000 ? `${Math.round(ms / 100) / 10}s` : `${Math.round(ms / 60000)}m`
  }
  void stats
  return '—'
}

onMounted(async () => {
  await load()
  const d = await api().getDefinition(String(route.params.definitionId))
  if (d.success && d.data) defName.value = d.data.name
})
</script>

<style scoped>
.wf-runs-history { padding: 12px 16px; height: 100%; overflow: auto; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.title { font-weight: 600; }
.spacer { flex: 1; }
.err { color: var(--el-color-danger); }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
