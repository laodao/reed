/**
 * 「分镜有视频」双口径判定（2026-09-25 一致性修复 · 审计主题 B）
 * @module platform/episode-production/services/shot-video-readiness
 *
 * 片段制出片只写 ep_video_segments.video_path，不回写 storyboards.video_path，
 * 因此统一判定口径为：分镜自身 videoPath 非空，或其所属非 superseded 片段
 * status=completed 且 videoPath 非空（与导出器跳过 superseded 片段对齐）。
 * stage-gate / ep-agent / timeline-builder 共用，不做数据回写。
 */

import type { DataSource } from 'typeorm'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'

export type SegmentVideoInfo = Pick<EpVideoSegmentEntity, 'status' | 'videoPath'>
export type SegmentVideoMap = Map<string, SegmentVideoInfo>

/** 按 episodeId 一次查出片段状态 Map（id → status/videoPath） */
export async function loadSegmentVideoMap(
  ds: DataSource,
  episodeId: string,
): Promise<SegmentVideoMap> {
  const segs = await ds
    .getRepository(EpVideoSegmentEntity)
    .find({ where: { episodeId } as any })
  return new Map(segs.map((s) => [s.id, { status: s.status, videoPath: s.videoPath }]))
}

/** 片段是否能为分镜提供成片视频：非 superseded 且 completed 且 videoPath 非空 */
export function segmentProvidesVideo(seg: SegmentVideoInfo | null | undefined): boolean {
  return !!seg && seg.status !== 'superseded' && seg.status === 'completed' && !!seg.videoPath
}

/** 分镜有视频 = 自身 videoPath 非空，或所属片段能提供视频 */
export function storyboardHasVideo(
  sb: { videoPath?: string | null; segmentId?: string | null },
  segmentsById?: SegmentVideoMap,
): boolean {
  if (sb.videoPath) return true
  if (!sb.segmentId) return false
  return segmentProvidesVideo(segmentsById?.get(sb.segmentId))
}
