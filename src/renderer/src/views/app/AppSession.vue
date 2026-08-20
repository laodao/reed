<template>
  <div class="app-session">
    <div class="back-bar">
      <el-button text @click="router.push(`/apps/${appId}`)"><el-icon><ArrowLeft /></el-icon> 返回应用</el-button>
      <span class="title">{{ session?.title || '应用会话' }}</span>
    </div>

    <div class="chat-wrap">
      <div class="chat-msgs" ref="msgBox">
        <!-- 每类卡片渲染 -->
        <template v-for="(m, i) in messages" :key="i">
          <!-- start-form 启动表单 -->
          <div v-if="m.metadata?.sessionCard?.card === 'start-form'" class="msg">
            <div class="bubble">
              <div class="card">
                <div class="card-title">启动参数 <span class="badge blue">可填写后运行</span></div>
                <RunInputForm ref="startFormRef" :inputs="m.metadata.sessionCard.form ?? []" @valid="v => (startValid = v)" />
                <div class="card-footer">
                  <el-button type="primary" :disabled="!startValid" :loading="starting" @click="submitStart">运行</el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- run-status 运行状态 -->
          <div v-else-if="m.metadata?.sessionCard?.card === 'run-status' || m.metadata?.sessionCard?.card === 'node-status'" class="msg">
            <div class="bubble">
              <span class="badge" :class="m.metadata.sessionCard.card === 'node-status' && m.metadata.sessionCard.status === 'running' ? 'orange' : 'blue'">
                {{ cardSummary(m) }}
              </span>
            </div>
          </div>

          <!-- review 审核/表单卡片 -->
          <div v-else-if="m.metadata?.sessionCard?.card === 'review'" class="msg">
            <div class="bubble">
              <div class="card">
                <div class="card-title">等待操作 <span class="badge orange">{{ kindLabel(m.metadata.sessionCard.kind) }}</span></div>
                <RunInputForm v-if="m.metadata.sessionCard.kind === 'form'" ref="reviewFormRef" :inputs="schemaFields(m.metadata.sessionCard.schema) ?? []" @valid="v => (reviewValid = v)" />
                <div v-else class="review-hint">节点 {{ m.metadata.sessionCard.nodeId }} 等待操作</div>
                <div class="card-footer">
                  <el-button size="small" @click="decide(m, 'reject')">取消流程</el-button>
                  <el-button v-if="m.metadata.sessionCard.kind === 'form'" size="small" type="primary" :disabled="!reviewValid" @click="decideWithForm(m)">提交并继续</el-button>
                  <el-button v-else size="small" type="primary" @click="decide(m, 'approve')">批准</el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- report 结果 -->
          <div v-else-if="m.metadata?.sessionCard?.card === 'report'" class="msg">
            <div class="bubble">
              <div class="card">
                <div class="card-title">📄 {{ m.metadata.sessionCard.title }}</div>
                <div class="md-body">{{ m.metadata.sessionCard.markdown }}</div>
                <div class="card-footer">
                  <el-button size="small" @click="viewRun(m)">查看运行详情</el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- message 普通输出 -->
          <div v-else class="msg">
            <div class="bubble">{{ m.metadata?.sessionCard?.card === 'message' ? m.metadata.sessionCard.content : m.content }}</div>
          </div>
        </template>
        <div v-if="!loading && messages.length === 0" class="empty">暂无消息，请先在应用页开始会话</div>
      </div>

      <div class="chat-input">
        <el-input v-model="quickInput" placeholder="输入参数后再次运行（留空沿用上次）" @keyup.enter="quickStart" />
        <el-button type="primary" @click="quickStart">发送</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 应用会话页（片3b 骨架 + 片4 完整卡片）：start 表单 / 审核 / 结果 以消息流呈现
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import RunInputForm from '@/components/workflow/RunInputForm.vue'

const route = useRoute()
const router = useRouter()
const appId = computed(() => String(route.params.id))
const sessionId = computed(() => String(route.params.sessionId ?? ''))
const api = () => (window as never as { electronAPI: { app: any; appSession: any; workflow: any } }).electronAPI

const session = ref<any>(null)
const messages = ref<any[]>([])
const loading = ref(false)
const startValid = ref(false)
const reviewValid = ref(false)
const starting = ref(false)
const startFormRef = ref<any>()
const reviewFormRef = ref<any>()
const quickInput = ref('')
const msgBox = ref<HTMLElement>()

const cardSummary = (m: any): string => {
  const c = m.metadata?.sessionCard
  if (!c) return m.content || ''
  if (c.card === 'run-status') return `⚡ 运行中：${c.status}`
  if (c.card === 'node-status') return `节点 ${c.nodeId}：${c.status}`
  return ''
}
const kindLabel = (k: string): string => ({ form: '请填写表单', choose: '请选择', approve: '请批准', input: '请输入' })[k] ?? k
const schemaFields = (schema: any): any[] | undefined => (Array.isArray(schema?.fields) ? schema.fields : undefined)

async function loadMessages(): Promise<void> {
  loading.value = true
  try {
    const s = await api().appSession.get(sessionId.value)
    if (s.success) session.value = s.data
    const resp = await api().appSession.messages(sessionId.value)
    if (resp.success) messages.value = resp.data ?? []
    await nextTick()
    msgBox.value?.scrollTo({ top: msgBox.value.scrollHeight })
  } finally { loading.value = false }
}

async function startWith(inputs?: Record<string, unknown>): Promise<void> {
  starting.value = true
  try {
    const resp = await api().appSession.start({ sessionId: sessionId.value, inputs })
    if (!resp.success) {
      ElMessage.error(resp.error ?? '启动失败')
      return
    }
    await loadMessages()
  } finally { starting.value = false }
}

async function submitStart(): Promise<void> {
  const edited = startFormRef.value?.getValues?.() ?? {}
  await startWith(edited)
}

async function quickStart(): Promise<void> {
  const text = quickInput.value.trim()
  quickInput.value = ''
  await startWith(text ? { quickInput: text } : undefined)
}

async function decide(m: any, decision: 'approve' | 'reject'): Promise<void> {
  const c = m.metadata.sessionCard
  await api().appSession.review({
    sessionId: sessionId.value, nodeId: c.nodeId, decision,
  })
  await loadMessages()
}
async function decideWithForm(m: any): Promise<void> {
  const c = m.metadata.sessionCard
  const edited = reviewFormRef.value?.getValues?.() ?? {}
  await api().appSession.review({ sessionId: sessionId.value, nodeId: c.nodeId, decision: 'approve_with_changes', editedValues: edited })
  await loadMessages()
}

function viewRun(m: any): void {
  const runId = m.metadata?.sessionCard?.runId
  if (runId) router.push(`/workflow/run/${runId}`)
}

onMounted(loadMessages)
</script>

<style scoped>
.app-session { padding: 16px 26px; display: flex; flex-direction: column; height: 100%; }
.back-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.title { font-weight: 600; }
.chat-wrap { flex: 1; display: flex; flex-direction: column; background: var(--el-bg-color); border: 1px solid var(--el-border-color); border-radius: 10px; overflow: hidden; }
.chat-msgs { flex: 1; overflow-y: auto; padding: 18px; }
.msg { margin-bottom: 12px; display: flex; }
.bubble { max-width: 82%; }
.card { border: 1px solid var(--el-border-color); border-radius: 8px; padding: 14px; }
.card-title { font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; }
.badge.blue { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.badge.orange { background: #faecd8; color: #e6a23c; }
.card-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.review-hint { color: var(--el-text-color-secondary); font-size: 13px; }
.md-body { white-space: pre-wrap; font-size: 13px; line-height: 1.8; }
.empty { color: var(--el-text-color-secondary); text-align: center; padding: 40px 0; }
.chat-input { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--el-border-color); }
</style>