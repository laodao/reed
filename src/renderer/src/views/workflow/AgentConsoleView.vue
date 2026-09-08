<template>
  <div class="agent-console page-container">
    <div class="page-header">
      <div>
        <h2>Agent 对话</h2>
        <span class="meta">独立的 Agent 会话——完整执行过程流（参考 ZCode / Codex / DeepSeek-harness）</span>
      </div>
      <div class="header-actions">
        <el-button size="small" @click="gotoTaskTree">任务树</el-button>
        <el-button type="primary" size="small" @click="createSession">新建会话</el-button>
      </div>
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

      <!-- 中栏：活动流（用户消息 + Agent 执行过程按时间交织） -->
      <section class="stream-pane">
        <template v-if="selected && selected.kind === 'chat'">
          <div class="stream-header">
            <span class="cv-label">{{ selected.label }}</span>
            <el-tag v-if="selected.running || streamState.isStreaming" type="success" size="small" effect="dark">运行中</el-tag>
            <div class="cv-actions">
              <el-button v-if="selected.running || streamState.isStreaming" text type="danger" size="small" @click="stopRun">停止</el-button>
            </div>
          </div>

          <div ref="scrollRef" class="stream-body">
            <template v-for="item in timeline" :key="item.key">
              <!-- 用户消息：右侧紧凑气泡 -->
              <div v-if="item.kind === 'user'" class="user-turn">
                <div class="user-bubble">{{ item.message.content }}</div>
              </div>
              <!-- Agent 段：过程块流（DeepSeek-harness：叙述全显 + 工具折叠行） -->
              <div v-else class="agent-turn">
                <div v-for="block in item.blocks" :key="block.key" class="block">
                  <template v-if="block.type === 'text'">
                    <div class="text-block markdown-body" :class="{ clamped: textClamped.has(block.key) && !expanded.has(block.key) }" :data-key="block.key" v-html="mdHtml(block.key, block.text)"></div>
                    <div v-if="textClamped.has(block.key)" class="text-toggle" @click="toggleText(block.key)">
                      {{ expanded.has(block.key) ? '收起' : '展开全文' }}
                    </div>
                  </template>
                  <template v-else-if="block.type === 'tool'">
                    <div class="tool-card" @click="toggleTool(block.key)">
                      <div class="tool-line">
                        <span class="tool-mark" :class="toolMarkClass(block)">{{ block.pending ? '⟳' : block.ok === false ? '✗' : '⏺' }}</span>
                        <span class="tool-name">{{ agentToolLabel(block.name) }}</span>
                        <span class="tool-args">{{ block.argsDigest }}</span>
                        <span v-if="block.durationMs" class="tool-ms">{{ block.durationMs }}ms</span>
                      </div>
                      <div v-if="expandedTool.has(block.key)" class="tool-detail" @click.stop>
                        <div class="detail-sec">入参</div>
                        <pre class="detail-pre">{{ prettyOf(block.args) }}</pre>
                        <template v-if="block.result">
                          <div class="detail-sec">返回数据</div>
                          <pre class="detail-pre">{{ prettyOf(block.result) }}</pre>
                        </template>
                      </div>
                    </div>
                  </template>
                  <div v-else-if="block.type === 'notice'" class="notice-block">{{ block.text }}</div>
                  <div v-else-if="block.type === 'memory'" class="memory-line">已装配 {{ block.count }} 条相关经验（来自知识飞轮）</div>
                </div>
                <div v-if="isLiveTurn(item)" class="live-line"><span class="running-dot" /> 执行中…</div>
              </div>
            </template>

            <!-- 旧格式兜底：无轨迹标记的会话回退纯消息渲染 -->
            <template v-if="legacyMode">
              <div v-for="m in messages" :key="m.id" class="user-turn" :class="{ legacyAssistant: m.role === 'assistant' }">
                <div class="user-bubble" :class="{ legacy: m.role === 'assistant' }">{{ m.content }}</div>
              </div>
            </template>

            <div v-if="timeline.length === 0 && !legacyMode" class="empty-tip">派个活试试——比如「用 web_search 查一下 …」或「运行 ×× 工作流」</div>
          </div>

          <div class="conversation-input">
            <textarea
              v-model="draft"
              class="draft-input"
              rows="2"
              placeholder="给智能体发消息（Ctrl+Enter 发送）"
              :disabled="streamState.isStreaming"
              @keydown="onInputKeydown"
            />
            <div class="input-actions">
              <span class="input-hint">{{ streamState.isStreaming ? 'Agent 执行中…' : '' }}</span>
              <el-button v-if="streamState.isStreaming" size="small" type="danger" @click="stopRun">停止</el-button>
              <el-button v-else size="small" type="primary" :disabled="!draft.trim()" @click="send">发送</el-button>
            </div>
          </div>
        </template>

        <template v-else-if="selected">
          <div class="stream-header">
            <span class="cv-label">{{ selected.label }}</span>
            <el-tag size="small" type="warning" effect="plain">任务会话（只读）</el-tag>
            <div class="cv-actions">
              <el-button v-if="selected.rootId || selected.refId" text size="small" @click="openDrawer('tree')">任务树详情</el-button>
              <el-button v-if="selected.running" text type="danger" size="small" @click="stopRun">停止</el-button>
            </div>
          </div>
          <div class="stream-body">
            <div class="agent-turn">
              <div v-for="block in taskBlocks" :key="block.key" class="block">
                <template v-if="block.type === 'text'">
                    <div class="text-block markdown-body" v-html="mdHtml(block.key, block.text)"></div>
                  </template>
                <template v-else-if="block.type === 'tool'">
                  <div class="tool-card" @click="toggleTool(block.key)">
                    <div class="tool-line">
                      <span class="tool-mark" :class="toolMarkClass(block)">{{ block.pending ? '⟳' : block.ok === false ? '✗' : '⏺' }}</span>
                      <span class="tool-name">{{ agentToolLabel(block.name) }}</span>
                      <span class="tool-args">{{ block.argsDigest }}</span>
                    </div>
                    <div v-if="expandedTool.has(block.key)" class="tool-detail" @click.stop>
                      <div class="detail-sec">入参</div>
                      <pre class="detail-pre">{{ prettyOf(block.args) }}</pre>
                      <template v-if="block.result">
                        <div class="detail-sec">返回数据</div>
                        <pre class="detail-pre">{{ prettyOf(block.result) }}</pre>
                      </template>
                    </div>
                  </div>
                </template>
                <div v-else-if="block.type === 'notice'" class="notice-block">{{ block.text }}</div>
              </div>
            </div>
            <div v-if="taskBlocks.length === 0" class="empty-tip">该会话还没有轨迹记录</div>
          </div>
        </template>

        <div v-else class="empty-tip stream-pane-empty">从左侧选择会话，或新建一个 Agent 会话</div>
      </section>

      <!-- 右栏：会话上下文检查器（上下文 / 记忆 / 子任务规划 / 工作流 / 技能） -->
      <aside class="inspector-pane">
        <div class="insp-scroll">
          <div class="insp-sec">
            <div class="insp-title">
              会话上下文
              <a class="insp-link" @click="openDrawer('context')">查看</a>
            </div>
            <div class="kv-grid">
              <span class="kv-k">模型</span><span class="kv-v">{{ contextInfo.model }}</span>
              <span class="kv-k">轮次</span><span class="kv-v">{{ contextInfo.turns }}</span>
              <span class="kv-k">执行步骤</span><span class="kv-v">{{ contextInfo.steps }}</span>
              <span class="kv-k">Tokens</span><span class="kv-v">{{ contextInfo.tokens }}</span>
            </div>
          </div>

          <div class="insp-sec">
            <div class="insp-title">
              记忆
              <a class="insp-link" @click="openDrawer('memory')">知识飞轮</a>
            </div>
            <div v-if="memoryLines.length > 0" class="insp-list">
              <div v-for="(line, i) in memoryLines" :key="i" class="insp-item">{{ line }}</div>
            </div>
            <div v-else class="insp-empty">本会话暂未装配记忆</div>
          </div>

          <div class="insp-sec">
            <div class="insp-title">
              子任务规划
              <a v-if="taskTreeItems.length > 0" class="insp-link" @click="openDrawer('tree')">任务树</a>
            </div>
            <div v-for="t in taskTreeItems" :key="t.rootId" class="insp-card">
              <div class="tree-root" @click="openDrawer('tree')">
                <span class="tree-status" :class="`st-${t.status}`" />
                <span class="tree-title">{{ t.title }}</span>
                <span v-if="t.score != null" class="tree-score">{{ t.score.toFixed(2) }}</span>
              </div>
              <div v-for="(c, i) in t.children" :key="i" class="tree-child">
                <span class="tree-status" :class="`st-${c.status}`" />
                <span class="tree-child-title">{{ c.title }}</span>
              </div>
            </div>
            <div v-if="taskTreeItems.length === 0" class="insp-empty">尚未创建任务规划</div>
          </div>

          <div class="insp-sec">
            <div class="insp-title">工作流</div>
            <div v-for="r in runItems" :key="r.runId" class="insp-card">
              <div class="tree-root" @click="router.push(`/workflow/run/${r.runId}`)">
                <span class="run-status" :class="`rs-${r.status}`">{{ runLabel(r.status) }}</span>
                <span class="tree-title">运行 {{ r.runId.slice(0, 12) }}…</span>
              </div>
            </div>
            <div v-if="runItems.length === 0" class="insp-empty">本会话未运行工作流</div>
          </div>

          <div class="insp-sec">
            <div class="insp-title">技能</div>
            <div v-if="skillLabels.length > 0" class="insp-list">
              <div v-for="(s2, i) in skillLabels" :key="i" class="insp-item">{{ s2 }}</div>
            </div>
            <div v-else class="insp-empty">本会话未调用技能</div>
          </div>
        </div>
      </aside>
    </div>

    <!-- 会话详情抽屉（37 号实测反馈：知识飞轮/任务树/上下文就地弹出，不跳页，只看当前会话） -->
    <el-drawer v-model="drawerVisible" :title="drawerTitle" direction="rtl" size="460px">
      <!-- 任务树（当前会话创建的规划树，层级完整渲染） -->
      <template v-if="drawerMode === 'tree'">
        <div v-for="t in taskTreeItems" :key="t.rootId" class="drawer-tree">
          <div v-for="n in treeRows(t)" :key="n.id" class="drawer-tree-row" :style="{ paddingLeft: n.depth * 16 + 'px' }">
            <span class="tree-status" :class="`st-${n.status}`" />
            <span class="drawer-tree-title" :class="{ 'drawer-tree-root': n.depth === 0 }">{{ n.title }}</span>
            <span v-if="n.qualityScore != null" class="tree-score">{{ n.qualityScore.toFixed(2) }}</span>
            <span class="drawer-tree-status">{{ taskStatusLabel(n.status) }}</span>
          </div>
        </div>
        <div v-if="taskTreeItems.length === 0" class="insp-empty">当前会话尚未创建任务规划</div>
        <div class="drawer-foot">
          <a class="insp-link" @click="gotoTaskTree">在任务树管理页查看全局 →</a>
        </div>
      </template>

      <!-- 知识飞轮（本会话各轮装配的记忆引用） -->
      <template v-else-if="drawerMode === 'memory'">
        <template v-if="memoryGroups.length > 0">
          <div v-for="g in memoryGroups" :key="g.key" class="drawer-mem-group">
            <div class="drawer-sec-hint">{{ g.label }}</div>
            <div v-for="(line, i) in g.refs" :key="i" class="insp-item">{{ line }}</div>
          </div>
        </template>
        <div v-else class="insp-empty">本会话暂未装配记忆——Agent 执行任务时会自动从知识飞轮召回相关经验</div>
        <div class="drawer-foot">
          <a class="insp-link" @click="router.push('/agent-memory')">打开知识飞轮管理页 →</a>
        </div>
      </template>

      <!-- 会话上下文（模型实际看到的消息历史） -->
      <template v-else>
        <div v-loading="contextLoading">
          <div class="drawer-sec-hint">系统提示词（最近一轮动态装配，含知识飞轮记忆）</div>
          <template v-if="contextSystemPrompt">
            <pre class="drawer-pre" :class="{ 'drawer-pre-clamped': !sysExpanded }">{{ contextSystemPrompt }}</pre>
            <a class="text-toggle" @click="sysExpanded = !sysExpanded">{{ sysExpanded ? '收起' : '展开全文' }}</a>
          </template>
          <div v-else class="insp-empty">暂无快照——新轮次执行后会在此显示最近一轮装配的系统提示词（历史轮次生成于该能力上线前）</div>

          <div class="drawer-sec-hint drawer-sec-gap">模型消息历史（{{ contextData?.messages.length ?? 0 }} 条，读自会话存储）</div>
          <div v-for="m in contextData?.messages ?? []" :key="m.seq" class="ctx-msg">
            <div class="ctx-msg-head">
              <el-tag size="small" :type="roleTag(m.role)" effect="plain">{{ m.role }}</el-tag>
              <span class="ctx-msg-seq">#{{ m.seq }} · {{ m.bytes }}B</span>
              <span v-if="m.truncated" class="ctx-trunc">已截断</span>
            </div>
            <pre v-if="m.text" class="drawer-pre ctx-msg-text">{{ m.text }}</pre>
            <div v-for="(c, i) in m.toolCalls" :key="`c${i}`" class="ctx-tool">⚙ 调用 {{ c.name }}({{ c.argsDigest }})</div>
            <div v-for="(r, i) in m.toolResults" :key="`r${i}`" class="ctx-tool">↩ 返回 {{ r.name }}: {{ r.digest }}</div>
            <div v-if="m.otherParts.length > 0" class="ctx-tool">其他部件：{{ m.otherParts.join('、') }}</div>
          </div>
          <div v-if="contextData && contextData.messages.length === 0" class="insp-empty">会话存储为空——还没有完成的 Agent 轮次</div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDialogStore } from '@/stores/dialog'
import { agentToolLabel } from '@/utils/agent-tool-labels'
import { renderMarkdown } from '@/utils/markdown'
import type {
  AgentConsoleContext,
  AgentConsoleSession,
  AgentConsoleTrajectoryEntry,
  AgentRunUpdateEvent,
} from '@shared/types/agent.types'
import type { Message } from '@shared/types'

type ConsoleApi = {
  listSessions: () => Promise<{ success: boolean; data?: AgentConsoleSession[]; error?: string }>
  getTrajectory: (p: { scopeKey: string }) => Promise<{ success: boolean; data?: AgentConsoleTrajectoryEntry[]; error?: string }>
  getContext: (p: { scopeKey: string }) => Promise<{ success: boolean; data?: AgentConsoleContext; error?: string }>
  stop: (p: { scopeKey: string }) => Promise<{ success: boolean; data?: { stopped: boolean }; error?: string }>
  onTrajectory: (cb: (data: { scopeKey: string; entry: AgentConsoleTrajectoryEntry }) => void) => () => void
  onRunUpdate: (cb: (data: AgentRunUpdateEvent) => void) => () => void
}
const api = () =>
  (window as never as {
    electronAPI: {
      workflow: {
        agentConsole: ConsoleApi
        getTaskTree: (rootId: string) => Promise<{ success: boolean; data?: { root: TaskNode; nodes: TaskNode[] }; error?: string }>
        getRun: (runId: string) => Promise<{ success: boolean; data?: { run: { status: string; durationMs: number | null } }; error?: string }>
      }
    }
  }).electronAPI.workflow

const route = useRoute()
const router = useRouter()
const store = useDialogStore()

interface TaskNode {
  id: string
  parentId: string | null
  depth: number
  title: string
  status: string
  qualityScore: number | null
}

// ============ 活动块模型（DeepSeek-harness：叙述全显 + 工具折叠行，按时间交织） ============

type Block =
  | { type: 'text'; key: string; text: string }
  | { type: 'tool'; key: string; name: string; argsDigest: string; args: unknown; result?: unknown; ok?: boolean; durationMs?: number; pending: boolean }
  | { type: 'notice'; key: string; text: string }
  | { type: 'memory'; key: string; count: number }

interface TimelineItem {
  key: string
  ts: number
  kind: 'user' | 'agent'
  message?: Message
  blocks: Block[]
}

const sessions = ref<AgentConsoleSession[]>([])
const selected = ref<AgentConsoleSession | null>(null)
const draft = ref('')
const scrollRef = ref<HTMLElement | null>(null)

/** 当前会话消息（对话流复用 dialog store——与聊天页同一数据面） */
const messages = computed<Message[]>(() => (selected.value?.kind === 'chat' ? store.messages : []))
const streamState = computed(() => store.streamState)

interface Entry extends AgentConsoleTrajectoryEntry {
  key: string
  ts: number
}
const entries = ref<Entry[]>([])
let selectReqId = 0
let liveSeq = 0

const expanded = reactive(new Set<string>())
const expandedTool = reactive(new Set<string>())
const textClamped = reactive(new Set<string>())

/** markdown 渲染缓存（key=轨迹块 key，select 会话时清空） */
const mdCache = new Map<string, string>()
function mdHtml(key: string, text: string): string {
  let html = mdCache.get(key)
  if (html === undefined) {
    html = renderMarkdown(text)
    mdCache.set(key, html)
  }
  return html
}

let offTrajectory: (() => void) | null = null
let offRunUpdate: (() => void) | null = null

const hasTurnMarkers = computed(() => entries.value.some((e) => e.name === 'turn_start'))
/** 旧格式兜底：无轨迹标记但有消息 */
const legacyMode = computed(() => !hasTurnMarkers.value && messages.value.length > 0)

// ============ 轨迹 → 轮次段 → 活动块 ============

/** 轨迹按 turn_start 切段（iteration 每轮从 0 重来，不可作轮次边界） */
const segments = computed(() => {
  const sorted = [...entries.value].sort((a, b) => a.ts - b.ts)
  const out: Array<{ ts: number; entries: Entry[] }> = []
  for (const e of sorted) {
    if (e.name === 'turn_start' || out.length === 0) out.push({ ts: e.ts, entries: [] })
    out[out.length - 1].entries.push(e)
  }
  return out
})

function buildBlocks(entriesIn: Entry[]): Block[] {
  const blocks: Block[] = []
  const toolByKey = new Map<string, Extract<Block, { type: 'tool' }>>()
  // 预扫 tool_result：发射序不保证 call 在前（ai@6 流内执行工具，轨迹里结果行
  // 常落在调用行之前——33 号长程实测），配对不能依赖条目顺序
  const resultByKey = new Map<string, { ok: boolean; payload: unknown; durationMs?: number }>()
  for (const e of entriesIn) {
    if (e.kind !== 'tool_result') continue
    const callId = String(e.payload?.toolCallId ?? '')
    if (callId) resultByKey.set(callId, { ok: e.payload?.ok !== false, payload: e.payload, durationMs: e.durationMs ?? undefined })
  }
  const pushText = (key: string, text: string) => {
    if (!text) return
    const last = blocks[blocks.length - 1]
    if (last?.type === 'text') {
      last.text += `\n\n${text}`
      return
    }
    blocks.push({ type: 'text', key, text })
  }
  for (const e of entriesIn) {
    const suffix = String(e.seq ?? e.key)
    if (e.name === 'turn_start') continue
    // 记忆装配留痕（36 号 kit 与任务执行器统一 name 判定——旧任务轨迹 kind=decision
    // 也按 name 兼容；必须先于 decision 分支，否则永远不可达且误计步数）
    if (e.kind === 'memory_assembly' || e.name === 'memory_assembly') {
      const refs = e.payload?.memoryRefs
      if (Array.isArray(refs) && refs.length > 0) blocks.push({ type: 'memory', key: `mem-${suffix}`, count: refs.length })
    } else if (e.kind === 'decision') {
      pushText(`txt-${suffix}`, thoughtOf(e))
    } else if (e.kind === 'tool_call') {
      const callId = String(e.payload?.toolCallId ?? '')
      const block: Extract<Block, { type: 'tool' }> = {
        type: 'tool',
        key: `tool-${suffix}`,
        name: e.name ?? '',
        argsDigest: digestArgs(e.payload?.args),
        args: e.payload?.args,
        pending: true,
      }
      if (callId) toolByKey.set(callId, block)
      const ready = callId ? resultByKey.get(callId) : undefined
      if (ready) {
        block.pending = false
        block.ok = ready.ok
        block.result = ready.payload
        block.durationMs = ready.durationMs
      }
      blocks.push(block)
    } else if (e.kind === 'tool_result') {
      const callId = String(e.payload?.toolCallId ?? '')
      const target = toolByKey.get(callId)
      if (target) {
        target.pending = false
        target.ok = e.payload?.ok !== false
        target.result = e.payload
        target.durationMs = e.durationMs ?? undefined
      } else {
        blocks.push({ type: 'tool', key: `tool-${suffix}`, name: e.name ?? '', argsDigest: '', args: undefined, result: e.payload, ok: e.payload?.ok !== false, durationMs: e.durationMs ?? undefined, pending: false })
      }
    } else if (e.kind === 'guardrail_stop') {
      blocks.push({ type: 'notice', key: `notice-${suffix}`, text: `本轮执行终止：${String(e.payload?.reason ?? '未知原因')}` })
    }
  }
  return blocks
}

/** 会话时间线：用户消息与 Agent 轮次段按时间交织 */
const timeline = computed<TimelineItem[]>(() => {
  if (!hasTurnMarkers.value) return []
  const items: TimelineItem[] = []
  for (const seg of segments.value) {
    if (seg.entries.length > 0) {
      const blocks = buildBlocks(seg.entries)
      if (blocks.length > 0) items.push({ key: `seg-${seg.ts}`, ts: seg.ts, kind: 'agent', blocks })
    }
  }
  for (const m of messages.value) {
    if (m.role !== 'user') continue
    items.push({ key: `u-${m.id}`, ts: new Date(m.createdAt).getTime() || 0, kind: 'user', message: m, blocks: [] })
  }
  return items.sort((a, b) => a.ts - b.ts)
})

/** 任务会话（无用户消息）：整条轨迹一组 */
const taskBlocks = computed<Block[]>(() => {
  if (selected.value?.kind !== 'task') return []
  return buildBlocks(entries.value)
})

function isLiveTurn(item: TimelineItem): boolean {
  const last = timeline.value[timeline.value.length - 1]
  return (streamState.value.isStreaming || selected.value?.running === true) && item.key === last?.key && item.kind === 'agent'
}

// ============ 右栏：会话上下文检查器 ============

const contextInfo = computed(() => {
  const tokens = messages.value.reduce((sum, m) => sum + (m.tokensUsed ?? 0), 0)
  return {
    model: store.currentDialog?.modelId ?? '—',
    turns: messages.value.filter((m) => m.role === 'user').length,
    steps: entries.value.filter((e) => e.kind === 'decision' && e.name !== 'turn_start' && e.name !== 'memory_assembly').length,
    tokens: tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens),
  }
})

interface RefItem {
  kind: string
  id: string
  label: string
}
const allRefs = computed<RefItem[]>(() => {
  const out = new Map<string, RefItem>()
  for (const m of messages.value) {
    for (const r of m.metadata?.agent?.refs ?? []) out.set(`${r.kind}:${r.id}`, r)
  }
  return [...out.values()]
})

const memoryLines = computed(() => {
  const out = new Set<string>()
  for (const e of entries.value) {
    // name 双兼容：36 号 kit=kind memory_assembly；旧任务轨迹行 kind=decision
    if (e.kind !== 'memory_assembly' && e.name !== 'memory_assembly') continue
    const refs = e.payload?.memoryRefs
    if (Array.isArray(refs)) refs.forEach((r) => out.add(String(r)))
  }
  return [...out]
})

const skillLabels = computed(() => allRefs.value.filter((r) => r.kind === 'skill').map((r) => r.label))

interface TreeNode {
  id: string
  parentId: string | null
  depth: number
  title: string
  status: string
  qualityScore: number | null
}

interface TreeItem {
  rootId: string
  title: string
  status: string
  score: number | null
  /** 右栏卡片预览（前 8 个子任务标题） */
  children: Array<{ title: string; status: string }>
  /** 全量节点（抽屉层级渲染用） */
  nodes: TreeNode[]
}
const taskTreeItems = ref<TreeItem[]>([])

interface RunItem {
  runId: string
  status: string
}
const runItems = ref<RunItem[]>([])

/**
 * 装配右栏检查器数据（37 号串数据修复：所有 await 后校验 req——旧实现读
 * store.messages 时对话还在加载，拿到的是上一个会话的 refs，任务树因此串台）
 */
async function loadInspectorData(req: number): Promise<void> {
  const rootIds = new Set<string>()
  for (const r of allRefs.value) if (r.kind === 'task_tree') rootIds.add(r.id)
  if (selected.value?.kind === 'task' && selected.value.rootId) rootIds.add(selected.value.rootId)
  const trees: TreeItem[] = []
  for (const rootId of rootIds) {
    try {
      const resp = await api().getTaskTree(rootId)
      if (req !== selectReqId) return
      if (resp.success && resp.data) {
        const root = resp.data.root
        const nodes: TreeNode[] = resp.data.nodes.map((n) => ({
          id: n.id,
          parentId: n.parentId,
          depth: n.depth,
          title: n.title,
          status: n.status,
          qualityScore: n.qualityScore,
        }))
        trees.push({
          rootId,
          title: root.title,
          status: root.status,
          score: root.qualityScore,
          children: nodes
            .filter((n) => n.id !== root.id)
            .slice(0, 8)
            .map((n) => ({ title: n.title, status: n.status })),
          nodes,
        })
      }
    } catch {
      /* 树已删除等：跳过 */
    }
  }
  if (req !== selectReqId) return
  taskTreeItems.value = trees

  const runs: RunItem[] = []
  for (const r of allRefs.value) {
    if (r.kind !== 'workflow_run') continue
    try {
      const resp = await api().getRun(r.id)
      if (req !== selectReqId) return
      runs.push({ runId: r.id, status: resp.success && resp.data ? resp.data.run.status : 'unknown' })
    } catch {
      runs.push({ runId: r.id, status: 'unknown' })
    }
  }
  if (req !== selectReqId) return
  runItems.value = runs
}

function runLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '排队',
    running: '运行中',
    waiting_review: '待审核',
    succeeded: '成功',
    failed: '失败',
    cancelled: '已取消',
    timed_out: '超时',
    interrupted: '中断',
    skipped: '跳过',
  }
  return labels[status] ?? status
}

// ============ 会话 ============

async function loadSessions(): Promise<void> {
  const resp = await api().agentConsole.listSessions()
  if (resp.success) {
    // 只显示对话会话（33 号实测反馈）：任务是某个对话主题下的执行详情，
    // 入口在右侧检查器「子任务规划」与页头「任务树」按钮，不在左侧列表占位
    sessions.value = (resp.data ?? []).filter((s) => s.kind === 'chat')
    if (selected.value) {
      const fresh = sessions.value.find((s) => s.scopeKey === selected.value!.scopeKey)
      if (fresh) selected.value.running = fresh.running
    }
  } else ElMessage.error(resp.error ?? '加载会话失败')
}

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
  // 新对话零消息时 agent_sessions 尚无行——直接合成会话项选中
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

async function select(s: AgentConsoleSession): Promise<void> {
  const req = ++selectReqId
  selected.value = s
  entries.value = []
  // 右栏同步清空（防上一会话的任务树/运行列表闪现）
  taskTreeItems.value = []
  runItems.value = []
  contextData.value = null
  drawerVisible.value = false
  mdCache.clear()
  liveSeq = 0
  expanded.clear()
  expandedTool.clear()
  // 轨迹与会话消息并行加载，两者都落定后再装配右栏——refs 读的是当前会话的消息
  await Promise.all([loadTrajectory(s.scopeKey, req), loadSessionDialog(s, req)])
  if (req !== selectReqId) return
  await loadInspectorData(req)
}

/** 加载会话对应的对话（chat 会话的消息/refs 数据面） */
async function loadSessionDialog(s: AgentConsoleSession, req: number): Promise<void> {
  if (s.kind !== 'chat' || !s.refId) return
  const resp = await window.electronAPI.dialog.get(s.refId)
  if (req !== selectReqId) return
  if (resp.success && resp.dialog) {
    await store.selectDialog(resp.dialog)
  } else {
    // 已删对话：清空 store 消息/refs（防上一会话数据污染当前时间线与右栏）
    store.clearCurrentDialog()
    ElMessage.warning('该会话的对话已被删除，仅可查看过程时间线')
  }
}

async function loadTrajectory(scopeKey: string, req: number): Promise<void> {
  const resp = await api().agentConsole.getTrajectory({ scopeKey })
  if (req !== selectReqId) return
  if (resp.success) {
    entries.value = (resp.data ?? []).map((e, i) => ({
      ...e,
      key: `t-${e.seq ?? 'na'}-${i}`,
      ts: e.createdAt ? new Date(e.createdAt).getTime() || i : i,
    }))
  } else ElMessage.error(resp.error ?? '加载轨迹失败')
}

// ============ 对话（复用 dialog store） ============

function send(): void {
  const content = draft.value.trim()
  if (!content || streamState.value.isStreaming) return
  draft.value = ''
  const req = selectReqId
  void store.sendMessage(content).then(() => {
    if (req === selectReqId) void loadInspectorData(req)
  })
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
      await store.stopGeneration()
      return
    }
    const resp = await api().agentConsole.stop({ scopeKey: selected.value!.scopeKey })
    if (resp.success && resp.data?.stopped) ElMessage.success('已发送停止指令')
    else if (resp.success) ElMessage.warning('该会话当前没有可停止的运行')
    else ElMessage.error(resp.error ?? '停止失败')
  })()
}

// ============ 事件与交互 ============

function onTrajectoryEvent(data: { scopeKey: string; entry: AgentConsoleTrajectoryEntry }): void {
  if (!selected.value || data.scopeKey !== selected.value.scopeKey) return
  entries.value = [...entries.value, { ...data.entry, key: `live-${liveSeq++}`, ts: Date.now() }]
}

function onRunUpdateEvent(data: AgentRunUpdateEvent): void {
  const known = sessions.value.some((x) => x.scopeKey === data.scopeKey)
  if (!known || data.status !== 'running') void loadSessions()
  const s = sessions.value.find((x) => x.scopeKey === data.scopeKey)
  if (s) s.running = data.status === 'running'
  if (selected.value?.scopeKey === data.scopeKey) selected.value.running = data.status === 'running'
}

/** 页头「任务树」：任务树不再占独立菜单，从这里进（33 号实测反馈） */
function gotoTaskTree(): void {
  void router.push('/agent-tasks')
}

// ============ 会话详情抽屉（37 号实测反馈：就地弹出，仅当前会话内容） ============

type DrawerMode = 'tree' | 'memory' | 'context'
const drawerVisible = ref(false)
const drawerMode = ref<DrawerMode>('tree')
const sysExpanded = ref(false)

const drawerTitle = computed(() => {
  const base = selected.value?.label ?? ''
  return drawerMode.value === 'tree' ? `任务树 · ${base}` : drawerMode.value === 'memory' ? `知识飞轮 · ${base}` : `会话上下文 · ${base}`
})

function openDrawer(mode: DrawerMode): void {
  if (!selected.value) return
  drawerMode.value = mode
  drawerVisible.value = true
  if (mode === 'context') void loadContext()
}

/** 任务树抽屉：nodes 按 parentId 从根 DFS 排出渲染序（后端返回序不保证） */
function treeRows(t: TreeItem): TreeNode[] {
  const byParent = new Map<string | null, TreeNode[]>()
  for (const n of t.nodes) {
    const key = byParent.get(n.parentId) ?? []
    key.push(n)
    byParent.set(n.parentId, key)
  }
  const out: TreeNode[] = []
  const walk = (parentId: string | null): void => {
    for (const n of byParent.get(parentId) ?? []) {
      out.push(n)
      walk(n.id)
    }
  }
  walk(null)
  // 根缺失（异常数据）兜底：把孤立节点也补进显示，避免整树消失
  if (out.length === 0) return [...t.nodes].sort((a, b) => a.depth - b.depth)
  return out
}

const TASK_STATUS_LABELS: Record<string, string> = {
  pending_review: '待审核',
  ready: '待执行',
  running: '执行中',
  verifying: '验证中',
  succeeded: '完成',
  failed: '失败',
  cancelled: '已取消',
  escalated: '待人工',
  replanned: '已重规划',
}
function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status] ?? status
}

/** 知识飞轮抽屉：按轮分组的记忆装配记录（最新一轮在前） */
const memoryGroups = computed(() => {
  const groups: Array<{ key: string; label: string; refs: string[] }> = []
  let turn = 0
  for (const e of [...entries.value].sort((a, b) => a.ts - b.ts)) {
    if (e.name === 'turn_start') turn++
    // name 双兼容（36 号 kit 与旧任务轨迹行）
    if (e.kind !== 'memory_assembly' && e.name !== 'memory_assembly') continue
    const refs = Array.isArray(e.payload?.memoryRefs) ? (e.payload!.memoryRefs as unknown[]).map(String) : []
    if (refs.length > 0) groups.push({ key: e.key, label: `第 ${turn} 轮装配 · ${refs.length} 条`, refs })
  }
  return groups.reverse()
})

// ---- 上下文抽屉 ----

const contextData = ref<AgentConsoleContext | null>(null)
const contextLoading = ref(false)

/** 系统提示词快照：最近一轮 turn_start 的动态装配态（聊天宿主在轨迹留痕） */
const contextSystemPrompt = computed(() => {
  let prompt: string | null = null
  for (const e of entries.value) {
    if (e.name !== 'turn_start') continue
    const p = e.payload?.systemPrompt
    if (typeof p === 'string' && p) prompt = p
  }
  return prompt
})

async function loadContext(): Promise<void> {
  const scopeKey = selected.value?.scopeKey
  if (!scopeKey) return
  contextLoading.value = true
  sysExpanded.value = false
  try {
    const resp = await api().agentConsole.getContext({ scopeKey })
    if (selected.value?.scopeKey !== scopeKey) return // 会话已切换，丢弃
    if (resp.success && resp.data) contextData.value = resp.data
    else ElMessage.error(resp.error ?? '读取会话上下文失败')
  } finally {
    contextLoading.value = false
  }
}

function roleTag(role: string): 'primary' | 'success' | 'warning' | 'info' {
  if (role === 'user') return 'primary'
  if (role === 'assistant') return 'success'
  if (role === 'tool') return 'warning'
  return 'info'
}

function toggleText(key: string): void {
  if (expanded.has(key)) expanded.delete(key)
  else expanded.add(key)
}
function toggleTool(key: string): void {
  if (expandedTool.has(key)) expandedTool.delete(key)
  else expandedTool.add(key)
}
function toolMarkClass(block: Extract<Block, { type: 'tool' }>): string {
  if (block.pending) return 'mark-run'
  return block.ok === false ? 'mark-bad' : 'mark-ok'
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
function thoughtOf(entry: AgentConsoleTrajectoryEntry): string {
  const t = entry.payload?.thought
  return typeof t === 'string' ? t.trim() : ''
}
function digestArgs(args: unknown, max = 60): string {
  if (args === undefined || args === null) return ''
  let s: string
  try {
    s = typeof args === 'string' ? args : JSON.stringify(args)
  } catch {
    return ''
  }
  return s.length <= max ? s : `${s.slice(0, max)}…`
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

// 文本超长折叠探测（渲染后测量高度）
watch(
  () => timeline.value.map((t) => t.blocks.map((b) => b.key).join(',')).join('|'),
  () => {
    void nextTick(() => {
      document.querySelectorAll<HTMLElement>('.text-block').forEach((el) => {
        const key = el.getAttribute('data-key')
        if (key && el.scrollHeight > 340) textClamped.add(key)
      })
    })
  },
)

// 内容变化自动滚到底
watch(
  () => [messages.value.length, messages.value[messages.value.length - 1]?.content.length ?? 0, entries.value.length],
  () => {
    void nextTick(() => {
      scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight })
    })
  },
)

// 深链（页内二次跳转）
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
  offTrajectory = api().agentConsole.onTrajectory(onTrajectoryEvent)
  offRunUpdate = api().agentConsole.onRunUpdate(onRunUpdateEvent)
})
onUnmounted(() => {
  offTrajectory?.()
  offRunUpdate?.()
})
</script>

<style scoped>
.page-container { padding: 16px 20px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.header-actions { display: flex; align-items: center; gap: 8px; }
.page-header h2 { margin: 0 0 2px; font-size: 18px; }
.meta { color: var(--el-text-color-secondary); font-size: 13px; }

.console-layout { display: flex; gap: 12px; flex: 1; min-height: 0; }

/* ---- 会话列表 ---- */
.session-list { width: 232px; flex-shrink: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 8px; overflow: auto; }
.session-item { padding: 8px 10px; border-radius: 6px; cursor: pointer; margin-bottom: 4px; }
.session-item:hover { background: var(--el-fill-color-light); }
.session-item.active { background: var(--el-color-primary-light-9); }
.session-title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.session-label { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-meta { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.running-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--el-color-success); flex-shrink: 0; animation: pulse 1.2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* ---- 活动流 ---- */
.stream-pane { flex: 1; min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
.stream-pane-empty { border: none; }
.stream-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--el-border-color-lighter); }
.cv-label { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-actions { margin-left: auto; display: flex; gap: 4px; }

.stream-body { flex: 1; overflow: auto; padding: 16px 18px; }

.user-turn { display: flex; justify-content: flex-end; margin-bottom: 16px; }
.user-bubble { max-width: 72%; background: var(--el-color-primary); color: #fff; border-radius: 12px 12px 2px 12px; padding: 9px 13px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.user-bubble.legacy { background: var(--el-fill-color); color: var(--el-text-color-primary); border-radius: 12px; }
.legacyAssistant { justify-content: flex-start; }

.agent-turn { margin-bottom: 18px; }
.block { margin-bottom: 10px; }

/* 步内叙述文本：正文段落（超长折叠） */
.text-block { font-size: 14px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; color: var(--el-text-color-primary); }
/* 渲染态文本块：markdown 自管换行，关掉容器的 pre-wrap */
.text-block.markdown-body { white-space: normal; }
.markdown-body :deep(p) { margin: 0 0 8px; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(h1), .markdown-body :deep(h2), .markdown-body :deep(h3), .markdown-body :deep(h4) { margin: 12px 0 6px; font-size: 15px; font-weight: 600; }
.markdown-body :deep(h1:first-child), .markdown-body :deep(h2:first-child), .markdown-body :deep(h3:first-child) { margin-top: 0; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { margin: 4px 0 8px; padding-left: 20px; }
.markdown-body :deep(li) { margin: 2px 0; }
.markdown-body :deep(blockquote) { margin: 6px 0; padding: 4px 10px; border-left: 3px solid var(--el-border-color); color: var(--el-text-color-secondary); }
.markdown-body :deep(table) { border-collapse: collapse; margin: 8px 0; font-size: 13px; display: block; overflow-x: auto; max-width: 100%; }
.markdown-body :deep(th), .markdown-body :deep(td) { border: 1px solid var(--el-border-color-lighter); padding: 4px 10px; text-align: left; }
.markdown-body :deep(th) { background: var(--el-fill-color-light); font-weight: 600; }
.markdown-body :deep(a) { color: var(--el-color-primary); }
.markdown-body :deep(code) { background: var(--el-fill-color); border-radius: 4px; padding: 1px 5px; font-size: 13px; }
.markdown-body :deep(.md-code-block) { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; margin: 8px 0; background: var(--el-fill-color-light); }
.markdown-body :deep(.md-code-lang) { font-size: 11px; color: var(--el-text-color-secondary); padding: 3px 10px; border-bottom: 1px solid var(--el-border-color-lighter); }
.markdown-body :deep(.md-code-block pre) { margin: 0; padding: 10px 12px; overflow-x: auto; }
.markdown-body :deep(.md-code-block code) { background: transparent; padding: 0; font-size: 12.5px; line-height: 1.55; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid var(--el-border-color-lighter); margin: 10px 0; }
.text-block.clamped { max-height: 320px; overflow: hidden; -webkit-mask-image: linear-gradient(180deg, #000 70%, transparent); mask-image: linear-gradient(180deg, #000 70%, transparent); }
.text-toggle { font-size: 12px; color: var(--el-color-primary); cursor: pointer; margin-top: 4px; user-select: none; }

/* 工具卡片：一行摘要（ZCode ⏺ 行），点击展开入参/结果 */
.tool-card { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-fill-color-lighter); cursor: pointer; overflow: hidden; }
.tool-card:hover { border-color: var(--el-border-color); }
.tool-line { display: flex; align-items: center; gap: 8px; padding: 7px 11px; min-width: 0; }
.tool-mark { font-size: 13px; flex-shrink: 0; }
.tool-mark.mark-ok { color: var(--el-color-success); }
.tool-mark.mark-bad { color: var(--el-color-danger); }
.tool-mark.mark-run { color: var(--el-color-primary); animation: spin 1s linear infinite; display: inline-block; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.tool-name { font-size: 13px; font-weight: 600; flex-shrink: 0; }
.tool-args { font-size: 12px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-ms { font-size: 11px; color: var(--el-text-color-placeholder); margin-left: auto; flex-shrink: 0; }
.tool-detail { border-top: 1px dashed var(--el-border-color-lighter); padding: 8px 11px; }
.detail-sec { font-size: 11px; color: var(--el-text-color-secondary); margin: 4px 0 2px; }
.detail-pre { margin: 0; font-size: 12px; white-space: pre-wrap; word-break: break-word; background: var(--el-fill-color); padding: 6px 8px; border-radius: 4px; max-height: 240px; overflow: auto; }

/* 系统提示 / 记忆标注 */
.notice-block { font-size: 12px; color: var(--el-color-warning); background: var(--el-color-warning-light-9); border-radius: 6px; padding: 7px 10px; }
.memory-line { font-size: 12px; color: var(--el-text-color-secondary); font-style: italic; }

.live-line { font-size: 12px; color: var(--el-text-color-secondary); display: flex; align-items: center; gap: 6px; }

.conversation-input { border-top: 1px solid var(--el-border-color-lighter); padding: 10px 12px; }
.draft-input { width: 100%; box-sizing: border-box; border: 1px solid var(--el-border-color); border-radius: 8px; padding: 9px 11px; font-size: 13px; font-family: inherit; resize: vertical; background: var(--el-bg-color); color: var(--el-text-color-primary); }
.draft-input:focus { outline: none; border-color: var(--el-color-primary-light-5); }
.input-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.input-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-right: auto; }

/* ---- 右栏：上下文检查器 ---- */
.inspector-pane { width: 300px; flex-shrink: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; }
.insp-scroll { height: 100%; overflow: auto; padding: 12px; }
.insp-sec { margin-bottom: 18px; }
.insp-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
.insp-link { font-size: 12px; color: var(--el-color-primary); cursor: pointer; font-weight: 400; }
.insp-list { display: flex; flex-direction: column; gap: 6px; }
.insp-item { font-size: 12px; color: var(--el-text-color-regular); background: var(--el-fill-color-lighter); border-radius: 6px; padding: 6px 8px; line-height: 1.5; }
.insp-empty { font-size: 12px; color: var(--el-text-color-placeholder); }
.kv-grid { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; font-size: 12px; }
.kv-k { color: var(--el-text-color-secondary); }
.kv-v { color: var(--el-text-color-primary); word-break: break-all; }
.insp-card { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 7px 9px; margin-bottom: 6px; }
.tree-root { display: flex; align-items: center; gap: 6px; cursor: pointer; min-width: 0; }
.tree-root:hover .tree-title { color: var(--el-color-primary); }
.tree-status { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--el-text-color-placeholder); }
.tree-status.st-succeeded { background: var(--el-color-success); }
.tree-status.st-running, .tree-status.st-ready { background: var(--el-color-primary); animation: pulse 1.2s infinite; }
.tree-status.st-failed { background: var(--el-color-danger); }
.tree-status.st-pending_review, .tree-status.st-escalated, .tree-status.st-verifying { background: var(--el-color-warning); }
.tree-status.st-replanned { background: var(--el-color-info); }
.tree-title { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-score { font-size: 11px; color: var(--el-text-color-secondary); margin-left: auto; flex-shrink: 0; }
.tree-child { display: flex; align-items: center; gap: 6px; padding-left: 14px; margin-top: 3px; }
.tree-child-title { font-size: 12px; color: var(--el-text-color-regular); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-status { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--el-fill-color); color: var(--el-text-color-regular); flex-shrink: 0; }
.run-status.rs-succeeded { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.run-status.rs-failed, .run-status.rs-cancelled, .run-status.rs-timed_out { background: var(--el-color-danger-light-9); color: var(--el-color-danger); }
.run-status.rs-running, .run-status.rs-pending { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }

.empty-tip { color: var(--el-text-color-secondary); font-size: 13px; padding: 24px; text-align: center; }

/* ---- 会话详情抽屉 ---- */
.drawer-sec-hint { font-size: 12px; color: var(--el-text-color-secondary); margin: 4px 0 8px; }
.drawer-sec-gap { margin-top: 18px; }
.drawer-tree { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; }
.drawer-tree-row { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 3px 0; }
.drawer-tree-title { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drawer-tree-root { font-weight: 600; }
.drawer-tree-status { font-size: 11px; color: var(--el-text-color-secondary); margin-left: auto; flex-shrink: 0; }
.drawer-mem-group { margin-bottom: 14px; }
.drawer-foot { margin-top: 16px; padding-top: 10px; border-top: 1px dashed var(--el-border-color-lighter); }
.drawer-pre { margin: 0; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; background: var(--el-fill-color-light); border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px 10px; max-height: none; overflow: visible; }
.drawer-pre-clamped { max-height: 200px; overflow: hidden; -webkit-mask-image: linear-gradient(180deg, #000 70%, transparent); mask-image: linear-gradient(180deg, #000 70%, transparent); }
.ctx-msg { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
.ctx-msg-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.ctx-msg-seq { font-size: 11px; color: var(--el-text-color-placeholder); }
.ctx-trunc { font-size: 11px; color: var(--el-color-warning); }
.ctx-msg-text { border: none; background: var(--el-fill-color-lighter); max-height: 220px; overflow: auto; }
.ctx-tool { font-size: 12px; color: var(--el-text-color-secondary); background: var(--el-fill-color-lighter); border-radius: 4px; padding: 4px 7px; margin-top: 4px; word-break: break-all; }
</style>
