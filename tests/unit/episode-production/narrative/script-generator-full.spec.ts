/**
 * generateFullScript 失败保护 + 场景 JSON 截断续写接入单测（2026-09-25 一致性修复 S1/S2）
 *
 * - S1：解析结果 scenes 为空时 generateFullScript 必须抛错（与缺正文同等待遇），
 *   不再只 warn 放行——handler 拿到空 scenes 会进「删旧场景+建新场景」事务，
 *   放行等于删光旧场景后新场景为 0
 * - S2：generateFullScript / continueScript / splitScriptTextToScenes 三个入口
 *   的场景 JSON 生成改走 callAIWithContinue（截断续写 ≤2 次），maxTokens 保持 16000
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const callAIMock = vi.fn()
const callAIWithContinueMock = vi.fn()

vi.mock('@core/platform/services/ai-call', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/platform/services/ai-call')>()
  return {
    ...actual,
    callAI: (...args: any[]) => callAIMock(...args),
    callAIWithContinue: (...args: any[]) => callAIWithContinueMock(...args),
  }
})

import { EpisodeScriptGenerator } from '@core/platform/episode-production/narrative/ai/script-generator'
import type { AssetRosterForScript } from '@shared/types/episode-production'

const ROSTER: AssetRosterForScript = {
  characters: [{ bindingId: 'cb_zhangsan', name: '张三', description: '茶馆客人' }],
  locations: [{ bindingId: 'lb_teahouse', name: '茶馆' }],
  items: [{ bindingId: 'ib_teapot', name: '茶壶' }],
}

const makeScene = (n: number, location: string) => ({
  sceneNumber: n,
  location,
  locationType: 'interior',
  timeOfDay: 'morning',
  sceneDescription: `${location}内景`,
  mood: '安静',
  characters: [{ characterName: '张三' }],
  dialogues: [],
  actions: [],
})

/** 拼一份带标记的完整剧本响应；omitScenesEnd 模拟「续写补齐 JSON 但没有结束标记」的拼接产物 */
const fullScriptResponse = (scenesJson: string, opts?: { omitScenesEnd?: boolean }) =>
  `【场景数据开始】\n${scenesJson}\n${opts?.omitScenesEnd ? '' : '【场景数据结束】\n'}` +
  '【梗概开始】测试梗概【梗概结束】\n' +
  '【剧本正文开始】\n第一场 茶馆。张三入座。\n【剧本正文结束】'

describe('generateFullScript 空场景保护（S1）', () => {
  beforeEach(() => {
    callAIMock.mockReset()
    callAIWithContinueMock.mockReset()
  })

  it('scenes 为空数组 → 抛错（不再 warn 放行）', async () => {
    callAIWithContinueMock.mockResolvedValue(fullScriptResponse('{"scenes": []}'))

    await expect(
      EpisodeScriptGenerator.getInstance().generateFullScript('一段章节内容', ROSTER),
    ).rejects.toThrow(/结构化场景数据/)
  })

  it('完全没有场景 JSON → 抛错', async () => {
    callAIWithContinueMock.mockResolvedValue(
      '【梗概开始】测试梗概【梗概结束】\n【剧本正文开始】\n第一场。\n【剧本正文结束】',
    )

    await expect(
      EpisodeScriptGenerator.getInstance().generateFullScript('一段章节内容', ROSTER),
    ).rejects.toThrow(/结构化场景数据/)
  })

  it('场景 JSON 正常 → 返回结果且主调用走 callAIWithContinue（maxTokens 16000 不变）', async () => {
    callAIWithContinueMock.mockResolvedValue(
      fullScriptResponse(JSON.stringify({ scenes: [makeScene(1, '茶馆')] })),
    )

    const result = await EpisodeScriptGenerator.getInstance().generateFullScript(
      '一段章节内容',
      ROSTER,
      'pc_1',
      'm_1',
    )

    expect(callAIWithContinueMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      16000,
      'pc_1',
      'm_1',
      2,
      { temperature: 0.3 },
    )
    expect(result.scenes).toHaveLength(1)
    expect(result.scenes[0].locationBindingId).toBe('lb_teahouse')
    expect(result.scriptContent).toContain('张三入座')
  })
})

describe('场景 JSON 截断续写接入（S2）', () => {
  beforeEach(() => {
    callAIMock.mockReset()
    callAIWithContinueMock.mockReset()
  })

  it('generateFullScript：截断续写补齐后的场景 JSON（无结束标记）完整解析', async () => {
    // 模拟 callAIWithContinue 的拼接产物：【场景数据开始】 后是被续写补齐的完整 JSON，
    // 但模型没补 【场景数据结束】 标记
    const scenesJson = JSON.stringify({ scenes: [makeScene(1, '茶馆'), makeScene(2, '码头')] })
    callAIWithContinueMock.mockResolvedValue(fullScriptResponse(scenesJson, { omitScenesEnd: true }))

    const result = await EpisodeScriptGenerator.getInstance().generateFullScript('章节', ROSTER)

    expect(result.scenes).toHaveLength(2)
    expect(result.scenes[0].characters[0].characterBindingId).toBe('cb_zhangsan')
    expect(result.scenes[1].location).toBe('码头')
  })

  it('continueScript：走 callAIWithContinue，新增场景按 startSceneNumber 解析', async () => {
    callAIWithContinueMock.mockResolvedValue(
      fullScriptResponse(JSON.stringify({ scenes: [makeScene(4, '码头')] })),
    )

    const result = await EpisodeScriptGenerator.getInstance().continueScript({
      existingScriptContent: '【第3场 茶馆 夜】\n张三推门而入。',
      existingScenesSummary: '- 第 3 场 | 茶馆',
      instruction: '往下写李四登场',
      startSceneNumber: 4,
      roster: ROSTER,
      providerConfigId: 'pc_1',
      modelId: 'm_1',
    })

    expect(callAIWithContinueMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      16000,
      'pc_1',
      'm_1',
      2,
      { temperature: 0.3 },
    )
    expect(result.scenes).toHaveLength(1)
    expect(result.scenes[0].sceneNumber).toBe(4)
  })

  it('continueScript：既无正文也无场景 → 仍然抛错（既有语义不变）', async () => {
    callAIWithContinueMock.mockResolvedValue('抱歉，我无法完成这个请求。')

    await expect(
      EpisodeScriptGenerator.getInstance().continueScript({
        existingScriptContent: '',
        existingScenesSummary: '',
        instruction: '继续写',
        startSceneNumber: 1,
        roster: ROSTER,
      }),
    ).rejects.toThrow(/没有返回可用的续写内容/)
  })

  it('splitScriptTextToScenes：走 callAIWithContinue 并返回拆分出的场景', async () => {
    callAIWithContinueMock.mockResolvedValue(
      fullScriptResponse(JSON.stringify({ scenes: [makeScene(4, '客栈')] })),
    )

    const scenes = await EpisodeScriptGenerator.getInstance().splitScriptTextToScenes({
      scriptText: '第四场 内景 客栈 日\n李四拍案而起。',
      existingScenesSummary: '- 第 3 场 | 茶馆',
      startSceneNumber: 4,
      roster: ROSTER,
    })

    expect(callAIWithContinueMock).toHaveBeenCalled()
    expect(scenes).toHaveLength(1)
    expect(scenes[0].location).toBe('客栈')
  })
})
