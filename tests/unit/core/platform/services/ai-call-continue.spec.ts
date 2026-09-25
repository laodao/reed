/**
 * callAIWithContinue 续写拼接单测（2026-09-25 一致性修复 S2/S9）
 *
 * 锁定修复后语义：
 * - mergeContinuationResponse：续写从头重复时以续写全量为准（旧实现会把完整重输出
 *   再追加一份，拼出两份 JSON 必解析失败）；部分重叠按最大重叠截断；无重叠直接拼接
 *   （不插入空白——截断点可落在任意字符，包括字符串中间）
 * - callAIWithContinue：截断 → 续写 → 合并后完整可解析；续写次数受 maxContinues 限制；
 *   opts（temperature 等）透传到每一次 callAI
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const chatSyncMock = vi.fn()

vi.mock('@core/platform/providers/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/platform/providers/llm')>()
  return {
    ...actual,
    createProvider: () => ({ chatSync: (ctx: any, opts: any) => chatSyncMock(ctx, opts) }),
  }
})
vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    providerConfigs: {
      getById: async () => ({
        id: 'pc_test',
        templateId: 'deepseek',
        apiKey: 'test-key',
        baseUrl: 'https://api.deepseek.com',
      }),
      getDefault: async () => null,
      getEnabled: async () => [],
    },
    dataSource: null,
  }),
}))
vi.mock('@core/interfaces/storage.interface', () => ({
  getSecureStorage: () => ({
    isInitialized: () => true,
    initialize: async () => {},
    decrypt: (s: string) => s,
  }),
}))

import {
  callAIWithContinue,
  isJsonTruncated,
  mergeContinuationResponse,
  parseJsonString,
} from '@core/platform/services/ai-call'

const FULL_JSON =
  '{"scenes":[{"sceneNumber":1,"location":"茶馆"},{"sceneNumber":2,"location":"码头"}]}'

describe('mergeContinuationResponse', () => {
  it('无重叠：直接拼接，不插入任何字符（截断点可在字符串中间）', () => {
    const cut = FULL_JSON.indexOf('"茶')
    const prev = `【场景数据开始】\n${FULL_JSON.slice(0, cut)}`
    const cont = FULL_JSON.slice(cut)
    const merged = mergeContinuationResponse(prev, cont)
    expect(merged).toBe(prev.trimEnd() + cont)
    const parsed = parseJsonString(merged.substring(merged.indexOf('{')))
    expect(parsed.scenes).toHaveLength(2)
    expect(parsed.scenes[0].location).toBe('茶馆')
  })

  it('续写从头重复（完整重输出）：以续写全量为准，不产出两份 JSON', () => {
    const prev = `【场景数据开始】\n${FULL_JSON.slice(0, 40)}`
    // 模型没听话，从头重新输出了完整 JSON
    const merged = mergeContinuationResponse(prev, FULL_JSON)
    expect(merged).toBe(`【场景数据开始】\n${FULL_JSON}`)
    const parsed = parseJsonString(merged.substring(merged.indexOf('{')))
    expect(parsed.scenes).toHaveLength(2)
    expect(merged.match(/"scenes"/g)).toHaveLength(1)
  })

  it('续写从头重复但排版不同（美化输出）：忽略空白差异仍判定为重输出', () => {
    const prev = `【场景数据开始】\n${FULL_JSON.slice(0, 40)}`
    const pretty = JSON.stringify(JSON.parse(FULL_JSON), null, 2)
    const merged = mergeContinuationResponse(prev, pretty)
    expect(merged).toBe(`【场景数据开始】\n${pretty}`)
    const parsed = parseJsonString(merged.substring(merged.indexOf('{')))
    expect(parsed.scenes).toHaveLength(2)
  })

  it('部分重叠：续写开头重复了已输出结尾，按最大重叠截断后拼接', () => {
    const prev = '{"scenes":[{"sceneNumber":1,"location":"茶馆"'
    const cont = '"location":"茶馆","mood":"安静"}]}'
    const merged = mergeContinuationResponse(prev, cont)
    expect(merged).toBe('{"scenes":[{"sceneNumber":1,"location":"茶馆","mood":"安静"}]}')
    expect(parseJsonString(merged).scenes[0].mood).toBe('安静')
  })

  it('部分重叠仅 1 字符（截断在字符串中间，模型重复了最后一个字）', () => {
    const prev = '{"scenes":[{"sceneNumber":1,"location":"茶'
    const cont = '茶馆"}]}'
    const merged = mergeContinuationResponse(prev, cont)
    expect(parseJsonString(merged).scenes[0].location).toBe('茶馆')
  })

  it('续写响应不含 { ：原文追加', () => {
    expect(mergeContinuationResponse('{"a": 1', ' 续写乱码')).toBe('{"a": 1 续写乱码')
  })
})

describe('callAIWithContinue', () => {
  beforeEach(() => {
    chatSyncMock.mockReset()
  })

  it('JSON 截断 → 续写拼接后完整解析；maxTokens/opts 透传到每次调用', async () => {
    const cut = 60
    chatSyncMock
      .mockResolvedValueOnce({ success: true, content: FULL_JSON.slice(0, cut) })
      .mockResolvedValueOnce({ success: true, content: FULL_JSON.slice(cut) })

    const result = await callAIWithContinue('生成场景', 'sys', 16000, 'pc_test', 'test-model', 2, {
      temperature: 0.3,
    })

    expect(chatSyncMock).toHaveBeenCalledTimes(2)
    expect(chatSyncMock.mock.calls[0][1]).toMatchObject({ maxTokens: 16000, temperature: 0.3 })
    expect(chatSyncMock.mock.calls[1][1]).toMatchObject({ maxTokens: 16000, temperature: 0.3 })
    // 续写提示词携带已截断的 JSON
    expect(chatSyncMock.mock.calls[1][0].messages[0].content).toContain(FULL_JSON.slice(0, cut))
    expect(parseJsonString(result)).toEqual(JSON.parse(FULL_JSON))
  })

  it('续写从头重复完整 JSON：最终只保留一份，可正常解析', async () => {
    chatSyncMock
      .mockResolvedValueOnce({ success: true, content: FULL_JSON.slice(0, 40) })
      .mockResolvedValueOnce({ success: true, content: FULL_JSON })

    const result = await callAIWithContinue('生成场景', 'sys', 8192, 'pc_test', 'test-model')

    expect(result.match(/"scenes"/g)).toHaveLength(1)
    expect(parseJsonString(result).scenes).toHaveLength(2)
  })

  it('持续截断时续写次数受 maxContinues 限制（1 次首调 + N 次续写）', async () => {
    chatSyncMock.mockResolvedValue({ success: true, content: '{"scenes": [{"sceneNumber": 1' })

    const result = await callAIWithContinue('p', 's', 8192, 'pc_test', 'test-model', 2)

    expect(chatSyncMock).toHaveBeenCalledTimes(3)
    expect(isJsonTruncated(result)).toBe(true)
  })

  it('输出未截断时不发起续写', async () => {
    chatSyncMock.mockResolvedValueOnce({ success: true, content: FULL_JSON })

    const result = await callAIWithContinue('p', 's', 8192, 'pc_test', 'test-model')

    expect(chatSyncMock).toHaveBeenCalledTimes(1)
    expect(result).toBe(FULL_JSON)
  })
})
