<template>
  <div class="agent-console page-container">
    <div class="page-header">
      <div>
        <h2>Agent 对话</h2>
        <span class="meta">独立的 Agent 会话——直接派活，工具调用、决策与结果全程可见（参考 ZCode / DeepSeek 形态）</span>
      </div>
      <el-button type="primary" size="small" @click="createSession">新建会话</el-button>
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
        <div v-if="sessions.length === 0" class="empty-tip">暂无会话——点右上角「新建会话」开始</div>
      </aside>

      <!-- 中栏：对话流（chat 会话可对话；task 会话只读引导） -->
      <section class="conversation-pane">
        <template v-if="selected && selected.kind === 'chat'">
          <div class="conversation-header">
            <span class="cv-label">{{ selected.label }}</span>
            <el-tag v-if="selected.running || streamState.isStreaming" type="success" size="small" effect="dark">运行中</el-tag>
            <div class="cv-actions">
              <el-button text size="small" :type="showTimeline ? 'primary' : ''" @click="showTimeline = !showTimeline">过程</el-button>
              <el-button v-if="selected.running || streamState.isStreaming" text type="danger" size="small" @click="stopRun">停止</el-button>
            </div>
          </div>

          <div ref="scrollRef" class="conversation-body">
            <div v-for="m in messages" :key="m.id" class="turn" :class="m.role">
              <div class="turn-role">{{ m.role === 'user' ? '我' : 'Agent' }}</div>
              <div class="turn-bubble">
                <MessageItem
                  :message="m"
                  @edit="onEditMessage"
                  @delete="onDeleteMessage"
                  @regenerate="onRegenerateMessage"
                />
              </div>
            </div>
            <div v-if="messages.length === 0" class="empty-tip">派个活试试——比如「用 web_search 查一下 …」或「运行 ×× 工作流」</div>
          </div>

          <div class="conversation-input">
            <textarea
              v-model="draft"
              class="draft-input"
              rows="2"
              placeholder="输入任务，Ctrl+Enter 发送（Shift+Enter 换行）"
              :disabled="streamState.isStreaming"
              @keydown="onInputKeydown"
            />
            <div class="input-actions">
              <span class="input-hint">{{ streamState.isStreaming ? 'Agent 执行中…' : '' }}</span>
              <el-button v-if="streamState.isStreaming" size="small" type="danger" @click="stopGeneration">停止</el-button>
              <el-button v-else size="small" type="primary" :disabled="!draft.trim()" @click="send">发送</el-button>
            </div>
          </div>
        </template>

        <template v-else-if="selected">
          <div class="conversation-header">
            <span class="cv-label">{{ selected.label }}</span>
            <el-tag size="small" type="warning" effect="plain">任务会话（只读）</el-tag>
            <div class="cv-actions">
              <el-button text size="small" :type="showTimeline ? 'primary' : ''" @click="showTimeline = !showTimeline">过程</el-button>
              <el-button v-if="selected.rootId || selected.refId" text size="small" @click="gotoTasks(selected.rootId ?? selected.refId!)">任务树详情</el-button>
              <el-button v-if="selected.running" text type="danger" size="small" @click="stopRun">停止</el-button>
            </div>
          </div>
          <div class="empty-tip" style="margin-top: 60px">
            任务会话由任务树驱动——此处只读观测过程；裁决与重试请在「任务树详情」中操作
          </div>
        </template>

        <div v-else class="empty-tip conversation-pane-empty">从左侧选择会话，或新建一个 Agent 会话</div>
      </section>

      <!-- 右栏：过程时间线（DeepSeek 式过程面板；可折叠） -->
      <aside v-if="showTimeline && selected" class="timeline-pane">
        <div class="timeline-head">
          <span>过程时间线</span>
          <el-button text size="small" @click="showTimeline = false">收起</el-button>
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
                  <el-collapse-item title="入参" :name="`call-${entry.key}`">
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
                  <el-collapse-item title="返回数据" :name="`res-${entry.key}`">
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
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MessageItem from '@/components/chat/MessageItem.vue'
import { useDialogStore } from '@/stores/dialog'
import type {
  AgentConsoleSession,
  AgentConsoleTrajectoryEntry,
  AgentRunUpdateEvent,
} from '@shared/types/agent.types'
import type { Message } from '@shared/types'

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
const store = useDialogStore()

const sessions = ref<AgentConsoleSession[]>([])
const selected = ref<AgentConsoleSession | null>(null)
const showTimeline = ref(true)
const draft = ref('')
const scrollRef = ref<HTMLElement | null>(null)

/** 当前会话消息（对话流复用 dialog store——与聊天页同一数据面，零重复接线） */
const messages = computed<Message[]>(() => (selected.value?.kind === 'chat' ? store.messages : []))
const streamState = computed(() => store.streamState)

/** 过程时间线 */
const entries = ref<(AgentConsoleTrajectoryEntry & { key: string })[]>([])
let selectReqId = 0
let liveSeq = 0

let offTrajectory: (() => void) | null = null
let offRunUpdate: (() => void) | null = null

const grouped = computed(() => {
  // seq 可空（实时条目落库前无 seq）：null 视为 +∞ 排在回放之后、保持到达序
  const map = new Map<number, (AgentConsoleTrajectoryEntry & { key: string })[]>()
  for (const e of [...entries.value].sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER))) {
    const list = map.get(e.iteration) ?? []
    list.push(e)
    map.set(e.iteration, list)
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([iteration, list]) => ({ iteration, entries: list }))
})

// ============ 会话 ============

async function loadSessions(): Promise<void> {
  const resp = await api().listSessions()
  if (resp.success) {
    sessions.value = resp.data ?? []
    if (selected.value) {
      const fresh = sessions.value.find((s) => s.scopeKey === selected.value!.scopeKey)
      if (fresh) selected.value.running = fresh.running
    }
  } else ElMessage.error(resp.error ?? '加载会话失败')
}

/** 新建 Agent 会话：创建对话并开启 Agent 模式（默认模型取首个可用提供商） */
async function createSession(): Promise<void> {
  const resp = await window.electronAPI.providerConfig.list()
  const cfg = resp.success && resp.data ? resp.data.find((c) => c.isEnabled) : undefined
  const modelId = cfg?.models?.[0]?.id
  if (!cfg || !modelId) {
    ElMessage.error('未配置可用的 AI 提供商——请先到设置中添加')
    return
  }
  const dialog = await store.createDialog({ title: 'Agent 会话', modelId, providerConfigId: cfg.id })
  if (!dialog) {
    ElMessage.error('创建会话失败')
    return
  }
  await store.updateDialog(dialog.id, { agentEnabled: true })
  // 新对话零消息时 agent_sessions 尚无行——直接合成会话项选中（首条消息发出后
  // loadSessions 会与库内列表自然合并；review 真机验证：曾因依赖列表而永远选不中）
  const synthetic: AgentConsoleSession = {
    scopeKey: `dialog:${dialog.id}`,
    kind: 'chat',
    label: dialog.title,
    refId: dialog.id,
    rootId: null,
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    running: false,
  }
  sessions.value = [synthetic, ...sessions.value]
  await select(synthetic)
  ElMessage.success('会话已创建，直接输入任务即可')
}

/** 选中会话：chat 会话切 dialog store 的 currentDialog（发送/停止/流式全复用） */
async function select(s: AgentConsoleSession): Promise<void> {
  selected.value = s
  entries.value = []
  liveSeq = 0
  void loadTrajectory(s.scopeKey)
  if (s.kind !== 'chat' || !s.refId) return
  const resp = await window.electronAPI.dialog.get(s.refId)
  if (resp.success && resp.dialog) {
    await store.selectDialog(resp.dialog)
  } else {
    ElMessage.warning('该会话的对话已被删除，仅可查看过程时间线')
  }
}

async function loadTrajectory(scopeKey: string): Promise<void> {
  const reqId = ++selectReqId
  const resp = await api().getTrajectory({ scopeKey })
  if (reqId !== selectReqId) return
  if (resp.success) entries.value = (resp.data ?? []).map((e) => ({ ...e, key: `t-${e.seq ?? 'na'}` }))
  else ElMessage.error(resp.error ?? '加载轨迹失败')
}

// ============ 对话（复用 dialog store：与聊天页同一数据面） ============

function send(): void {
  const content = draft.value.trim()
  if (!content || streamState.value.isStreaming) return
  draft.value = ''
  void store.sendMessage(content)
}

function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    send()
  }
}

function stopRun(): void {
  if (!selected.value) return
  void (async () => {
    if (selected.value?.kind === 'chat') {
      await store.stopGeneration() // chat:stop 双通道（普通流 + agent loop）
      return
    }
    const resp = await api().stop({ scopeKey: selected.value!.scopeKey })
    if (resp.success && resp.data?.stopped) ElMessage.success('已发送停止指令')
    else if (resp.success) ElMessage.warning('该会话当前没有可停止的运行')
    else ElMessage.error(resp.error ?? '停止失败')
  })()
}

// ============ 时间线 ============

function onTrajectoryEvent(data: { scopeKey: string; entry: AgentConsoleTrajectoryEntry }): void {
  if (!selected.value || data.scopeKey !== selected.value.scopeKey) return
  entries.value = [...entries.value, { ...data.entry, key: `live-${liveSeq++}` }]
}

function onRunUpdateEvent(data: AgentRunUpdateEvent): void {
  const known = sessions.value.some((x) => x.scopeKey === data.scopeKey)
  if (!known || data.status !== 'running') void loadSessions()
  const s = sessions.value.find((x) => x.scopeKey === data.scopeKey)
  if (s) s.running = data.status === 'running'
  if (selected.value?.scopeKey === data.scopeKey) selected.value.running = data.status === 'running'
}

function gotoTasks(rootId: string): void {
  void router.push({ path: '/agent-tasks', query: { focus: rootId } })
}

function onEditMessage(id: string, content: string): void {
  void store.updateMessage(id, content)
}
function onDeleteMessage(id: string): void {
  void store.deleteMessage(id)
}
function onRegenerateMessage(id: string): void {
  void store.regenerateResponse(id)
}

// ============ 展示工具 ============

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

// 内容/条目变化自动滚到底（对话流）
watch(
  () => [messages.value.length, messages.value[messages.value.length - 1]?.content.length ?? 0, entries.value.length],
  () => {
    void nextTick(() => {
      scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight })
    })
  },
)

// 停留本页时的二次深链（聊天页/消息卡再点「查看过程」）
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
onUnmounted(() => {
  offTrajectory?.()
  offRunUpdate?.()
})
</script>

<style scoped>
.page-container { padding: 16px 20px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-header h2 { margin: 0 0 2px; font-size: 18px; }
.meta { color: var(--el-text-color-secondary); font-size: 13px; }

.console-layout { display: flex; gap: 12px; flex: 1; min-height: 0; }

/* ---- 会话列表 ---- */
.session-list { width: 240px; flex-shrink: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 8px; overflow: auto; }
.session-item { padding: 8px 10px; border-radius: 6px; cursor: pointer; margin-bottom: 4px; }
.session-item:hover { background: var(--el-fill-color-light); }
.session-item.active { background: var(--el-color-primary-light-9); }
.session-title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.session-label { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-meta { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.running-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--el-color-success); flex-shrink: 0; animation: pulse 1.2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* ---- 对话流（ZCode 式：角色行 + 气泡 + 底部输入） ---- */
.conversation-pane { flex: 1; min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
.conversation-pane-empty { border: none; }
.conversation-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--el-border-color-lighter); }
.cv-label { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-actions { margin-left: auto; display: flex; gap: 4px; }

.conversation-body { flex: 1; overflow: auto; padding: 14px; }
.turn { margin-bottom: 14px; }
.turn-role { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 4px; }
.turn.user .turn-role { text-align: right; }
.turn.user .turn-bubble { display: flex; justify-content: flex-end; }
.turn :deep(.message-text) { font-size: 14px; line-height: 1.65; }

.conversation-input { border-top: 1px solid var(--el-border-color-lighter); padding: 10px 12px; }
.draft-input { width: 100%; box-sizing: border-box; border: 1px solid var(--el-border-color); border-radius: 8px; padding: 8px 10px; font-size: 13px; font-family: inherit; resize: vertical; background: var(--el-bg-color); color: var(--el-text-color-primary); }
.draft-input:focus { outline: none; border-color: var(--el-color-primary-light-5); }
.input-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.input-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-right: auto; }

/* ---- 过程时间线（DeepSeek 式过程面板） ---- */
.timeline-pane { width: 380px; flex-shrink: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
.timeline-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--el-border-color-lighter); font-size: 13px; font-weight: 600; }
.timeline-body { flex: 1; overflow: auto; padding: 10px 12px; }
.iter-head { font-size: 12px; color: var(--el-text-color-secondary); margin: 8px 0 6px; }
.entry-card { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; background: var(--el-fill-color-lighter); }
.entry-card.entry-bad { border-color: var(--el-color-danger-light-5); background: var(--el-color-danger-light-9); }
.entry-card.entry-final { border-color: var(--el-color-success-light-5); background: var(--el-color-success-light-9); }
.entry-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.entry-title .muted { font-weight: 400; color: var(--el-text-color-secondary); }
.entry-sub { font-size: 12px; color: var(--el-text-color-regular); margin-top: 4px; }
.entry-pre { margin: 6px 0 0; font-size: 12px; white-space: pre-wrap; word-break: break-word; background: var(--el-fill-color); padding: 6px 8px; border-radius: 4px; max-height: 260px; overflow: auto; }
.entry-collapse { margin-top: 6px; }
.empty-tip { color: var(--el-text-color-secondary); font-size: 13px; padding: 24px; text-align: center; }
</style>
