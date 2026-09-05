/**
 * DashScope STT Provider 测试：qwen3-asr-flash 同步识别（messages 结构）
 * 语言参数（'auto'/未知省略）/ 模型名归一化 / 请求体 / 响应解析 / 错误处理
 * @module tests/voice-providers/dashscope-stt-provider
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { DashScopeSTTProvider, normalizeAsrModel } from '@core/platform/providers/voice/dashscope-stt-provider'

const provider = new DashScopeSTTProvider({ apiKey: 'sk-test' })

function stubFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => vi.unstubAllGlobals())

describe('normalizeAsrModel', () => {
  it('带日期/实时后缀 → qwen3-asr-flash；缺省同', () => {
    expect(normalizeAsrModel('qwen3-asr-flash-2026-02-10')).toBe('qwen3-asr-flash')
    expect(normalizeAsrModel('qwen3-asr-flash-realtime-2026-02-10')).toBe('qwen3-asr-flash')
    expect(normalizeAsrModel('qwen3-asr-flash')).toBe('qwen3-asr-flash')
    expect(normalizeAsrModel(undefined)).toBe('qwen3-asr-flash')
    expect(normalizeAsrModel('')).toBe('qwen3-asr-flash')
  })
})

describe('DashScopeSTTProvider.transcribe', () => {
  it('请求体：qwen3-asr-flash + messages[].content[].audio(base64 data URI)', async () => {
    const mock = stubFetch({ code: 'Success', output: { choices: [{ message: { content: [{ text: '你好' }] } }] } })
    await provider.transcribe(Buffer.from('audio-bytes'), { modelId: 'qwen3-asr-flash-2026-02-10' })
    const [, init] = mock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.model).toBe('qwen3-asr-flash')
    expect(body.input.messages[0].role).toBe('system')
    expect(body.input.messages[1].role).toBe('user')
    expect(body.input.messages[1].content[0].audio).toBe('data:audio/wav;base64,YXVkaW8tYnl0ZXM=')
    expect(body.parameters.asr_options).toMatchObject({ enable_itn: false })
  })

  it('language=auto → asr_options 不含 language（模型自动检测）', async () => {
    const mock = stubFetch({ code: 'Success', output: { text: 'ok' } })
    await provider.transcribe(Buffer.from('audio'), { language: 'auto' })
    const body = JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.parameters.asr_options.language).toBeUndefined()
  })

  it('language=zh/en → asr_options.language 对应', async () => {
    const mock = stubFetch({ code: 'Success', output: { text: 'ok' } })
    await provider.transcribe(Buffer.from('audio'), { language: 'zh' })
    const bodyZh = JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string)
    expect(bodyZh.parameters.asr_options.language).toBe('zh')

    await provider.transcribe(Buffer.from('audio'), { language: 'en' })
    const bodyEn = JSON.parse((mock.mock.calls[1][1] as RequestInit).body as string)
    expect(bodyEn.parameters.asr_options.language).toBe('en')
  })

  it('未知语言（如 zh-CN）→ 省略，不传非法值', async () => {
    const mock = stubFetch({ code: 'Success', output: { text: 'ok' } })
    await provider.transcribe(Buffer.from('audio'), { language: 'zh-CN' })
    const body = JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.parameters.asr_options.language).toBeUndefined()
  })

  it('成功响应：output.choices[].message.content[].text 提取', async () => {
    stubFetch({ code: 'Success', output: { choices: [{ message: { content: [{ text: '你好世界' }, { text: '第二段' }] } }] } })
    const r = await provider.transcribe(Buffer.from('audio'))
    expect(r).toEqual({ success: true, text: '你好世界第二段' })
  })

  it('成功响应：output.text 兜底提取', async () => {
    stubFetch({ code: 'Success', output: { text: '兜底文本' } })
    const r = await provider.transcribe(Buffer.from('audio'))
    expect(r).toEqual({ success: true, text: '兜底文本' })
  })

  it('成功响应：output.sentence 拼接兜底', async () => {
    stubFetch({ code: 'Success', output: { sentence: [{ text: '第一句' }, { text: '第二句' }] } })
    const r = await provider.transcribe(Buffer.from('audio'))
    expect(r).toEqual({ success: true, text: '第一句第二句' })
  })

  it('HTTP 错误 → success=false + 错误消息', async () => {
    stubFetch({ message: 'InvalidApiKey' }, 401)
    const r = await provider.transcribe(Buffer.from('audio'))
    expect(r.success).toBe(false)
    expect(r.error).toContain('InvalidApiKey')
  })

  it('业务错误 code → success=false', async () => {
    stubFetch({ code: 'InvalidParameter', message: 'audio 不合法' })
    const r = await provider.transcribe(Buffer.from('audio'))
    expect(r.success).toBe(false)
    expect(r.error).toContain('audio')
  })

  it('无识别结果 → success=false', async () => {
    stubFetch({ code: 'Success', output: {} })
    const r = await provider.transcribe(Buffer.from('audio'))
    expect(r).toEqual({ success: false, error: '未获取到识别结果' })
  })
})
