/**
 * chat-render-cache 单测（性能回归）
 *
 * 背景：Chat 页每条 MessageItem 在模板里同步调用 formatContent/formatSourceContent，
 * 组件每次重渲染（流式 delta、父组件更新、滚动相关响应式变化）都会**重新解析整个
 * markdown**——markdown.ts 的渲染管线含 marked 解析 + DOMParser 消毒 + 逐行转义，
 * 单条成本虽只有 0.1~1ms，但 22 条消息 × 每轮流式几十次重渲染会累积成主线程长任务。
 * 本模块把"纯计算"缓存起来（不依赖 DOM），保证同一份内容只解析一次。
 */
import { describe, it, expect } from 'vitest'
import { createRenderCache, hashText, containsMermaidBlock } from '@/utils/chat-render-cache'

describe('createRenderCache', () => {
  it('同内容同模式只计算一次', () => {
    let calls = 0
    const cache = createRenderCache<string>((text) => `rendered:${text}:${++calls}`)
    expect(cache.get('msg-1', 'hello')).toBe('rendered:hello:1')
    expect(cache.get('msg-1', 'hello')).toBe('rendered:hello:1')
    expect(cache.get('msg-1', 'hello')).toBe('rendered:hello:1')
    expect(calls).toBe(1)
  })

  it('内容变化则重算（流式增量场景）', () => {
    let calls = 0
    const cache = createRenderCache<string>((text) => `${text}|${++calls}`)
    cache.get('msg-1', 'a')
    expect(cache.get('msg-1', 'a b')).toBe('a b|2')
    expect(cache.get('msg-1', 'a b')).toBe('a b|2')
    expect(calls).toBe(2)
  })

  it('不同消息同一内容互相独立（key 含消息 id）', () => {
    let calls = 0
    const cache = createRenderCache<string>((t) => `${t}${++calls}`)
    expect(cache.get('m1', 'x')).toBe('x1')
    expect(cache.get('m2', 'x')).toBe('x2')
    expect(calls).toBe(2)
  })

  it('同一 key 只保留最后一次结果（不无界增长）', () => {
    const cache = createRenderCache<string>((t) => t)
    for (let i = 0; i < 100; i++) cache.get('m1', `v${i}`)
    expect(cache.size()).toBe(1)
    expect(cache.get('m1', 'v99')).toBe('v99')
  })

  it('reset 后重新计算（会话切换语义）', () => {
    let calls = 0
    const cache = createRenderCache<string>((t) => `${t}${++calls}`)
    cache.get('m1', 'x')
    cache.reset()
    expect(cache.size()).toBe(0)
    expect(cache.get('m1', 'x')).toBe('x2')
  })

  it('空内容也走缓存（不重复计算空串）', () => {
    let calls = 0
    const cache = createRenderCache<string>(() => `e${++calls}`)
    cache.get('m1', '')
    cache.get('m1', '')
    expect(calls).toBe(1)
  })
})

describe('hashText', () => {
  it('同文本同值、异文本（高概率）异值', () => {
    expect(hashText('abc')).toBe(hashText('abc'))
    expect(hashText('abc')).not.toBe(hashText('abd'))
  })

  it('长文本也稳定（流式超长回答）', () => {
    const long = 'x'.repeat(200000) + 'tail'
    expect(hashText(long)).toBe(hashText(long))
    expect(hashText(long + 'a')).not.toBe(hashText(long))
  })
})

describe('containsMermaidBlock', () => {
  it('识别带语言的 mermaid 围栏', () => {
    expect(containsMermaidBlock('前文\n```mermaid\ngraph TD\nA-->B\n```\n后文')).toBe(true)
  })

  it('识别 .mmd 别名与缩进围栏', () => {
    expect(containsMermaidBlock('```mmd\ngraph TD\n```')).toBe(true)
    expect(containsMermaidBlock('   ```mermaid\ngraph TD\n   ```')).toBe(true)
  })

  it('未闭合围栏（流式中间态）也识别', () => {
    expect(containsMermaidBlock('```mermaid\ngraph TD\nA-->B')).toBe(true)
  })

  it('普通代码块/行内 mermaid 词不误判', () => {
    expect(containsMermaidBlock('```ts\nconst a = 1\n```')).toBe(false)
    expect(containsMermaidBlock('这里提到了 mermaid 这个词')).toBe(false)
    expect(containsMermaidBlock('```\nplain\n```')).toBe(false)
    expect(containsMermaidBlock('')).toBe(false)
  })
})