/**
 * useAiGeneration 统一生成基建 + parseJsonLoose 容错解析 单测
 *
 * 背景：各长文阶段组件重复实现流式监听/JSON 解析/取消逻辑，此 composable 收敛统一。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAiGeneration, parseJsonLoose } from '../../../../src/renderer/src/composables/useAiGeneration'

describe('useAiGeneration 状态机', () => {
  let gen: ReturnType<typeof useAiGeneration>
  beforeEach(() => {
    gen = useAiGeneration()
  })

  function mockParams(handlers?: { onDone?: () => void; onError?: (e: string) => void }) {
    let captured: { onContent: (c: string) => void; onDone: () => void; onError: (e: string) => void } | null = null
    const unsubscribe = vi.fn()
    const invoke = vi.fn(async () => ({ success: true }))
    const cancelCall = vi.fn()
    const p = {
      eventId: 'evt-1',
      subscribe: vi.fn((h: typeof captured) => { captured = h; return unsubscribe }),
      invoke,
      cancel: cancelCall,
    }
    return { p, getHandlers: () => captured!, unsubscribe, invoke, cancelCall }
  }

  it('start 订阅流式并累积 content', async () => {
    const { p, getHandlers } = mockParams()
    const ok = await gen.start(p)
    expect(ok).toBe(true)
    expect(p.subscribe).toHaveBeenCalledTimes(1)
    getHandlers().onContent('你好')
    getHandlers().onContent('，世界')
    expect(gen.content.value).toBe('你好，世界')
    expect(gen.generating.value).toBe(true)
  })

  it('done 事件结束生成并退订', async () => {
    const { p, getHandlers, unsubscribe } = mockParams()
    await gen.start(p)
    getHandlers().onContent('正文')
    getHandlers().onDone()
    expect(gen.generating.value).toBe(false)
    expect(gen.content.value).toBe('正文')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('error 事件设置错误并退订', async () => {
    const { p, getHandlers, unsubscribe } = mockParams()
    await gen.start(p)
    getHandlers().onError('生成失败')
    expect(gen.generating.value).toBe(false)
    expect(gen.error.value).toBe('生成失败')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('invoke 失败时设置错误并退订', async () => {
    const { p, unsubscribe } = mockParams()
    p.invoke.mockResolvedValueOnce({ success: false, error: '模型未配置' })
    const ok = await gen.start(p)
    expect(ok).toBe(false)
    expect(gen.error.value).toBe('模型未配置')
    expect(gen.generating.value).toBe(false)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('cancel 调用 cancel 回调 + 退订 + 清空状态', async () => {
    const { p, getHandlers, unsubscribe, cancelCall } = mockParams()
    await gen.start(p)
    getHandlers().onContent('部分内容')
    gen.cancel()
    expect(cancelCall).toHaveBeenCalledTimes(1)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(gen.generating.value).toBe(false)
  })

  it('重复 start 先清理上一次订阅', async () => {
    const a = mockParams()
    await gen.start(a.p)
    const b = mockParams()
    await gen.start(b.p)
    expect(a.unsubscribe).toHaveBeenCalledTimes(1) // 第一次的订阅被清理
    expect(b.unsubscribe).not.toHaveBeenCalled()
  })

  it('无 cancel 回调时 cancel 不报错', async () => {
    const { p, getHandlers, unsubscribe } = mockParams()
    const p2 = { ...p, cancel: undefined }
    await gen.start(p2)
    getHandlers().onContent('x')
    expect(() => gen.cancel()).not.toThrow()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe('parseJsonLoose 容错解析', () => {
  it('裸 JSON 数组', () => {
    const r = parseJsonLoose('[{"title":"a"}]')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual([{ title: 'a' }])
  })

  it('```json 代码块包裹', () => {
    const r = parseJsonLoose('```json\n[{"title":"a"}]\n```')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual([{ title: 'a' }])
  })

  it('前后有 AI 叙述文字（从第一个 {/[ 截取到配对括号）', () => {
    const r = parseJsonLoose('好的，以下是生成结果：\n[{"title":"a","summary":"x"}]\n希望对你有帮助')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual([{ title: 'a', summary: 'x' }])
  })

  it('含控制字符时清理后解析', () => {
    const r = parseJsonLoose('[{"title":"a\u0000\u0001","summary":"x\\n y"}]')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data[0].title).toBe('a')
      expect(r.data[0].summary).toBe('x\n y') // 转义序列 \\n 正确还原为换行
    }
  })

  it('嵌套数组正确配对（取最后一个配对括号）', () => {
    const r = parseJsonLoose('{"keyCharacters":[{"name":"林晓","brief":"主角"}],"summary":"正文"}')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.keyCharacters).toEqual([{ name: '林晓', brief: '主角' }])
      expect(r.data.summary).toBe('正文')
    }
  })

  it('非 JSON 返回 ok=false', () => {
    const r = parseJsonLoose('完全没有 JSON 内容')
    expect(r.ok).toBe(false)
  })

  it('JSON 对象（非数组）', () => {
    const r = parseJsonLoose('{"storyTime":"春","pendingEvents":[]}')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.storyTime).toBe('春')
  })
})
