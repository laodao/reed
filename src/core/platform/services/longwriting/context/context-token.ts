/**
 * 上下文 token 估算 + 模型窗口解析（步骤1 新增）
 * @module core/platform/services/longwriting/context/context-token
 *
 * 中文按 ceil(字符数*1.5) 粗略估算（不引入 tiktoken，误差由安全边际 1000 + 压缩兜底）。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'

/** 默认模型上下文窗口（未知时的保守兜底） */
export const DEFAULT_MODEL_WINDOW = 16000

/** 安全边际（预留固定 token，避免估算误差超 prompt） */
export const SAFETY_MARGIN = 1000

/**
 * 估算文本 token 数：ceil(字符数 * 1.5)
 * 中文 token 与字符比约 1.5，英文约 0.25，混合用 1.5 偏保守。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length * 1.5)
}

/**
 * 解析模型上下文窗口（优先 ModelDefinition.contextWindow）。
 * 三档：
 * ① config.models 命中 modelId 且有 contextWindow → 取 contextWindow
 * ② 命中但无 contextWindow，有 maxOutputTokens → maxOutputTokens * 4（保守估窗口）
 * ③ 全无 → DEFAULT_MODEL_WINDOW (16000)
 */
export async function resolveModelWindow(
  providerConfigId?: string,
  modelId?: string,
): Promise<number> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.providerConfigs) return DEFAULT_MODEL_WINDOW

    const config = providerConfigId
      ? await db.providerConfigs.getById(providerConfigId)
      : (await db.providerConfigs.getDefault()) ||
        ((await db.providerConfigs.getEnabled?.())[0] ?? null)
    if (!config) return DEFAULT_MODEL_WINDOW

    const models = (config as any).models || []
    const modelDef = modelId ? models.find((m: any) => m.id === modelId) : models[0]
    if (!modelDef) return DEFAULT_MODEL_WINDOW

    // 档①
    if (modelDef.contextWindow && modelDef.contextWindow > 0) {
      return modelDef.contextWindow
    }
    // 档②
    if (modelDef.maxOutputTokens && modelDef.maxOutputTokens > 0) {
      return modelDef.maxOutputTokens * 4
    }
    // 档③
    return DEFAULT_MODEL_WINDOW
  } catch {
    return DEFAULT_MODEL_WINDOW
  }
}

/**
 * 计算动态 token 预算
 * - reservedForGeneration = min(targetWords*2, floor(modelWindow/2))：生成预留，上限一半
 * - availableForContext = modelWindow - reservedForGeneration - SAFETY_MARGIN：上下文可用
 * - maxTokens = min(targetWords*2, reservedForGeneration)：放开旧 8192 上限
 */
export function computeBudget(
  modelWindow: number,
  targetWords: number,
): {
  reservedForGeneration: number
  availableForContext: number
  maxTokens: number
} {
  const reservedForGeneration = Math.min(
    targetWords * 2,
    Math.floor(modelWindow / 2),
  )
  const availableForContext = Math.max(
    0,
    modelWindow - reservedForGeneration - SAFETY_MARGIN,
  )
  const maxTokens = Math.min(targetWords * 2, reservedForGeneration)
  return { reservedForGeneration, availableForContext, maxTokens }
}
