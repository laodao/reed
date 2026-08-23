/**
 * useWizardProgress 向导步骤状态机 单测
 * 覆盖：初始 stage 定位、前进/后退、完成判定（数据存在性）、跳过、进度计算、状态持久化回调。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  STORY_WIZARD_STEPS,
  useWizardProgress,
  type WizardStepDef,
} from '../../../../src/renderer/src/composables/useWizardProgress'

function makeDoneSet(doneKeys: string[]) {
  const set = new Set(doneKeys)
  return vi.fn(async (key: string) => set.has(key))
}

describe('useWizardProgress 向导状态机', () => {
  let onStateChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onStateChange = vi.fn()
  })

  it('初始 stage 定位到最后到达的步骤', () => {
    const w = useWizardProgress({ steps: STORY_WIZARD_STEPS, checkStep: makeDoneSet([]), initialStage: 'plot' })
    expect(w.currentStep.value.key).toBe('plot')
    expect(w.currentIndex.value).toBe(3)
  })

  it('未知 stage 回退到第 0 步', () => {
    const w = useWizardProgress({ steps: STORY_WIZARD_STEPS, checkStep: makeDoneSet([]), initialStage: 'unknown' })
    expect(w.currentStep.value.key).toBe('idea')
    expect(w.currentIndex.value).toBe(0)
  })

  it('goNext / goPrev 线性移动（受"本步完成"门控）', async () => {
    const w = useWizardProgress({ steps: STORY_WIZARD_STEPS, checkStep: makeDoneSet(['idea']) })
    await w.refresh() // idea 完成
    await w.goNext() // 允许前进到 characters
    expect(w.currentStep.value.key).toBe('characters')
    // characters 未完成 → 再前进被门控
    await w.goNext()
    expect(w.currentStep.value.key).toBe('characters')
    w.goPrev()
    expect(w.currentStep.value.key).toBe('idea')
  })

  it('goNext 后 stage 持久化（onStateChange 回调）', async () => {
    const w = useWizardProgress({ steps: STORY_WIZARD_STEPS, checkStep: makeDoneSet(['idea']), onStateChange })
    await w.refresh()
    await w.goNext()
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ stage: 'characters' }))
  })

  it('canNext：当前步完成时可用，未完成时不可用', async () => {
    // idea 有数据 → 完成
    const w = useWizardProgress({ steps: STORY_WIZARD_STEPS, checkStep: makeDoneSet(['idea']) })
    await w.refresh()
    expect(w.canNext.value).toBe(true)
    await w.goNext() // 到 characters（无数据）
    expect(w.canNext.value).toBe(false)
  })

  it('markSkipped 记录跳过并持久化，该步视为完成', async () => {
    const w = useWizardProgress({
      steps: STORY_WIZARD_STEPS,
      checkStep: makeDoneSet(['idea', 'characters']),
      onStateChange,
    })
    await w.refresh()
    await w.goNext() // 到 characters
    await w.goNext() // 到 world（可选）
    w.markSkipped('world')
    expect(w.isStepSkipped('world')).toBe(true)
    expect(w.isStepDone('world')).toBe(true)
    expect(w.skipped.value).toContain('world')
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ skipped: ['world'] }),
    )
  })

  it('初始 skipped 列表生效（world 已跳过 → 视为完成）', async () => {
    const w = useWizardProgress({
      steps: STORY_WIZARD_STEPS,
      checkStep: makeDoneSet([]),
      initialSkipped: ['world'],
    })
    expect(w.isStepDone('world')).toBe(true)
  })

  it('progress 按已完成步骤数均分计算', async () => {
    const w = useWizardProgress({
      steps: STORY_WIZARD_STEPS,
      checkStep: makeDoneSet(['idea', 'characters']),
    })
    await w.refresh()
    // idea + characters 完成 = 2/6
    expect(w.progress.value).toBe(33)
  })

  it('optional 步骤标记（world 可选，其余必选）', () => {
    expect(STORY_WIZARD_STEPS.find(s => s.key === 'world')?.optional).toBe(true)
    expect(STORY_WIZARD_STEPS.find(s => s.key === 'idea')?.optional).toBeUndefined()
  })

  it('steps 顺序固定为 创意→人物→世界→故事线→大纲→章节', () => {
    expect(STORY_WIZARD_STEPS.map(s => s.key)).toEqual([
      'idea', 'characters', 'world', 'plot', 'outline', 'chapters',
    ])
  })

  it('goTo 跳到指定步骤（仅已完成/跳过步骤可回跳，未完成的不阻止但记录）', async () => {
    const w = useWizardProgress({ steps: STORY_WIZARD_STEPS, checkStep: makeDoneSet(['idea']) })
    await w.refresh()
    w.goTo(5)
    expect(w.currentStep.value.key).toBe('chapters')
  })

  it('自定义步骤列表（评论类 3 步场景）', async () => {
    const commentSteps: WizardStepDef[] = [
      { key: 'topic', label: '主题素材' },
      { key: 'outline', label: '大纲设计' },
      { key: 'chapters', label: '章节写作' },
    ]
    const w = useWizardProgress({ steps: commentSteps, checkStep: makeDoneSet([]), initialStage: 'outline' })
    expect(w.currentStep.value.key).toBe('outline')
    expect(w.steps.length).toBe(3)
  })
})
