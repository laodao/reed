/**
 * 提示词 golden snapshot 测试基建（提示词优化方案 §2.4 / §5 验证策略）
 * @module tests/unit/episode-production/prompts/prompt-snapshot
 *
 * 目的：把"提示词漂移"从不可见变为可见 diff。
 *
 * 做法（沿用 `script-generator.ts:228` 既有的"以 buildPrompt 输出哈希校验逐字节一致"实践）：
 *   1. 用**固定 PromptContext + 固定输入**渲染各提示词；
 *   2. 对渲染结果取稳定哈希（SHA-256 截断）并与基线表比对；
 *   3. 任何片段改动都会让哈希变化 → 必须显式更新基线，改动"有意识"。
 *
 * 基线更新方式：把实际哈希写回 `PROMPT_BASELINES`（故意为之的改动才更新）。
 *
 * 注意：本文件是**测试基建**，不参与生产代码。
 */

import { createHash } from 'node:crypto'
import { buildPromptContext, type PromptContext } from '@core/platform/episode-production/prompts/prompt-context'
import {
  STATIC_SPECS,
  namingEmotionSpec,
  pacingDensitySpec,
  jsonContinuationSpec,
} from '@core/platform/episode-production/prompts/specs'

/** 稳定哈希：SHA-256 前 16 位十六进制（足够防漂移，便于人工比对） */
export function promptHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

/**
 * 快照固定上下文（§2.4）：所有维度都给定值，确保渲染路径全覆盖。
 *
 * 用短剧体裁 + 古风年代——这是历史上事故最多、分支最多的组合；
 * 另用现代/电影组合做第二组，覆盖体裁与时代档案的差异分支。
 */
export const SNAPSHOT_CTX_SHORT_DRAMA: PromptContext = buildPromptContext({
  storyEra: '古代中国',
  storyRegion: '江南',
  storyExtra: '架空王朝',
  genre: 'short_drama',
  language: 'zh',
  stylePrompt: '国风工笔',
  aspectRatio: '9:16',
  targetEpisodeDurationSec: 120,
  segmentDurationBudgetSec: 15,
})

export const SNAPSHOT_CTX_FILM_MODERN: PromptContext = buildPromptContext({
  storyEra: '现代都市',
  storyRegion: '上海',
  genre: 'film',
  language: 'zh',
  stylePrompt: '写实电影感',
  aspectRatio: '16:9',
  targetEpisodeDurationSec: 3600,
  segmentDurationBudgetSec: 12,
})

/** 快照固定输入（渲染动态片段用） */
export const SNAPSHOT_FIXED_JSON_TRUNCATED = '{"scenes":[{"sceneNumber":1,"location":"茶馆"'

/**
 * 渲染全部片段（静态 + 动态）为 `key → 文本` 表。
 *
 * @param ctx 上下文（缺省用短剧古风组合）
 */
export function renderAllSpecs(ctx: PromptContext = SNAPSHOT_CTX_SHORT_DRAMA): Record<string, string> {
  return {
    ...STATIC_SPECS,
    namingEmotionSpec: namingEmotionSpec(ctx),
    pacingDensitySpec: pacingDensitySpec(ctx),
    jsonContinuationSpec: jsonContinuationSpec(SNAPSHOT_FIXED_JSON_TRUNCATED),
  }
}

/** 渲染全部片段的 `key → 哈希` 表 */
export function renderAllSpecHashes(ctx?: PromptContext): Record<string, string> {
  const specs = renderAllSpecs(ctx)
  return Object.fromEntries(Object.entries(specs).map(([k, v]) => [k, promptHash(v)]))
}

/**
 * 基线哈希表（golden snapshot）。
 *
 * **这是行为锁**：改动片段后本表会不匹配，必须确认 diff 符合预期再更新此表。
 * 值为 `''` 表示"尚未建立基线"（首次运行时按实际值填充）。
 */
export const PROMPT_BASELINES: Record<string, string> = {
  BINDING_CONSTRAINT_SPEC: 'f79f6bb8b2a97e67',
  SCENE_SPLIT_PRINCIPLES_SPEC: '657262efbb53a44c',
  SCENE_JSON_EXAMPLE_SPEC: '1d9803dd2f03c4a7',
  FIELD_QUALITY_SPEC: 'c5aae6531e9ff33d',
  ROSTER_LIST_SPEC: '6be4ff075293b3a6',
  SCRIPT_FIDELITY_SPEC: 'c1f2d3ed975e99c8',
  DIALOGUE_SINGLE_SOURCE_SPEC: 'fdd21a112731e0bc',
  NARRATION_QUALITY_SPEC: '95bf7535b838a64f',
  namingEmotionSpec: '0f7c09292281f468',
  pacingDensitySpec: '3bb43030322abaa1',
  jsonContinuationSpec: 'af44de13a8646cd8',
}