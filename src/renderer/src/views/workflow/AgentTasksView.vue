<template>
  <div class="agent-tasks page-container">
    <div class="page-header">
      <div>
        <h2>Agent 任务树</h2>
        <span class="meta">长程任务分解：规划 → 人工批准 → 逐任务过质量门</span>
      </div>
      <div class="actions">
        <el-button type="primary" @click="createDialogVisible = true">新建计划</el-button>
      </div>
    </div>

    <el-table :data="roots" size="small" empty-text="暂无任务计划">
      <el-table-column prop="title" label="计划" min-width="200" />
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="质量分" width="90">
        <template #default="{ row }">{{ row.qualityScore != null ? row.qualityScore.toFixed(2) : '—' }}</template>
      </el-table-column>
      <el-table-column prop="error" label="错误" min-width="140" show-overflow-tooltip />
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="openTree(row)">详情</el-button>
          <el-button v-if="row.status === 'pending_review'" text type="success" size="small" @click="approve(row)">批准计划</el-button>
          <el-button v-if="!terminal(row.status)" text type="danger" size="small" @click="cancelPlan(row)">取消</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 计划创建 -->
    <el-dialog v-model="createDialogVisible" title="新建任务计划" width="520px">
      <el-input v-model="newGoal" type="textarea" :rows="3" placeholder="描述一个长程目标，如：调研 XX 主题并产出带数据来源的报告" />
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!newGoal.trim()" @click="createPlan">生成计划（LLM 规划 → 人工批准）</el-button>
      </template>
    </el-dialog>

    <!-- 树详情抽屉 -->
    <el-drawer v-model="treeVisible" :title="`${treeRoot?.title ?? ''} · 任务树`" size="640px">
      <div v-for="node in treeNodes" :key="node.id" class="tree-node" :style="{ marginLeft: `${node.depth * 20}px` }">
        <div class="node-head">
          <el-tag :type="statusTag(node.status)" size="small" disable-transitions>{{ node.status }}</el-tag>
          <span class="node-title">{{ node.title }}</span>
          <span v-if="node.qualityScore != null" class="node-score">{{ node.qualityScore.toFixed(2) }}</span>
        </div>
        <div class="node-goal">{{ node.spec.goal }}</div>
        <div v-if="node.error" class="node-err">{{ node.error }}</div>
        <div class="node-actions">
          <template v-if="node.status === 'verifying'">
            <el-button text type="success" size="small" @click="verifyDecide(node, 'approve')">人工验收通过</el-button>
            <el-button text type="danger" size="small" @click="verifyDecide(node, 'reject')">驳回</el-button>
          </template>
          <template v-else-if="node.status === 'escalated'">
            <el-button text type="success" size="small" @click="escalateDecide(node, 'pass')">人工判定通过</el-button>
            <el-button text type="warning" size="small" @click="escalateDecide(node, 'retry')">再试一轮</el-button>
            <el-button text type="danger" size="small" @click="escalateDecide(node, 'fail')">判定失败</el-button>
          </template>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'AgentTasksView' })
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { AgentTaskView } from '@shared/types/agent.types'

type WfResp = { success: boolean; data?: unknown; error?: string }
type WfMethod = (payload?: unknown) => Promise<WfResp>
type WfApi = Record<string, WfMethod>
const api = () => (window as never as { electronAPI: { workflow: WfApi } }).electronAPI.workflow

const roots = ref<AgentTaskView[]>([])
const createDialogVisible = ref(false)
const newGoal = ref('')
const creating = ref(false)
const treeVisible = ref(false)
const treeRoot = ref<AgentTaskView | null>(null)
const treeNodes = ref<AgentTaskView[]>([])

function statusTag(s: string): 'success' | 'danger' | 'warning' | 'info' | 'primary' {
  if (s === 'succeeded') return 'success'
  if (['failed', 'escalated'].includes(s)) return 'danger'
  if (['running', 'verifying', 'ready'].includes(s)) return 'primary'
  if (s === 'pending_review') return 'warning'
  return 'info'
}
function terminal(s: string): boolean {
  return ['succeeded', 'failed', 'cancelled'].includes(s)
}
function formatTime(t: string | null): string {
  return t ? new Date(t).toLocaleString('zh-CN') : '—'
}

async function load(): Promise<void> {
  const resp = await api().listTaskRoots()
  if (resp.success) roots.value = (resp.data ?? []) as AgentTaskView[]
  else ElMessage.error(resp.error ?? '加载失败')
}

async function createPlan(): Promise<void> {
  creating.value = true
  try {
    const resp = await api().createPlan({ goal: newGoal.value.trim() })
    if (resp.success) {
      ElMessage.success('计划已生成，请审批后执行')
      createDialogVisible.value = false
      newGoal.value = ''
      await load()
    } else ElMessage.error(resp.error ?? '规划失败')
  } finally {
    creating.value = false
  }
}

async function approve(row: AgentTaskView): Promise<void> {
  const resp = await api().approvePlan(row.id)
  if (resp.success) { ElMessage.success('已批准，开始执行'); await load() }
  else ElMessage.error(resp.error ?? '批准失败')
}

async function cancelPlan(row: AgentTaskView): Promise<void> {
  const resp = await api().cancelTask(row.id)
  if (resp.success) { await load() }
  else ElMessage.error(resp.error ?? '取消失败')
}

async function openTree(row: AgentTaskView): Promise<void> {
  const resp = await api().getTaskTree(row.id)
  if (resp.success && resp.data) {
    treeRoot.value = (resp.data as { root: AgentTaskView }).root
    treeNodes.value = (resp.data as { nodes: AgentTaskView[] }).nodes.sort((a, b) => a.depth - b.depth || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    treeVisible.value = true
  } else ElMessage.error(resp.error ?? '加载失败')
}

/** 支持 /agent-tasks?focus=<rootId> 直达树详情（agent 引用卡片/待办中心跳转） */
async function openTreeById(rootId: string): Promise<void> {
  await openTree({ id: rootId } as AgentTaskView)
}

async function verifyDecide(node: AgentTaskView, decision: 'approve' | 'reject'): Promise<void> {
  const resp = await api().taskVerifyDecide({ taskId: node.id, decision })
  if (resp.success) { await openTree(treeRoot.value!); await load() }
  else ElMessage.error(resp.error ?? '操作失败')
}

async function escalateDecide(node: AgentTaskView, decision: 'pass' | 'fail' | 'retry'): Promise<void> {
  const resp = await api().taskEscalateDecide({ taskId: node.id, decision })
  if (resp.success) { await openTree(treeRoot.value!); await load() }
  else ElMessage.error(resp.error ?? '操作失败')
}

const route = useRoute()

onMounted(() => {
  void (async () => {
    await load()
    const focus = route.query.focus
    if (typeof focus === 'string' && focus) await openTreeById(focus)
  })()
})

// 已在本页时再点引用卡片（query 变化不重挂载）也要打开对应树
watch(
  () => route.query.focus,
  (focus) => {
    if (typeof focus === 'string' && focus) void openTreeById(focus)
  },
)
</script>

<style scoped>
.page-container { padding: 20px; height: 100%; overflow: auto; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.meta { color: var(--el-text-color-secondary); font-size: 13px; }
.tree-node { padding: 8px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; margin-bottom: 8px; background: var(--el-fill-color-lighter); }
.node-head { display: flex; align-items: center; gap: 8px; }
.node-title { font-weight: 600; font-size: 13px; }
.node-score { margin-left: auto; font-size: 12px; color: var(--el-text-color-secondary); }
.node-goal { font-size: 12px; color: var(--el-text-color-regular); margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
.node-err { font-size: 12px; color: var(--el-color-danger); margin-top: 4px; }
.node-actions { margin-top: 6px; display: flex; gap: 4px; }
</style>
