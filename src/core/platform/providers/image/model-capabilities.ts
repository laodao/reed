/**
 * 模型级图像生成能力注册表
 * @module platform/providers/image/model-capabilities
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

/** 万相 wan2.x / wanx（dashscope 用；bailian 的 wan 实测只吃 1 张参考图，见注册表内条目） */
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
  { provider: 'bailian', match: /^wan/, caps: {
    // 2026-09-18 场次2实测修正：bailian 网关对 wan 走老 text2image 形态
    // （bailian-image.provider.buildRequestBody），只有 input.image_url=refs[0] 被消费，
    // 多出来的 ref 进 element_list —— 该字段仅 kling-v3 识别，wan 一律忽略，
    // 多角色参考图被静默丢弃（阿蘅漂移根因）。dashscope 的 wan2.7-image 走多模态
    // content[] 是真多图，不受影响（仍用 WAN_CAPS）。
    ...WAN_CAPS,
    maxReferenceImages: 1,
  }},
  // KE-4 实测补充：bailian 专属网关的 qwen-image 系（与 dashscope 同能力面）
  // 2026-09-19 实测修正：网关路由到 qwen-image-3.0-distill，API 明确报错
  // "supports 0~3 image content items" → 参考图上限 3（非 4）
  { provider: 'bailian', match: /^qwen-image/, caps: {
    negativePrompt: true, seed: true, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 3,
    watermark: 'optional', promptRewrite: 'optional', sequentialGeneration: false,
  }},

  // ==================== volcengine（Seedream，模型级差异） ====================
  { provider: 'volcengine', match: /^(doubao-)?seedream-3-0/, caps: {
    negativePrompt: true, seed: true, quality: false, style: false,
    guidanceScale: true, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 9,
    watermark: 'optional', promptRewrite: 'none', sequentialGeneration: false,
  }},
  // Seedream 4.x / 5.x：无 seed/guidance，参考图 14 张，官方默认带水印
  { provider: 'volcengine', match: /^(doubao-)?seedream-[45]/, caps: {
    negativePrompt: false, seed: false, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 14,
    watermark: 'default_on', promptRewrite: 'optional', sequentialGeneration: true,
  }},

  // ==================== comfyui（Krea2 / Flux Kontext，局域网生成网关） ====================
  { provider: 'comfyui', match: /^krea/, caps: {
    negativePrompt: false, seed: false, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'aspect_ratio_resolution', maxReferenceImages: 0,
    watermark: 'not_supported', promptRewrite: 'none', sequentialGeneration: false,
  }},
  { provider: 'comfyui', match: /^flux-kontext/, caps: {
    negativePrompt: false, seed: false, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 1,
    watermark: 'not_supported', promptRewrite: 'none', sequentialGeneration: false,
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
 *
 * 解析顺序（不隐瞒原则，全部为显式匹配，无静默默认）：
 * 1. 按模型 id 前缀匹配（doubao-seedream-4-5-251128 等标准模型名）
 * 2. 按模型名称匹配（火山方舟推理接入点 ep-* 的 id 不含模型信息，
 *    用 provider 配置里用户填写的名称兜底，如 "Seedream 5.0 lite"）
 * 3. 均失败 → 抛 UnregisteredModelCapabilityError
 *
 * @param providerType - provider 类型（dashscope / bailian / volcengine / openai）
 * @param modelId - 模型 id（可能是 ep-* 接入点 id）
 * @param modelName - 模型显示名（可选，provider 配置里的名称，用于 ep-* 兜底解析）
 */
export function getModelCapabilities(
  providerType: string,
  modelId: string,
  modelName?: string,
): ImageModelCapabilities {
  // 1. 按 id 匹配
  const byId = MODEL_CAPABILITIES.find(
    e => e.provider === providerType && e.match.test(modelId),
  )
  if (byId) return byId.caps

  // 2. 按名称匹配（ep-* 接入点兜底；名称规范化：小写、空格/下划线/点转连字符，
  //    兼容 "Seedream 5.0 lite" → seedream-5-0-lite、"seedream-3.0-t2i" → seedream-3-0-t2i）
  if (modelName) {
    const normalized = modelName.toLowerCase().replace(/[\s_.]+/g, '-')
    const byName = MODEL_CAPABILITIES.find(
      e => e.provider === providerType && e.match.test(normalized),
    )
    if (byName) return byName.caps
  }

  // 3. 显式报错
  throw new UnregisteredModelCapabilityError(providerType, modelId)
}
