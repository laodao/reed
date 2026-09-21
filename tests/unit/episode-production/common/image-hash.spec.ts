/**
 * common/image-hash 单测（2026-09-21 照抄检测共享模块）
 * @module tests/unit/episode-production/common/image-hash
 *
 * 覆盖：aHash64 / hamming64 基本性质（同图距离 0、近似图距离小、相异图距离大）、
 * aHashDistance 路径解析与降级（文件不存在 / 非图片 → null）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import sharp from 'sharp'
import {
  aHash64,
  hamming64,
  aHashDistance,
  toAbsImagePath,
} from '@core/platform/episode-production/common/image-hash'

const SIZE = 64

/** 按像素函数生成 PNG 测试图 */
async function makeImage(
  file: string,
  pixel: (x: number, y: number) => number,
): Promise<void> {
  const data = Buffer.alloc(SIZE * SIZE * 3)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = pixel(x, y)
      const i = (y * SIZE + x) * 3
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
    }
  }
  await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toFile(file)
}

describe('image-hash', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-hash-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('同图距离 0；近似图（亮度微差）距离小；相异构图距离大', async () => {
    const a = path.join(dir, 'a.png')
    const a2 = path.join(dir, 'a2.png')
    const b = path.join(dir, 'b.png')
    // 左亮右暗
    await makeImage(a, (x) => (x < SIZE / 2 ? 240 : 30))
    // 同构图、亮度微差（aHash 按均值取 bit，不敏感于整体亮度）
    await makeImage(a2, (x) => (x < SIZE / 2 ? 230 : 40))
    // 上亮下暗（构图不同）
    await makeImage(b, (_x, y) => (y < SIZE / 2 ? 240 : 30))

    const ha = await aHash64(a)
    expect(hamming64(ha, ha)).toBe(0)
    expect(await aHashDistance(a, a2)).toBeLessThanOrEqual(10)
    const far = await aHashDistance(a, b)
    expect(far).not.toBeNull()
    expect(far!).toBeGreaterThan(10)
  })

  it('aHashDistance 降级：文件不存在 / 非图片 → null', async () => {
    const a = path.join(dir, 'a.png')
    await makeImage(a, () => 128)
    expect(await aHashDistance(a, path.join(dir, 'missing.png'))).toBeNull()
    const notImg = path.join(dir, 'x.txt')
    fs.writeFileSync(notImg, 'not an image')
    expect(await aHashDistance(a, notImg)).toBeNull()
  })

  it('toAbsImagePath：绝对路径原样；PathProvider 未初始化时相对路径原样返回', () => {
    const abs = path.join(dir, 'x.png')
    expect(toAbsImagePath(abs)).toBe(abs)
    // 单测环境未注册 PathProvider → catch 分支原样返回
    expect(toAbsImagePath('images/x.png')).toBe('images/x.png')
  })
})
