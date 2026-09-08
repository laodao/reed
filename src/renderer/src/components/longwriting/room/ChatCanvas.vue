<template>
  <div ref="scrollEl" class="chat">
    <div class="chat-inner">
      <div v-if="messages.length === 0 && !streamMessage && status !== 'loading'" class="welcome">
        <h3>故事研讨室</h3>
        <p>和主编多轮研讨：故事核 → 人物 → 故事线 → 大纲。讨论中的共识会沉淀在右侧账本，提炼成卡片后采纳入库。</p>
      </div>

      <template v-for="(item, i) in timeline" :key="item.key">
        <!-- 阶段分隔卡 -->
        <div v-if="item.type === 'divider'" class="divider">
          <span class="line"></span>
          <span class="badge">{{ item.phaseLabel }}</span>
          <span class="line"></span>
        </div>
        <!-- 消息气泡 -->
        <MessageBubble
          v-else-if="item.type === 'message'"
          :role="item.message.role"
          :content="item.message.content"
          :data-turn="item.message.metadata ? turnOf(item.message.metadata) : ''"
          :data-index="i"
        />
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
        <ArtifactCard v-for="c in cards" :key="c.id" :card="c">
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
import type { ArtifactCard as ArtifactCardData, RoomMessageView } from '@shared/types/story-room.types'

defineOptions({ name: 'RoomChatCanvas' })

const props = defineProps<{
  messages: RoomMessageView[]
  streamMessage: { content: string; turnNo: number } | null
  status: string
  busy: boolean
  cards: ArtifactCardData[]
}>()

defineEmits<{
  (e: 'adopt', card: ArtifactCardData): void
  (e: 'edit', card: ArtifactCardData): void
  (e: 'regen', card: ArtifactCardData): void
  (e: 'ignore', card: ArtifactCardData): void
}>()

type TimelineItem =
  | { key: string; type: 'divider'; phaseLabel: string }
  | { key: string; type: 'message'; message: RoomMessageView }

const scrollEl = ref<HTMLElement | null>(null)

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

function scrollToBottom(): void {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

watch(() => [props.messages.length, props.streamMessage?.content.length], scrollToBottom, { flush: 'post' })
</script>

<style scoped>
.chat {
  flex: 1; overflow-y: auto; padding: 22px 28px 12px; scroll-behavior: smooth; min-height: 0;
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
.typing { display: inline-flex; gap: 4px; padding: 10px 4px; }
.typing i {
  width: 6px; height: 6px; border-radius: 50%; background: var(--el-color-primary);
  animation: bounce 1.1s infinite;
}
.typing i:nth-child(2) { animation-delay: 0.15s; }
.typing i:nth-child(3) { animation-delay: 0.3s; }
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-4px); opacity: 1; }
}
</style>
