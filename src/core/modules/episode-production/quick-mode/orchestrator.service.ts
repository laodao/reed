/**
 * QuickModeOrchestrator · AI 一键模式编排（spec 2026-05-09 ep-redesign §3.2 C3 · P-19）
 *
 * 用户输入一句话剧本 → 自动跑完 6 stage 出片，替代繁琐的逐 stage 操作。
 *
 * 设计为依赖注入：构造时传 7 个 step 函数（每步对应现有 service 调用），
 * service 本身只负责编排 / 错误恢复 / 进度回调，与具体 service 解耦：便于测试 mock。
 *
 * 双母语：
 *   大众用户 → 一句话进 → 成片出，跳过所有细节
 *   专业用户 → 中途可暂停修改 / 重生 / 跳过；每步暴露 step 名字便于 debug
 */

export interface QuickModeInput {
  userPrompt: string
  durationSec: 30 | 60 | 90
  styleAnchors: string[]
  projectId: string
}

export interface QuickModeContext {
  /** 上一步产物（动态注入，下一步可读） */
  episodeId?: string
  scriptId?: string
  generatedAssetIds?: string[]
  thumbnailFrames?: string[]
  storyboardIds?: string[]
  keyframeImagePaths?: string[]
  videoPaths?: string[]
  finalMp4Path?: string
}

export type QuickModeStepName =
  | 'episode'
  | 'script'
  | 'assets'
  | 'thumbnails'
  | 'storyboards'
  | 'keyframes'
  | 'videos'
  | 'compose'

export interface QuickModeStep {
  name: QuickModeStepName
  /** UI 展示的中文名 */
  label: string
  /** 执行 — 接 ctx 读上一步产物 / 写本步产物 */
  run: (ctx: QuickModeContext, input: QuickModeInput) => Promise<void>
}

export interface QuickModeCallbacks {
  onStepStart?: (step: QuickModeStepName) => void
  onStepComplete?: (step: QuickModeStepName, ctx: QuickModeContext) => void
  onStepError?: (step: QuickModeStepName, err: Error) => void
  onProgress?: (step: QuickModeStepName, current: number, total: number) => void
}

export interface QuickModeResult {
  success: boolean
  ctx: QuickModeContext
  failedStep?: QuickModeStepName
  error?: string
}

export class QuickModeOrchestrator {
  constructor(
    /** 编排顺序的 7 个 step（caller 注入，便于 mock 测试） */
    private readonly steps: QuickModeStep[],
  ) {}

  /**
   * 顺序执行 steps；任一失败立即 throw（caller 在 catch 中决定是否重试）。
   * 通过 callbacks 推进度（IPC 层在 onStepXxx 里 webContents.send）。
   */
  async run(
    input: QuickModeInput,
    callbacks: QuickModeCallbacks = {},
  ): Promise<QuickModeResult> {
    if (!input.userPrompt?.trim()) {
      throw new Error('userPrompt 不能为空')
    }
    if (!input.projectId?.trim()) {
      throw new Error('projectId 不能为空')
    }

    const ctx: QuickModeContext = {}
    for (const step of this.steps) {
      callbacks.onStepStart?.(step.name)
      try {
        await step.run(ctx, input)
        callbacks.onStepComplete?.(step.name, ctx)
      } catch (e: any) {
        const err = e instanceof Error ? e : new Error(String(e))
        callbacks.onStepError?.(step.name, err)
        return {
          success: false,
          ctx,
          failedStep: step.name,
          error: err.message,
        }
      }
    }
    return { success: true, ctx }
  }
}
