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
import sharp from 'sharp'
import {
  aHash64,
  hamming64,
  toAbsImagePath,
} from '@core/platform/episode-production/common/image-hash'

export interface MachineCheckFailure {
  code: 'flat_or_blank' | 'reference_copy' | 'reference_copy_whitebg'
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

/** 路径解析：委托 common/image-hash（相对路径按 dataPath 拼） */
const toAbs = toAbsImagePath

/** 整图通道标准差均值（空图/纯色检测） */
async function overallStdev(absPath: string): Promise<number> {
  const stats = await sharp(absPath).stats()
  const stdevs = stats.channels.map((c) => c.stdev ?? 0)
  return stdevs.length ? stdevs.reduce((a, b) => a + b, 0) / stdevs.length : 0
}

/** 边缘一圈（约 10%）灰度均值/方差：32x32 缩略图取外圈 3px 环 */
async function edgeBandStats(absPath: string): Promise<{ mean: number; variance: number }> {
  const size = 32
  const ring = 3
  const { data } = await sharp(absPath)
    .resize(size, size, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const vals: number[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < ring || x >= size - ring || y < ring || y >= size - ring) {
        vals.push(data[y * size + x])
      }
    }
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length
  return { mean, variance }
}

/**
 * 跑关键帧机器校验。
 *
 * @param imagePath 关键帧图片（相对 dataPath 或绝对路径）
 * @param referenceImagePaths 生成时实际生效的参考图（照抄检测基准；读不出的单张跳过）
 */
export async function runKeyframeMachineChecks(
  imagePath: string,
  referenceImagePaths: string[],
): Promise<MachineCheckResult> {
  const checkedAt = new Date().toISOString()
  const abs = toAbs(imagePath)
  if (!fs.existsSync(abs)) {
    console.warn('[keyframe-machine-checks] 关键帧文件不可读，机器校验降级放行:', imagePath)
    return { pass: true, failures: [], checkedAt }
  }

  let hash: bigint
  let stdev: number
  let edge: { mean: number; variance: number }
  try {
    ;[hash, stdev, edge] = await Promise.all([
      aHash64(abs),
      overallStdev(abs),
      edgeBandStats(abs),
    ])
  } catch (e) {
    console.warn('[keyframe-machine-checks] sharp 读取失败，机器校验降级放行:', imagePath, e)
    return { pass: true, failures: [], checkedAt }
  }

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

  return { pass: failures.length === 0, failures, checkedAt }
}
