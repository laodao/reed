<template>
  <div class="agent-todos page-container">
    <div class="page-header">
      <div>
        <h2>待办中心</h2>
        <span class="meta">工作流审批 · 任务裁决——集中处理（27 号 M4）</span>
      </div>
    </div>

    <el-tabs v-model="tab" class="tabs-area">
      <el-tab-pane :label="`工作流审批 (${reviews.length})`" name="reviews">
        <div class="list-wrap">
          <el-table :data="pagedReviews" size="small" empty-text="暂无待审批" height="100%">
            <el-table-column type="index" label="#" width="52" :index="reviewRowIndex" />
            <el-table-column label="送审时间" width="150">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column prop="nodeName" label="节点" min-width="120" />
            <el-table-column label="送审内容" min-width="240">
              <template #default="{ row }"><span class="content">{{ outputSummary(row) }}</span></template>
            </el-table-column>
            <el-table-column label="截止" width="150">
              <template #default="{ row }">{{ formatTime(row.waitExpiresAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="330" fixed="right">
              <template #default="{ row }">
                <el-button text type="success" size="small" @click="decide(row, 'approve')">批准</el-button>
                <el-button text type="warning" size="small" @click="decideEdit(row)">修改后批准</el-button>
                <el-button text type="danger" size="small" @click="decide(row, 'reject')">驳回</el-button>
                <el-button text type="primary" size="small" @click="gotoRun(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              small
              background
              layout="total, sizes, prev, pager, next"
              :total="reviews.length"
              v-model:current-page="reviewPage"
              v-model:page-size="reviewPageSize"
              :page-sizes="[10, 20, 50]"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="`任务裁决 (${taskTodos.length})`" name="tasks">
        <div class="list-wrap">
          <el-table :data="pagedTaskTodos" size="small" empty-text="暂无待裁决任务" height="100%">
            <el-table-column type="index" label="#" width="52" :index="taskRowIndex" />
            <el-table-column label="创建时间" width="150">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column prop="title" label="任务" min-width="180" />
            <el-table-column label="状态" width="120">
              <template #default="{ row }"><el-tag size="small" :type="row.status === 'escalated' ? 'danger' : 'primary'" disable-transitions>{{ row.status }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="rootTitle" label="所属计划" min-width="160" />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="gotoTasks(row.rootId)">去裁决</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              small
              background
              layout="total, sizes, prev, pager, next"
              :total="taskTodos.length"
              v-model:current-page="taskPage"
              v-model:page-size="taskPageSize"
              :page-sizes="[10, 20, 50]"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="`审批历史 (${historyTotal})`" name="history">
        <div class="list-wrap">
          <el-table :data="historyRows" v-loading="historyLoading" size="small" empty-text="暂无审批记录" height="100%">
            <el-table-column type="index" label="#" width="52" :index="historyRowIndex" />
            <el-table-column label="审批时间" width="160">
              <template #default="{ row }">{{ formatTime(row.review?.decidedAt ?? row.finishedAt) }}</template>
            </el-table-column>
            <el-table-column label="决策" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="DECISION_TONE[row.review?.decision] ?? 'info'" disable-transitions>
                  {{ DECISION_LABEL[row.review?.decision] ?? row.review?.decision ?? '—' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="nodeName" label="节点" min-width="120" show-overflow-tooltip />
            <el-table-column label="工作流" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.definitionName ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="意见" min-width="160" show-overflow-tooltip>
              <template #default="{ row }"><span class="content">{{ row.review?.comment || '—' }}</span></template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="gotoRun(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              small
              background
              layout="total, prev, pager, next"
              :total="historyTotal"
              v-model:current-page="historyPage"
              :page-size="historyPageSize"
              @current-change="loadHistory"
            />
          </div>
        </div>
      </el-tab-pane>

      </el-tabs>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'AgentTodosView' })
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

interface ReviewRow {
  runId: string
  nodeId: string
  nodeName: string
  nodeType?: string
  error: string | null
  output: Record<string, unknown> | null
  waitExpiresAt: string | null
  /** 送审时间（节点创建时间，后端 WorkflowNodeRunRecord.createdAt） */
  createdAt: string | null
}
/** 审批历史行（后端 listReviewed：review 留痕 + 运行状态/定义名富化） */
interface HistoryRow extends ReviewRow {
  definitionId: string | null
  definitionName: string | null
  runStatus: string | null
  review: { decision: string; comment?: string; decidedAt: string } | null
  finishedAt: string | null
}

/** 决策 → 展示文案 / 标签色（含超时自动决策留痕） */
const DECISION_LABEL: Record<string, string> = {
  approve: '批准',
  approve_with_changes: '修改后批准',
  reject: '驳回',
  timeout_approve: '超时自动通过',
  timeout_reject: '超时自动驳回',
}
const DECISION_TONE: Record<string, string> = {
  approve: 'success',
  approve_with_changes: 'warning',
  reject: 'danger',
  timeout_approve: 'info',
  timeout_reject: 'danger',
}
interface TaskTodo { id: string; title: string; status: string; rootId: string; rootTitle: string; createdAt: string | null }

type WfResp = { success: boolean; data?: unknown; error?: string }
type WfApi = Record<string, (payload?: unknown) => Promise<WfResp>>
const router = useRouter()
const api = () => (window as never as { electronAPI: { workflow: WfApi } }).electronAPI.workflow

const tab = ref<'reviews' | 'tasks' | 'history'>('reviews')
const reviews = ref<ReviewRow[]>([])
const taskTodos = ref<TaskTodo[]>([])

// ==================== 分页（每列表独立；分页栏固定底部，表格内滚动） ====================
const pageSizeDefault = 10
const reviewPage = ref(1)
const reviewPageSize = ref(pageSizeDefault)
const taskPage = ref(1)
const taskPageSize = ref(pageSizeDefault)

function slicePage<T>(list: T[], page: number, pageSize: number): T[] {
  return list.slice((page - 1) * pageSize, page * pageSize)
}
function clampPage(page: number, listLength: number, pageSize: number): number {
  const maxPage = Math.max(1, Math.ceil(listLength / pageSize))
  return Math.min(page, maxPage)
}
/** 序号列全局索引（带分页偏移） */
function rowIndex(page: number, pageSize: number): (i: number) => number {
  return (i: number) => (page - 1) * pageSize + i + 1
}

const pagedReviews = computed(() => slicePage(reviews.value, reviewPage.value, reviewPageSize.value))
const pagedTaskTodos = computed(() => slicePage(taskTodos.value, taskPage.value, taskPageSize.value))
const reviewRowIndex = computed(() => rowIndex(reviewPage.value, reviewPageSize.value))
const taskRowIndex = computed(() => rowIndex(taskPage.value, taskPageSize.value))

/** 列表刷新后把页码收敛回有效范围（数据变少时避免空页） */
watch(reviews, (list) => { reviewPage.value = clampPage(reviewPage.value, list.length, reviewPageSize.value) })
watch(taskTodos, (list) => { taskPage.value = clampPage(taskPage.value, list.length, taskPageSize.value) })

/** 单调请求序号（review M8：切 tab 交错覆盖曾让计数闪变） */
let loadSeq = 0

// ==================== 审批历史（服务端分页；切到页签才加载，挂载不发请求） ====================
const historyRows = ref<HistoryRow[]>([])
const historyTotal = ref(0)
const historyPage = ref(1)
const historyPageSize = ref(pageSizeDefault)
const historyLoading = ref(false)
const historyRowIndex = computed(() => rowIndex(historyPage.value, historyPageSize.value))

async function loadHistory(): Promise<void> {
  const seq = ++loadSeq
  historyLoading.value = true
  try {
    const r = await api().listReviewed({ page: historyPage.value, pageSize: historyPageSize.value })
    if (seq !== loadSeq) return
    if (r.success) {
      const data = r.data as { items?: HistoryRow[]; total?: number } | undefined
      historyRows.value = data?.items ?? []
      historyTotal.value = data?.total ?? 0
    } else ElMessage.error(r.error ?? '审批历史加载失败')
  } finally {
    if (seq === loadSeq) historyLoading.value = false
  }
}

async function load(): Promise<void> {
  const seq = ++loadSeq
  // 两段并行（review M8：串行 N+1 曾拖慢首屏）
  const [r, rootsRes] = await Promise.all([
    api().getPendingReviews(),
    api().listTaskRoots(),
  ])
  if (seq !== loadSeq) return
  reviews.value = r.success ? ((r.data ?? []) as ReviewRow[]) : []
  if (!r.success) ElMessage.error(r.error ?? '审批列表加载失败')
  const todos: TaskTodo[] = []
  if (rootsRes.success) {
    const roots = (rootsRes.data ?? []) as Array<{ id: string; title: string }>
    const trees = await Promise.all(roots.map((root) => api().getTaskTree(root.id)))
    if (seq !== loadSeq) return
    for (const t of trees) {
      if (!t.success) continue
      for (const node of (t.data as { nodes: Array<{ id: string; title: string; status: string; createdAt?: string | null }> }).nodes) {
        if (['verifying', 'escalated'].includes(node.status)) {
          const root = roots.find((x) => x.id === (t.data as { root: { id: string } }).root.id)
          todos.push({
            id: node.id,
            title: node.title,
            status: node.status,
            rootId: root?.id ?? '',
            rootTitle: root?.title ?? '',
            createdAt: node.createdAt ?? null,
          })
        }
      }
    }
  } else ElMessage.error(rootsRes.error ?? '任务加载失败')
  taskTodos.value = todos
}

function outputSummary(row: ReviewRow): string {
  if (!row.output) return '—'
  try {
    return JSON.stringify(row.output).slice(0, 120)
  } catch {
    return String(row.output)
  }
}
function formatTime(t: string | null | undefined): string {
  return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '—'
}

/** 修改后批准（与运行详情同构；review M7：盲批曾对 choose/form 行必然失败） */
async function decideEdit(row: ReviewRow): Promise<void> {
  const current = row.output ?? {}
  const { value } = await ElMessageBox.prompt(
    '修改后的 JSON（浅覆盖送审内容顶层字段）',
    '修改后批准',
    { inputValue: JSON.stringify(current) },
  )
  try {
    await decide(row, 'approve_with_changes', JSON.parse(value) as Record<string, unknown>)
  } catch {
    ElMessage.error('不是有效 JSON')
  }
}

async function decide(row: ReviewRow, decision: 'approve' | 'reject' | 'approve_with_changes', editedValues?: Record<string, unknown>): Promise<void> {
  const resp = await api().reviewDecide({ runId: row.runId, nodeId: row.nodeId, decision, editedValues })
  if (resp.success) { ElMessage.success('已提交'); await load() }
  else ElMessage.error(resp.error ?? '操作失败')
}

function gotoRun(row: ReviewRow): void {
  void router.push(`/workflow/run/${row.runId}`)
}
function gotoTasks(rootId: string): void {
  void router.push({ path: '/agent-tasks', query: { focus: rootId } })
}

onMounted(() => { void load() })
// 历史页签懒加载（挂载只发待办两查询）；其余页签复用原聚合加载
watch(tab, () => { if (tab.value === 'history') void loadHistory(); else void load() })
</script>

<style scoped>
.page-container {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.page-header { flex: none; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.meta { color: var(--el-text-color-secondary); font-size: 13px; }
.content { font-size: 12px; color: var(--el-text-color-regular); }

/* tabs 占据剩余高度；表头/分页固定，表格中间内容滚动 */
.tabs-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.tabs-area :deep(.el-tabs__header) { flex: none; margin-bottom: 8px; }
.tabs-area :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.tabs-area :deep(.el-tab-pane) { height: 100%; }

.list-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.list-wrap :deep(.el-table) { flex: 1; min-height: 0; }
.pager {
  flex: none;
  padding-top: 10px;
  display: flex;
  justify-content: flex-end;
}
</style>