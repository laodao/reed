<template>
  <div class="session-card">
    <!-- 用户提交的消息（role=user，P2 角色区分：左侧气泡回显提交参数） -->
    <div v-if="props.message.role === 'user'" class="bubble user-bubble">
      <span class="who">我</span>
      <div class="user-text">{{ props.message.content }}</div>
    </div>

    <!-- start-form 启动表单（表单卡片不受气泡 82% 限制，占满消息区宽度；字段多自动两列） -->
    <div v-else-if="card?.card === CARDS.startForm" class="bubble form-bubble">
      <div class="card">
        <div class="card-title">启动参数 <span class="badge blue">可填写后运行</span></div>
        <RunInputForm ref="startFormRef" auto-columns :inputs="startFormFields" @valid="v => (startValid = v)" />
        <div class="card-footer">
          <el-button type="primary" :disabled="!startValid" @click="submitStartForm">运行</el-button>
        </div>
      </div>
    </div>

    <!-- run-status / node-status 运行状态（追加式进度，无 in-place 更新） -->
    <div v-else-if="isStatusCard" class="bubble">
      <span class="badge" :class="card?.card === CARDS.nodeStatus && card.status === 'running' ? 'orange' : 'blue'">
        {{ statusSummary }}
      </span>
    </div>

    <!-- review 审核/表单卡片（kind 判别：form / choose / input / approve；表单卡占满宽度） -->
    <div v-else-if="card?.card === CARDS.review" class="bubble form-bubble">
      <div class="card">
        <div class="card-title">等待操作 <span class="badge orange">{{ kindLabel(card.kind) }}</span></div>
        <RunInputForm v-if="card.kind === 'form'" ref="reviewFormRef" auto-columns :inputs="reviewFields ?? []" @valid="v => (reviewValid = v)" />
        <!-- 送审内容展示（approve/input/choose 的 payload；文本按 markdown 渲染） -->
        <div v-else-if="reviewPayloadText" class="review-payload">
          <div class="md-body" v-html="renderedReviewPayload"></div>
        </div>
        <div v-else class="review-hint">节点 {{ card.nodeId }} 等待操作</div>
        <div class="card-footer">
          <el-button size="small" @click="decide('reject')">取消流程</el-button>
          <el-button v-if="card.kind === 'form'" size="small" type="primary" :disabled="!reviewValid" @click="decideWithForm">提交并继续</el-button>
          <el-button v-else size="small" type="primary" @click="decide('approve')">批准</el-button>
        </div>
      </div>
    </div>

    <!-- report 结果卡片（markdown 内联渲染） -->
    <div v-else-if="card?.card === CARDS.report" class="bubble">
      <div class="card">
        <div class="card-title">📄 {{ card.title }}</div>
        <div class="md-body" v-html="renderedMd"></div>
        <div class="card-footer">
          <el-button size="small" @click="emit('view-run', card.runId)">查看运行详情</el-button>
        </div>
      </div>
    </div>

    <!-- message 卡片 / 普通消息兜底 -->
    <div v-else class="bubble">{{ messageContent }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 会话消息卡片（片4 共享组件）：按 messages.metadata.sessionCard 判别联合分派渲染。
 * 会话页（AppSession.vue）与运行详情（WorkflowRunDetail）共用的卡片形态收敛于此——
 * 消除各页重复实现；markdown 用 marked 渲染（与 RunDetail 报告预览同源）。
 */
import { ref, computed, watch } from 'vue'
import RunInputForm from '@/components/workflow/RunInputForm.vue'
import { WORKFLOW_SESSION_CARDS as CARDS } from '@shared/types/app.types'
import type { Message } from '@shared/types/message.types'

const props = defineProps<{ message: Message }>()
const emit = defineEmits<{
  (e: 'submit', values: Record<string, unknown>): void
  (e: 'review', payload: { nodeId: string; decision: 'approve' | 'approve_with_changes' | 'reject'; editedValues?: Record<string, unknown> }): void
  (e: 'view-run', runId: string): void
}>()

const card = computed(() => props.message.metadata?.sessionCard ?? null)
const isStatusCard = computed(
  () => card.value?.card === CARDS.runStatus || card.value?.card === CARDS.nodeStatus,
)

/** start-form 卡片字段（form=发布图 start.inputs） */
const startFormFields = computed(() =>
  card.value?.card === CARDS.startForm ? (card.value.form as Array<Record<string, unknown>>) : [],
)
/** review 卡片字段（schema.fields） */
const reviewFields = computed(() => {
  if (card.value?.card !== CARDS.review) return undefined
  const f = (card.value.schema as { fields?: unknown } | null | undefined)?.fields
  return Array.isArray(f) ? (f as Array<Record<string, unknown>>) : undefined
})

/** 送审内容文本（approve/input/choose 的 payload：content 字段优先，其余 stringify） */
const reviewPayloadText = computed(() => {
  if (card.value?.card !== CARDS.review) return ''
  const schema = (card.value.schema ?? {}) as Record<string, unknown>
  if (typeof schema.content === 'string' && schema.content.trim()) return schema.content
  // 无 content 字段时，把其余可读字段拼成文本（避免盲批）
  const readable = Object.entries(schema).filter(([k]) => !['form', 'fields', 'options', 'interaction'].includes(k))
  if (readable.length === 0) return ''
  return readable.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n\n')
})

/** 送审内容 markdown 渲染（与 report 卡片同源） */
const renderedReviewPayload = ref('')
watch(
  reviewPayloadText,
  async text => {
    renderedReviewPayload.value = ''
    if (!text) return
    try {
      const { marked } = await import('marked')
      renderedReviewPayload.value = await marked.marked(text, { gfm: true, breaks: true, async: true })
    } catch {
      renderedReviewPayload.value = text
    }
  },
  { immediate: true },
)

const statusSummary = computed(() => {
  const c = card.value
  if (!c) return props.message.content || ''
  if (c.card === CARDS.runStatus) return `⚡ 运行中：${c.status}`
  if (c.card === CARDS.nodeStatus) return `节点 ${c.nodeId}：${c.status}`
  return ''
})

const messageContent = computed(() => {
  const c = card.value
  if (c?.card === CARDS.message) return c.content
  return props.message.content || ''
})

const kindLabel = (k: string): string =>
  ({ form: '请填写表单', choose: '请选择', approve: '请批准', input: '请输入' })[k] ?? k

const startValid = ref(false)
const reviewValid = ref(false)
const startFormRef = ref<any>()
const reviewFormRef = ref<any>()

function submitStartForm(): void {
  emit('submit', startFormRef.value?.getValues?.() ?? {})
}

function decide(decision: 'approve' | 'reject'): void {
  if (card.value?.card !== CARDS.review) return
  emit('review', { nodeId: card.value.nodeId, decision })
}

function decideWithForm(): void {
  if (card.value?.card !== CARDS.review) return
  emit('review', {
    nodeId: card.value.nodeId,
    decision: 'approve_with_changes',
    editedValues: reviewFormRef.value?.getValues?.() ?? {},
  })
}

// ---- report markdown 内联渲染（marked，异步；失败回退纯文本） ----
const renderedMd = ref('')
watch(
  card,
  async c => {
    renderedMd.value = ''
    if (c?.card !== CARDS.report) return
    try {
      const { marked } = await import('marked')
      renderedMd.value = await marked.marked(c.markdown, { gfm: true, breaks: true, async: true })
    } catch {
      renderedMd.value = c.markdown
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.session-card { margin-bottom: 12px; display: flex; }
.bubble { max-width: 82%; }
/* 表单卡片（start-form/review）占满消息区，避免聊天气泡限制把多字段表单挤窄 */
.bubble.form-bubble { max-width: 100%; width: 100%; }
/* 用户提交回显（左侧气泡） */
.bubble.user-bubble { align-self: flex-start; background: var(--el-fill-color-light); border-radius: 10px; padding: 8px 12px; }
.bubble.user-bubble .who { font-size: 11px; color: var(--el-text-color-secondary); display: block; margin-bottom: 2px; }
.bubble.user-bubble .user-text { font-size: 13px; white-space: pre-wrap; word-break: break-all; }
.card { border: 1px solid var(--el-border-color); border-radius: 8px; padding: 14px; }
.card-title { font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; }
.badge.blue { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.badge.orange { background: #faecd8; color: #e6a23c; }
.card-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.review-hint { color: var(--el-text-color-secondary); font-size: 13px; }
.review-payload { max-height: 320px; overflow-y: auto; background: var(--el-fill-color-lighter); border-radius: 6px; padding: 10px 12px; }
.review-payload .md-body { font-size: 13px; line-height: 1.7; color: var(--el-text-color-primary); }
.md-body { white-space: pre-wrap; font-size: 13px; line-height: 1.8; }
</style>
