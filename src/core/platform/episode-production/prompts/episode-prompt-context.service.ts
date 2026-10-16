/**
 * 剧集制作 · PromptContext 装配服务（提示词优化方案 §2.1）
 * @module platform/episode-production/prompts/episode-prompt-context.service
 *
 * 职责：从 DB（episode + project.config）装配全链路统一的 PromptContext，
 * 保证 Agent 快照、剧本、分镜、关键帧、视频各环节拿到的是**同一份**上下文。
 *
 * 优化前各环节各取所需、互不对账（剧本拿不到背景、cogen 拿不到风格与时长、
 * 关键帧拿不到身份字段、语速三处硬编码），本服务是"业务变量全部注入"（原则 P2）的
 * 唯一装配入口。
 */

import type { DataSource } from 'typeorm'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { createDefaultPromptContext, buildPromptContext, type PromptContext } from './prompt-context'

/**
 * 按 episodeId 装配 PromptContext。
 *
 * 任一环节缺失都返回缺省上下文（不注入业务变量）——
 * 提示词渲染结果等价于优化前，不会因数据缺失而报错。
 */
export async function buildPromptContextForEpisode(
  ds: DataSource | null | undefined,
  episodeId: string | null | undefined,
): Promise<PromptContext> {
  if (!ds || !episodeId) return createDefaultPromptContext()
  try {
    const episode = await ds.getRepository(VideoEpisodeEntity).findOne({ where: { id: episodeId } })
    if (!episode) return createDefaultPromptContext()

    const project = episode.projectId
      ? await ds.getRepository(VideoProjectEntity).findOne({ where: { id: episode.projectId } })
      : null

    return promptContextFromEpisodeAndProject(episode, project)
  } catch (err) {
    console.warn(
      `[episode-prompt-context] 装配上下文失败（回落到缺省上下文）：${err instanceof Error ? err.message : String(err)}`,
    )
    return createDefaultPromptContext()
  }
}

/**
 * 纯函数版本（便于单测）：把 episode/project 实体投成 PromptContext。
 *
 * 字段映射：
 *   - 故事背景三件套 ← episode.storyEra / storyRegion / storyBackgroundExtra
 *   - 体裁/语言/语速/目标集长/时代档案 ← project.config
 *   - 风格词 ← config.stylePrompt（缺省回退 config.styleAnchors 拼接）
 *   - 画幅/片段预算 ← config.aspectRatio / config.segmentDurationBudgetSec
 */
export function promptContextFromEpisodeAndProject(
  episode: { storyEra?: string | null; storyRegion?: string | null; storyBackgroundExtra?: string | null } | null,
  project: { config?: Record<string, unknown> | null } | null,
): PromptContext {
  const config = (project?.config ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined

  return buildPromptContext({
    storyEra: episode?.storyEra ?? null,
    storyRegion: episode?.storyRegion ?? null,
    storyExtra: episode?.storyBackgroundExtra ?? null,
    genre: str(config.genre) ?? null,
    language: str(config.language) ?? null,
    speechCharsPerSec: num(config.speechCharsPerSec) ?? null,
    stylePrompt: str(config.stylePrompt) ?? null,
    styleAnchors: Array.isArray(config.styleAnchors)
      ? (config.styleAnchors as unknown[]).filter((s): s is string => typeof s === 'string')
      : null,
    aspectRatio: str(config.aspectRatio) ?? null,
    targetEpisodeDurationSec: num(config.targetEpisodeDurationSec) ?? null,
    segmentDurationBudgetSec: num(config.segmentDurationBudgetSec) ?? null,
    eraProfileKey: str(config.eraProfileKey) ?? null,
  })
}