<template>
  <div class="app-session">
    <div class="back-bar">
      <el-button text @click="goBack"><el-icon><ArrowLeft /></el-icon> {{ backLabel }}</el-button>
      <span class="title">{{ session?.title || '应用会话' }}</span>
      <div class="spacer" />
      <el-button size="small" type="primary" plain @click="newSession">＋ 新建会话</el-button>
    </div>

    <div class="chat-wrap">
      <div class="chat-msgs" ref="msgBox">
        <!-- 卡片渲染收敛到共享组件 SessionMessageCard（start-form/review/run-status/report/message） -->
        <template v-for="(m, i) in messages" :key="i">
          <SessionMessageCard
            :message="m"
            @submit="startWith"
            @review="handleReview(m, $event)"
            @view-run="viewRun"
          />
        </template>
        <div v-if="!loading && messages.length === 0" class="empty">暂无消息，请先在应用页开始会话</div>
      </div>

      <!-- 快速输入仅对无 start 表单的简单应用显示（有表单时用上方卡片驱动，避免两套入口） -->
      <div v-if="!hasStartForm" class="chat-input">
        <el-input v-model="quickInput" placeholder="输入参数后再次运行（留空沿用上次）" @keyup.enter="quickStart" />
        <el-button type="primary" @click="quickStart">发送</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 应用会话页（片3b 骨架 + 片4 完整卡片）：start 表单 / 审核 / 结果 以消息流呈现
 * 卡片渲染收敛到 SessionMessageCard 共享组件；本页只负责消息流容器 + IPC 编排。
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import SessionMessageCard from '@/components/workflow/SessionMessageCard.vue'
import type { AppSessionRecord } from '@shared/types/app.types'
import type { Message } from '@shared/types/message.types'
import { electronApi } from '@/types/electron-api'

const route = useRoute()
const router = useRouter()
const appId = computed(() => String(route.params.id))
const sessionId = computed(() => String(route.params.sessionId ?? ''))
const api = electronApi()

const session = ref<AppSessionRecord | null>(null)
const messages = ref<Message[]>([])
const loading = ref(false)
const quickInput = ref('')
const msgBox = ref<HTMLElement>()

/** 会话内是否存在 start-form 卡（有则用表单驱动，隐藏自由文本快速输入） */
const hasStartForm = computed(() =>
  messages.value.some(m => m.metadata?.sessionCard?.card === 'start-form'),
)

/** 新建会话（与详情/列表入口一致）：创建后跳转新会话页 */
async function newSession(): Promise<void> {
  const resp = await api.appSession.create({ appId: appId.value })
  if (resp.success) {
    router.push(`/apps/${appId.value}/session/${resp.data?.id}?from=${fromSource.value}`)
  } else ElMessage.error(resp.error ?? '创建会话失败')
}

/** 返回来源：from=home（首页启动）→ 回首页；from=list（应用列表）→ 回列表；否则回应用详情 */
const fromSource = computed<'home' | 'list' | 'detail'>(() => {
  const f = route.query.from
  if (f === 'home') return 'home'
  if (f === 'list') return 'list'
  return 'detail'
})
const backLabel = computed(() => {
  if (fromSource.value === 'home') return '返回首页'
  if (fromSource.value === 'list') return '返回应用列表'
  return '返回应用'
})
function goBack(): void {
  if (fromSource.value === 'home') router.push('/')
  else if (fromSource.value === 'list') router.push('/apps')
  else router.push(`/apps/${appId.value}`)
}

async function loadMessages(): Promise<void> {
  loading.value = true
  try {
    const s = await api.appSession.get(sessionId.value)
    if (s.success) session.value = s.data ?? null
    const resp = await api.appSession.messages(sessionId.value)
    if (resp.success) messages.value = resp.data ?? []
    await nextTick()
    msgBox.value?.scrollTo({ top: msgBox.value.scrollHeight })
  } finally { loading.value = false }
}

async function startWith(inputs?: Record<string, unknown>): Promise<void> {
  const resp = await api.appSession.start({ sessionId: sessionId.value, inputs })
  if (!resp.success) {
    ElMessage.error(resp.error ?? '启动失败')
    return
  }
  await loadMessages()
}

/** 快捷输入：自由文本兜底（字段键 quickInput 与 start 表单 schema 不对位，仅用于无表单的简单应用；有表单请用上方卡片） */
async function quickStart(): Promise<void> {
  const text = quickInput.value.trim()
  quickInput.value = ''
  await startWith(text ? { quickInput: text } : undefined)
}

/** 卡片审核决策（SessionMessageCard review 事件 → IPC；失败提示不静默） */
async function handleReview(
  _m: Message,
  payload: { nodeId: string; decision: 'approve' | 'approve_with_changes' | 'reject'; editedValues?: Record<string, unknown> },
): Promise<void> {
  const resp = await api.appSession.review({
    sessionId: sessionId.value,
    nodeId: payload.nodeId,
    decision: payload.decision,
    editedValues: payload.editedValues,
  })
  if (!resp.success) ElMessage.error(resp.error ?? '操作失败')
  await loadMessages()
}

function viewRun(runId: string): void {
  router.push(`/workflow/run/${runId}`)
}

// ---- 实时刷新：订阅 wf:run-event，命中本会话 last_run_id 则重拉消息（事件桥写卡后同步显示） ----
let unsub: (() => void) | null = null
function subscribeRunEvents(): void {
  unsub = api.workflow.onRunEvent((e) => {
    if (!session.value?.lastRunId || e?.runId !== session.value.lastRunId) return
    void loadMessages()  // 事件桥已写卡——重拉即实时
  })
}
async function ensureSession(): Promise<void> {
  if (session.value?.lastRunId) return
  const s = await api.appSession.get(sessionId.value)
  if (s.success && s.data?.lastRunId) session.value = s.data
}

onMounted(async () => {
  await loadMessages()
  await ensureSession()
  subscribeRunEvents()
})
onUnmounted(() => { unsub?.() })
</script>

<style scoped>
.app-session { padding: 16px 26px; display: flex; flex-direction: column; height: 100%; }
.back-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.back-bar .spacer { flex: 1; }
.title { font-weight: 600; }
.chat-wrap { flex: 1; display: flex; flex-direction: column; background: var(--el-bg-color); border: 1px solid var(--el-border-color); border-radius: 10px; overflow: hidden; }
.chat-msgs { flex: 1; overflow-y: auto; padding: 18px; }
.empty { color: var(--el-text-color-secondary); text-align: center; padding: 40px 0; }
.chat-input { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--el-border-color); }
</style>
