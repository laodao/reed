<template>
  <div class="agent-todos page-container">
    <div class="page-header">
      <div>
        <h2>待办中心</h2>
        <span class="meta">工作流审批 · 任务裁决 · 记忆审批——集中处理（27 号 M4）</span>
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

      <el-tab-pane :label="`记忆审批 (${memories.length})`" name="memory">
        <div class="list-wrap">
          <el-table :data="pagedMemories" size="small" empty-text="暂无待审记忆" height="100%">
            <el-table-column type="index" label="#" width="52" :index="memoryRowIndex" />
            <el-table-column label="提交时间" width="150">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="类型" width="90">
              <template #default="{ row }"><el-tag size="small" disable-transitions>{{ row.kind }}</el-tag></template>
            </el-table-column>
            <el-table-column label="标题" min-width="160">
              <template #default="{ row }">{{ row.content.title }}</template>
            </el-table-column>
            <el-table-column label="内容" min-width="260">
              <template #default="{ row }"><span class="content">{{ row.content.content }}</span></template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button text type="success" size="small" @click="memory(row.id, 'approve')">批准</el-button>
                <el-button text type="danger" size="small" @click="memory(row.id, 'archive')">归档</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              small
              background
              layout="total, sizes, prev, pager, next"
              :total="memories.length"
              v-model:current-page="memoryPage"
              v-model:page-size="memoryPageSize"
              :page-sizes="[10, 20, 50]"
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
interface TaskTodo { id: string; title: string; status: string; rootId: string; rootTitle: string; createdAt: string | null }
interface MemoryRow { id: string; kind: string; content: { title?: string; content?: string }; confidence: number | null; createdAt: string | null }

type WfResp = { success: boolean; data?: unknown; error?: string }
type WfApi = Record<string, (payload?: unknown) => Promise<WfResp>>
const router = useRouter()
const api = () => (window as never as { electronAPI: { workflow: WfApi } }).electronAPI.workflow

const tab = ref<'reviews' | 'tasks' | 'memory'>('reviews')
const reviews = ref<ReviewRow[]>([])
const taskTodos = ref<TaskTodo[]>([])
const memories = ref<MemoryRow[]>([])

// ==================== 分页（每列表独立；分页栏固定底部，表格内滚动） ====================
const pageSizeDefault = 10
const reviewPage = ref(1)
const reviewPageSize = ref(pageSizeDefault)
const taskPage = ref(1)
const taskPageSize = ref(pageSizeDefault)
const memoryPage = ref(1)
const memoryPageSize = ref(pageSizeDefault)

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
const pagedMemories = computed(() => slicePage(memories.value, memoryPage.value, memoryPageSize.value))
const reviewRowIndex = computed(() => rowIndex(reviewPage.value, reviewPageSize.value))
const taskRowIndex = computed(() => rowIndex(taskPage.value, taskPageSize.value))
const memoryRowIndex = computed(() => rowIndex(memoryPage.value, memoryPageSize.value))

/** 列表刷新后把页码收敛回有效范围（数据变少时避免空页） */
watch(reviews, (list) => { reviewPage.value = clampPage(reviewPage.value, list.length, reviewPageSize.value) })
watch(taskTodos, (list) => { taskPage.value = clampPage(taskPage.value, list.length, taskPageSize.value) })
watch(memories, (list) => { memoryPage.value = clampPage(memoryPage.value, list.length, memoryPageSize.value) })

/** 单调请求序号（review M8：切 tab 交错覆盖曾让计数闪变） */
let loadSeq = 0

async function load(): Promise<void> {
  const seq = ++loadSeq
  // 三段并行（review M8：串行 N+1 曾拖慢首屏）
  const [r, rootsRes, m] = await Promise.all([
    api().getPendingReviews(),
    api().listTaskRoots(),
    api().listMemoryPending(),
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
  memories.value = m.success ? ((m.data ?? []) as MemoryRow[]) : []
  if (!m.success) ElMessage.error(m.error ?? '记忆列表加载失败')
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

async function memory(id: string, action: 'approve' | 'archive'): Promise<void> {
  const resp = await api()[action === 'approve' ? 'approveMemory' : 'archiveMemory'](id)
  if (resp.success) { await load() }
  else ElMessage.error(resp.error ?? '操作失败')
}

function gotoRun(row: ReviewRow): void {
  void router.push(`/workflow/run/${row.runId}`)
}
function gotoTasks(rootId: string): void {
  void router.push({ path: '/agent-tasks', query: { focus: rootId } })
}

onMounted(() => { void load() })
watch(tab, () => { void load() })
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