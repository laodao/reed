<template>
  <div class="guest-run">
    <!-- 加载中 -->
    <div v-if="loading" class="guest-run__state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>正在加载工作流…</span>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="error" class="guest-run__state guest-run__state--error">
      <el-icon><CircleCloseFilled /></el-icon>
      <span>{{ error }}</span>
    </div>

    <template v-else>
      <header class="guest-run__header">
        <h1>{{ meta.name }}</h1>
        <p v-if="meta.description">{{ meta.description }}</p>
      </header>

      <!-- 未运行：输入表单 -->
      <section v-if="phase === 'form'" class="guest-run__card">
        <RunInputForm ref="formRef" :inputs="meta.inputs" @valid="v => (formValid = v)" />
        <el-button type="primary" :disabled="!formValid" :loading="submitting" @click="invoke">
          运行
        </el-button>
      </section>

      <!-- 运行中/结束：状态时间线 -->
      <section v-else class="guest-run__card">
        <div class="guest-run__status" :data-tone="runStatusTone">
          <template v-if="runStatus === 'running'"><el-icon class="is-loading"><Loading /></el-icon> 运行中</template>
          <template v-else-if="runStatus === 'waiting_review'"><el-icon><WarningFilled /></el-icon> 等待工作流所有者审核</template>
          <template v-else-if="runStatus === 'succeeded'"><el-icon><CircleCheckFilled /></el-icon> 运行完成</template>
          <template v-else><el-icon><CircleCloseFilled /></el-icon> 运行结束（{{ runStatus }}）</template>
        </div>

        <ul class="guest-run__nodes">
          <li v-for="node in nodes" :key="node.nodeId + ':' + node.iterationIndex" :data-status="node.status">
            <span class="guest-run__node-name">{{ node.nodeName || node.nodeId }}</span>
            <span class="guest-run__node-status">{{ NODE_STATUS_LABEL[node.status] ?? node.status }}</span>
            <span v-if="node.error" class="guest-run__node-error">{{ node.error }}</span>
          </li>
        </ul>

        <!-- 结果正文：取快照中最后一个有文本输出的节点（report/llm 输出 markdown） -->
        <div v-if="resultText" class="guest-run__result">
          <h3>结果</h3>
          <pre class="guest-run__result-body">{{ resultText }}</pre>
        </div>

        <el-button v-if="isTerminal" @click="reset">再次运行</el-button>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 工作流免登录独立运行页（C3 spec v2 §7）
 *
 * - 路由 /workflow-run/:token（Web 端公开页，main-web 白名单放行）
 * - 数据面只走 REST：GET/POST /api/workflow/share/:token[/invoke]、
 *   SSE /share/:token/run/:runId/events（EventSource；无需登录）
 * - 审核挂起只读展示（审核决策需登录，访客不可操作）
 * - 不依赖 window.electronAPI / Pinia 用户态——Electron 端打开此页会得到
 *   明确的"分享链接无效"（无 /api/workflow 服务）
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Loading, CircleCloseFilled, CircleCheckFilled, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import RunInputForm from '@/components/workflow/RunInputForm.vue'
import { WORKFLOW_RUN_TERMINAL_STATUSES } from '@shared/types/workflow.types'

/** 节点状态中文标签（与 RunDetail 一致口径） */
const NODE_STATUS_LABEL: Record<string, string> = {
  pending: '等待',
  running: '运行中',
  succeeded: '完成',
  failed: '失败',
  failed_recovered: '失败已恢复',
  waiting_review: '待审核',
  cancelled: '已取消',
  interrupted: '已中断',
  skipped: '跳过',
  timed_out: '超时',
}

interface StartInputDef { key: string; label?: string; type?: string; required?: boolean; options?: unknown[]; multi?: boolean; defaultValue?: unknown }
interface NodeRunRow { nodeId: string; nodeName?: string | null; iterationIndex?: number; status: string; error?: string | null; output?: Record<string, unknown> | null }

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const loading = ref(true)
const error = ref('')
const meta = ref<{ definitionId: string; name: string; description: string | null; inputs: StartInputDef[] } | null>(null)

const formRef = ref<InstanceType<typeof RunInputForm>>()
const formValid = ref(false)
const submitting = ref(false)

/** form → running → done */
const phase = ref<'form' | 'run'>('form')
const runId = ref('')
const runStatus = ref('running')
const nodes = ref<NodeRunRow[]>([])
const resultText = ref('')

const isTerminal = computed(() => WORKFLOW_RUN_TERMINAL_STATUSES.has(runStatus.value))
const runStatusTone = computed(() => (runStatus.value === 'succeeded' ? 'ok' : isTerminal.value ? 'bad' : 'busy'))

let es: EventSource | null = null

/** 加载分享定义元信息 */
async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`/api/workflow/share/${token.value}`)
    const body = await res.json()
    if (!res.ok || !body.ok) throw new Error(body.error ?? '分享链接无效或已停止分享')
    meta.value = body.data
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}
void load()

/** 提交运行 */
async function invoke(): Promise<void> {
  if (!meta.value || !formRef.value) return
  submitting.value = true
  try {
    const res = await fetch(`/api/workflow/share/${token.value}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: formRef.value.getValues() }),
    })
    const body = await res.json()
    if (!res.ok || !body.ok) throw new Error(body.error ?? '启动失败')
    runId.value = body.data.runId
    runStatus.value = body.data.status
    phase.value = 'run'
    subscribe(body.data.runId)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    submitting.value = false
  }
}

/** 订阅 SSE（终态时拉取含输出的快照后关闭） */
function subscribe(id: string): void {
  closeStream()
  es = new EventSource(`/api/workflow/share/${token.value}/run/${id}/events`)
  es.addEventListener('snapshot', ev => {
    const data = JSON.parse((ev as MessageEvent).data)
    nodes.value = (data.nodeRuns ?? []) as NodeRunRow[]
    if (data.run?.status) runStatus.value = data.run.status
  })
  es.addEventListener('node-status', ev => {
    const p = JSON.parse((ev as MessageEvent).data)
    const row = nodes.value.find(n => n.nodeId === p.nodeId && (n.iterationIndex ?? 0) === (p.iterationIndex ?? 0))
    if (row) {
      row.status = p.status
      row.error = p.error ?? row.error
    } else {
      nodes.value.push({ nodeId: p.nodeId, nodeName: p.nodeId, iterationIndex: p.iterationIndex ?? 0, status: p.status, error: p.error })
    }
  })
  es.addEventListener('run-status', ev => {
    const p = JSON.parse((ev as MessageEvent).data)
    runStatus.value = p.status
  })
  es.addEventListener('done', () => {
    closeStream()
    void fetchSnapshot(id)
  })
  es.onerror = () => closeStream()
}

/** 终态后重开一次流取快照（含节点输出；服务端推 snapshot+done 即关） */
async function fetchSnapshot(id: string): Promise<void> {
  await new Promise<void>(resolve => {
    const s = new EventSource(`/api/workflow/share/${token.value}/run/${id}/events`)
    s.addEventListener('snapshot', ev => {
      const data = JSON.parse((ev as MessageEvent).data)
      nodes.value = (data.nodeRuns ?? []) as NodeRunRow[]
      if (data.run?.status) runStatus.value = data.run.status
      resultText.value = pickResultText(nodes.value)
      s.close()
      resolve()
    })
    s.onerror = () => { s.close(); resolve() }
  })
}

/** 结果正文：最后一个 succeeded 且输出含文本字段的节点（report/markdown 类） */
function pickResultText(rows: NodeRunRow[]): string {
  for (let i = rows.length - 1; i >= 0; i--) {
    const out = rows[i].output
    if (!out) continue
    for (const key of ['markdown', 'content', 'text', 'answer', 'result']) {
      const v = out[key]
      if (typeof v === 'string' && v.trim()) return v
    }
  }
  return ''
}

function reset(): void {
  phase.value = 'form'
  runId.value = ''
  runStatus.value = 'running'
  nodes.value = []
  resultText.value = ''
}

function closeStream(): void {
  es?.close()
  es = null
}

onBeforeUnmount(closeStream)
</script>

<style scoped>
.guest-run {
  max-width: 720px;
  margin: 40px auto;
  padding: 0 16px;
}
.guest-run__state {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  padding: 64px 0;
  color: var(--el-text-color-secondary);
}
.guest-run__state--error { color: var(--el-color-danger); }
.guest-run__header h1 { margin: 0 0 4px; font-size: 20px; }
.guest-run__header p { margin: 0 0 16px; color: var(--el-text-color-secondary); font-size: 13px; }
.guest-run__card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 16px;
  background: var(--el-bg-color);
}
.guest-run__status { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; font-weight: 600; }
.guest-run__status[data-tone='ok'] { color: var(--el-color-success); }
.guest-run__status[data-tone='bad'] { color: var(--el-color-danger); }
.guest-run__nodes { list-style: none; padding: 0; margin: 0 0 12px; }
.guest-run__nodes li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.guest-run__nodes li[data-status='succeeded'] { color: var(--el-color-success); }
.guest-run__nodes li[data-status='failed'] { color: var(--el-color-danger); }
.guest-run__nodes li[data-status='running'] { color: var(--el-color-primary); }
.guest-run__node-name { flex: 1; }
.guest-run__node-status { color: var(--el-text-color-secondary); }
.guest-run__node-error { color: var(--el-color-danger); font-size: 12px; }
.guest-run__result h3 { margin: 12px 0 8px; font-size: 14px; }
.guest-run__result-body {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  max-height: 400px;
  overflow: auto;
}
</style>
