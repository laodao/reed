/**
 * 模型能力解析（纯函数）
 * @module core/providers/model-capability
 *
 * 设计目的：消除 AI Provider 层「按模型名字符串硬编码判断能力」的病根。
 *
 * 能力数据本应来自落库的 ModelDefinition（testConnection 检测后写入 UserProviderConfig.models），
 * 但 provider 层历史上各自重新做字符串匹配（supportsVision / isDeepSeekR1），导致：
 *  - 新模型（deepseek-v4-pro、qwen3.x）能力对不上；
 *  - reasoning_content 字段被静默丢弃 → 流式响应内容为 0 → 前端"一直不返回"。
 *
 * 本模块提供统一入口 resolveCapabilities：
 *  - 优先读落库 ModelDefinition 能力字段（type / supportsThinking / supportsTools / supportsWebSearch）；
 *  - def 缺失或某字段为 undefined 时，按模型名回退字符串兜底（向后兼容旧数据 / 未 testConnection 的自定义模型）；
 *  - 视觉能力统一用 type==='multimodal' 表达（全代码库一致标准）。
 */

import type { ModelDefinition } from '@shared/types'

/**
 * 模型能力集合
 */
export interface ModelCapabilities {
  /** 是否支持图像输入（视觉/多模态） */
  supportsVision: boolean
  /** 是否支持深度思考（会返回 reasoning_content 思维链） */
  supportsThinking: boolean
  /** 是否内置联网搜索 */
  supportsWebSearch: boolean
  /** 是否支持工具/函数调用 */
  supportsTools: boolean
}

/**
 * 仅按模型名字符串兜底推断能力。
 *
 * 当落库 ModelDefinition 缺失（自定义模型未 testConnection、旧数据）时使用。
 * 清单来自历史上两个 provider 文件的合并去重，并补充了新模型（deepseek-v4-pro）。
 * 这是"最后防线"，主路径应优先依赖落库能力字段。
 */
export function guessCapabilitiesByModelId(modelId: string): ModelCapabilities {
  const id = (modelId || '').toLowerCase()

  // ===== 是否支持深度思考（返回 reasoning_content） =====
  let supportsThinking = false
  if (
    id.includes('deepseek-reasoner') ||
    id.includes('deepseek-r1') ||
    // DeepSeek V4 系列（pro/flash 等）默认输出 reasoning_content，旧 isDeepSeekR1 漏判会导致内容被丢弃
    id.includes('deepseek-v4') ||
    /\bo1[-_]?/.test(id) ||
    /\bo3[-_]?/.test(id)
  ) {
    supportsThinking = true
  }

  // ===== 是否支持视觉（图像输入） =====
  let supportsVision = false
  if (
    // OpenAI GPT-4 系列
    id.includes('gpt-4o') ||
    id.includes('gpt-4-turbo') ||
    id.includes('gpt-4-vision') ||
    id.includes('gpt-4-1106-vision') ||
    id.includes('gpt-4-0125-preview') ||
    id.includes('gpt-4-1106-preview') ||
    // Anthropic Claude 3 系列
    id.includes('claude-3') ||
    id.includes('claude-sonnet') ||
    id.includes('claude-opus') ||
    id.includes('claude-haiku') ||
    // Google Gemini 系列
    id.includes('gemini') ||
    // 阿里通义千问视觉模型
    id.includes('qwen-vl') ||
    id.includes('qwen2-vl') ||
    id.includes('qwen2.5-vl') ||
    // 智谱视觉模型
    id.includes('glm-4v') ||
    id.includes('glm-4-vision') ||
    // 其他 OpenAI 兼容平台的视觉模型（通用后缀兜底）
    id.includes('vision') ||
    id.includes('-vl') ||
    id.includes('-v-')
  ) {
    supportsVision = true
  }

  // ===== 是否支持工具/函数调用 =====
  let supportsTools = false
  if (
    id.includes('gpt-3.5') ||
    id.includes('gpt-4') ||
    id.includes('gpt-4o') ||
    /\bo1[-_]?/.test(id) ||
    /\bo3[-_]?/.test(id) ||
    id.includes('claude-3') ||
    id.includes('claude-sonnet') ||
    id.includes('claude-opus') ||
    id.includes('claude-haiku') ||
    id.includes('gemini') ||
    // DeepSeek（reasoner / r1 系列不支持工具）
    (id.includes('deepseek') && !id.includes('reasoner') && !id.includes('r1')) ||
    id.includes('glm-4') ||
    // 通义千问（视觉 vl 不算工具）
    (id.includes('qwen') && !id.includes('vl')) ||
    id.includes('moonshot') ||
    id.includes('kimi')
  ) {
    supportsTools = true
  }

  // ===== 是否内置联网搜索 =====
  let supportsWebSearch = false
  if (id.includes('sonar')) {
    supportsWebSearch = true
  }

  return { supportsVision, supportsThinking, supportsWebSearch, supportsTools }
}

/**
 * 解析模型能力：落库 ModelDefinition 优先，缺失/未填字段按模型名兜底。
 *
 * @param modelId 模型 ID
 * @param def 落库的 ModelDefinition（可空）
 * @returns 能力集合
 */
export function resolveCapabilities(
  modelId: string,
  def: ModelDefinition | undefined
): ModelCapabilities {
  // 无落库定义 → 完全走字符串兜底
  if (!def) {
    return guessCapabilitiesByModelId(modelId)
  }

  const guessed = guessCapabilitiesByModelId(modelId)

  // 视觉能力：统一用 type==='multimodal' 表达；type 缺失时回退模型名兜底
  const supportsVision =
    def.type !== undefined ? def.type === 'multimodal' : guessed.supportsVision

  // 其余能力字段：def 显式声明（含 false）则用 def，未声明（undefined）则回退兜底
  const supportsThinking =
    def.supportsThinking !== undefined ? def.supportsThinking : guessed.supportsThinking
  const supportsWebSearch =
    def.supportsWebSearch !== undefined ? def.supportsWebSearch : guessed.supportsWebSearch
  const supportsTools =
    def.supportsTools !== undefined ? def.supportsTools : guessed.supportsTools

  return { supportsVision, supportsThinking, supportsWebSearch, supportsTools }
}

/**
 * 思维链模型的 max_tokens 下限。
 * reasoning_content 计入输出 token：思维链动辄数千 token，若 max_tokens 太小（如 4096），
 * 会在思考阶段就撞顶（finish_reason:length），正文一个字都不输出 —— 表现为"只有思维链、回答被截断"。
 */
export const THINKING_MODEL_MIN_MAX_TOKENS = 16384

/**
 * 统一计算 max_tokens。
 *
 * 优先级：调用方传入 > 模型定义 maxOutputTokens > 默认 8192。
 * 若模型是思维链模型（reasoning 计入输出 token），应用下限 THINKING_MODEL_MIN_MAX_TOKENS
 * —— 防止模型定义里过小的值（如 4096）导致思考阶段就被截断。
 *
 * @param modelId 模型 ID（用于判断是否思维链模型，按名兜底）
 * @param optionMaxTokens 调用方显式传入的 maxTokens（最高优先）
 * @param modelMaxOutputTokens 落库模型定义的 maxOutputTokens
 * @param applyThinkingFloor 是否应用思维链下限（由 provider 的 supportedParams 控制的场景传 true）
 */
export function resolveMaxTokens(
  modelId: string,
  optionMaxTokens?: number,
  modelMaxOutputTokens?: number,
  applyThinkingFloor: boolean = false
): number {
  const base = optionMaxTokens ?? modelMaxOutputTokens ?? 8192
  if (!applyThinkingFloor) {
    return base
  }
  const caps = resolveCapabilities(modelId, undefined)
  if (!caps.supportsThinking) {
    return base
  }
  return Math.max(base, THINKING_MODEL_MIN_MAX_TOKENS)
}
