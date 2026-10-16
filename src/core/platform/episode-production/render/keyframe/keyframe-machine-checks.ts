/**
 * 关键帧机器校验（2026-09-21 · 雪麓山庄 v2 复盘 E 项）
 * @module platform/episode-production/render/keyframe/keyframe-machine-checks
 *
 * 不依赖任何模型的硬校验，生成后立刻跑，先于 VLM 审核：
 *   1. 照抄检测：关键帧与每张有效参考图算 64-bit aHash（8x8 灰度均值哈希），
 *      汉明距离 ≤6 判"疑似原样照抄参考图"（flux-kontext 照抄白底立绘的根因）。
 *      白底立绘场景放宽复合判定：画面边缘一圈近乎纯白（均值>245 且方差<50）
 *      且与参考图距离 ≤12 → 同样判照抄（立绘贴进画面会有少量缩放/压缩差异）。
 *   2. 空图/纯色检测：整图各通道标准差均值 <10 → fail。
 *
 * 降级原则：图读不出来（sharp 异常 / 文件不存在）不判 fail——机器校验是
 * 内容检测器，不是 IO 闸门；读不出时放行并 warn（后续视频 provider 会暴露真错误）。
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  aHash64,
  hamming64,
  toAbsImagePath,
} from '@core/platform/episode-production/common/image-hash'
import {
  workerImageStats,
  workerBoardCopyCheck,
  workerHashDistance,
} from '@core/platform/episode-production/common/sharp-worker'

export interface MachineCheckFailure {
  code: 'flat_or_blank' | 'reference_copy' | 'reference_copy_whitebg' | 'board_copy' | 'composite_copy'
  detail: string
}

export interface MachineCheckResult {
  pass: boolean
  failures: MachineCheckFailure[]
  checkedAt: string
}

/** aHash 汉明距离阈值：≤6 判照抄 */
const AHASH_COPY_THRESHOLD = 6
/** 白底立绘复合判定阈值（放宽，需同时满足边缘纯白） */
const AHASH_COPY_WHITEBG_THRESHOLD = 12
/** 空图/纯色判定：整图通道标准差均值下限 */
const FLAT_STDEV_THRESHOLD = 10
/** 边缘纯白判定：边缘带灰度均值 >245 且方差 <50 */
const EDGE_WHITE_MEAN = 245
const EDGE_WHITE_VAR = 50
/*
 * R2 板复刻阈值（v3 实锤图回测标定，见 tests/.../keyframe-machine-checks-board-copy.spec）：
 *   - aHash 距离 ≤12：板复刻（实测板复刻 dist 6~10，正常帧 vs 板 ≥19）
 *   - 色相红占比 ≥0.25% 且集中于小圆点（最密 2 格占 ≥40%）：编号徽章被抄进画面
 *     （实测板复刻 0.28%~0.36%，含徽章的正常帧 0.22%；真实红色元素如灯笼/红衣
 *     占比可能更高但不集中，靠集中度挡误杀）
 */
const BOARD_COPY_AHASH_THRESHOLD = 12
const BOARD_BADGE_RED_RATIO = 0.0025
const BOARD_BADGE_CONCENTRATION = 0.4
/*
 * 合成锚定复刻阈值：kontext 若照抄合成图（贴纸白边还在），关键帧 vs 合成图
 * aHash 距离会极小。融合成功的帧与合成图差异显著（光影/背景重绘）。≤6 判未融合。
 */
const COMPOSITE_COPY_AHASH_THRESHOLD = 6

/** 路径解析：委托 common/image-hash（相对路径按 dataPath 拼） */
const toAbs = toAbsImagePath

/**
 * 跑关键帧机器校验。
 *
 * @param imagePath 关键帧图片（相对 dataPath 或绝对路径）
 * @param referenceImagePaths 生成时实际生效的参考图（照抄检测基准；读不出的单张跳过）
 */
export async function runKeyframeMachineChecks(
  imagePath: string,
  referenceImagePaths: string[],
  /** R2：拼板模式传参考板路径，追加"板复刻"检测（编辑模型会直接输出板本身） */
  opts?: { boardPath?: string | null; compositePath?: string | null },
): Promise<MachineCheckResult> {
  const checkedAt = new Date().toISOString()
  const abs = toAbs(imagePath)
  if (!fs.existsSync(abs)) {
    console.warn('[keyframe-machine-checks] 关键帧文件不可读，机器校验降级放行:', imagePath)
    return { pass: true, failures: [], checkedAt }
  }

  // aHash + 标准差 + 边缘白度一个 RPC 取回（sharp 在 worker 子进程）
  const stats = await workerImageStats(abs)
  if (!stats) {
    console.warn('[keyframe-machine-checks] sharp 读取失败，机器校验降级放行:', imagePath)
    return { pass: true, failures: [], checkedAt }
  }
  const hash = BigInt(`0x${stats.aHash}`)
  const stdev = stats.stdev
  const edge = { mean: stats.edgeMean, variance: stats.edgeVar }

  const failures: MachineCheckFailure[] = []

  // 空图/纯色
  if (stdev < FLAT_STDEV_THRESHOLD) {
    failures.push({
      code: 'flat_or_blank',
      detail: `画面近乎纯色/空白（整图标准差 ${stdev.toFixed(1)} < ${FLAT_STDEV_THRESHOLD}）`,
    })
  }

  // 照抄检测（逐张有效参考图）
  const edgeNearWhite = edge.mean > EDGE_WHITE_MEAN && edge.variance < EDGE_WHITE_VAR
  for (const refPath of referenceImagePaths) {
    const refAbs = toAbs(refPath)
    if (!fs.existsSync(refAbs)) continue
    let refHash: bigint
    try {
      refHash = await aHash64(refAbs)
    } catch {
      continue
    }
    const dist = hamming64(hash, refHash)
    if (dist <= AHASH_COPY_THRESHOLD) {
      failures.push({
        code: 'reference_copy',
        detail: `疑似原样照抄参考图 ${path.basename(refPath)}（aHash 汉明距离 ${dist} ≤ ${AHASH_COPY_THRESHOLD}）`,
      })
    } else if (edgeNearWhite && dist <= AHASH_COPY_WHITEBG_THRESHOLD) {
      failures.push({
        code: 'reference_copy_whitebg',
        detail:
          `白底立绘疑似照抄参考图 ${path.basename(refPath)}` +
          `（边缘纯白 mean=${edge.mean.toFixed(1)} var=${edge.variance.toFixed(1)}，aHash 距离 ${dist}）`,
      })
    }
  }

  /*
   * R2 板复刻检测（2026-09-21 v3 逐帧复核实锤）：拼板模式下 flux-kontext 类编辑模型
   * 高概率把编号参考板本身当输出（白底分栏 + 红编号徽章原样进成片）。此前机器校验
   * 只对比成员参考图，从不对比板本身 → 全放行。两个信号任一命中即 fail。
   */
  const boardAbs = opts?.boardPath ? toAbs(opts.boardPath) : null
  if (boardAbs && fs.existsSync(boardAbs)) {
    const bc = await workerBoardCopyCheck(abs, boardAbs)
    if (bc) {
      if (bc.dist <= BOARD_COPY_AHASH_THRESHOLD) {
        failures.push({
          code: 'board_copy',
          detail: `疑似原样输出编号参考板（关键帧 vs 参考板 aHash 距离 ${bc.dist} ≤ ${BOARD_COPY_AHASH_THRESHOLD}）`,
        })
      } else if (
        bc.redRatio >= BOARD_BADGE_RED_RATIO &&
        bc.redConcentration >= BOARD_BADGE_CONCENTRATION
      ) {
        failures.push({
          code: 'board_copy',
          detail:
            `画面含参考板编号徽章（色相红占比 ${(bc.redRatio * 100).toFixed(2)}% ≥ 0.25%，` +
            `集中度 ${(bc.redConcentration * 100).toFixed(0)}%，疑似把参考板当输出）`,
        })
      }
    }
  }

  /*
   * 合成锚定复刻检测（2026-09-21 设计转向）：场景优先合成锚定模式下，kontext 若
   * 照抄合成图，贴纸白边/生硬拼贴还在，必须打回重拍。关键帧 vs 合成图 aHash ≤6 判未融合。
   */
  const compositeAbs = opts?.compositePath ? toAbs(opts.compositePath) : null
  if (compositeAbs && fs.existsSync(compositeAbs)) {
    const dist = await workerHashDistance(abs, compositeAbs)
    if (dist !== null && dist <= COMPOSITE_COPY_AHASH_THRESHOLD) {
      failures.push({
        code: 'composite_copy',
        detail: `合成贴图疑似原样未融合（关键帧 vs 合成图 aHash 距离 ${dist} ≤ ${COMPOSITE_COPY_AHASH_THRESHOLD}，贴纸感/白边未消除）`,
      })
    }
  }

  return { pass: failures.length === 0, failures, checkedAt }
}
