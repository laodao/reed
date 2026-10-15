<template>
  <!--
    VoiceDesignDialog · 声音设计对话框
    通过文本描述创建音色（无需音频样本）
  -->
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="540px"
    append-to-body
    :close-on-click-modal="false"
    destroy-on-close
    @update:model-value="onDialogVisibilityChange"
    @close="onDialogClose"
  >
    <!-- 表单阶段 -->
    <div v-if="phase === 'form'">
      <el-form label-width="92px" size="default">
        <el-form-item label="音色名称" required>
          <el-input
            v-model="form.name"
            placeholder="如：温柔女声 / 旁白男声"
            maxlength="40"
            clearable
          />
        </el-form-item>

        <el-form-item label="prefix" required>
          <el-input
            v-model="form.prefix"
            placeholder="≤10 个小写字母数字（如 gentle）"
            maxlength="10"
          />
          <div class="form-hint">
            DashScope 用此前缀生成 voice_id（如 cosyvoice-v3-plus-{prefix}-xxxxxxxx），
            同账号下唯一。仅支持小写字母和数字。
          </div>
          <div v-if="form.prefix && !prefixValid" class="form-error">
            ⚠ prefix 必须为 1-10 个小写字母或数字
          </div>
        </el-form-item>

        <el-form-item label="声音描述" required>
          <el-input
            v-model="form.voicePrompt"
            type="textarea"
            :rows="4"
            placeholder="描述声音特征，如：年轻女性，温柔甜美，语速适中，声音清澈..."
            maxlength="500"
            show-word-limit
          />
          <div class="form-hint">
            详细描述声音特征，包括性别、年龄、语气、语速等，最多 500 字。
          </div>
          <div v-if="form.voicePrompt && form.voicePrompt.trim().length > 500" class="form-error">
            ⚠ 声音描述不能超过 500 字
          </div>
        </el-form-item>

        <el-form-item label="目标模型">
          <el-select v-model="form.targetModel" placeholder="选择目标模型" class="full-width">
            <el-option label="CosyVoice v3.5 Plus（推荐）" value="cosyvoice-v3.5-plus" />
            <el-option label="CosyVoice v3 Plus" value="cosyvoice-v3-plus" />
          </el-select>
          <div class="form-hint">
            目标模型需与后续 TTS 合成时使用的模型一致。
          </div>
        </el-form-item>

        <p class="dialog-tip">
          💡 系统将根据您的描述生成音色（异步，约 1-2 分钟）。<br />
          训练完成后会自动出现在「已就绪」列表，可绑定到角色用于 TTS 渲染。
        </p>
      </el-form>
    </div>

    <!-- 训练中阶段 -->
    <div v-else-if="phase === 'busy'" class="busy-pane">
      <el-icon class="busy-icon is-loading" :size="40"><Loading /></el-icon>
      <div class="busy-title">⏳ 设计中…</div>
      <div class="busy-meta">已耗时 {{ formatElapsed(elapsedSec) }}</div>
      <div v-if="busyVoiceId" class="busy-voice-id">
        Voice ID:<br />
        <code>{{ busyVoiceId }}</code>
      </div>
      <div class="busy-hint">
        设计通常需要 1-2 分钟。可以关闭对话框 — 任务在后台继续。
      </div>
    </div>

    <!-- 完成阶段 -->
    <div v-else class="done-pane">
      <template v-if="doneStatus === 'ready'">
        <el-icon class="done-icon-ok" :size="40"><CircleCheckFilled /></el-icon>
        <div class="done-title">✅ 设计完成</div>
        <div class="done-meta">音色已就绪，可绑定到角色或试听。</div>
        <div class="done-actions">
          <el-button :loading="previewing" @click="onPreview">▶ 试听</el-button>
        </div>
      </template>
      <template v-else>
        <el-icon class="done-icon-fail" :size="40"><CircleCloseFilled /></el-icon>
        <div class="done-title">❌ 设计失败</div>
        <div class="done-meta">
          {{ doneError || '未知错误，请重试' }}
        </div>
      </template>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <template v-if="phase === 'form'">
          <el-button @click="closeDialog">取消</el-button>
          <el-button
            type="primary"
            :disabled="!canSubmit"
            :loading="submitting"
            @click="onSubmit"
          >
            开始设计
          </el-button>
        </template>
        <template v-else-if="phase === 'busy'">
          <el-button @click="closeDialog">关闭（后台继续）</el-button>
        </template>
        <template v-else>
          <el-button type="primary" @click="closeDialog">完成</el-button>
        </template>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  CircleCheckFilled,
  CircleCloseFilled,
  Loading,
} from '@element-plus/icons-vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  completed: [payload: { id: string; voiceId?: string }]
  failed: [payload: { id: string; errorMessage?: string }]
}>()

type Phase = 'form' | 'busy' | 'done'

const phase = ref<Phase>('form')
const submitting = ref(false)
const previewing = ref(false)

const form = ref({
  name: '',
  prefix: '',
  voicePrompt: '',
  targetModel: 'cosyvoice-v3.5-plus',
})

// 表单验证状态
const prefixValid = computed(() => /^[a-z0-9]{1,10}$/.test(form.value.prefix))
const nameValid = computed(() => form.value.name.trim().length > 0)
const voicePromptValid = computed(() => {
  const prompt = form.value.voicePrompt.trim()
  return prompt.length > 0 && prompt.length <= 500
})

// busy 状态
const busyVoiceId = ref<string>('')
const busyDesignedVoiceId = ref<string>('')
const busyStartedAt = ref<number>(0)
const elapsedSec = ref<number>(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

// done 状态
const doneStatus = ref<'ready' | 'failed'>('ready')
const doneError = ref<string>('')

const dialogTitle = computed(() => {
  if (phase.value === 'form') return '设计声音'
  if (phase.value === 'busy') return '设计进行中…'
  return doneStatus.value === 'ready' ? '设计完成' : '设计失败'
})

const canSubmit = computed(
  () => nameValid.value && prefixValid.value && voicePromptValid.value,
)

watch(
  () => props.modelValue,
  (v) => {
    if (v) resetState()
  },
)

onMounted(() => {
  // 可在此订阅完成/失败事件（如 scheduler 推送）
})

onUnmounted(() => {
  // 清理所有定时器
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

function resetState(): void {
  phase.value = 'form'
  submitting.value = false
  previewing.value = false
  form.value = { name: '', prefix: '', voicePrompt: '', targetModel: 'cosyvoice-v3.5-plus' }
  busyVoiceId.value = ''
  busyDesignedVoiceId.value = ''
  busyStartedAt.value = 0
  elapsedSec.value = 0
  doneStatus.value = 'ready'
  doneError.value = ''
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function onDialogVisibilityChange(v: boolean): void {
  emit('update:modelValue', v)
}

function onDialogClose(): void {}

function closeDialog(): void {
  emit('update:modelValue', false)
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return
  const api = (window as any).electronAPI?.voice
  if (!api?.designVoice) {
    ElMessage.error('voice.designVoice IPC 未就绪')
    return
  }

  submitting.value = true
  try {
    const resp = await api.designVoice({
      name: form.value.name.trim(),
      voicePrompt: form.value.voicePrompt.trim(),
      prefix: form.value.prefix.trim(),
      targetModel: form.value.targetModel,
    })
    if (!resp?.success || !resp.data) {
      ElMessage.error(resp?.error || '设计提交失败')
      return
    }
    busyDesignedVoiceId.value = resp.data.id
    busyVoiceId.value = resp.data.voiceId ?? ''

    // 部分情况 provider 立即返回 ready
    if (resp.data.status === 'ready') {
      onDesignDone('ready', resp.data.voiceId)
      return
    }
    if (resp.data.status === 'failed') {
      onDesignDone('failed', undefined, resp.data.errorMessage)
      return
    }

    // 切到 busy 态
    phase.value = 'busy'
    busyStartedAt.value = Date.now()
    elapsedSec.value = 0
    elapsedTimer = setInterval(() => {
      elapsedSec.value = Math.floor((Date.now() - busyStartedAt.value) / 1000)
    }, 1000)

    // 启动状态轮询（每 30 秒查询一次）
    pollTimer = setInterval(() => {
      pollDesignStatus()
    }, 30000)
    // 立即进行第一次轮询
    pollDesignStatus()
  } catch (e: any) {
    ElMessage.error(e?.message || '设计提交异常')
  } finally {
    submitting.value = false
  }
}

function onDesignDone(
  status: 'ready' | 'failed',
  voiceId?: string,
  errorMessage?: string,
): void {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  doneStatus.value = status
  doneError.value = errorMessage ?? ''
  phase.value = 'done'
  if (status === 'ready') {
    emit('completed', { id: busyDesignedVoiceId.value, voiceId })
  } else {
    emit('failed', { id: busyDesignedVoiceId.value, errorMessage })
  }
}

async function pollDesignStatus(): Promise<void> {
  const api = (window as any).electronAPI?.voice
  if (!api?.refreshDesignStatus || !busyDesignedVoiceId.value) return

  try {
    const resp = await api.refreshDesignStatus(busyDesignedVoiceId.value)
    if (!resp?.success || !resp.data) {
      console.warn('[VoiceDesignDialog] 查询状态失败:', resp?.error)
      return
    }

    const { status, voiceId, errorMessage } = resp.data
    if (status === 'ready') {
      onDesignDone('ready', voiceId)
    } else if (status === 'failed') {
      onDesignDone('failed', undefined, errorMessage)
    }
    // training 状态继续轮询
  } catch (e: any) {
    console.warn('[VoiceDesignDialog] 查询状态异常:', e?.message)
  }
}

async function onPreview(): Promise<void> {
  const api = (window as any).electronAPI?.voice
  if (!api?.previewDesignedVoice || !busyDesignedVoiceId.value) return
  previewing.value = true
  try {
    const resp = await api.previewDesignedVoice(busyDesignedVoiceId.value)
    if (!resp?.success || !resp.data?.audioPath) {
      ElMessage.error(resp?.error || '试听失败')
      return
    }
    const audio = new Audio(resp.data.audioPath)
    audio.play().catch((err: any) => {
      ElMessage.error(`音频播放失败：${err?.message ?? err}`)
    })
  } catch (e: any) {
    ElMessage.error(e?.message || '试听异常')
  } finally {
    previewing.value = false
  }
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<style scoped lang="scss">
.full-width {
  width: 100%;
}

.form-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
  margin-top: 4px;
}

.form-error {
  font-size: 12px;
  color: var(--el-color-danger);
  margin-top: 4px;
}

.dialog-tip {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
  padding-left: 92px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.busy-pane,
.done-pane {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px 12px;
}

.busy-icon {
  color: var(--el-color-primary);
}

.busy-title,
.done-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.busy-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.busy-voice-id {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  text-align: center;

  code {
    background: var(--el-fill-color-light);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
  }
}

.busy-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  max-width: 400px;
  margin-top: 6px;
  line-height: 1.6;
}

.done-icon-ok {
  color: var(--el-color-success);
}

.done-icon-fail {
  color: var(--el-color-danger);
}

.done-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  max-width: 400px;
  line-height: 1.6;
}

.done-actions {
  margin-top: 4px;
}
</style>