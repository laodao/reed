/**
 * defaultBrainLlm 模型无关自适应：思考型模型空输出 → 预算翻倍重试；
 * <think> 标签剥离；截断续写。transport 注入，无网络。
 */
import { describe, it, expect } from 'vitest'
import { defaultBrainLlm, stripThinkBlocks, BRAIN_LLM_MAX_TOKENS, BRAIN_LLM_MAX_TOKENS_CEILING } from '@core/platform/services/kb-brain/llm'

describe('stripThinkBlocks', () => {
  it('剥离成对与未闭合的 think 标签', () => {
    expect(stripThinkBlocks('<think>推理…</think>{"a":1}')).toBe('{"a":1}')
    expect(stripThinkBlocks('<think>推理被截断')).toBe('')
  })
  it('无标签原样返回', () => {
    expect(stripThinkBlocks('{"a":1}')).toBe('{"a":1}')
  })
})

describe('defaultBrainLlm 自适应', () => {
  it('空输出（思考耗尽预算）→ 预算翻倍重试直至封顶', async () => {
    const budgets: Array<number | undefined> = []
    let calls = 0
    const llm = defaultBrainLlm('kb-brain-atomize', undefined, {
      transport: async req => {
        budgets.push(req.maxTokens)
        calls++
        if (calls <= 2) return '' // 前两次空（思考吃光预算）
        return '{"ok":true}'
      },
    })
    const out = await llm({ system: 's', user: 'u' })
    expect(out).toBe('{"ok":true}')
    expect(budgets[0]).toBe(BRAIN_LLM_MAX_TOKENS)
    expect(budgets[1]).toBe(BRAIN_LLM_MAX_TOKENS * 2)
    expect(budgets[2]).toBe(BRAIN_LLM_MAX_TOKENS * 4)
    // 封顶不超过 ceiling
    expect(budgets.every(b => (b ?? 0) <= BRAIN_LLM_MAX_TOKENS_CEILING)).toBe(true)
  })

  it('think 标签混在输出里 → 剥离后再判截断，不误续写', async () => {
    const llm = defaultBrainLlm('kb-brain-atomize', undefined, {
      transport: async () => '<think>思考</think>{"atoms":[],"events":[]}',
    })
    const out = await llm({ system: 's', user: 'u' })
    expect(out).toContain('"atoms"')
  })

  it('最终返回值不含 think 标签——思考草稿不外泄（review H2 回归）', async () => {
    const llm = defaultBrainLlm('kb-brain-adjudicate', undefined, {
      transport: async () => '<think>我需要输出 {"memory":"草稿"}</think>{"memory":"正式答案"}',
    })
    const out = await llm({ system: 's', user: 'u' })
    expect(out).not.toContain('<think>')
    expect(out).not.toContain('草稿')
    expect(out).toContain('正式答案')
  })

  it('截断输出走续写（沿用升级后的预算）', async () => {
    const seen: Array<number | undefined> = []
    let calls = 0
    const llm = defaultBrainLlm('kb-brain-atomize', undefined, {
      transport: async req => {
        seen.push(req.maxTokens)
        calls++
        if (calls === 1) return '{"atoms":[{"statement":"截断的'
        return '续写内容"}],"events":[]}'
      },
    })
    const out = await llm({ system: 's', user: 'u', maxTokens: 4000 })
    expect(out).toContain('"events"')
    expect(seen[0]).toBe(4000)
  })
})
