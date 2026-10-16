/**
 * stt 节点分段转写测试：超长音频自动切段逐段识别合并；短音频单段直调；段失败抛错
 * @module tests/workflow/stt-node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- mock 语音服务 ----
const recognizeSpeechMock = vi.fn()
vi.mock('@core/platform/services/voice.service', () => ({
  VoiceService: { recognizeSpeech: (...a: any[]) => recognizeSpeechMock(...a) },
}))

// ---- mock ffmpeg 能力（测试不跑真实二进制） ----
const getVideoMetadataMock = vi.fn()
const extractAudioSegmentMock = vi.fn(async () => {})
vi.mock('@core/platform/episode-production/reference-video/ffmpeg-helpers', () => ({
  getVideoMetadata: (...a: any[]) => getVideoMetadataMock(...a),
  extractAudioSegment: (...a: any[]) => extractAudioSegmentMock(...a),
}))

// ---- mock 其它静态依赖（ai-nodes 引入的服务） ----
vi.mock('@core/platform/services/knowledge-base.service', () => ({
  KnowledgeBaseService: class { search = vi.fn(); searchQa = vi.fn() },
}))
vi.mock('@core/platform/services/search-engine.service', () => ({ getSearchEngineService: () => ({}) }))
vi.mock('@core/platform/services/translation.service', () => ({ TranslationService: class {} }))
vi.mock('@core/platform/services/image.service', () => ({ ImageService: class {} }))
vi.mock('@core/interfaces/event.interface', () => ({ getEventEmitter: () => ({ emit: vi.fn() }) }))

import { AI_NODE_HANDLERS } from '@core/platform/workflow/nodes/ai-nodes'

const handler = AI_NODE_HANDLERS.find(h => h.type === 'stt')!

const makeCtx = (config: Record<string, unknown>): any => ({
  runId: 'run_1',
  runKey: 'stt1',
  nodeId: 'stt1',
  nodeType: 'stt',
  iterationIndex: 0,
  config,
  startInputs: {},
  triggerInfo: {},
  signal: new AbortController().signal,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  emitProgress: () => {},
  resolveTemplate: (t: string) => t as never,
  getVariable: () => undefined,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('stt 节点：分段转写', () => {
  it('validateConfig：音频为空报错', () => {
    expect(handler.validateConfig({} as never).length).toBeGreaterThan(0)
    expect(handler.validateConfig({ audio: '{{audio1.audioPath}}' } as never)).toEqual([])
  })

  it('短音频（≤ segmentMinutes）→ 单段直调，不切段', async () => {
    getVideoMetadataMock.mockResolvedValue({ durationSec: 120, width: 0, height: 0 })
    recognizeSpeechMock.mockResolvedValue({ success: true, data: { text: '短音频文本' } })
    const result = await handler.execute(makeCtx({
      audio: 'C:/a/b.wav', language: 'zh', segmentMinutes: 5, providerConfigId: 'pc1', modelId: 'm1',
    }))
    expect(result).toMatchObject({ status: 'succeeded' })
    expect((result as any).output.text).toBe('短音频文本')
    expect(extractAudioSegmentMock).not.toHaveBeenCalled()
    expect(recognizeSpeechMock).toHaveBeenCalledTimes(1)
    expect(recognizeSpeechMock.mock.calls[0][0]).toMatchObject({ audioPath: 'C:/a/b.wav', language: 'zh', providerId: 'pc1', modelId: 'm1' })
  })

  it('超长音频 → 按 segmentMinutes 切段逐段识别合并（段间标注第 N 段）', async () => {
    getVideoMetadataMock.mockResolvedValue({ durationSec: 1250, width: 0, height: 0 }) // ~20.8 分钟
    recognizeSpeechMock
      .mockResolvedValueOnce({ success: true, data: { text: '第一段内容' } })
      .mockResolvedValueOnce({ success: true, data: { text: '第二段内容' } })
      .mockResolvedValueOnce({ success: true, data: { text: '第三段内容' } })
      .mockResolvedValueOnce({ success: true, data: { text: '第四段内容' } })
      .mockResolvedValueOnce({ success: true, data: { text: '第五段内容' } })
    const result = await handler.execute(makeCtx({ audio: 'C:/a/long.wav', segmentMinutes: 5 }))
    expect(result).toMatchObject({ status: 'succeeded' })
    const text = (result as any).output.text
    expect(text).toContain('【第 1 段】')
    expect(text).toContain('第一段内容')
    expect(text).toContain('第五段内容')
    // 5 段：段路径以 segN.wav 结尾（分隔符平台相关，用正则断言）+ 每段时长 300s
    expect(extractAudioSegmentMock).toHaveBeenCalledTimes(5)
    expect(extractAudioSegmentMock.mock.calls[0][0]).toBe('C:/a/long.wav')
    expect(extractAudioSegmentMock.mock.calls[0][1]).toMatch(/long_seg1\.wav$/)
    expect(extractAudioSegmentMock.mock.calls[0].slice(2)).toEqual([0, 300])
    expect(extractAudioSegmentMock.mock.calls[4][1]).toMatch(/long_seg5\.wav$/)
    expect(extractAudioSegmentMock.mock.calls[4].slice(2)).toEqual([1200, 300])
    expect(recognizeSpeechMock).toHaveBeenCalledTimes(5)
    expect(recognizeSpeechMock.mock.calls[0][0].audioPath).toMatch(/long_seg1\.wav$/)
  })

  it('缺省 segmentMinutes → 4 分钟（防超限余量）', async () => {
    getVideoMetadataMock.mockResolvedValue({ durationSec: 1500, width: 0, height: 0 })
    recognizeSpeechMock.mockResolvedValue({ success: true, data: { text: 'ok' } })
    await handler.execute(makeCtx({ audio: 'C:/a/x.wav' }))
    expect(extractAudioSegmentMock.mock.calls[0][2]).toBe(0)
    expect(extractAudioSegmentMock.mock.calls[0][3]).toBe(240) // 4 分钟
  })

  it('某段识别失败 → 抛错（引擎兜底标 failed，不静默）', async () => {
    getVideoMetadataMock.mockResolvedValue({ durationSec: 600, width: 0, height: 0 })
    recognizeSpeechMock
      .mockResolvedValueOnce({ success: true, data: { text: '第一段' } })
      .mockResolvedValueOnce({ success: false, error: '音频超限' })
    await expect(handler.execute(makeCtx({ audio: 'C:/a/y.wav', segmentMinutes: 5 }))).rejects.toThrow('第 2 段')
  })

  it('元数据读取失败 → 降级单段直调', async () => {
    getVideoMetadataMock.mockRejectedValue(new Error('no meta'))
    recognizeSpeechMock.mockResolvedValue({ success: true, data: { text: '单段兜底' } })
    const result = await handler.execute(makeCtx({ audio: 'C:/a/z.wav' }))
    expect(result).toMatchObject({ status: 'succeeded' })
    expect((result as any).output.text).toBe('单段兜底')
    expect(extractAudioSegmentMock).not.toHaveBeenCalled()
    expect(recognizeSpeechMock).toHaveBeenCalledTimes(1)
  })

  it('base64 音频输入 → 走 audioData 单段直调', async () => {
    recognizeSpeechMock.mockResolvedValue({ success: true, data: { text: 'data' } })
    const result = await handler.execute(makeCtx({ audio: 'data:audio/wav;base64,AAAA' }))
    expect(result).toMatchObject({ status: 'succeeded' })
    expect(recognizeSpeechMock.mock.calls[0][0].audioData).toBe('AAAA')
  })
})
