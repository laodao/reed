/**
 * 模型级图像生成能力注册表
 * @module image-providers/model-capabilities
 * @description design docs/design/image-provider-capability-model-design.md §4
 *
 * 原则（评审确认）：**不隐瞒问题**
 * - 能力按模型级登记（前缀匹配），未登记 → 抛 UnregisteredModelCapabilityError
 * - 任何 provider 上线新模型时必须同步登记，否则生成调用会在边界报错
 * - 注册表须覆盖当前系统支持的全部 provider：dashscope / bailian / volcengine / openai
 *   （minimax / zhipu 经 image.service 映射走 openai 格式，登记在 openai 名下）
 */
import type { ImageModelCapabilities } from '@shared/types/image-provider.types'

/** 未登记模型能力错误 */
export class UnregisteredModelCapabilityError extends Error {
  constructor(providerType: string, modelId: string) {
    super(
      `模型未登记生成能力：provider=${providerType}, model=${modelId}。` +
      `请在 src/core/image-providers/model-capabilities.ts 的 MODEL_CAPABILITIES 中登记该模型的能力。`
    )
    this.name = 'UnregisteredModelCapabilityError'
  }
}

interface CapabilityEntry {
  provider: string
  match: RegExp
  caps: ImageModelCapabilities
}

/** 万相 wan2.x / wanx（dashscope 与 bailian 共用同一套能力） */
const WAN_CAPS: ImageModelCapabilities = {
  negativePrompt: true,
  seed: true,
  quality: true,
  style: true,
  guidanceScale: false,
  strength: false,
  sizeMode: 'pixels',
  maxReferenceImages: 4,
  watermark: 'optional',
  promptRewrite: 'optional_default_on',
  sequentialGeneration: false,
}

const MODEL_CAPABILITIES: CapabilityEntry[] = [
  // ==================== dashscope（万相 / qwen） ====================
  { provider: 'dashscope', match: /^qwen-image/, caps: {
    negativePrompt: true, seed: true, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 4,
    watermark: 'optional', promptRewrite: 'optional', sequentialGeneration: false,
  }},
  { provider: 'dashscope', match: /^wan/, caps: WAN_CAPS },

  // ==================== bailian（可灵 / 万相） ====================
  { provider: 'bailian', match: /^kling\/kling-v3-omni-image/, caps: {
    negativePrompt: false, seed: false, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'aspect_ratio_resolution', maxReferenceImages: 10,
    watermark: 'optional', promptRewrite: 'none', sequentialGeneration: true,
  }},
  { provider: 'bailian', match: /^kling\//, caps: {
    negativePrompt: false, seed: false, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'aspect_ratio_resolution', maxReferenceImages: 1,
    watermark: 'optional', promptRewrite: 'none', sequentialGeneration: false,
  }},
  { provider: 'bailian', match: /^wan/, caps: WAN_CAPS },

  // ==================== volcengine（Seedream，模型级差异） ====================
  { provider: 'volcengine', match: /^doubao-seedream-3-0/, caps: {
    negativePrompt: true, seed: true, quality: false, style: false,
    guidanceScale: true, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 9,
    watermark: 'optional', promptRewrite: 'none', sequentialGeneration: false,
  }},
  // Seedream 4.x / 5.x：无 seed/guidance，参考图 14 张，官方默认带水印
  { provider: 'volcengine', match: /^doubao-seedream-[45]|^seedream-[45]/, caps: {
    negativePrompt: false, seed: false, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 14,
    watermark: 'default_on', promptRewrite: 'optional', sequentialGeneration: true,
  }},

  // ==================== openai（DALL-E / gpt-image；minimax/zhipu 映射同格式） ====================
  { provider: 'openai', match: /^gpt-image/, caps: {
    negativePrompt: false, seed: false, quality: true, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 4,
    watermark: 'not_supported', promptRewrite: 'none', sequentialGeneration: false,
  }},
  { provider: 'openai', match: /^dall-e/, caps: {
    negativePrompt: false, seed: false, quality: true, style: true,
    guidanceScale: false, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 0,
    watermark: 'not_supported', promptRewrite: 'none', sequentialGeneration: false,
  }},
  // minimax / zhipu 走 openai 兼容（image.service 已映射为 openai 类型）
  { provider: 'openai', match: /^image-/, caps: {   // minimax image-01
    negativePrompt: true, seed: true, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 1,
    watermark: 'optional', promptRewrite: 'none', sequentialGeneration: false,
  }},
  { provider: 'openai', match: /^cogview/, caps: {  // zhipu cogview
    negativePrompt: true, seed: true, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 1,
    watermark: 'optional', promptRewrite: 'none', sequentialGeneration: false,
  }},
]

/**
 * 查询模型生成能力。
 * @param providerType - provider 类型（dashscope / bailian / volcengine / openai）
 * @param modelId - 模型 id
 * @returns 能力集
 * @throws UnregisteredModelCapabilityError 未登记（含未登记 provider 类型）
 */
export function getModelCapabilities(providerType: string, modelId: string): ImageModelCapabilities {
  const entry = MODEL_CAPABILITIES.find(
    e => e.provider === providerType && e.match.test(modelId),
  )
  if (!entry) {
    throw new UnregisteredModelCapabilityError(providerType, modelId)
  }
  return entry.caps
}
