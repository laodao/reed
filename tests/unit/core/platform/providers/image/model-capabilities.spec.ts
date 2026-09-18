/**
 * 模型级图像生成能力注册表 · 单元测试
 * @see src/core/image-providers/model-capabilities.ts
 *
 * 验证目标（design docs/design/image-provider-capability-model-design.md §4/§8）：
 * 1. 已登记模型返回正确能力集（万相/Seedream/可灵/OpenAI 兼容）
 * 2. 能力按模型级区分（seedream-3.0 支持 seed，4.5 不支持）
 * 3. 前缀匹配（doubao-seedream-4-5-251128 命中 ^doubao-seedream-4-5）
 * 4. **未登记模型：抛 UnregisteredModelCapabilityError（不隐瞒，不静默回退）**
 */
import { describe, expect, it } from 'vitest'
import {
  getModelCapabilities,
  UnregisteredModelCapabilityError,
} from '@core/platform/providers/image/model-capabilities'

describe('getModelCapabilities · 已登记模型', () => {
  it('万相 wan2.6-image：负面词/seed/quality 支持，pixels 尺寸，参考图 4 张', () => {
    const caps = getModelCapabilities('dashscope', 'wan2.6-image')
    expect(caps.negativePrompt).toBe(true)
    expect(caps.seed).toBe(true)
    expect(caps.quality).toBe(true)
    expect(caps.sizeMode).toBe('pixels')
    expect(caps.maxReferenceImages).toBe(4)
    expect(caps.strength).toBe(false)
    expect(caps.promptRewrite).toBe('optional_default_on')
  })

  it('万相 qwen-image：multimodal 格式能力', () => {
    const caps = getModelCapabilities('dashscope', 'qwen-image')
    expect(caps.negativePrompt).toBe(true)
    expect(caps.seed).toBe(true)
    expect(caps.sizeMode).toBe('pixels')
    expect(caps.maxReferenceImages).toBeGreaterThan(0)
  })

  it('Seedream 4.5（带版本后缀）：无 seed，参考图 14 张，watermark 默认开', () => {
    const caps = getModelCapabilities('volcengine', 'doubao-seedream-4-5-251128')
    expect(caps.seed).toBe(false)
    expect(caps.guidanceScale).toBe(false)
    expect(caps.negativePrompt).toBe(false)
    expect(caps.maxReferenceImages).toBe(14)
    expect(caps.watermark).toBe('default_on')
    expect(caps.sizeMode).toBe('pixels')
  })

  it('Seedream 3.0 t2i：支持 seed/guidanceScale（模型级差异）', () => {
    const caps = getModelCapabilities('volcengine', 'doubao-seedream-3-0-t2i-250619')
    expect(caps.seed).toBe(true)
    expect(caps.guidanceScale).toBe(true)
  })

  it('可灵 v3 图像：仅 n/aspect_ratio/resolution，参考图 1 张', () => {
    const caps = getModelCapabilities('bailian', 'kling/kling-v3-image-generation')
    expect(caps.negativePrompt).toBe(false)
    expect(caps.seed).toBe(false)
    expect(caps.quality).toBe(false)
    expect(caps.sizeMode).toBe('aspect_ratio_resolution')
    expect(caps.maxReferenceImages).toBe(1)
    expect(caps.sequentialGeneration).toBe(false)
  })

  it('可灵 v3 omni：多参考图 + 组图', () => {
    const caps = getModelCapabilities('bailian', 'kling/kling-v3-omni-image-generation')
    expect(caps.maxReferenceImages).toBe(10)
    expect(caps.sequentialGeneration).toBe(true)
  })

  it('OpenAI DALL-E 3：无参考图，无负面词', () => {
    const caps = getModelCapabilities('openai', 'dall-e-3')
    expect(caps.maxReferenceImages).toBe(0)
    expect(caps.negativePrompt).toBe(false)
    expect(caps.sizeMode).toBe('pixels')
  })

  it('OpenAI gpt-image-1：支持参考图', () => {
    const caps = getModelCapabilities('openai', 'gpt-image-1')
    expect(caps.maxReferenceImages).toBeGreaterThan(0)
  })

  it('bailian 万相模型：与 dashscope 同基础能力，但实测只吃 1 张参考图', () => {
    const caps = getModelCapabilities('bailian', 'wan2.6-image')
    expect(caps.negativePrompt).toBe(true)
    expect(caps.seed).toBe(true)
    // 2026-09-19 修正：bailian 网关对 wan 走老 text2image 形态，element_list 不被消费
    expect(caps.maxReferenceImages).toBe(1)
  })
})

describe('getModelCapabilities · 未登记报错（不隐瞒）', () => {
  it('未登记模型：抛 UnregisteredModelCapabilityError，消息含模型 id 与登记指引', () => {
    expect(() => getModelCapabilities('dashscope', 'some-future-model-9'))
      .toThrow(UnregisteredModelCapabilityError)
    expect(() => getModelCapabilities('dashscope', 'some-future-model-9'))
      .toThrow(/some-future-model-9/)
    expect(() => getModelCapabilities('dashscope', 'some-future-model-9'))
      .toThrow(/model-capabilities\.ts/)
  })

  it('未登记 provider 类型：同样抛错', () => {
    expect(() => getModelCapabilities('unknown-provider', 'any-model'))
      .toThrow(UnregisteredModelCapabilityError)
  })
})

describe('getModelCapabilities · ep-* 接入点名称兜底（火山方舟）', () => {
  it('ep-* + 名称 "seedream-5.0-lite"：解析为 Seedream 5 能力', () => {
    const caps = getModelCapabilities('volcengine', 'ep-20260324195047-cnpvj', 'seedream-5.0-lite')
    expect(caps.maxReferenceImages).toBe(14)
    expect(caps.watermark).toBe('default_on')
  })

  it('ep-* + 名称 "Seedream 5.0 lite"（空格/大小写）也命中', () => {
    const caps = getModelCapabilities('volcengine', 'ep-20260324195047-cnpvj', 'Seedream 5.0 lite')
    expect(caps.maxReferenceImages).toBe(14)
  })

  it('ep-* + 名称 "Seedream 3.0 t2i"：解析为 3.0 能力（支持 seed）', () => {
    const caps = getModelCapabilities('volcengine', 'ep-x', 'seedream-3.0-t2i')
    expect(caps.seed).toBe(true)
  })

  it('ep-* + 无法识别的名称：仍然抛错（不隐瞒）', () => {
    expect(() => getModelCapabilities('volcengine', 'ep-x', '某个自定义名字'))
      .toThrow(UnregisteredModelCapabilityError)
  })

  it('ep-* 且无名称：仍然抛错', () => {
    expect(() => getModelCapabilities('volcengine', 'ep-x'))
      .toThrow(UnregisteredModelCapabilityError)
  })
})
