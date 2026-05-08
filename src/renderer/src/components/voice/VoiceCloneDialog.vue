<template>
  <!--
    VoiceCloneDialog · 声音复刻共用对话框

    设计文档：docs/superpowers/specs/2026-05-07-voice-cloning-design.md §8.2

    三态视图：
      1. form  - 表单填写（音色名称 / prefix / 上传样本 / 语种）
      2. busy  - 训练中（已提交，等 scheduler 推 voice:clone-completed/failed）
      3. done  - 完成或失败

    UseCase：
      - 'standalone'  - Voice.vue 「声音复刻」tab 用 ；完成后关闭对话框
      - 'asset-stage' - 资产页 + 复刻新音色 用；完成后 emit('completed') 让父组件 reload

    客户端预校验：
      - 时长 10-20s（用 HTML5 <audio> metadata 解析）
      - 单声道（用 Web Audio API decodeAudioData 取 numberOfChannels）
      - 文件格式 wav/mp3/m4a；大小 ≤ 10MB
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
    <!-- ========== 阶段 1：表单 ========== -->
    <div v-if="phase === 'form'">
      <el-form label-width="92px" size="default">
        <el-form-item label="音色名称" required>
          <el-input
            v-model="form.name"
            placeholder="如：作者本人 / 旁白男声"
            maxlength="40"
            clearable
          />
        </el-form-item>

        <el-form-item label="prefix" required>
          <el-input
            v-model="form.prefix"
            placeholder="≤10 个小写字母数字（如 myself）"
            maxlength="10"
          />
          <div class="form-hint">
            DashScope 用此前缀生成 voice_id（如 cosyvoice-v3-plus-{prefix}-xxxxxxxx），
            同账号下唯一。
          </div>
        </el-form-item>

        <el-form-item label="样本音频" required>
          <div
            class="upload-box"
            :class="{ 'has-file': !!sampleFileMeta }"
            @click="triggerPickFile"
          >
            <input
              ref="fileInputRef"
              type="file"
              accept="audio/wav,audio/mpeg,audio/mp4,audio/m4a,audio/x-m4a,.wav,.mp3,.m4a"
              class="hidden-input"
              @change="onFilePicked"
            />
            <template v-if="!sampleFileMeta">
              <el-icon :size="32"><UploadFilled /></el-icon>
              <div class="upload-primary">点击选择音频文件</div>
              <div class="upload-secondary">
                wav / mp3 / m4a · 10-20 秒 · 单声道 · ≤10MB
              </div>
            </template>
            <template v-else>
              <div class="file-meta">
                <span class="file-name">📄 {{ sampleFileMeta.fileName }}</span>
                <span class="file-stats">
                  {{ sampleFileMeta.durationSec.toFixed(1) }}s ·
                  {{ formatSize(sampleFileMeta.sizeBytes) }} ·
                  {{ sampleFileMeta.channels === 1 ? '单声道 ✓' : `${sampleFileMeta.channels} 声道 ⚠` }}
                </span>
                <el-button size="small" text @click.stop="resetFile">重选</el-button>
              </div>
            </template>
          </div>
          <div v-if="sampleValidationError" class="form-error">
            ⚠ {{ sampleValidationError }}
          </div>
        </el-form-item>

        <el-form-item label="语种">
          <el-select v-model="form.language" placeholder="选择语种" class="full-width">
            <el-option label="中文" value="zh" />
            <el-option label="英文" value="en" />
            <el-option label="日文" value="ja" />
            <el-option label="韩文" value="ko" />
            <el-option label="法文" value="fr" />
            <el-option label="德文" value="de" />
          </el-select>
        </el-form-item>

        <p class="dialog-tip">
          💡 系统将上传样本到 DashScope 并启动复刻任务（异步，约 1-2 分钟）。<br />
          训练完成后会自动出现在「已就绪」列表，可绑定到角色用于 TTS 渲染。
        </p>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeDialog">取消</el-button>
          <el-button
            type="primary"
            :disabled="!canSubmit"
            :loading="submitting"
            @click="onSubmit"
          >
            开始复刻
          </el-button>
        </span>
      </template>
    </div>

    <!-- ========== 阶段 2：训练中 ========== -->
    <div v-else-if="phase === 'busy'" class="busy-pane">
      <el-icon class="busy-icon is-loading" :size="40"><Loading /></el-icon>
      <div class="busy-title">⏳ 训练中…</div>
      <div class="busy-meta">已耗时 {{ formatElapsed(elapsedSec) }}</div>
      <div v-if="busyVoiceId" class="busy-voice-id">
        Voice ID:<br />
        <code>{{ busyVoiceId }}</code>
      </div>
      <div class="busy-hint">
        训练通常需要 1-2 分钟。可以关闭对话框 — 训练在后台继续，完成后会通知您。
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeDialog">关闭（后台继续）</el-button>
        </span>
      </template>
    </div>

    <!-- ========== 阶段 3：完成 / 失败 ========== -->
    <div v-else class="done-pane">
      <template v-if="doneStatus === 'ready'">
        <el-icon class="done-icon-ok" :size="40"><CircleCheckFilled /></el-icon>
        <div class="done-title">✅ 复刻完成</div>
        <div class="done-meta">音色已就绪，可绑定到角色或试听。</div>
        <div class="done-actions">
          <el-button :loading="previewing" @click="onPreview">▶ 试听</el-button>
        </div>
      </template>
      <template v-else>
        <el-icon class="done-icon-fail" :size="40"><CircleCloseFilled /></el-icon>
        <div class="done-title">❌ 复刻失败</div>
        <div class="done-meta">
          {{ doneError || '未知错误，请重试' }}
        </div>
      </template>
      <template #footer>
        <span class="dialog-footer">
          <el-button type="primary" @click="closeDialog">完成</el-button>
        </span>
      </template>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * VoiceCloneDialog — 共用对话框组件
 *
 * 子集 IPC：
 *   - electronAPI.voice.clone({name, samplePath, sampleDurationSec, prefix, language})
 *   - electronAPI.voice.preview(id)
 *   - electronAPI.voice.onCloneCompleted(callback)
 *   - electronAPI.voice.onCloneFailed(callback)
 *
 * Web 端通过 channel-map 自动转 HTTP；PC 端走 ipcRenderer。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  CircleCheckFilled,
  CircleCloseFilled,
  Loading,
  UploadFilled,
} from '@element-plus/icons-vue'

const props = defineProps<{
  modelValue: boolean
  /** 'standalone' = Voice.vue tab；'asset-stage' = 资产页按钮 */
  useCase?: 'standalone' | 'asset-stage'
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  /** 复刻成功（status=ready）— 父组件用于 reload */
  completed: [payload: { id: string; voiceId?: string }]
  /** 复刻失败 — 父组件可统计 */
  failed: [payload: { id: string; errorMessage?: string }]
}>()

type Phase = 'form' | 'busy' | 'done'

const phase = ref<Phase>('form')
const submitting = ref(false)
const previewing = ref(false)

const form = ref({
  name: '',
  prefix: '',
  language: 'zh' as string,
})

const sampleFileMeta = ref<{
  filePath: string
  fileName: string
  sizeBytes: number
  durationSec: number
  channels: number
} | null>(null)

const sampleValidationError = ref<string>('')

const fileInputRef = ref<HTMLInputElement | null>(null)

// busy 状态
const busyVoiceId = ref<string>('')
const busyClonedVoiceId = ref<string>('')
const busyStartedAt = ref<number>(0)
const elapsedSec = ref<number>(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null

// done 状态
const doneStatus = ref<'ready' | 'failed'>('ready')
const doneError = ref<string>('')

// 事件订阅清理
let unsubCompleted: (() => void) | null = null
let unsubFailed: (() => void) | null = null

const dialogTitle = computed(() => {
  if (phase.value === 'form') return '复刻声音'
  if (phase.value === 'busy') return '复刻进行中…'
  return doneStatus.value === 'ready' ? '复刻完成' : '复刻失败'
})

const canSubmit = computed(
  () =>
    form.value.name.trim().length > 0 &&
    /^[a-z0-9]{1,10}$/.test(form.value.prefix) &&
    !!sampleFileMeta.value &&
    !sampleValidationError.value,
)

watch(
  () => props.modelValue,
  (v) => {
    if (v) resetState()
    else cleanupSubscriptions()
  },
)

onMounted(() => {
  // 订阅复刻完成 / 失败事件（无论 dialog 是否打开都监听 — 关闭后再开看不到事件）
  // 取消订阅放在 unmounted 和 dialog 关闭时
  setupSubscriptions()
})

onBeforeUnmount(() => {
  cleanupSubscriptions()
  if (elapsedTimer) clearInterval(elapsedTimer)
})

function setupSubscriptions(): void {
  const api = (window as any).electronAPI?.voice
  if (!api) return
  if (typeof api.onCloneCompleted === 'function') {
    unsubCompleted = api.onCloneCompleted((data: any) => {
      if (busyClonedVoiceId.value && data?.id === busyClonedVoiceId.value) {
        onTrainingDone('ready', data?.voiceId)
      }
    })
  }
  if (typeof api.onCloneFailed === 'function') {
    unsubFailed = api.onCloneFailed((data: any) => {
      if (busyClonedVoiceId.value && data?.id === busyClonedVoiceId.value) {
        onTrainingDone('failed', undefined, data?.errorMessage)
      }
    })
  }
}

function cleanupSubscriptions(): void {
  if (unsubCompleted) {
    unsubCompleted()
    unsubCompleted = null
  }
  if (unsubFailed) {
    unsubFailed()
    unsubFailed = null
  }
}

function resetState(): void {
  phase.value = 'form'
  submitting.value = false
  previewing.value = false
  form.value = { name: '', prefix: '', language: 'zh' }
  sampleFileMeta.value = null
  sampleValidationError.value = ''
  busyVoiceId.value = ''
  busyClonedVoiceId.value = ''
  busyStartedAt.value = 0
  elapsedSec.value = 0
  doneStatus.value = 'ready'
  doneError.value = ''
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
  if (!unsubCompleted && !unsubFailed) setupSubscriptions()
}

function onDialogVisibilityChange(v: boolean): void {
  emit('update:modelValue', v)
}

function onDialogClose(): void {
  // 仅 form / done 阶段允许关闭重置；busy 阶段也允许关 — 任务后台继续
}

function closeDialog(): void {
  emit('update:modelValue', false)
}

function triggerPickFile(): void {
  fileInputRef.value?.click()
}

function resetFile(): void {
  sampleFileMeta.value = null
  sampleValidationError.value = ''
  if (fileInputRef.value) fileInputRef.value.value = ''
}

async function onFilePicked(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  sampleValidationError.value = ''

  // 格式 / 大小预校验
  const okExt = /\.(wav|mp3|m4a)$/i.test(file.name)
  if (!okExt) {
    sampleValidationError.value = '仅支持 wav / mp3 / m4a'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    sampleValidationError.value = '文件超过 10MB'
    return
  }

  // 时长 + 单声道校验
  const meta = await analyzeAudio(file).catch((err: any) => {
    sampleValidationError.value = `音频解析失败：${err?.message ?? err}`
    return null
  })
  if (!meta) return

  if (meta.durationSec < 10 || meta.durationSec > 20) {
    sampleValidationError.value = `音频时长 ${meta.durationSec.toFixed(1)}s，需在 10-20 秒`
    // 但仍允许用户看到 meta，便于他重选
  }
  if (meta.channels !== 1) {
    sampleValidationError.value = `音频为 ${meta.channels} 声道，DashScope 复刻要求单声道`
  }

  // 拿到本地绝对路径 — 在 Electron 中 file 有 .path；Web 中无
  const filePath = (file as any).path as string | undefined
  if (!filePath) {
    sampleValidationError.value =
      'Web 模式当前不支持本地音频上传 — 请用桌面版（PC）'
    return
  }

  sampleFileMeta.value = {
    filePath,
    fileName: file.name,
    sizeBytes: file.size,
    durationSec: meta.durationSec,
    channels: meta.channels,
  }
}

/**
 * 用 Web Audio API 解析音频时长 + 通道数。
 * 失败抛错（如无法 decode）。
 */
async function analyzeAudio(
  file: File,
): Promise<{ durationSec: number; channels: number }> {
  const arrayBuf = await file.arrayBuffer()
  const Ctx =
    (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctx) {
    throw new Error('当前浏览器不支持 Web Audio API')
  }
  const ctx = new Ctx()
  try {
    const audio = await ctx.decodeAudioData(arrayBuf.slice(0))
    return {
      durationSec: audio.duration,
      channels: audio.numberOfChannels,
    }
  } finally {
    if (typeof ctx.close === 'function') void ctx.close()
  }
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value || !sampleFileMeta.value) return
  const api = (window as any).electronAPI?.voice
  if (!api?.clone) {
    ElMessage.error('voice.clone IPC 未就绪')
    return
  }

  submitting.value = true
  try {
    const resp = await api.clone({
      name: form.value.name.trim(),
      samplePath: sampleFileMeta.value.filePath,
      sampleDurationSec: sampleFileMeta.value.durationSec,
      prefix: form.value.prefix.trim(),
      language: form.value.language,
    })
    if (!resp?.success || !resp.data) {
      ElMessage.error(resp?.error || '复刻提交失败')
      return
    }
    busyClonedVoiceId.value = resp.data.id
    busyVoiceId.value = resp.data.voiceId ?? ''

    // 部分情况 provider 立即返回 ready（罕见）— 直接跳完成
    if (resp.data.status === 'ready') {
      onTrainingDone('ready', resp.data.voiceId)
      return
    }
    if (resp.data.status === 'failed') {
      onTrainingDone('failed', undefined, resp.data.errorMessage)
      return
    }

    // 切到 busy 态，等 scheduler 推事件
    phase.value = 'busy'
    busyStartedAt.value = Date.now()
    elapsedSec.value = 0
    elapsedTimer = setInterval(() => {
      elapsedSec.value = Math.floor((Date.now() - busyStartedAt.value) / 1000)
    }, 1000)
  } catch (e: any) {
    ElMessage.error(e?.message || '复刻提交异常')
  } finally {
    submitting.value = false
  }
}

function onTrainingDone(
  status: 'ready' | 'failed',
  voiceId?: string,
  errorMessage?: string,
): void {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
  doneStatus.value = status
  doneError.value = errorMessage ?? ''
  phase.value = 'done'
  if (status === 'ready') {
    emit('completed', { id: busyClonedVoiceId.value, voiceId })
  } else {
    emit('failed', { id: busyClonedVoiceId.value, errorMessage })
  }
}

async function onPreview(): Promise<void> {
  const api = (window as any).electronAPI?.voice
  if (!api?.preview || !busyClonedVoiceId.value) return
  previewing.value = true
  try {
    const resp = await api.preview(busyClonedVoiceId.value)
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
  margin-top: 6px;
}

.upload-box {
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  padding: 18px 14px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  background: var(--el-fill-color-light);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;

  &:hover {
    border-color: var(--el-color-primary);
    background: var(--el-fill-color);
  }

  &.has-file {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary);
  }
}

.hidden-input {
  display: none;
}

.upload-primary {
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.upload-secondary {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.file-meta {
  width: 100%;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  text-align: left;
}

.file-name {
  font-weight: 500;
  font-size: 13px;
  color: var(--el-text-color-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-stats {
  font-size: 11px;
  color: var(--el-text-color-secondary);
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
