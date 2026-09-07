<template>
  <div class="agent-console page-container">
    <div class="page-header">
      <div>
        <h2>Agent 工作台</h2>
        <span class="meta">Agent 会话的过程时间线——工具调用、决策与结果全程可见（29 号 M5.5）</span>
      </div>
      <el-button text size="small" @click="loadSessions">刷新</el-button>
    </div>

    <div class="console-layout">
      <!-- 左栏：会话列表 -->
      <aside class="session-list">
        <div
          v-for="s in sessions"
          :key="s.scopeKey"
          class="session-item"
          :class="{ active: s.scopeKey === selected?.scopeKey }"
          @click="select(s)"
        >
          <div class="session-title-row">
            <el-tag size="small" :type="kindTag(s.kind)" effect="plain">{{ kindLabel(s.kind) }}</el-tag>
            <span v-if="s.running" class="running-dot" title="运行中" />
            <span class="session-label">{{ s.label }}</span>
          </div>
          <div class="session-meta">{{ formatTime(s.updatedAt) }} · {{ s.messageCount }} 条</div>
        </div>
        <div v-if="sessions.length === 0" class="empty-tip">暂无 Agent 会话——在聊天页开启 Agent 模式发消息，或批准一个任务树</div>
      </aside>

      <!-- 右侧：过程时间线 -->
      <section class="timeline-pane">
        <template v-if="selected">
          <div class="timeline-header">
            <span class="tl-label">{{ selected.label }}</span>
            <el-tag v-if="selected.running" type="success" size="small" effect="dark">运行中</el-tag>
            <div class="tl-actions">
              <el-button v-if="selected.refId && selected.kind === 'chat'" text size="small" @click="gotoChat(selected.refId)">去对话</el-button>
              <el-button v-if="selected.kind === 'task' && (selected.rootId || selected.refId)" text size="small" @click="gotoTasks(selected.rootId ?? selected.refId!)">任务树详情</el-button>
              <el-button v-if="selected.running" text type="danger" size="small" @click="stopRun">停止</el-button>
            </div>
          </div>

          <div class="timeline-body">
            <div v-for="group in grouped" :key="group.iteration" class="iter-group">
              <div class="iter-head">{{ group.iteration >= 0 ? `第 ${group.iteration} 步` : '进行中' }}</div>
              <div v-for="entry in group.entries" :key="entry.key" class="entry-card" :class="entryClass(entry)">
                <template v-if="entry.kind === 'decision'">
                  <div class="entry-title">决策 <span class="muted">{{ entryName(entry) }}</span></div>
                  <pre v-if="thoughtOf(entry)" class="entry-pre">{{ thoughtOf(entry) }}</pre>
                  <div v-if="toolCallsOf(entry).length" class="entry-sub">调用工具：{{ toolCallsOf(entry).join('、') }}</div>
                </template>
                <template v-else-if="entry.kind === 'tool_call'">
                  <div class="entry-title">工具调用 <span class="muted">{{ entry.name }}</span></div>
                  <el-collapse class="entry-collapse">
                    <el-collapse-item title="入参" :name="`call-${entry.seq}`">
                      <pre class="entry-pre">{{ prettyOf(entry.payload?.args) }}</pre>
                    </el-collapse-item>
                  </el-collapse>
                </template>
                <template v-else-if="entry.kind === 'tool_result'">
                  <div class="entry-title">
                    工具结果
                    <el-tag size="small" :type="entry.payload?.ok === false ? 'danger' : 'success'" effect="plain">
                      {{ entry.payload?.ok === false ? '失败' : '成功' }}
                    </el-tag>
                    <span v-if="entry.durationMs" class="muted">{{ entry.durationMs }}ms</span>
                  </div>
                  <el-collapse class="entry-collapse">
                    <el-collapse-item title="返回数据" :name="`res-${entry.seq}`">
                      <pre class="entry-pre">{{ prettyOf(entry.payload) }}</pre>
                    </el-collapse-item>
                  </el-collapse>
                </template>
                <template v-else-if="entry.kind === 'final'">
                  <div class="entry-title">最终回答</div>
                  <pre class="entry-pre">{{ entry.payload?.answer }}</pre>
                </template>
                <template v-else-if="entry.kind === 'guardrail_stop'">
                  <div class="entry-title">护栏终止</div>
                  <div class="entry-sub">{{ entry.payload?.reason }}</div>
                </template>
                <template v-else-if="entry.kind === 'memory_assembly'">
                  <div class="entry-title">知识装配</div>
                  <div v-for="(line, i) in memoryRefsOf(entry)" :key="i" class="entry-sub">{{ line }}</div>
                </template>
                <template v-else>
                  <div class="entry-title">{{ entry.kind }} <span class="muted">{{ entryName(entry) }}</span></div>
                  <pre class="entry-pre">{{ prettyOf(entry.payload) }}</pre>
                </template>
              </div>
            </div>
            <div v-if="grouped.length === 0" class="empty-tip">该会话还没有轨迹记录</div>
          </div>
        </template>
        <div v-else class="empty-tip timeline-pane">从左侧选择一个会话查看过程时间线</div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type {
  AgentConsoleSession,
  AgentConsoleTrajectoryEntry,
  AgentRunUpdateEvent,
} from '@shared/types/agent.types'

/** 视图内条目（回放行 + 实时广播统一形态；实时条目落库前无 seq） */
interface ConsoleEntry extends AgentConsoleTrajectoryEntry {
  /** 视图唯一 key（回放=seq，实时=本地递增——review P1-2：undefined key 曾致 Vue 复用错乱） */
  key: string
}

type ConsoleApi = {
  listSessions: () => Promise<{ success: boolean; data?: AgentConsoleSession[]; error?: string }>
  getTrajectory: (p: { scopeKey: string }) => Promise<{ success: boolean; data?: AgentConsoleTrajectoryEntry[]; error?: string }>
  stop: (p: { scopeKey: string }) => Promise<{ success: boolean; data?: { stopped: boolean }; error?: string }>
  onTrajectory: (cb: (data: { scopeKey: string; entry: AgentConsoleTrajectoryEntry }) => void) => () => void
  onRunUpdate: (cb: (data: AgentRunUpdateEvent) => void) => () => void
}
const api = () => (window as never as { electronAPI: { workflow: { agentConsole: ConsoleApi } } }).electronAPI.workflow.agentConsole

const route = useRoute()
const router = useRouter()

const sessions = ref<AgentConsoleSession[]>([])
const selected = ref<AgentConsoleSession | null>(null)
const entries = ref<ConsoleEntry[]>([])
/** 回放请求版本（review P2-2：慢回放覆盖新会话数据） */
let selectReqId = 0
/** 实时条目本地序号（广播条目落库前无 seq） */
let liveSeq = 0

let offTrajectory: (() => void) | null = null
let offRunUpdate: (() => void) | null = null

const grouped = computed(() => {
  // seq 可空（实时条目）：null 视为 +∞ 排在回放之后、保持到达序
  const map = new Map<number, ConsoleEntry[]>()
  for (const e of [...entries.value].sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER))) {
    const list = map.get(e.iteration) ?? []
    list.push(e)
    map.set(e.iteration, list)
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([iteration, list]) => ({ iteration, entries: list }))
})

async function loadSessions(): Promise<void> {
  const resp = await api().listSessions()
  if (resp.success) {
    sessions.value = resp.data ?? []
    // 运行状态以最新列表为准（轮询刷新/事件刷新共用）
    if (selected.value) {
      const fresh = sessions.value.find((s) => s.scopeKey === selected.value!.scopeKey)
      if (fresh) selected.value.running = fresh.running
    }
  } else ElMessage.error(resp.error ?? '加载会话失败')
}

async function select(s: AgentConsoleSession): Promise<void> {
  selected.value = s
  const reqId = ++selectReqId
  entries.value = []
  const resp = await api().getTrajectory({ scopeKey: s.scopeKey })
  // 竞态守卫（review P2-2）：回放期间用户已切走则丢弃
  if (reqId !== selectReqId) return
  if (resp.success) entries.value = (resp.data ?? []).map((e) => ({ ...e, key: `t-${e.seq ?? 'na'}-${e.seq}` }))
  else ElMessage.error(resp.error ?? '加载轨迹失败')
}

async function stopRun(): Promise<void> {
  if (!selected.value) return
  const resp = await api().stop({ scopeKey: selected.value.scopeKey })
  if (resp.success && resp.data?.stopped) ElMessage.success('已发送停止指令')
  else if (resp.success) ElMessage.warning('该会话当前没有可停止的运行')
  else ElMessage.error(resp.error ?? '停止失败')
}

function onTrajectoryEvent(data: { scopeKey: string; entry: AgentConsoleTrajectoryEntry }): void {
  if (!selected.value || data.scopeKey !== selected.value.scopeKey) return
  entries.value = [...entries.value, { ...data.entry, key: `live-${liveSeq++}` }]
}

function onRunUpdateEvent(data: AgentRunUpdateEvent): void {
  const known = sessions.value.some((x) => x.scopeKey === data.scopeKey)
  // 新运行的 started：列表可能还没有该会话——刷新（review P3-3）
  if (!known || data.status !== 'running') void loadSessions()
  const s = sessions.value.find((x) => x.scopeKey === data.scopeKey)
  if (s) s.running = data.status === 'running'
  if (selected.value?.scopeKey === data.scopeKey) selected.value.running = data.status === 'running'
}

function gotoChat(dialogId: string): void {
  void router.push('/chat')
  void dialogId // 聊天页当前即对话入口（M5.5 不做会话定位，登记后续）
}
function gotoTasks(rootId: string): void {
  void router.push({ path: '/agent-tasks', query: { focus: rootId } })
}

function kindLabel(kind: AgentConsoleSession['kind']): string {
  return kind === 'chat' ? '聊天' : kind === 'task' ? '任务' : '会话'
}
function kindTag(kind: AgentConsoleSession['kind']): 'primary' | 'warning' | 'info' {
  return kind === 'chat' ? 'primary' : kind === 'task' ? 'warning' : 'info'
}
function formatTime(t: string | null): string {
  return t ? new Date(t).toLocaleString('zh-CN') : '—'
}
function entryName(entry: AgentConsoleTrajectoryEntry): string {
  return entry.name ? `· ${entry.name}` : ''
}
function entryClass(entry: AgentConsoleTrajectoryEntry): string {
  if (entry.kind === 'guardrail_stop') return 'entry-bad'
  if (entry.kind === 'final') return 'entry-final'
  return ''
}
function thoughtOf(entry: AgentConsoleTrajectoryEntry): string {
  const t = entry.payload?.thought
  return typeof t === 'string' ? t : ''
}
function toolCallsOf(entry: AgentConsoleTrajectoryEntry): string[] {
  const list = entry.payload?.toolCalls
  return Array.isArray(list) ? list.map((x) => String(x)) : []
}
function memoryRefsOf(entry: AgentConsoleTrajectoryEntry): string[] {
  const list = entry.payload?.memoryRefs
  return Array.isArray(list) ? list.map((x) => String(x)) : []
}
function prettyOf(value: unknown, max = 2000): string {
  if (value === undefined || value === null) return '（空）'
  let s: string
  try {
    s = JSON.stringify(value, null, 2)
  } catch {
    return '[unserializable]'
  }
  return s.length <= max ? s : `${s.slice(0, max)}…[truncated]`
}

onMounted(() => {
  void (async () => {
    await loadSessions()
    const target = route.query.session
    if (typeof target === 'string' && target) {
      const found = sessions.value.find((s) => s.scopeKey === target)
      if (found) await select(found)
      else ElMessage.warning('未找到该会话（可能还没有轨迹记录）')
    }
  })()
  offTrajectory = api().onTrajectory(onTrajectoryEvent)
  offRunUpdate = api().onRunUpdate(onRunUpdateEvent)
})

// 停留本页时的二次深链（聊天页再点「查看过程」query 变化不重挂载）
watch(
  () => route.query.session,
  (target) => {
    if (typeof target !== 'string' || !target) return
    void (async () => {
      if (sessions.value.length === 0) await loadSessions()
      const found = sessions.value.find((s) => s.scopeKey === target)
      if (found) await select(found)
    })()
  },
)
onUnmounted(() => {
  offTrajectory?.()
  offRunUpdate?.()
})
</script>

<style scoped>
.page-container { padding: 20px; height: 100%; overflow: auto; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 18px; }
.meta { color: var(--el-text-color-secondary); font-size: 13px; }

.console-layout { display: flex; gap: 16px; min-height: 0; }
.session-list { width: 300px; flex-shrink: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 8px; overflow: auto; max-height: calc(100vh - 160px); }
.session-item { padding: 8px 10px; border-radius: 6px; cursor: pointer; margin-bottom: 4px; }
.session-item:hover { background: var(--el-fill-color-light); }
.session-item.active { background: var(--el-color-primary-light-9); }
.session-title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.session-label { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-meta { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.running-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--el-color-success); flex-shrink: 0; animation: pulse 1.2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.timeline-pane { flex: 1; min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 12px; overflow: auto; max-height: calc(100vh - 160px); }
.timeline-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--el-border-color-lighter); }
.tl-label { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-actions { margin-left: auto; display: flex; gap: 4px; }

.iter-head { font-size: 12px; color: var(--el-text-color-secondary); margin: 10px 0 6px; }
.entry-card { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; background: var(--el-fill-color-lighter); }
.entry-card.entry-bad { border-color: var(--el-color-danger-light-5); background: var(--el-color-danger-light-9); }
.entry-card.entry-final { border-color: var(--el-color-success-light-5); background: var(--el-color-success-light-9); }
.entry-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.entry-title .muted { font-weight: 400; color: var(--el-text-color-secondary); }
.entry-sub { font-size: 12px; color: var(--el-text-color-regular); margin-top: 4px; }
.entry-pre { margin: 6px 0 0; font-size: 12px; white-space: pre-wrap; word-break: break-word; background: var(--el-fill-color); padding: 6px 8px; border-radius: 4px; max-height: 260px; overflow: auto; }
.entry-collapse { margin-top: 6px; }
.empty-tip { color: var(--el-text-color-secondary); font-size: 13px; padding: 24px; text-align: center; }
</style>
