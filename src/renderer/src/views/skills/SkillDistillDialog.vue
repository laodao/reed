<template>
  <el-dialog v-model="visible" title="AI 蒸馏 · 从内容生成技能" width="720px" top="6vh" :close-on-click-modal="task?.status !== 'running'" @closed="onClosed">
    <!-- 阶段一：输入 -->
    <template v-if="phase === 'input'">
      <el-form label-width="90px" label-position="left">
        <el-form-item label="内容来源">
          <el-radio-group v-model="form.source">
            <el-radio-button value="text">粘贴文本</el-radio-button>
            <el-radio-button value="file">本地文件</el-radio-button>
            <el-radio-button value="url">网页链接</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.source === 'text'" label="源内容">
          <el-input v-model="form.text" type="textarea" :rows="10" placeholder="粘贴要蒸馏的内容：书籍章节、教程、方法论文章、写作样本、访谈/聊天记录…（建议 ≥1000 字）" />
          <div class="hint">{{ textChars }} 字{{ textChars < 1000 ? '（内容偏短，蒸馏出的技能会薄）' : '' }}</div>
        </el-form-item>
        <el-form-item v-else-if="form.source === 'file'" label="本地文件">
          <el-button @click="pickFile">选择 .md / .txt 文件</el-button>
          <span v-if="fileName" class="file-name">{{ fileName }}（{{ textChars }} 字）</span>
        </el-form-item>
        <el-form-item v-else label="网页链接">
          <el-input v-model="form.url" placeholder="https://…（文章/教程/公众号网页，自动抓正文）" />
        </el-form-item>
        <el-form-item label="蒸馏目标">
          <el-select v-model="form.contentType" style="width: 260px">
            <el-option label="自动判断" value="auto" />
            <el-option label="方法论 / 知识（框架·决策规则·反模式）" value="methodology" />
            <el-option label="写作风格（结构·句式·语气套路）" value="style" />
            <el-option label="人物人设（表达·决策·心智模型）" value="persona" />
          </el-select>
          <div class="hint">方法论→知识提炼类技能；写作风格→可模仿的风格卡；人设→可对话的人格画像</div>
        </el-form-item>
        <el-form-item label="蒸馏重点">
          <el-input v-model="form.hints" type="textarea" :rows="2" placeholder="可选：技能用途、侧重维度，如「只要决策规则，不要案例」「用于写公众号推文」" />
        </el-form-item>
      </el-form>
    </template>

    <!-- 阶段二：进度 -->
    <template v-else-if="phase === 'running'">
      <el-steps :active="stepActive" align-center finish-status="success" class="steps">
        <el-step title="准备" />
        <el-step title="判型" />
        <el-step title="阅读笔记" />
        <el-step title="组装" />
        <el-step title="审计修复" />
        <el-step title="入库" />
      </el-steps>
      <el-progress :percentage="task?.progress ?? 0" :stroke-width="10" class="progress" />
      <div class="log">
        <div v-for="(l, i) in logs" :key="i" class="log-line" :class="{ latest: i === logs.length - 1 }">{{ l }}</div>
      </div>
    </template>

    <!-- 阶段三：结果 -->
    <template v-else>
      <template v-if="task?.status === 'done'">
        <el-result icon="success" :title="`已生成技能「${task.resultSkillName}」`" :sub-title="`技能 ID：${task.resultSkillId}`">
          <template #extra>
            <div class="result-stats">
              <el-tag>源内容 {{ task.stats.sourceChars }} 字 / {{ task.stats.chunksTotal }} 块</el-tag>
              <el-tag type="info">LLM 调用 {{ task.stats.llmCalls }} 次</el-tag>
              <el-tag v-if="task.detectedType" type="warning">类型：{{ typeLabel(task.detectedType) }}</el-tag>
              <el-tag v-if="task.stats.repairPasses > 0" type="danger">修复 {{ task.stats.repairPasses }} 轮</el-tag>
            </div>
            <div v-if="warnIssues.length" class="warn-list">
              <div class="warn-title">审计提示（warn，不影响使用）：</div>
              <div v-for="(w, i) in warnIssues" :key="i" class="warn-item">· {{ w.message }}</div>
            </div>
          </template>
        </el-result>
      </template>
      <template v-else>
        <el-result icon="error" title="蒸馏失败" :sub-title="task?.error ?? '未知错误'">
          <template #extra>
            <div v-if="errorIssues.length" class="warn-list">
              <div class="warn-title">未通过的审计项：</div>
              <div v-for="(w, i) in errorIssues" :key="i" class="warn-item">· {{ w.message }}</div>
            </div>
          </template>
        </el-result>
      </template>
    </template>

    <template #footer>
      <template v-if="phase === 'input'">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :disabled="!canSubmit" @click="submit">开始蒸馏</el-button>
      </template>
      <template v-else-if="phase === 'running'">
        <el-button @click="cancel">取消任务</el-button>
      </template>
      <template v-else>
        <el-button v-if="task?.status === 'done'" type="primary" @click="openResult">查看技能</el-button>
        <el-button @click="reset">{{ task?.status === 'done' ? '再蒸一个' : '返回修改' }}</el-button>
        <el-button @click="visible = false">关闭</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * AI 蒸馏对话框（技能库入口）：输入（粘贴/文件/URL + 蒸馏目标）→ 进度轮询 → 结果。
 * 自包含轮询（1.5s），与 ic store 的 startPolling 同思路但不落 store——对话框私有状态。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { SkillDistillRequest, SkillDistillTaskSnapshot } from '@shared/types/skill-distill.types'

type Phase = 'input' | 'running' | 'result'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'created', skillId: string): void }>()

const api = () => (window as never as { electronAPI: { skills: any; file: any } }).electronAPI

const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const phase = ref<Phase>('input')
const form = ref({ source: 'text' as 'text' | 'file' | 'url', text: '', url: '', contentType: 'auto', hints: '' })
const fileName = ref('')
const taskId = ref('')
const task = ref<SkillDistillTaskSnapshot | null>(null)
const logs = ref<string[]>([])
let pollTimer: ReturnType<typeof setInterval> | null = null

const textChars = computed(() => form.value.text.length)
const canSubmit = computed(() => {
  if (form.value.source === 'text') return textChars.value >= 50
  if (form.value.source === 'file') return textChars.value >= 50
  return /^https?:\/\//.test(form.value.url.trim())
})

const errorIssues = computed(() => (task.value?.issues ?? []).filter(i => i.level === 'error'))
const warnIssues = computed(() => (task.value?.issues ?? []).filter(i => i.level === 'warn'))

const STEP_OF_STAGE: Record<string, number> = {
  queued: 0, preparing: 0, detecting: 1, noting: 2, assembling: 3, auditing: 4, repairing: 4, writing: 5,
}
const stepActive = computed(() => {
  if (task.value?.status === 'done') return 6
  return STEP_OF_STAGE[task.value?.stage ?? 'queued'] ?? 0
})

function typeLabel(t: string): string {
  return { methodology: '方法论/知识', style: '写作风格', persona: '人物人设' }[t] ?? t
}

function pushLog(message: string): void {
  if (!message) return
  const last = logs.value[logs.value.length - 1]
  if (last === message) return
  logs.value.push(message)
  if (logs.value.length > 60) logs.value.splice(0, logs.value.length - 60)
}

async function pickFile(): Promise<void> {
  try {
    const picked = await api().file.openDialog({ filters: [{ name: '文本内容', extensions: ['md', 'txt', 'markdown'] }] })
    const path = picked?.filePaths?.[0] ?? picked?.path ?? null
    if (!path) return
    const read = await api().file.readTextFile({ path })
    if (!read?.success || !read.data) {
      ElMessage.error(`读取失败：${read?.error ?? '空文件'}`)
      return
    }
    form.value.text = read.data
    fileName.value = path.split(/[\\/]/).pop() ?? path
  } catch (e: any) {
    ElMessage.error(`读取失败：${e?.message ?? e}`)
  }
}

async function submit(): Promise<void> {
  const request: SkillDistillRequest = {
    inputType: form.value.source === 'url' ? 'url' : 'text',
    text: form.value.source === 'url' ? undefined : form.value.text,
    url: form.value.source === 'url' ? form.value.url.trim() : undefined,
    contentType: form.value.contentType as SkillDistillRequest['contentType'],
    hints: form.value.hints.trim() || undefined,
  }
  try {
    const r = await api().skills.distillRun(request)
    if (!r?.success || !r.data?.id) {
      ElMessage.error(`发起失败：${r?.error ?? '未知错误'}`)
      return
    }
    taskId.value = r.data.id
    task.value = r.data
    logs.value = []
    pushLog('任务已发起')
    phase.value = 'running'
    startPolling()
  } catch (e: any) {
    ElMessage.error(`发起失败：${e?.message ?? e}`)
  }
}

function startPolling(): void {
  stopPolling()
  pollTimer = setInterval(async () => {
    if (!taskId.value) return
    try {
      const r = await api().skills.distillStatus(taskId.value)
      const snap = r?.data as SkillDistillTaskSnapshot | null
      if (!snap) return
      pushLog(snap.message)
      const finished = snap.status !== 'running'
      task.value = snap
      if (finished) {
        stopPolling()
        phase.value = 'result'
        if (snap.status === 'done' && snap.resultSkillId) emit('created', snap.resultSkillId)
      }
    } catch {
      /* 单次轮询失败静默（下一轮重试） */
    }
  }, 1500)
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function cancel(): Promise<void> {
  if (!taskId.value) return
  try {
    await api().skills.distillCancel(taskId.value)
    ElMessage.info('已请求取消（当前模型调用返回后生效）')
  } catch (e: any) {
    ElMessage.error(`取消失败：${e?.message ?? e}`)
  }
}

function reset(): void {
  phase.value = 'input'
  task.value = null
  taskId.value = ''
  logs.value = []
}

function openResult(): void {
  if (task.value?.resultSkillId) emit('created', task.value.resultSkillId)
  visible.value = false
}

function onClosed(): void {
  stopPolling()
  if (phase.value === 'running') {
    // 对话框被直接关掉：任务继续在后台跑，提示用户可在下次打开时看不到（v1 无任务列表 UI）
    if (task.value?.status === 'running') ElMessage.info('蒸馏任务仍在后台进行，产物完成后会出现在技能库')
  }
  reset()
}

watch(
  () => props.modelValue,
  v => {
    if (v && phase.value === 'running' && taskId.value) startPolling()
  },
)
</script>

<style scoped>
.hint { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; width: 100%; }
.file-name { margin-left: 10px; font-size: 13px; color: var(--el-text-color-regular); }
.steps { margin: 12px 0 20px; }
.progress { margin-bottom: 16px; }
.log { background: var(--el-fill-color-lighter); border-radius: 8px; padding: 10px 14px; max-height: 220px; overflow-y: auto; font-size: 12px; line-height: 1.9; }
.log-line { color: var(--el-text-color-secondary); }
.log-line.latest { color: var(--el-text-color-primary); font-weight: 600; }
.result-stats { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-bottom: 12px; }
.warn-list { text-align: left; background: var(--el-fill-color-lighter); border-radius: 8px; padding: 10px 14px; font-size: 12px; max-height: 160px; overflow-y: auto; }
.warn-title { font-weight: 600; margin-bottom: 4px; }
.warn-item { color: var(--el-text-color-regular); line-height: 1.8; }
</style>
