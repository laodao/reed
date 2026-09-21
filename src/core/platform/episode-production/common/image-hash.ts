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
 *
 * 2026-09-21：sharp 计算全部经 common/sharp-worker 子进程执行（libvips 高频调用
 * 崩 Electron 主进程实测）；本模块只剩路径解析 + 纯 bigint 位运算 + RPC 装配。
 */

import * as fs from 'fs'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import { workerAHash, workerHashDistance } from './sharp-worker'

/** 路径解析：绝对路径直接用；相对路径按 dataPath 拼（PathProvider 未初始化则原样返回） */
export function toAbsImagePath(p: string): string {
  if (path.isAbsolute(p)) return p
  try {
    return path.join(getPathProvider().getDataPath(), p)
  } catch {
    return p
  }
}

/** 64-bit aHash（worker 子进程计算）；图不可读 / sharp 失败 → 抛错（调用方 catch 降级） */
export async function aHash64(absPath: string): Promise<bigint> {
  const hex = await workerAHash(absPath)
  if (!hex) throw new Error(`aHash 计算失败（图不可读）：${absPath}`)
  return BigInt(`0x${hex}`)
}

/** 64-bit 哈希汉明距离（纯位运算，主进程本地） */
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
  return workerHashDistance(absA, absB)
}
