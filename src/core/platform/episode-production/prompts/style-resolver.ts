/**
 * 剧集制作 · 风格单一来源（提示词优化方案 §4.4，原则 P1/P5）
 * @module platform/episode-production/prompts/style-resolver
 *
 * 背景：优化前项目 stylePrompt 有 **5 个注入点**、互不对账：
 *   1. 资产身份段（`buildAssetIdentityPrompt` 的「风格：」项）
 *   2. 资产主图锚点前缀（`buildStoryAnchorPrefix`，标签还用"时代背景："与身份段"故事年代："不同名）
 *   3. 关键帧第 1 段（风格前缀 / 有参考图时 REFERENCE_MATCH_STYLE_PREFIX）
 *   4. 关键帧第 12 段（qualitySuffix）
 *   5. 关键帧调用方 `keyframe-generation.service.ts:1266` 尾部再拼 `，${projectStyle}`
 *   （外加缩略图风格行、视频段的「画面风格：」）
 *
 * 本模块定义全链路唯一入口 `resolveStyle(ctx)`，明确各段职责与优先级，
 * 消费点统一调用它，不再各自拼装。
 *
 * 职责划分（§4.4）：
 *   - `prefix`  ：管**主体形象**——有角色参考图时用"与参考图一致"前缀，否则用风格预设前缀；
 *   - `suffix`  ：管**非主体区域与整体质感**——风格预设的质量后缀；
 *   - `projectStyle`：项目级风格词（`config.stylePrompt`）——**追加一次**，不再多处重复；
 *   - `negative`：负面词 = 风格预设 negative + 时代档案 negativeExtra。
 */

import type { PromptContext } from './prompt-context'

/** 风格预设形状（与 keyframe-prompt-builder 的 StyleConfig 同形） */
export interface StylePreset {
  stylePrefix: string
  qualitySuffix: string
  negativePrompt: string
}

/**
 * 有角色参考图时使用的风格前缀（F4/C6，2026-09-20 人物一致性修复）。
 *
 * 写实电影词（"professional photography, movie scene"）会把 Q 版等非写实参考图写实化——
 * 风格词压过参考图。有角色参考图时改用"与参考图保持一致"前缀，把风格决定权交给参考图。
 */
export const REFERENCE_MATCH_STYLE_PREFIX =
  '画面风格、人物外观与参考图保持一致（match the reference images exactly: same character face, hairstyle, outfit and art style）'

/** 解析后的风格组成（各段职责明确，避免重复注入） */
export interface ResolvedStyle {
  /** 主体风格前缀（第 1 段） */
  prefix: string
  /** 质量后缀（末段，管整体质感） */
  suffix: string
  /** 项目级风格词（**只在末尾追加一次**，不要在各段重复） */
  projectStyle: string
  /** 负面词（风格预设 + 时代档案合并） */
  negative: string
  /** 是否采用了"与参考图一致"前缀（供日志/测试断言） */
  matchedReference: boolean
}

/**
 * 解析全链路风格（§4.4 唯一入口）。
 *
 * @param input.styleConfig 风格预设（来自 PRESET_STYLES）
 * @param input.hasCharacterReference 该帧/该图是否有角色参考图
 * @param input.assetStyleAnchors 资产级风格锚点（可选，作为主体风格的补充）
 * @param input.ctx PromptContext（提供 project stylePrompt 单一注入点）
 * @param input.eraNegativeExtra 时代档案 negative（**显式传入优先**——
 *        调用方可能只有 storyEra 而没有完整 ctx，此时从 eraProfile 派生，
 *        不能因缺 ctx 就静默丢掉时代约束）
 */
export function resolveStyle(input: {
  styleConfig: StylePreset
  hasCharacterReference?: boolean
  assetStyleAnchors?: string | string[] | null
  ctx?: PromptContext
  eraNegativeExtra?: string | null
}): ResolvedStyle {
  const anchors = normalizeAnchors(input.assetStyleAnchors)
  const matchedReference = !!input.hasCharacterReference

  // 1. 主体前缀：有参考图 → 让位给参考图；否则用预设前缀（可拼资产风格锚点）
  const basePrefix = matchedReference
    ? REFERENCE_MATCH_STYLE_PREFIX
    : input.styleConfig.stylePrefix
  const prefix = anchors.length > 0 && !matchedReference
    ? `${basePrefix}, ${anchors.join(', ')}`
    : basePrefix

  // 2. 质量后缀
  const suffix = input.styleConfig.qualitySuffix

  // 3. 项目风格词（唯一一份，末尾追加）
  const projectStyle = input.ctx?.stylePrompt?.trim() ?? ''

  // 4. 负面词：预设 + 时代档案（显式传入优先，其次从 ctx.eraProfile 取）
  const eraNegative =
    input.eraNegativeExtra?.trim() || input.ctx?.eraProfile?.negativeExtra?.trim() || ''
  const negative = [input.styleConfig.negativePrompt, eraNegative].filter(Boolean).join(', ')

  return { prefix, suffix, projectStyle, negative, matchedReference }
}

/**
 * 把解析结果拼成最终 prompt（§4.4：prompt 只在 builder 一处成型）。
 *
 * @param body 各段组装出的正文（不含风格前缀/后缀/项目风格词）
 */
export function composeStyledPrompt(style: ResolvedStyle, body: string): string {
  const parts = [style.prefix, body, style.suffix, style.projectStyle].filter(
    (p) => typeof p === 'string' && p.trim().length > 0,
  )
  return parts.join(', ')
}

function normalizeAnchors(raw: string | string[] | null | undefined): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
  const t = raw.trim()
  if (!t) return []
  // 兼容 JSON 字符串（binding.styleAnchors 列是 text JSON）
  if (t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t)
      if (Array.isArray(parsed)) {
        return parsed.filter((s): s is string => typeof s === 'string' && s.trim()).map((s) => s.trim())
      }
    } catch {
      /* 非 JSON，按普通字符串处理 */
    }
  }
  return [t]
}