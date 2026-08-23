/**
 * 向导步骤状态机
 * @module renderer/composables/useWizardProgress
 *
 * 向导 6 步：创意起点 → 人物设计 → 世界设定(可选) → 故事线 → 故事大纲 → 逐章写作。
 * - 完成判定：数据存在性（checkStep 注入，各步骤 count IPC）
 * - 跳过：wizard_state.skipped 持久化（世界设定等可选步骤）
 * - 进度：按已完成/跳过步骤数均分 0-100
 * - stage 恢复：project.stage 记录最后到达的步骤
 * - 持久化：onStateChange 回调（由调用方写 lw_projects.stage/progress/wizard_state）
 */

import { ref, computed } from 'vue'

export interface WizardStepDef {
  key: string
  label: string
  /** 可选步骤：无数据时允许显式跳过 */
  optional?: boolean
}

/** 故事类向导步骤（顺序固定） */
export const STORY_WIZARD_STEPS: WizardStepDef[] = [
  { key: 'idea', label: '创意起点' },
  { key: 'characters', label: '人物设计' },
  { key: 'world', label: '世界设定', optional: true },
  { key: 'plot', label: '故事线' },
  { key: 'outline', label: '故事大纲' },
  { key: 'chapters', label: '逐章写作' },
]

export interface WizardState {
  stage: string
  skipped: string[]
  progress: number
}

export interface UseWizardProgressOptions {
  steps: WizardStepDef[]
  /** 步骤完成判定（数据存在性，如 lw_story_overviews.summary 非空） */
  checkStep: (key: string) => Promise<boolean>
  /** 初始阶段（project.stage；不匹配任一已知步骤时从第 0 步） */
  initialStage?: string
  /** 初始跳过列表（wizard_state.skipped） */
  initialSkipped?: string[]
  /** 状态变化回调（stage/skipped/progress 任一变化时触发，供持久化） */
  onStateChange?: (state: WizardState) => void
}

export interface UseWizardProgressReturn {
  steps: WizardStepDef[]
  currentIndex: ReturnType<typeof ref<number>>
  currentStep: ReturnType<typeof computed<WizardStepDef>>
  skipped: ReturnType<typeof ref<string[]>>
  /** 各步完成判定缓存（数据存在性） */
  doneCache: Map<string, boolean>
  progress: ReturnType<typeof computed<number>>
  canNext: ReturnType<typeof computed<boolean>>
  canPrev: ReturnType<typeof computed<boolean>>
  isStepDone: (key: string) => boolean
  isStepSkipped: (key: string) => boolean
  isStepActive: (key: string) => boolean
  goNext: () => Promise<void>
  goPrev: () => void
  goTo: (index: number) => void
  markSkipped: (key: string) => void
  refresh: () => Promise<void>
}

export function useWizardProgress(options: UseWizardProgressOptions): UseWizardProgressReturn {
  const { steps, checkStep, onStateChange } = options

  // 初始位置：project.stage 对应步骤；未知则第 0 步
  const initialIndex = Math.max(
    0,
    steps.findIndex(s => s.key === options.initialStage),
  )
  const currentIndex = ref(initialIndex)
  const skipped = ref<string[]>(options.initialSkipped ?? [])
  const doneCache = new Map<string, boolean>()

  const currentStep = computed(() => steps[currentIndex.value])

  const emitState = (): void => {
    onStateChange?.({
      stage: currentStep.value.key,
      skipped: [...skipped.value],
      progress: progress.value,
    })
  }

  /** 步骤是否完成（数据存在 或 已跳过） */
  function isStepDone(key: string): boolean {
    if (skipped.value.includes(key)) return true
    return doneCache.get(key) === true
  }

  function isStepSkipped(key: string): boolean {
    return skipped.value.includes(key)
  }

  function isStepActive(key: string): boolean {
    return key === currentStep.value.key
  }

  /** 已完成的步骤数（含跳过；当前步完成也算） */
  const completedCount = computed(() =>
    steps.filter(s => isStepDone(s.key)).length,
  )
  const progress = computed(() =>
    steps.length === 0 ? 0 : Math.round((completedCount.value / steps.length) * 100),
  )

  const canNext = computed(() => {
    if (currentIndex.value >= steps.length - 1) return false
    return isStepDone(currentStep.value.key)
  })

  const canPrev = computed(() => currentIndex.value > 0)

  /** 重新判定各步完成状态（数据存在性） */
  async function refresh(): Promise<void> {
    await Promise.all(
      steps.map(async s => {
        if (skipped.value.includes(s.key)) return
        doneCache.set(s.key, await checkStep(s.key))
      }),
    )
    emitState()
  }

  async function goNext(): Promise<void> {
    if (!canNext.value) return
    currentIndex.value++
    emitState()
  }

  function goPrev(): void {
    if (!canPrev.value) return
    currentIndex.value--
    emitState()
  }

  function goTo(index: number): void {
    if (index < 0 || index >= steps.length) return
    currentIndex.value = index
    emitState()
  }

  /** 显式跳过可选步骤（写入 skipped + 视为完成） */
  function markSkipped(key: string): void {
    if (!steps.some(s => s.key === key)) return
    if (!skipped.value.includes(key)) {
      skipped.value = [...skipped.value, key]
      emitState()
    }
  }

  return {
    steps,
    currentIndex,
    currentStep,
    skipped,
    doneCache,
    progress,
    canNext,
    canPrev,
    isStepDone,
    isStepSkipped,
    isStepActive,
    goNext,
    goPrev,
    goTo,
    markSkipped,
    refresh,
  }
}
