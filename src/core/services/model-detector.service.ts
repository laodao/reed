/**
 * 模型检测服务
 * @module core/services/model-detector
 * @description 自动检测模型能力和特性
 */

import type { ModelType } from '@shared/types/provider-template.types'

/**
 * 检测模型类型
 * @param modelId - 模型 ID（小写）
 * @returns ModelType
 */
export function detectModelType(modelId: string): ModelType {
  // 嵌入模型 - 必须最先检查
  if (modelId.includes('embedding') || modelId.includes('embed')) {
    return 'embedding'
  }

  // 重排序模型
  if (modelId.includes('rerank')) {
    return 'rerank'
  }

  // 图像生成模型
  if (
    modelId.includes('dall-e') ||
    modelId.includes('stable-diffusion') ||
    modelId.includes('midjourney') ||
    modelId.includes('cogview') ||
    modelId.includes('wanx') ||
    modelId.includes('flux') ||
    (modelId.includes('image') && !modelId.includes('vision')) ||
    (modelId.includes('picture') && !modelId.includes('vision'))
  ) {
    return 'image'
  }

  // 视频生成模型
  if (modelId.includes('sora') || modelId.includes('video') || modelId.includes('runway')) {
    return 'video'
  }

  // 音频模型
  if (
    modelId.includes('whisper') ||
    modelId.includes('tts') ||
    modelId.includes('audio') ||
    modelId.includes('speech') ||
    modelId.includes('voice') ||
    modelId.includes('asr')
  ) {
    return 'audio'
  }

  // 多模态模型（支持图像输入）
  // OpenAI GPT-4 系列
  if (
    modelId.includes('gpt-4o') ||
    modelId.includes('gpt-4-turbo') ||
    modelId.includes('gpt-4-vision') ||
    modelId.includes('gpt-4-1106-vision') ||
    modelId.includes('gpt-4-0125-preview') ||
    modelId.includes('gpt-4-1106-preview')
  ) {
    return 'multimodal'
  }

  // OpenAI o1/o3 系列
  if (modelId.match(/\bo1[-_]?/) || modelId.match(/\bo3[-_]?/)) {
    return 'multimodal'
  }

  // Anthropic Claude 3 系列
  if (
    modelId.includes('claude-3') ||
    modelId.includes('claude-sonnet') ||
    modelId.includes('claude-opus') ||
    modelId.includes('claude-haiku')
  ) {
    return 'multimodal'
  }

  // Google Gemini 系列
  if (modelId.includes('gemini')) {
    return 'multimodal'
  }

  // 阿里通义千问视觉模型
  if (
    modelId.includes('qwen-vl') ||
    modelId.includes('qwen2-vl') ||
    modelId.includes('qwen2.5-vl')
  ) {
    return 'multimodal'
  }

  // 智谱 GLM-4V 视觉模型
  if (modelId.includes('glm-4v') || modelId.includes('glm-4-vision')) {
    return 'multimodal'
  }

  // 默认为文本模型
  return 'text'
}

/**
 * 检测模型是否支持深度思考
 * @param modelId - 模型 ID（小写）
 * @returns boolean
 */
export function detectThinkingSupport(modelId: string): boolean {
  // DeepSeek R1 / Reasoner
  if (modelId.includes('deepseek-reasoner') || modelId.includes('deepseek-r1')) {
    return true
  }
  // OpenAI o1 / o3 系列
  if (modelId.match(/\bo1[-_]?/) || modelId.match(/\bo3[-_]?/)) {
    return true
  }
  return false
}

/**
 * 检测模型是否支持联网搜索
 * @param modelId - 模型 ID（小写）
 * @returns boolean
 */
export function detectWebSearchSupport(modelId: string): boolean {
  // Perplexity sonar 系列
  if (modelId.includes('sonar')) {
    return true
  }
  return false
}

/**
 * 检测模型是否支持工具调用
 * @param modelId - 模型 ID（小写）
 * @returns boolean
 */
export function detectToolSupport(modelId: string): boolean {
  // OpenAI GPT-3.5/GPT-4 系列支持函数调用
  if (
    modelId.includes('gpt-3.5') ||
    modelId.includes('gpt-4') ||
    modelId.includes('gpt-4o')
  ) {
    return true
  }

  // OpenAI o1/o3 系列
  if (modelId.match(/\bo1[-_]?/) || modelId.match(/\bo3[-_]?/)) {
    return true
  }

  // Anthropic Claude 3 系列
  if (
    modelId.includes('claude-3') ||
    modelId.includes('claude-sonnet') ||
    modelId.includes('claude-opus') ||
    modelId.includes('claude-haiku')
  ) {
    return true
  }

  // Google Gemini
  if (modelId.includes('gemini')) {
    return true
  }

  // DeepSeek（reasoner/r1 系列不支持）
  if (
    modelId.includes('deepseek') &&
    !modelId.includes('reasoner') &&
    !modelId.includes('r1')
  ) {
    return true
  }

  // 智谱 GLM-4
  if (modelId.includes('glm-4')) {
    return true
  }

  // 通义千问
  if (modelId.includes('qwen') && !modelId.includes('vl')) {
    return true
  }

  // Moonshot
  if (modelId.includes('moonshot') || modelId.includes('kimi')) {
    return true
  }

  return false
}

/**
 * 检测模型是否支持视觉（图像输入）
 * @param modelId - 模型 ID（小写）
 * @returns boolean
 */
export function detectVisionSupport(modelId: string): boolean {
  const modelType = detectModelType(modelId)
  return modelType === 'multimodal'
}