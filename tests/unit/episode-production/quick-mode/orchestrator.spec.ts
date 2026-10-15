/**
 * QuickModeOrchestrator · spec（Phase 3 P3-C3，spec 2026-05-09 §3.2 C3）
 *
 * 验证编排器顺序执行 / 错误恢复 / 回调推进度。
 */

import { describe, it, expect, vi } from 'vitest'
import {
  QuickModeOrchestrator,
  type QuickModeStep,
  type QuickModeInput,
  type QuickModeStepName,
} from '@core/platform/episode-production/quick-mode/orchestrator.service'

const baseInput: QuickModeInput = {
  userPrompt: '少年阿白的成长',
  durationSec: 30,
  styleAnchors: ['国风工笔'],
  projectId: 'p1',
}

function mockStep(name: QuickModeStepName, mutator?: (ctx: any) => void): QuickModeStep {
  return {
    name,
    label: name,
    run: vi.fn(async (ctx) => {
      if (mutator) mutator(ctx)
    }),
  }
}

describe('QuickModeOrchestrator', () => {
  it('全部 step 顺序执行 → success=true', async () => {
    const steps: QuickModeStep[] = [
      mockStep('episode', (ctx) => { ctx.episodeId = 'e1' }),
      mockStep('script', (ctx) => { ctx.scriptId = 's1' }),
      mockStep('assets', (ctx) => { ctx.generatedAssetIds = ['a1'] }),
      mockStep('thumbnails', (ctx) => { ctx.thumbnailFrames = ['f1', 'f2'] }),
      mockStep('storyboards', (ctx) => { ctx.storyboardIds = ['sb1'] }),
      mockStep('keyframes'),
      mockStep('videos'),
      mockStep('compose', (ctx) => { ctx.finalMp4Path = '/out.mp4' }),
    ]
    const orch = new QuickModeOrchestrator(steps)
    const result = await orch.run(baseInput)
    expect(result.success).toBe(true)
    expect(result.ctx.episodeId).toBe('e1')
    expect(result.ctx.finalMp4Path).toBe('/out.mp4')
  })

  it('某 step 失败 → 立即返回 failedStep + error', async () => {
    const steps: QuickModeStep[] = [
      mockStep('episode', (ctx) => { ctx.episodeId = 'e1' }),
      {
        name: 'script',
        label: 'script',
        run: vi.fn(async () => {
          throw new Error('剧本生成失败')
        }),
      },
      mockStep('assets'),  // 不应被调用
    ]
    const orch = new QuickModeOrchestrator(steps)
    const result = await orch.run(baseInput)
    expect(result.success).toBe(false)
    expect(result.failedStep).toBe('script')
    expect(result.error).toBe('剧本生成失败')
    expect(result.ctx.episodeId).toBe('e1')  // 已完成步骤的 ctx 保留
    expect(steps[2].run).not.toHaveBeenCalled()
  })

  it('回调按顺序触发 onStepStart / onStepComplete', async () => {
    const events: string[] = []
    const steps: QuickModeStep[] = [
      mockStep('episode'),
      mockStep('script'),
    ]
    const orch = new QuickModeOrchestrator(steps)
    await orch.run(baseInput, {
      onStepStart: (s) => events.push(`start:${s}`),
      onStepComplete: (s) => events.push(`complete:${s}`),
    })
    expect(events).toEqual([
      'start:episode',
      'complete:episode',
      'start:script',
      'complete:script',
    ])
  })

  it('失败时触发 onStepError', async () => {
    const errors: Array<{ step: string; msg: string }> = []
    const steps: QuickModeStep[] = [
      {
        name: 'episode',
        label: 'episode',
        run: async () => { throw new Error('DB 异常') },
      },
    ]
    const orch = new QuickModeOrchestrator(steps)
    await orch.run(baseInput, {
      onStepError: (s, err) => errors.push({ step: s, msg: err.message }),
    })
    expect(errors).toEqual([{ step: 'episode', msg: 'DB 异常' }])
  })

  it('userPrompt 空 → 抛错', async () => {
    const orch = new QuickModeOrchestrator([])
    await expect(orch.run({ ...baseInput, userPrompt: '' })).rejects.toThrow(/userPrompt/)
  })

  it('projectId 空 → 抛错', async () => {
    const orch = new QuickModeOrchestrator([])
    await expect(orch.run({ ...baseInput, projectId: '' })).rejects.toThrow(/projectId/)
  })

  it('ctx 在 step 间传递', async () => {
    const steps: QuickModeStep[] = [
      mockStep('episode', (ctx) => { ctx.episodeId = 'e1' }),
      {
        name: 'script',
        label: 'script',
        run: vi.fn(async (ctx) => {
          // step 2 应能读到 step 1 写的 ctx
          expect(ctx.episodeId).toBe('e1')
          ctx.scriptId = 's_for_' + ctx.episodeId
        }),
      },
    ]
    const orch = new QuickModeOrchestrator(steps)
    const result = await orch.run(baseInput)
    expect(result.ctx.scriptId).toBe('s_for_e1')
  })
})
