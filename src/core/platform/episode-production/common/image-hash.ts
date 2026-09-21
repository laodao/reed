/**
 * 图像感知哈希共享模块（2026-09-21 · 照抄检测抽取）
 * @module platform/episode-production/common/image-hash
 *
 * 64-bit aHash（8x8 灰度均值哈希）+ 汉明距离，供两处照抄检测共用：
 *   - render/keyframe/keyframe-machine-checks.ts（关键帧 vs 参考图）
 *   - assets/services/main-image-generator.service.ts（地点主图 vs 平面图/父级主图）
 *
 * 中立层：不依赖 render / assets 任何一侧，避免 assets → render 反向依赖。
 * 降级原则：图读不出来（sharp 异常 / 文件不存在）返回 null，由调用方决定放行策略。
 */

import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'
import { getPathProvider } from '@core/interfaces/path.interface'

/** 路径解析：绝对路径直接用；相对路径按 dataPath 拼（PathProvider 未初始化则原样返回） */
export function toAbsImagePath(p: string): string {
  if (path.isAbsolute(p)) return p
  try {
    return path.join(getPathProvider().getDataPath(), p)
  } catch {
    return p
  }
}

/** 64-bit aHash：resize 8x8 灰度 → 按均值取bit */
export async function aHash64(absPath: string): Promise<bigint> {
  const { data } = await sharp(absPath)
    .resize(8, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let sum = 0
  for (const v of data) sum += v
  const mean = sum / 64
  let bits = 0n
  for (let i = 0; i < 64; i++) {
    if (data[i] >= mean) bits |= 1n << BigInt(i)
  }
  return bits
}

/** 64-bit 哈希汉明距离 */
export function hamming64(a: bigint, b: bigint): number {
  let x = a ^ b
  let n = 0
  while (x) {
    n += Number(x & 1n)
    x >>= 1n
  }
  return n
}

/**
 * 两张图的 aHash 汉明距离（相对/绝对路径均可）。
 * 任一文件不可读 / sharp 失败 → 返回 null（调用方按"无法判定"放行，不误判照抄）。
 */
export async function aHashDistance(
  imagePath: string,
  referencePath: string,
): Promise<number | null> {
  const absA = toAbsImagePath(imagePath)
  const absB = toAbsImagePath(referencePath)
  if (!fs.existsSync(absA) || !fs.existsSync(absB)) return null
  try {
    const [ha, hb] = await Promise.all([aHash64(absA), aHash64(absB)])
    return hamming64(ha, hb)
  } catch {
    return null
  }
}
