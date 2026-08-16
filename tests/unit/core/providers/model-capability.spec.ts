/**
 * model-capability 能力解析单测
 * @module tests/unit/core/providers/model-capability
 *
 * 验证 resolveCapabilities：
 *  - 优先读落库 ModelDefinition 能力字段（消除 provider 层硬编码模型名判断的病根）；
 *  - def 缺失或某字段为 undefined 时，按模型名回退到字符串兜底（向后兼容旧数据/自定义模型）。
 *
 * 这是为「AI 对话空响应」修复（deepseek-v4-pro 等 reasoning_content 被丢弃）提供的基座。
 */

import { describe, it, expect } from 'vitest'
import {
  resolveCapabilities,
  guessCapabilitiesByModelId,
  resolveMaxTokens,
  THINKING_MODEL_MIN_MAX_TOKENS
} from '@core/providers/model-capability'
import type { ModelDefinition } from '@shared/types'

// 构造 ModelDefinition 的辅助函数，只填必填字段，其余按用例覆盖
function makeDef(over: Partial<ModelDefinition>): ModelDefinition {
  return {
    id: over.id ?? 'm',
    name: over.name ?? 'm',
    contextWindow: over.contextWindow ?? 8192,
    maxOutputTokens: over.maxOutputTokens ?? 4096,
    features: over.features ?? ['chat', 'streaming'],
    ...over
  }
}

describe('guessCapabilitiesByModelId（字符串兜底）', () => {
  it('识别思考模型：deepseek-reasoner / r1', () => {
    expect(guessCapabilitiesByModelId('deepseek-reasoner').supportsThinking).toBe(true)
    expect(guessCapabilitiesByModelId('DeepSeek-R1').supportsThinking).toBe(true)
  })

  it('识别思考模型：deepseek-v4-pro 等发 reasoning_content 的新模型', () => {
    expect(guessCapabilitiesByModelId('deepseek-v4-pro').supportsThinking).toBe(true)
  })

  it('识别思考模型：OpenAI o1 / o3 系列', () => {
    expect(guessCapabilitiesByModelId('o1-preview').supportsThinking).toBe(true)
    expect(guessCapabilitiesByModelId('o3-mini').supportsThinking).toBe(true)
  })

  it('普通对话模型不误判为思考', () => {
    expect(guessCapabilitiesByModelId('deepseek-chat').supportsThinking).toBe(false)
    expect(guessCapabilitiesByModelId('qwen-plus').supportsThinking).toBe(false)
  })

  it('识别视觉模型：gpt-4o / claude-3 / gemini / qwen-vl / glm-4v', () => {
    expect(guessCapabilitiesByModelId('gpt-4o').supportsVision).toBe(true)
    expect(guessCapabilitiesByModelId('claude-3-opus').supportsVision).toBe(true)
    expect(guessCapabilitiesByModelId('gemini-1.5-pro').supportsVision).toBe(true)
    expect(guessCapabilitiesByModelId('qwen2.5-vl-72b').supportsVision).toBe(true)
    expect(guessCapabilitiesByModelId('glm-4v').supportsVision).toBe(true)
  })

  it('通用 vision / -vl 后缀兜底', () => {
    expect(guessCapabilitiesByModelId('some-model-vision').supportsVision).toBe(true)
    expect(guessCapabilitiesByModelId('some-model-vl').supportsVision).toBe(true)
  })

  it('普通文本模型不误判为视觉', () => {
    expect(guessCapabilitiesByModelId('deepseek-chat').supportsVision).toBe(false)
    expect(guessCapabilitiesByModelId('qwen-plus').supportsVision).toBe(false)
  })

  it('识别工具调用能力', () => {
    expect(guessCapabilitiesByModelId('gpt-4o').supportsTools).toBe(true)
    expect(guessCapabilitiesByModelId('qwen-plus').supportsTools).toBe(true)
    // deepseek 非 r 系列支持工具
    expect(guessCapabilitiesByModelId('deepseek-chat').supportsTools).toBe(true)
    // deepseek reasoner 不支持工具
    expect(guessCapabilitiesByModelId('deepseek-reasoner').supportsTools).toBe(false)
  })

  it('识别联网搜索（sonar）', () => {
    expect(guessCapabilitiesByModelId('sonar-pro').supportsWebSearch).toBe(true)
    expect(guessCapabilitiesByModelId('gpt-4o').supportsWebSearch).toBe(false)
  })
})

describe('resolveCapabilities（落库优先 + 兜底）', () => {
  it('def.type==="multimodal" → supportsVision=true，走主路径不依赖模型名', () => {
    const def = makeDef({ id: 'm1', type: 'multimodal' })
    const caps = resolveCapabilities('totally-unknown-model', def)
    expect(caps.supportsVision).toBe(true)
  })

  it('def.type==="text" → supportsVision=false', () => {
    const def = makeDef({ id: 'm1', type: 'text' })
    expect(resolveCapabilities('m1', def).supportsVision).toBe(false)
  })

  it('def.supportsThinking=true → 原样返回', () => {
    const def = makeDef({ id: 'm1', supportsThinking: true })
    expect(resolveCapabilities('m1', def).supportsThinking).toBe(true)
  })

  it('def 缺失（自定义模型/旧数据）→ 回退字符串兜底', () => {
    // 即使没有落库 def，deepseek-v4-pro 也能被兜底识别为 thinking
    const caps = resolveCapabilities('deepseek-v4-pro', undefined)
    expect(caps.supportsThinking).toBe(true)
  })

  it('def 存在但某字段 undefined → 该字段回退兜底，其余字段用 def', () => {
    // type=text 但没填 supportsThinking；模型名是 deepseek-reasoner
    const def = makeDef({ id: 'deepseek-reasoner', type: 'text' /* supportsThinking 未填 */ })
    const caps = resolveCapabilities('deepseek-reasoner', def)
    // supportsVision 用 def.type
    expect(caps.supportsVision).toBe(false)
    // supportsThinking 缺失 → 回退兜底命中
    expect(caps.supportsThinking).toBe(true)
  })

  it('def 完整时所有字段以 def 为准，不被模型名兜底干扰', () => {
    // def 明确说不支持思考，即便模型名是 deepseek-reasoner 也以 def 为准
    const def = makeDef({ id: 'deepseek-reasoner', type: 'text', supportsThinking: false })
    expect(resolveCapabilities('deepseek-reasoner', def).supportsThinking).toBe(false)
  })
})

describe('resolveMaxTokens（思维链模型下限保护）', () => {
  it('思维链模型 + 模型定义 maxOutputTokens=4096 → 抬到下限（回归：deepseek-v4-flash 截断 bug）', () => {
    // 2026-08 实际场景：模型定义里 maxOutputTokens=4096，思维链 6567 字符就把 4096 token 烧完，
    // finish_reason:length，正文 0 输出。下限保护必须把它抬起来。
    expect(resolveMaxTokens('deepseek-v4-flash', undefined, 4096, true)).toBe(THINKING_MODEL_MIN_MAX_TOKENS)
  })

  it('思维链模型 + 调用方显式传大值 → 尊重调用方（不压缩）', () => {
    expect(resolveMaxTokens('deepseek-v4-flash', 32768, 4096, true)).toBe(32768)
  })

  it('非思维链模型 + maxOutputTokens=4096 → 不抬高，尊重模型定义', () => {
    expect(resolveMaxTokens('deepseek-chat', undefined, 4096, true)).toBe(4096)
  })

  it('未应用下限（applyThinkingFloor=false）→ 原样返回', () => {
    expect(resolveMaxTokens('deepseek-v4-flash', undefined, 4096, false)).toBe(4096)
  })

  it('全部缺省 → 默认 8192', () => {
    expect(resolveMaxTokens('some-model', undefined, undefined, true)).toBe(8192)
  })
})
