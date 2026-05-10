<template>
  <!--
    AIQuickModeWizard · AI 一键模式 wizard（spec 2026-05-09 ep-redesign §3.2 C3 · P-19）

    大众短剧用户母语入口：输入一句话剧本 → wizard 自动跑创建剧集 + AI 识别要素，
    跳到 ① 内容 stage 让用户确认识别结果继续后续 stage。

    流程:
      step 1（用户操作）：输入剧本概要 + 时长 + 风格
      step 2（自动）：createEpisode（uploaded 模式 + content=用户文本）
      step 3（自动）：identifyEntities（如项目 scriptModel 已配）
      step 4（完成）：emit done → 父组件跳转打开 workbench

    后续生成 script / storyboards / keyframes / videos 由用户在各 stage 主动触发，
    避免 wizard 跑得过长 + AI 调用失败时的复杂回滚。

    双母语:
      - 大众用户：跳过繁琐选择（outline/uploaded、章节绑定），输入一句话即开
      - 专业用户：每步可见 + 完成后跳到 ① 内容 stage 仍能逐 stage 介入
  -->
  <el-dialog
    v-model="visible"
    title="✨ AI 一键模式"
    width="640px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="onDialogClose"
  >
    <div class="wizard-body">
      <!-- 输入步骤 -->
      <section v-if="phase === 'input'" class="step-input">
        <div class="hint-row">
          输入一句话或一段简介，AI 会自动识别角色 / 地点 / 物品并跳到 ① 内容 stage 让你检查。
        </div>
        <el-form label-width="86px" size="small">
          <el-form-item label="剧集标题" required>
            <el-input v-model="form.title" placeholder="如：林夕与江湖" maxlength="80" />
          </el-form-item>
          <el-form-item label="一句话剧本" required>
            <el-input
              v-model="form.summary"
              type="textarea"
              :rows="6"
              :maxlength="2000"
              show-word-limit
              placeholder="输入剧本概要 — 至少 30 字，越具体效果越好&#10;例：少年阿白在江南水乡偶遇神秘女子林夕，因家传玉佩被卷入..."
            />
          </el-form-item>
          <el-form-item label="目标时长">
            <el-radio-group v-model="form.durationSec">
              <el-radio-button :value="30">30 秒</el-radio-button>
              <el-radio-button :value="60">60 秒</el-radio-button>
              <el-radio-button :value="90">90 秒</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="风格">
            <el-select
              v-model="form.styleAnchors"
              multiple
              filterable
              allow-create
              placeholder="选择或输入主流风格（多选）"
              style="width: 100%"
            >
              <el-option v-for="s in STYLE_PRESETS" :key="s" :label="s" :value="s" />
            </el-select>
          </el-form-item>
        </el-form>
      </section>

      <!-- 执行步骤进度 -->
      <section v-if="phase !== 'input'" class="step-progress">
        <el-progress :percentage="progressPct" :status="phase === 'failed' ? 'exception' : phase === 'done' ? 'success' : undefined" />
        <ul class="step-list">
          <li
            v-for="step in steps"
            :key="step.name"
            :class="['step-item', `step-${step.status}`]"
          >
            <span class="step-icon">{{ stepIcon(step.status) }}</span>
            <span class="step-label">{{ step.label }}</span>
            <span v-if="step.detail" class="step-detail">{{ step.detail }}</span>
          </li>
        </ul>
        <div v-if="phase === 'failed' && errorMsg" class="error-msg">
          ❌ {{ errorMsg }}
        </div>
        <div v-if="phase === 'done'" class="done-msg">
          ✅ 创建完成。点「打开剧集」进入 ① 内容 stage 检查识别结果，确认后继续 ② 资产生成。
        </div>
      </section>
    </div>

    <template #footer>
      <el-button v-if="phase === 'input'" @click="visible = false">取消</el-button>
      <el-button
        v-if="phase === 'input'"
        type="primary"
        :disabled="!canRun"
        @click="onRun"
      >✨ 开始</el-button>
      <el-button v-if="phase === 'running'" disabled>{{ runningLabel }}</el-button>
      <el-button v-if="phase === 'failed'" @click="onReset">重试</el-button>
      <el-button v-if="phase === 'failed'" type="primary" @click="onJump">仍然打开剧集</el-button>
      <el-button v-if="phase === 'done'" type="primary" @click="onJump">打开剧集</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { STYLE_PRESETS } from '@core/modules/episode-production/assets/constants/style-presets'
import { useEpisodeStore } from '@/stores/episode-production/episode.store'
import { useEpProjectStore } from '@/stores/episode-production/project.store'

interface ProjectLite {
  id: string
  name: string
  config?: any
}

const props = defineProps<{
  modelValue: boolean
  project: ProjectLite | null
  /** 下一集编号（父组件传入；createEpisode 必填） */
  nextEpisodeNumber: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  /** 创建完成 → 父组件跳转 workbench 打开剧集 */
  (e: 'done', payload: { episodeId: string }): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

type Phase = 'input' | 'running' | 'done' | 'failed'
const phase = ref<Phase>('input')
const progressPct = ref(0)
const errorMsg = ref('')
const createdEpisodeId = ref<string>('')

const form = reactive<{
  title: string
  summary: string
  durationSec: 30 | 60 | 90
  styleAnchors: string[]
}>({
  title: '',
  summary: '',
  durationSec: 60,
  styleAnchors: [],
})

interface StepRow {
  name: string
  label: string
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  detail?: string
}

const steps = ref<StepRow[]>([])

function stepIcon(s: StepRow['status']): string {
  return s === 'done' ? '✓' : s === 'running' ? '⟳' : s === 'failed' ? '✗' : s === 'skipped' ? '○' : '·'
}

const canRun = computed(
  () =>
    !!props.project?.id
    && form.title.trim().length > 0
    && form.summary.trim().length >= 30,
)

const runningLabel = computed(() => {
  const cur = steps.value.find((s) => s.status === 'running')
  return cur ? `${cur.label}...` : '处理中...'
})

const episodeStore = useEpisodeStore()
const projectStore = useEpProjectStore()

function setStep(name: string, status: StepRow['status'], detail?: string): void {
  const row = steps.value.find((s) => s.name === name)
  if (row) {
    row.status = status
    if (detail !== undefined) row.detail = detail
  }
}

async function onRun(): Promise<void> {
  if (!canRun.value || !props.project) return

  steps.value = [
    { name: 'create', label: '创建剧集', status: 'pending' },
    { name: 'identify', label: 'AI 识别角色 / 地点 / 物品', status: 'pending' },
  ]
  phase.value = 'running'
  progressPct.value = 5
  errorMsg.value = ''

  // step 1: createEpisode
  try {
    setStep('create', 'running')
    progressPct.value = 15
    const ep = await episodeStore.createEpisode(props.project.id, {
      sourceType: 'uploaded',
      uploadedContent: form.summary.trim(),
      episodeNumber: props.nextEpisodeNumber,
      title: form.title.trim(),
    })
    if (!ep) {
      throw new Error('创建剧集失败')
    }
    createdEpisodeId.value = ep.id
    setStep('create', 'done', `id ${ep.id.slice(0, 8)}...`)
    progressPct.value = 50
  } catch (e: any) {
    setStep('create', 'failed', e?.message ?? String(e))
    errorMsg.value = `创建剧集失败：${e?.message ?? e}`
    phase.value = 'failed'
    progressPct.value = 100
    return
  }

  // step 2: identifyEntities（依赖项目 scriptModel 配置）
  const sm = projectStore.currentProject?.config?.scriptModel ?? props.project.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    setStep('identify', 'skipped', '未配置剧本生成模型 — 请去 ① 内容 stage 手动「AI 识别要素」')
    progressPct.value = 100
    phase.value = 'done'
    return
  }
  try {
    setStep('identify', 'running')
    progressPct.value = 65
    const r = await episodeStore.identifyEntities(createdEpisodeId.value, sm.providerConfigId, sm.modelId)
    if (r) {
      setStep('identify', 'done', `${r.characters} 角色 / ${r.locations} 地点 / ${r.items} 物品`)
    } else {
      setStep('identify', 'skipped', '识别失败 — 进入 ① 内容 stage 重试')
    }
    progressPct.value = 100
    phase.value = 'done'
  } catch (e: any) {
    setStep('identify', 'failed', e?.message ?? String(e))
    progressPct.value = 100
    // 不 fail 整个 wizard — 已创建剧集，跳过去让用户继续
    phase.value = 'done'
  }
}

function onReset(): void {
  phase.value = 'input'
  errorMsg.value = ''
  progressPct.value = 0
  steps.value = []
}

function onJump(): void {
  if (createdEpisodeId.value) {
    emit('done', { episodeId: createdEpisodeId.value })
  }
  visible.value = false
}

function onDialogClose(): void {
  // dialog 关闭时若已创建剧集但用户没点跳转 → 也 emit done 让父组件刷新列表
  if (phase.value === 'done' && createdEpisodeId.value) {
    emit('done', { episodeId: createdEpisodeId.value })
  }
  // reset for next open
  phase.value = 'input'
  steps.value = []
  errorMsg.value = ''
  progressPct.value = 0
  createdEpisodeId.value = ''
  form.title = ''
  form.summary = ''
}
</script>

<style scoped lang="scss">
.wizard-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hint-row {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 10px 12px;
  border-radius: 6px;
  border-left: 3px solid var(--el-color-primary);
}

.step-progress {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
}

.step-pending {
  color: var(--el-text-color-placeholder);
}
.step-running {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}
.step-done {
  color: var(--el-color-success);
}
.step-skipped {
  color: var(--el-text-color-secondary);
  font-style: italic;
}
.step-failed {
  color: var(--el-color-danger);
}

.step-icon {
  width: 20px;
  text-align: center;
  font-weight: 700;
}

.step-detail {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.error-msg {
  color: var(--el-color-danger);
  font-size: 13px;
  background: var(--el-color-danger-light-9);
  padding: 10px 12px;
  border-radius: 4px;
}

.done-msg {
  color: var(--el-color-success);
  font-size: 13px;
  background: var(--el-color-success-light-9);
  padding: 10px 12px;
  border-radius: 4px;
}
</style>
