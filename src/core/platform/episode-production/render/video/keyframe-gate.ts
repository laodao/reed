/**
 * 视频生成关键帧闸门（2026-09-21 · 雪麓山庄 v2 复盘 E3 项）
 * @module platform/episode-production/render/video/keyframe-gate
 *
 * 背景：关键帧审核结论此前只是徽章提示，video 链路根本不读——"无法读取图像"
 * 的 text 模型审核记 issues 照样放行，照抄白底立绘的帧直接进了视频。
 * 本闸门在 keyframes2video / image2video 生成前强制校验将实际消费的关键帧：
 *   - machineCheck.pass（生成时落的机器校验；老数据缺记录 → 现场用 sharp 重算）
 *   - review.status ∈ {pass, skipped}（issues/error 拦截；审核文本自认
 *     "无法读取图像"的老数据按 skipped 对待——那是纯文本模型的无效结论）
 *   - review 无记录（老数据）→ 以机器校验为准，不拦
 *
 * 不满足 → 抛 KeyframeGateBlockedError（code='KEYFRAME_GATE_BLOCKED' + 逐帧 failures），
 * IPC 层透传给 UI；调用方传 force=true 可人工强制跳过。t2v 模式无关键帧，不走闸门。
 */

import type { DataSource } from 'typeorm'
import type { StoryboardKeyframe } from '@core/database/repositories/storyboard-keyframe.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { runKeyframeMachineChecks } from '../keyframe/keyframe-machine-checks'

export interface KeyframeGateFrameFailure {
  frameIndex: number
  keyframeId: string
  failures: string[]
}

export interface KeyframeGateResult {
  pass: boolean
  frames: KeyframeGateFrameFailure[]
}

/** 闸门拦截错误：IPC 层按 code 识别，把 frames 透出给 UI */
export class KeyframeGateBlockedError extends Error {
  readonly code = 'KEYFRAME_GATE_BLOCKED'
  constructor(
    readonly frames: KeyframeGateFrameFailure[],
    contextLabel: string,
  ) {
    super(
      `关键帧闸门拦截（${contextLabel}）：${frames.length} 帧未过校验——` +
        frames
          .map((f) => `帧${f.frameIndex}: ${f.failures.join('；')}`)
          .join(' | ') +
        '。请重新生成/校验关键帧，或确认无误后人工强制生成。',
    )
    this.name = 'KeyframeGateBlockedError'
  }
}

/** 与 keyframe-review.service 同一口径：审核文本自认读不了图 → 结论无效按 skipped 对待 */
const UNREADABLE_REVIEW_RE = /无法读取|不可识别|无法核验|无法确认/

interface ReviewMeta {
  status?: string
  issues?: string[]
  summary?: string
}

interface MachineCheckMeta {
  pass?: boolean
  failures?: Array<{ code?: string; detail?: string }>
}

/**
 * 评估一组关键帧的闸门结果（keyframes = 视频将实际消费的帧，通常 start/end）。
 * 行缺失 / 无图 → 该帧失败。
 */
export async function evaluateKeyframeGate(
  ds: DataSource,
  keyframes: StoryboardKeyframe[],
): Promise<KeyframeGateResult> {
  const imageAssetRepo = new ImageAssetRepository(ds)
  const frames: KeyframeGateFrameFailure[] = []

  for (const kf of keyframes) {
    const failures: string[] = []
    const ia = kf.imageAssetId ? await imageAssetRepo.getById(kf.imageAssetId) : null
    if (!ia?.imagePath) {
      frames.push({
        frameIndex: kf.frameIndex,
        keyframeId: kf.id,
        failures: ['关键帧未生成图片'],
      })
      continue
    }

    const meta = (ia.metadata ?? {}) as Record<string, unknown>

    // 机器校验：有记录用记录；老数据缺记录 → 现场重算（基准 = 生效参考图）
    let mc = meta.machineCheck as MachineCheckMeta | undefined
    if (!mc || typeof mc.pass !== 'boolean') {
      const refIds = (
        Array.isArray(meta.referenceImageIdsEffective) && meta.referenceImageIdsEffective.length > 0
          ? meta.referenceImageIdsEffective
          : Array.isArray(meta.referenceImageIds)
            ? meta.referenceImageIds
            : []
      ) as string[]
      let refPaths: string[] = []
      if (refIds.length > 0) {
        const rows = await ds
          .getRepository(AssetImageEntity)
          .createQueryBuilder('ai')
          .where('ai.id IN (:...ids)', { ids: refIds })
          .getMany()
        refPaths = rows.map((r) => r.imagePath).filter((p): p is string => !!p)
      }
      const live = await runKeyframeMachineChecks(ia.imagePath, refPaths, {
        // R2：拼板模式的老数据现场校验同样要过板复刻检测；合成锚定同样过未融合检测
        boardPath:
          (meta.referenceBoard as { path?: string } | undefined)?.path ?? null,
        compositePath:
          (meta.compositeAnchor as { compositePath?: string } | undefined)?.compositePath ?? null,
      })
      mc = { pass: live.pass, failures: live.failures }
    }
    if (mc.pass === false) {
      for (const f of mc.failures ?? []) failures.push(f.detail ?? f.code ?? '机器校验未过')
      if ((mc.failures ?? []).length === 0) failures.push('机器校验未过')
    }

    // 一致性审核：仅 pass / skipped 放行；老数据无记录不拦（以机器校验为准）
    const review = meta.review as ReviewMeta | undefined
    if (review?.status) {
      const unreadable = UNREADABLE_REVIEW_RE.test(
        `${review.summary ?? ''} ${(review.issues ?? []).join(' ')}`,
      )
      if (review.status === 'issues' && !unreadable) {
        failures.push(
          `一致性审核存疑：${(review.issues ?? []).join('；') || review.summary || ''}`.trim(),
        )
      } else if (review.status === 'error') {
        failures.push('一致性审核调用失败（error），请重新校验或人工强制')
      }
    }

    if (failures.length > 0) {
      frames.push({ frameIndex: kf.frameIndex, keyframeId: kf.id, failures })
    }
  }

  return { pass: frames.length === 0, frames }
}

/** 闸门断言：未过 → 抛 KeyframeGateBlockedError */
export function assertKeyframeGate(result: KeyframeGateResult, contextLabel: string): void {
  if (!result.pass) throw new KeyframeGateBlockedError(result.frames, contextLabel)
}
