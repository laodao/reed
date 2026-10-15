/**
 * 剧集制作 · 提示词上下文（提示词优化方案 §2.1，原则 P2 业务变量全部注入）
 * @module platform/episode-production/prompts/prompt-context
 *
 * 背景：优化前各环节各取所需、互不对账——
 *   - 剧本生成完全拿不到故事背景（era/region/extra），润色器却有；
 *   - cogen 拿不到风格/目标时长，却要求"15s 片段 8-12 镜"；
 *   - 关键帧拿不到性别/年龄/人种，资产阶段精心反推的身份字段在此断链；
 *   - 语速 4.5 字/秒在 cogen 常量、提示词、前端三处各写一份。
 *
 * 本模块定义全链路统一注入上下文 `PromptContext`，由 DB 项目配置同源构建，
 * 保证 Agent 快照、剧本、分镜、关键帧、视频各环节拿到的是**同一份**上下文。
 *
 * 使用约定：prompt builder 统一签名 `(input, ctx: PromptContext)`，
 * 缺省上下文用 `createDefaultPromptContext()`（不注入任何业务变量，行为等价于优化前）。
 */

import type { GenreKey } from './genre-profiles'
import { DEFAULT_GENRE, getGenreProfile, type GenreProfile } from './genre-profiles'
import type { EraProfile } from './era-profiles'
import { DEFAULT_ERA_PROFILE, resolveEraProfile } from './era-profiles'
import {
  DEFAULT_SPEECH_CHARS_PER_SEC as SHARED_SPEECH_CHARS_PER_SEC,
  DEFAULT_PROMPT_LANGUAGE as SHARED_DEFAULT_LANGUAGE,
  resolveSpeechCharsPerSec as sharedResolveSpeechCharsPerSec,
} from '@shared/types/episode-production/workflow.types'

/** 缺省语速表（字/秒）：按语言给默认值，项目配置可覆写。
 *  §3.8 单一事实源：与 renderer 共用 `shared/types` 的定义，避免三处各写一份 4.5。 */
export const DEFAULT_SPEECH_CHARS_PER_SEC = SHARED_SPEECH_CHARS_PER_SEC

/** 未指定语言时的兜底语言 */
export const DEFAULT_LANGUAGE = SHARED_DEFAULT_LANGUAGE

/** 目标集长缺省推算系数：字数 ≈ 目标秒数 × 该系数（用于故事原文长度区间） */
export const STORY_CHARS_PER_TARGET_SEC = 4

/**
 * 全链路统一提示词上下文。
 *
 * 所有字段都可缺省——缺省即"不注入该维度"，提示词渲染结果与优化前一致，
 * 便于渐进接入与 golden snapshot 对照。
 */
export interface PromptContext {
  /** 故事年代（项目 episode.storyEra） */
  storyEra?: string
  /** 故事地域（episode.storyRegion） */
  storyRegion?: string
  /** 其他故事背景（episode.storyBackgroundExtra） */
  storyExtra?: string
  /** 体裁档案（§2.2）：决定注入哪套剧作纪律与节奏偏好 */
  genre: GenreProfile
  /** 台词语言（决定语速与语言纪律），默认 zh */
  language: string
  /** 语速（字/秒）——提示词宣称的校验口径必须与此一致 */
  speechCharsPerSec: number
  /** 项目风格词（config.stylePrompt，兼容读 styleAnchors 首项） */
  stylePrompt?: string
  /** 画幅（config.aspectRatio，如 '16:9' / '9:16'） */
  aspectRatio?: string
  /** 目标集长（秒）；缺省不注入时长指导 */
  targetEpisodeDurationSec?: number
  /** 视频片段时长预算（config.segmentDurationBudgetSec，默认 15） */
  segmentDurationBudgetSec?: number
  /** 时代档案（§2.5）：替代朝代正则的时代约束来源 */
  eraProfile: EraProfile
}

/** 从项目/剧集配置组装 PromptContext 的原始输入（DB 实体字段的形状） */
export interface PromptContextSource {
  storyEra?: string | null
  storyRegion?: string | null
  storyExtra?: string | null
  genre?: string | null
  language?: string | null
  speechCharsPerSec?: number | null
  stylePrompt?: string | null
  styleAnchors?: string[] | null
  aspectRatio?: string | null
  targetEpisodeDurationSec?: number | null
  segmentDurationBudgetSec?: number | null
  eraProfileKey?: string | null
}

/**
 * 解析语速：显式配置优先（合法正数），否则按语言查表，最后兜底 4.5。
 */
export function resolveSpeechCharsPerSec(
  explicit: number | null | undefined,
  language: string,
): number {
  return sharedResolveSpeechCharsPerSec(explicit, language)
}

/**
 * 由项目配置构建 PromptContext（全链路唯一入口）。
 *
 * 所有取值都做 trim/合法性收敛，避免把空串当有效值注入提示词。
 */
export function buildPromptContext(source: PromptContextSource = {}): PromptContext {
  const language = normalizeText(source.language) ?? DEFAULT_LANGUAGE
  const genreKey = (normalizeText(source.genre) as GenreKey | undefined) ?? DEFAULT_GENRE
  const storyEra = normalizeText(source.storyEra)

  // 风格词：显式 stylePrompt 优先；否则回退项目 styleAnchors 首项（历史字段兼容）
  const stylePrompt =
    normalizeText(source.stylePrompt) ??
    (Array.isArray(source.styleAnchors)
      ? source.styleAnchors.map((s) => s?.trim()).filter(Boolean).join(' / ') || undefined
      : undefined)

  return {
    storyEra,
    storyRegion: normalizeText(source.storyRegion),
    storyExtra: normalizeText(source.storyExtra),
    genre: getGenreProfile(genreKey),
    language,
    speechCharsPerSec: resolveSpeechCharsPerSec(source.speechCharsPerSec, language),
    stylePrompt,
    aspectRatio: normalizeText(source.aspectRatio),
    targetEpisodeDurationSec: positiveOrUndefined(source.targetEpisodeDurationSec),
    segmentDurationBudgetSec: positiveOrUndefined(source.segmentDurationBudgetSec),
    eraProfile: resolveEraProfile(normalizeText(source.eraProfileKey), storyEra, genreKey),
  }
}

/** 缺省上下文：不注入任何业务变量（行为等价于优化前，供未接入环节与测试使用） */
export function createDefaultPromptContext(): PromptContext {
  return buildPromptContext({})
}

// ==================== 渲染片段（各提示词共用，避免各自拼装漂移） ====================

/**
 * 【故事背景】段（§3.4）。
 *
 * 优化前剧本生成完全没有背景注入；本段由 PromptContext 统一渲染，
 * 三个字段都空时返回空串（调用方据此省略整段）。
 */
export function renderStoryBackgroundBlock(ctx: PromptContext): string {
  const lines: string[] = []
  if (ctx.storyEra) lines.push(`年代：${ctx.storyEra}`)
  if (ctx.storyRegion) lines.push(`地域：${ctx.storyRegion}`)
  if (ctx.storyExtra) lines.push(`其他：${ctx.storyExtra}`)
  if (lines.length === 0) return ''
  return `## 故事背景\n\n${lines.join('\n')}`
}

/**
 * 【故事背景与风格】段（§3.8，cogen 用）。
 *
 * 除背景外还带画幅/目标时长/项目风格——这些是分镜节奏与画面一致性的事实依据，
 * 优化前 cogen 一个都没有，导致约束 6 的节奏规则无法执行。
 */
export function renderStoryStyleBlock(ctx: PromptContext): string {
  const lines: string[] = []
  if (ctx.storyEra) lines.push(`故事年代：${ctx.storyEra}`)
  if (ctx.storyRegion) lines.push(`故事地域：${ctx.storyRegion}`)
  if (ctx.storyExtra) lines.push(`故事背景：${ctx.storyExtra}`)
  if (ctx.stylePrompt) lines.push(`画面风格：${ctx.stylePrompt}`)
  if (ctx.aspectRatio) lines.push(`画面比例：${ctx.aspectRatio}`)
  if (ctx.targetEpisodeDurationSec) {
    lines.push(`本集目标时长：约 ${ctx.targetEpisodeDurationSec} 秒`)
  }
  if (lines.length === 0) return ''
  return `## 故事背景与风格\n\n${lines.join('\n')}`
}

/**
 * 目标场景数/总时长指导区间（§3.4，剧本生成用）。
 *
 * 按 `targetEpisodeDurationSec` 推算：短剧单场景约 20-40 秒。
 * 未配置目标集长时返回空串（不注入）。
 */
export function renderTargetDurationGuidance(ctx: PromptContext): string {
  const target = ctx.targetEpisodeDurationSec
  if (!target) return ''
  const minScenes = Math.max(1, Math.round(target / 40))
  const maxScenes = Math.max(minScenes + 1, Math.round(target / 20))
  return (
    `## 篇幅目标\n\n` +
    `本集目标时长约 ${target} 秒：建议拆 ${minScenes}-${maxScenes} 个场景，` +
    `各场景时长之和应接近目标时长；单场景过短会碎、过长会拖。`
  )
}

function normalizeText(v: string | null | undefined): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

function positiveOrUndefined(v: number | null | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
}