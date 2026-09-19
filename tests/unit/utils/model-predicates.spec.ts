/**
 * 共享模型判定谓词测试
 *
 * 背景：知识大脑模型设置曾按 type='chat' 过滤 → 永远为空
 * （ModelType 枚举无 'chat'，对话模型是 'text' 或缺省）。
 * isChatModel 与 ai-call / provider-adapter 的既有选型规则一致。
 */
import { describe, it, expect } from 'vitest'
import { isChatModel, isListableChatModel } from '@shared/utils/model-predicates'

describe('isChatModel', () => {
  it('type=text 且 features 含 chat → true', () => {
    expect(isChatModel({ id: 'qwen-max', type: 'text', features: ['chat', 'streaming'] })).toBe(true)
  })
  it('type 缺省但 features 含 chat → true（存量数据兼容）', () => {
    expect(isChatModel({ id: 'm1', features: ['chat'] } as never)).toBe(true)
  })
  it("type='chat' 不是合法枚举 → false（回归：按此过滤永远为空）", () => {
    expect(isChatModel({ id: 'm1', type: 'chat', features: ['chat'] } as never)).toBe(false)
  })
  it('embedding/rerank/image 模型 → false', () => {
    expect(isChatModel({ id: 'e1', type: 'embedding', features: [] })).toBe(false)
    expect(isChatModel({ id: 'r1', type: 'rerank', features: ['rerank'] })).toBe(false)
    expect(isChatModel({ id: 'i1', type: 'image', features: ['chat'] })).toBe(false)
  })
  it('text 但 features 无 chat → false', () => {
    expect(isChatModel({ id: 'm2', type: 'text', features: ['vision'] })).toBe(false)
  })
  it('无 id / null / undefined → false', () => {
    expect(isChatModel({ id: '', type: 'text', features: ['chat'] })).toBe(false)
    expect(isChatModel(null)).toBe(false)
    expect(isChatModel(undefined)).toBe(false)
  })
})

describe('isListableChatModel（模型设置下拉清单口径）', () => {
  it('text 且 features 含 chat → true', () => {
    expect(isListableChatModel({ id: 'm1', type: 'text', features: ['chat'] })).toBe(true)
  })
  it('text 但 features 不含 chat → true（ai-call tier-2：任意 text 可作宿主对话）', () => {
    expect(isListableChatModel({ id: 'm2', type: 'text', features: [] })).toBe(true)
  })
  it('type 缺省 → true', () => {
    expect(isListableChatModel({ id: 'm3', features: [] } as never)).toBe(true)
  })
  it('multimodal+chat → true（视觉理解主力款，如百炼 qwen3.8-max 模板形态）', () => {
    expect(isListableChatModel({ id: 'v1', type: 'multimodal', features: ['chat', 'streaming'] })).toBe(true)
  })
  it('multimodal 不含 chat / image / embedding → false', () => {
    expect(isListableChatModel({ id: 'v2', type: 'multimodal', features: ['vision'] })).toBe(false)
    expect(isListableChatModel({ id: 'i1', type: 'image', features: ['chat'] })).toBe(false)
    expect(isListableChatModel({ id: 'e1', type: 'embedding', features: [] })).toBe(false)
  })
  it("type='chat'（非法枚举）→ false", () => {
    expect(isListableChatModel({ id: 'm4', type: 'chat', features: ['chat'] } as never)).toBe(false)
  })
  it('无 id / null → false', () => {
    expect(isListableChatModel({ id: '', type: 'text', features: ['chat'] })).toBe(false)
    expect(isListableChatModel(null)).toBe(false)
  })
})
