/**
 * narrative/ai/story-text-generator
 * @module platform/episode-production/narrative/ai/story-text-generator
 * @description 「AI 写剧本」——根据用户提示词 + 故事背景，生成小说体裁的故事原文。
 *
 * 用途：在「创建剧集」对话框里，让用户凭一句提示词生成故事原文，回填到
 * uploadedContent 字段；后续在剧本 stage 由 EpisodeScriptGenerator 拆成结构化场景。
 *
 * 边界划分：
 * - 本模块只产出"原著/长文"体裁的**自由文本**（对齐 uploadedContent 字段语义）。
 * - 不做场景拆分 / binding 引用——那是 EpisodeScriptGenerator 的职责（需要资产 roster），
 *   且创建剧集时机通常还没建资产，结构化方案不可用。
 */

import { callAI } from './_helpers'
import type { EpAiGenerateTextRequest } from '@shared/types/episode-production'
import {
  createDefaultPromptContext,
  STORY_CHARS_PER_TARGET_SEC,
  type PromptContext,
} from '../../prompts/prompt-context'

/** 故事原文长度硬上下限（中文字符）——按目标集长推算结果会被收敛到该区间 */
export const STORY_TEXT_MIN_CHARS = 800
export const STORY_TEXT_MAX_CHARS = 3000

/**
 * 按目标集长推算篇幅区间（§3.3：长度不再写死，与目标集长挂钩）。
 *
 * 以 `targetEpisodeDurationSec × STORY_CHARS_PER_TARGET_SEC` 为中心取 0.6/1.4 倍，
 * 再**逐端收敛**到硬上下限（而不是整段回退），保证：
 *   - 结果恒为有效区间（min < max）；
 *   - 随目标集长单调不减（长集不会给出比短集更短的篇幅建议）。
 *
 * 未配置/非法目标集长时返回历史区间 800–3000。
 */
export function resolveStoryCharsRange(
  targetEpisodeDurationSec?: number,
): { min: number; max: number } {
  if (!targetEpisodeDurationSec || targetEpisodeDurationSec <= 0) {
    return { min: STORY_TEXT_MIN_CHARS, max: STORY_TEXT_MAX_CHARS }
  }
  const center = targetEpisodeDurationSec * STORY_CHARS_PER_TARGET_SEC
  // 逐端 clamp：min 上不越过"上限减 1"，max 下不低于"下限加 1"，避免区间退化
  const min = Math.min(
    Math.max(STORY_TEXT_MIN_CHARS, Math.round(center * 0.6)),
    STORY_TEXT_MAX_CHARS - 1,
  )
  const max = Math.max(
    Math.min(STORY_TEXT_MAX_CHARS, Math.round(center * 1.4)),
    min + 1,
  )
  return { min, max }
}

/**
 * 系统提示词：定位资深小说家，输出小说体裁正文。
 * - 纯文本（无 Markdown）
 * - 篇幅按目标集长推算（缺省 800–3000 字）
 * - **对白必须使用引号标出**（§3.3：把下游保真校验的隐含前提显式化到上游）
 * - 只输出正文，不加开场白 / 解释
 */
export function buildStoryTextSystemPrompt(
  ctx: PromptContext = createDefaultPromptContext(),
): string {
  const { min, max } = resolveStoryCharsRange(ctx.targetEpisodeDurationSec)
  const genreLine = ctx.genre.narrativeRequirement
    ? `\n6. 体裁要求（${ctx.genre.label}）：${ctx.genre.narrativeRequirement}`
    : ''

  return `你是一位拥有10年以上经验的资深小说家，擅长影视化叙事。请根据用户给出的创作要求，撰写一段故事原文（小说体裁）。

要求：
1. 体裁：小说正文，包含生动的场景描写、人物动作与神态、自然融入的对白、清晰的情节推进。
2. 篇幅：${min}–${max} 字（中文字符计），确保有足够细节供后续剧本拆分使用。
3. 格式：纯文本，不要使用 Markdown（不要 # 标题、** 加粗、代码块等）；段落用空行分隔。
4. 只输出故事正文本身，不要写"以下是故事"之类的开场白或结尾解释。
5. 若给定了故事背景（年代/地域/其他），需在情节中自然体现该背景的氛围与质感。
6. **人物对白必须使用引号标出**（如："这句话是角色说的。"）——本故事后续将被改编为剧本，
   对白需要能被逐句提取与校验；不使用引号的对白会被下游保真校验视为缺失。${genreLine}`
}

/** 向后兼容的静态常量（= 无上下文渲染结果，历史默认篇幅） */
export const STORY_TEXT_SYSTEM_PROMPT = buildStoryTextSystemPrompt()

/**
 * 把请求里的"故事背景 + 创作要求"拼成最终用户提示词（纯函数，便于单测）。
 *
 * 拼接规则：
 * - 任一背景字段 trim 后非空 → 输出【故事背景】段（仅含非空字段）
 * - 创作要求始终作为【创作要求】段
 * - 段落之间用空行分隔
 */
export function buildStoryTextUserPrompt(req: EpAiGenerateTextRequest): string {
  const bg: string[] = []
  const era = req.storyEra?.trim()
  const region = req.storyRegion?.trim()
  const extra = req.storyBackgroundExtra?.trim()
  if (era) bg.push(`年代：${era}`)
  if (region) bg.push(`地域：${region}`)
  if (extra) bg.push(`其他：${extra}`)

  const parts: string[] = []
  if (bg.length > 0) {
    parts.push('【故事背景】\n' + bg.join('\n'))
  }
  parts.push('【创作要求】\n' + req.prompt.trim())
  return parts.join('\n\n')
}

/**
 * 生成故事原文：拼提示词 → 调 callAI（非流式，返回纯文本）。
 * provider/model 缺省时走 callAI 内部 fallback；未配置 provider 会 throw（由调用方 catch）。
 *
 * @param ctx PromptContext（§3.3：体裁叙事要求 + 目标集长决定篇幅区间；
 *            缺省不注入，行为等价优化前）
 */
export async function generateStoryText(
  req: EpAiGenerateTextRequest,
  ctx: PromptContext = createDefaultPromptContext(),
): Promise<string> {
  const userPrompt = buildStoryTextUserPrompt(req)
  const systemPrompt = buildStoryTextSystemPrompt(ctx)
  const maxTokens = req.maxTokens ?? 16000
  return callAI(
    userPrompt,
    systemPrompt,
    maxTokens,
    req.providerConfigId,
    req.modelId,
  )
}

/** @internal 测试用：暴露纯函数与常量，便于不打 AI 接口验证拼接逻辑 */
export const __test = {
  buildStoryTextUserPrompt,
  buildStoryTextSystemPrompt,
  resolveStoryCharsRange,
  STORY_TEXT_SYSTEM_PROMPT,
}
