/**
 * 项目级风格锚点读取 helper
 * @module modules/episode-production/assets/services/project-style.helper
 *
 * spec 2026-05-08：剧集项目可在创建对话框选默认风格（VideoProjectConfig.styleAnchors）。
 * character / location / item binding 创建时若没有自身风格，默认继承项目风格。
 *
 * "默认填入"语义：在 service.create* 时一次性快照写入 binding.styleAnchors。
 * 之后用户改项目风格不会影响已建资产；用户也可在设定卡里编辑该资产风格。
 */

import type { DataSource } from 'typeorm'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'

export async function getProjectStyleAnchors(
  ds: DataSource,
  projectId: string,
): Promise<string[]> {
  const repo = ds.getRepository(VideoProjectEntity)
  const project = await repo.findOne({ where: { id: projectId } })
  if (!project) return []
  const cfg = (project.config ?? {}) as Record<string, unknown>
  const raw = cfg.styleAnchors
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
}

/** binding 表里 styleAnchors 是 text JSON 字符串。本 helper 直接返回适合写入的字符串（空则 null）。 */
export async function getProjectStyleAnchorsAsJson(
  ds: DataSource,
  projectId: string,
): Promise<string | null> {
  const arr = await getProjectStyleAnchors(ds, projectId)
  if (arr.length === 0) return null
  return JSON.stringify(arr)
}
