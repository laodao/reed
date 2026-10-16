<template>
  <div ref="scrollEl" class="chat" @scroll="onScroll">
    <div class="chat-inner">
      <!-- 主编开场白（原型形态：人设气泡而非标题屏） -->
      <MessageBubble
        v-if="messages.length === 0 && !streamMessage && status !== 'loading'"
        role="assistant"
        :content="welcomeText"
      />

      <template v-for="(item, i) in timeline" :key="item.key">
        <!-- 阶段分隔卡 -->
        <div v-if="item.type === 'divider'" class="divider">
          <span class="line"></span>
          <span class="badge">{{ item.phaseLabel }}</span>
          <span class="line"></span>
        </div>
        <!-- 消息气泡（assistant 消息中的审批标记剥离后由下方审批按钮渲染） -->
        <template v-else-if="item.type === 'message'">
          <MessageBubble
            :role="item.message.role"
            :content="displayContent(item.message)"
            :timestamp="item.message.timestamp"
            :data-turn="item.message.metadata ? turnOf(item.message.metadata) : ''"
            :data-index="i"
          />
          <div
            v-for="aid in item.message.role === 'assistant' ? markersOf(item.message.content) : []"
            :key="`${item.key}-apr-${aid}`"
            class="approval-row"
          >
            <button class="approval-btn" :class="{ done: approvalStatus(aid) !== 'pending' }" @click="$emit('open-approval', aid)">
              <span class="ab-ico">📝</span>
              <span class="ab-body">
                <span class="ab-title">{{ approvalLabel(aid) }}</span>
                <span class="ab-sub">{{ approvalStatus(aid) === 'pending' ? '点击查看审批内容并确认' : approvalStatus(aid) === 'approved' ? '已通过' : '已驳回' }}</span>
              </span>
              <span class="ab-go">{{ approvalStatus(aid) === 'pending' ? '去审批 →' : '查看' }}</span>
            </button>
          </div>
        </template>
      </template>

      <!-- 流式中的主编发言 -->
      <MessageBubble
        v-if="streamMessage"
        role="assistant"
        :content="streamMessage.content"
        streaming
      />
      <!-- 等待主编开口 -->
      <div v-else-if="busy" class="typing">
        <i></i><i></i><i></i>
      </div>

      <!-- 提炼卡片（对话流末尾） -->
      <template v-if="cards.length > 0">
        <div class="cards-head">── 提炼结果（确认后入库）──</div>
        <ArtifactCard v-for="c in cards.filter((x) => x.status !== 'ignored')" :key="c.id" :card="c">
          <template #actions>
            <el-button size="small" type="success" @click="$emit('adopt', c)">✓ 采纳入库</el-button>
            <el-button size="small" @click="$emit('edit', c)">✎ 编辑</el-button>
            <el-button size="small" @click="$emit('regen', c)">↻ 换一版</el-button>
            <el-button size="small" text type="danger" @click="$emit('ignore', c)">忽略</el-button>
          </template>
        </ArtifactCard>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import MessageBubble from './MessageBubble.vue'
import ArtifactCard from './ArtifactCard.vue'
import { ROOM_PHASE_META } from './roomKinds'
import { extractApprovalMarkers, stripApprovalMarkers } from '@shared/types/story-room.types'
import type { ArtifactCard as ArtifactCardData, RoomApproval, RoomMessageView } from '@shared/types/story-room.types'

defineOptions({ name: 'RoomChatCanvas' })

const props = defineProps<{
  messages: RoomMessageView[]
  streamMessage: { content: string; turnNo: number } | null
  status: string
  busy: boolean
  cards: ArtifactCardData[]
  projectName?: string
  /** 溯源定位请求：{turn, n}——n 为递增序号驱动 watch */
  locateTurn?: { turn: number; n: number } | null
  /** 审批单状态表（按钮标题/终态展示用；未知 id 按 pending 处理） */
  approvals?: RoomApproval[]
}>()

defineEmits<{
  (e: 'adopt', card: ArtifactCardData): void
  (e: 'edit', card: ArtifactCardData): void
  (e: 'regen', card: ArtifactCardData): void
  (e: 'ignore', card: ArtifactCardData): void
  (e: 'open-approval', approvalId: string): void
}>()

/** 提取 assistant 消息里的审批标记 id */
function markersOf(content: string): string[] {
  return extractApprovalMarkers(content || '')
}

/** 展示正文：剥离审批标记（标记由审批按钮渲染，不进 markdown） */
function displayContent(m: RoomMessageView): string {
  return m.role === 'assistant' ? stripApprovalMarkers(m.content || '') : m.content || ''
}

function approvalOf(id: string): RoomApproval | undefined {
  return (props.approvals ?? []).find((a) => a.id === id)
}

function approvalLabel(id: string): string {
  return approvalOf(id)?.title || '待审批单'
}

function approvalStatus(id: string): string {
  return approvalOf(id)?.status || 'pending'
}

const welcomeText = [
  '我是你的**故事主编**。《' + (props.projectName || '未命名作品') + '》已就绪。',
  '',
  '没有步骤、没有表单——**一个对话聊到底**：加人物/门派/武功直接说；改设定说"把××的××改成××"；右侧**世界设定集**随时查看，点条目可在对话中追问。讨论中的共识会沉淀成**讨论成果**，随时「提炼入库」。',
].join('\n')

type TimelineItem =
  | { key: string; type: 'divider'; phaseLabel: string }
  | { key: string; type: 'message'; message: RoomMessageView }

const scrollEl = ref<HTMLElement | null>(null)

/** 吸底跟随：用户上翻脱离底部即停，拉回底部恢复；用户发送指令时无条件重吸 */
const followBottom = ref(true)
/** 距底部多少像素内视为「在底部」 */
const NEAR_BOTTOM_PX = 120
/** 程序化置底产生的 scroll 事件不算「用户拖动」，需抑制一帧 */
let programmaticScroll = false

function onScroll(): void {
  if (programmaticScroll) return
  const el = scrollEl.value
  if (!el) return
  followBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
}

function scrollToBottom(force = false): void {
  nextTick(() => {
    const el = scrollEl.value
    if (!el) return
    // 用户发送指令：无论停在哪都拉底并重吸跟随
    if (force) followBottom.value = true
    // 用户上翻阅读中：agent 新消息不拽回（评审 P2-18 延续）
    if (!followBottom.value) return
    programmaticScroll = true
    // 瞬时置底：流式增量若走 smooth 逐帧动画会拖影，且干扰 scroll 判定
    el.style.scrollBehavior = 'auto'
    el.scrollTop = el.scrollHeight
    el.style.scrollBehavior = ''
    requestAnimationFrame(() => {
      programmaticScroll = false
    })
  })
}

function turnOf(metadata: string): number {
  try {
    return JSON.parse(metadata)?.turnNo ?? 0
  } catch {
    return 0
  }
}

/** 消息时间线：阶段变化处插分隔卡（按消息 metadata.phase） */
const timeline = computed<TimelineItem[]>(() => {
  const items: TimelineItem[] = []
  let lastPhase = ''
  for (const m of props.messages) {
    const meta = m.metadata ? safeParse(m.metadata) : {}
    const phase = meta.phase as string | undefined
    if (phase && phase !== lastPhase) {
      const label = ROOM_PHASE_META.find((p) => p.id === phase)?.label
      if (label) {
        items.push({ key: `divider-${phase}-${items.length}`, type: 'divider', phaseLabel: `${label}阶段` })
        lastPhase = phase
      }
    }
    items.push({ key: m.id || `msg-${m.timestamp}-${items.length}`, type: 'message', message: m })
  }
  return items
})

function safeParse(metadata: string): Record<string, unknown> {
  try {
    return JSON.parse(metadata) || {}
  } catch {
    return {}
  }
}

// 用户发送（乐观上屏 role=user）无条件拉底；assistant 消息仅在吸底跟随时拉底
watch(() => props.messages.length, () => {
  const last = props.messages[props.messages.length - 1]
  scrollToBottom(last?.role === 'user')
}, { flush: 'post' })
// 溯源定位：滚到该轮首条消息并闪烁高亮（跳入历史即视为离开底部，跟随自然解除）
watch(() => props.locateTurn, (req) => {
  if (!req) return
  nextTick(() => {
    const el = scrollEl.value?.querySelector(`[data-turn="${req.turn}"]`) as HTMLElement | null
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('locate-flash')
    setTimeout(() => el.classList.remove('locate-flash'), 2000)
  })
})
watch(() => props.streamMessage?.content.length, () => scrollToBottom(false), { flush: 'post' })
// 提炼卡片与打字指示渲染在对话流末尾，吸底时补拉
watch(() => props.cards.length, () => scrollToBottom(false), { flush: 'post' })
watch(() => props.busy, () => scrollToBottom(false), { flush: 'post' })
</script>

<style scoped>
.chat {
  /* 程序化置底走瞬时赋值（见 scrollToBottom）；scroll-behavior 不影响用户滚轮/拖拽 */
  flex: 1; overflow-y: auto; padding: 22px 28px 12px; min-height: 0;
}
.chat-inner { max-width: 820px; margin: 0 auto; }
.welcome { text-align: center; padding: 60px 20px 30px; }
.welcome h3 { font-size: 18px; margin-bottom: 10px; }
.welcome p { font-size: 13px; color: var(--el-text-color-secondary); line-height: 1.9; max-width: 460px; margin: 0 auto; }
.divider { display: flex; align-items: center; gap: 12px; margin: 22px 0 10px; }
.divider .line { flex: 1; height: 1px; background: var(--el-border-color-lighter); }
.divider .badge {
  font-size: 11.5px; color: var(--el-color-primary); background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-8); border-radius: 999px; padding: 2.5px 13px;
}
.cards-head { text-align: center; font-size: 12px; color: var(--el-text-color-secondary); margin: 18px 0 6px; }
.approval-row { display: flex; justify-content: flex-start; margin: -6px 0 14px 52px; }
.approval-btn {
  display: inline-flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer;
  border: 1px solid var(--el-color-warning-light-5); border-radius: 10px;
  background: var(--el-color-warning-light-9); transition: box-shadow .15s, border-color .15s;
  text-align: left;
}
.approval-btn:hover { border-color: var(--el-color-warning); box-shadow: 0 2px 10px rgba(230, 162, 60, .18); }
.approval-btn.done { border-color: var(--el-border-color-lighter); background: var(--el-fill-color-light); }
.ab-ico { font-size: 18px; }
.ab-body { display: flex; flex-direction: column; gap: 2px; }
.ab-title { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); }
.ab-sub { font-size: 11.5px; color: var(--el-text-color-secondary); }
.ab-go { font-size: 12px; color: var(--el-color-warning); font-weight: 600; white-space: nowrap; }
.approval-btn.done .ab-go { color: var(--el-text-color-secondary); font-weight: 400; }
.typing { display: inline-flex; gap: 4px; padding: 10px 4px; }
.typing i {
  width: 6px; height: 6px; border-radius: 50%; background: var(--el-color-primary);
  animation: bounce 1.1s infinite;
}
.typing i:nth-child(2) { animation-delay: 0.15s; }
.typing i:nth-child(3) { animation-delay: 0.3s; }
.locate-flash { animation: locateFlash 1s ease 2; }
@keyframes locateFlash { 0%, 100% { outline: 2px solid transparent; } 50% { outline: 2px solid var(--el-color-primary); border-radius: 8px; } }
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-4px); opacity: 1; }
}
</style>
