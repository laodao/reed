/**
 * common/sharp-worker 单测（2026-09-21 · sharp 子进程执行器）
 *
 * 起真实子进程（ELECTRON_RUN_AS_NODE 形态，与单测 runner 同源）做 op roundtrip：
 * - aHash / hashDistance：同图距离 0、相异图距离大、不可读 → null
 * - imageStats：纯色图 stdev≈0 + 边缘均值；噪点图 stdev 大
 * - probe：buffer / path 两种形态拿 width/height/format；坏 buffer → null
 * - makeBoard：两张小图拼板落盘，members 编号顺序
 * - 串行队列：并发两个调用都成功返回
 *
 * 子进程在 afterAll 统一 dispose（避免挂住 vitest 进程）。
 */

import { afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import sharp from 'sharp'
import {
  disposeSharpWorker,
  getSharpWorker,
  workerAHash,
  workerHashDistance,
  workerImageStats,
  workerMakeBoard,
  workerProbe,
} from '@core/platform/episode-production/common/sharp-worker'

let tmpDir: string

async function makeSolid(file: string, color: string, w = 64, h = 64): Promise<void> {
  await sharp({ create: { width: w, height: h, channels: 3, background: color } })
    .png()
    .toFile(file)
}

async function makeNoise(file: string, seed = 1, w = 64, h = 64): Promise<void> {
  const buf = Buffer.alloc(w * h * 3)
  let s = seed
  for (let i = 0; i < buf.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    buf[i] = s % 256
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file)
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-worker-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

afterAll(() => {
  disposeSharpWorker()
})

describe('sharp-worker op roundtrip（真实子进程）', () => {
  it('aHash：可读图返回 16 字符 hex；不可读 → null', async () => {
    const a = path.join(tmpDir, 'a.png')
    await makeSolid(a, '#aa0000')
    const hex = await workerAHash(a)
    expect(hex).toMatch(/^[0-9a-f]{16}$/)
    expect(await workerAHash(path.join(tmpDir, 'ghost.png'))).toBeNull()
  })

  it('hashDistance：同图 0；相异构图 >10；缺文件 → null', async () => {
    const a = path.join(tmpDir, 'a.png')
    const b = path.join(tmpDir, 'b.png')
    // 左亮右暗 vs 上亮下暗（构图不同）
    const mk = async (f: string, horizontal: boolean) => {
      const size = 64
      const data = Buffer.alloc(size * size * 3)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = (horizontal ? x < size / 2 : y < size / 2) ? 240 : 30
          const i = (y * size + x) * 3
          data[i] = data[i + 1] = data[i + 2] = v
        }
      }
      await sharp(data, { raw: { width: size, height: size, channels: 3 } }).png().toFile(f)
    }
    await mk(a, true)
    await mk(b, false)

    expect(await workerHashDistance(a, a)).toBe(0)
    const far = await workerHashDistance(a, b)
    expect(far).not.toBeNull()
    expect(far!).toBeGreaterThan(10)
    expect(await workerHashDistance(a, path.join(tmpDir, 'ghost.png'))).toBeNull()
  })

  it('imageStats：纯色图 stdev≈0 且边缘纯白检测可辨；噪点图 stdev 大', async () => {
    const flat = path.join(tmpDir, 'flat.png')
    const noise = path.join(tmpDir, 'noise.png')
    await makeSolid(flat, '#ffffff')
    await makeNoise(noise, 7)

    const s1 = await workerImageStats(flat)
    expect(s1).not.toBeNull()
    expect(s1!.stdev).toBeLessThan(10)
    expect(s1!.edgeMean).toBeGreaterThan(245)
    expect(s1!.aHash).toMatch(/^[0-9a-f]{16}$/)

    const s2 = await workerImageStats(noise)
    expect(s2!.stdev).toBeGreaterThan(10)

    expect(await workerImageStats(path.join(tmpDir, 'ghost.png'))).toBeNull()
  })

  it('probe：path / buffer 两种形态；坏 buffer → null', async () => {
    const a = path.join(tmpDir, 'a.png')
    await makeSolid(a, '#00aa00', 100, 50)
    const byPath = await workerProbe({ path: a })
    expect(byPath).toEqual({ width: 100, height: 50, format: 'png' })

    const buf = fs.readFileSync(a)
    const byBuf = await workerProbe({ bufferBase64: buf.toString('base64') })
    expect(byBuf).toEqual({ width: 100, height: 50, format: 'png' })

    expect(await workerProbe({ bufferBase64: Buffer.from('not image').toString('base64') })).toBeNull()
  })

  it('makeBoard：两张小图拼板落盘，members 编号顺序', async () => {
    const a = path.join(tmpDir, 'a.png')
    const b = path.join(tmpDir, 'b.png')
    await makeSolid(a, '#aa0000', 200, 300)
    await makeSolid(b, '#0000aa', 200, 300)
    const outPath = path.join(tmpDir, 'board.png')

    const out = await workerMakeBoard({
      members: [
        { imagePath: a, assetImageId: 'ai_a', name: '甲', kind: 'character' },
        { imagePath: b, assetImageId: 'ai_b', name: '乙', kind: 'location' },
      ],
      outPath,
    })
    expect(fs.existsSync(outPath)).toBe(true)
    expect(out.members.map((m) => m.slot)).toEqual([1, 2])
    expect(out.width).toBe(512 * 2 + 8)
    expect(out.height).toBe(768 + 64)
  })

  it('makeBoard：成员全部不可读 → reject', async () => {
    await expect(
      workerMakeBoard({
        members: [{ imagePath: path.join(tmpDir, 'ghost.png'), assetImageId: 'x', name: 'x', kind: 'character' }],
        outPath: path.join(tmpDir, 'board.png'),
      }),
    ).rejects.toThrow(/不可读/)
  })

  it('串行队列：并发两个调用都正常返回', async () => {
    const a = path.join(tmpDir, 'a.png')
    await makeSolid(a, '#aa0000')
    const [r1, r2] = await Promise.all([workerAHash(a), workerProbe({ path: a })])
    expect(r1).toMatch(/^[0-9a-f]{16}$/)
    expect(r2?.format).toBe('png')
  })

  it('未知 op → reject（协议完整性）', async () => {
    await expect(
      getSharpWorker().call('no_such_op', {}),
    ).rejects.toThrow(/unknown op/)
  })
})
