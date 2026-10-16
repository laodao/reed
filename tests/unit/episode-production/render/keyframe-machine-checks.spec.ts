/**
 * keyframe-machine-checks 单测（2026-09-21 · E1 机器校验）
 *
 * 用 sharp 现场生成测试图：
 * - 与参考图同图 → aHash 距离 0 → reference_copy fail
 * - 白底 + 与参考图近似（轻微位移）→ reference_copy_whitebg 复合判定 fail
 * - 白底但内容与参考图完全不同 → pass（复合判定不误杀）
 * - 纯色图 → flat_or_blank fail
 * - 噪点正常图 → pass
 * - 文件不可读 → 降级放行（机器校验不是 IO 闸门）
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import sharp from 'sharp'
import { runKeyframeMachineChecks } from '@core/platform/episode-production/render/keyframe/keyframe-machine-checks'

let tmpDir: string

/** 随机噪点图（正常画面：标准差大、与任何参考图不相似） */
async function makeNoiseImage(file: string, w = 64, h = 64, seed = 1): Promise<void> {
  const buf = Buffer.alloc(w * h * 3)
  let s = seed
  for (let i = 0; i < buf.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    buf[i] = s % 256
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file)
}

/** 白底 + 中央深色方块（模拟白底立绘）；dx/dy 控制方块位移 */
async function makeWhiteBgFigure(file: string, dx = 0, size = 200): Promise<void> {
  const sq = 60
  const left = Math.round((size - sq) / 2) + dx
  await sharp({
    create: { width: size, height: size, channels: 3, background: '#ffffff' },
  })
    .composite([
      {
        input: await sharp({
          create: { width: sq, height: sq, channels: 3, background: '#222222' },
        })
          .png()
          .toBuffer(),
        left,
        top: Math.round((size - sq) / 2),
      },
    ])
    .png()
    .toFile(file)
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-mc-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('runKeyframeMachineChecks', () => {
  it('与参考图完全同图 → 照抄 fail', async () => {
    const kf = path.join(tmpDir, 'kf.png')
    const ref = path.join(tmpDir, 'ref.png')
    await makeWhiteBgFigure(kf)
    fs.copyFileSync(kf, ref)

    const r = await runKeyframeMachineChecks(kf, [ref])
    expect(r.pass).toBe(false)
    expect(r.failures.some((f) => f.code === 'reference_copy')).toBe(true)
  })

  it('白底 + 与参考图近似（位移 4px）→ 白底立绘复合判定 fail', async () => {
    const ref = path.join(tmpDir, 'ref.png')
    const kf = path.join(tmpDir, 'kf.png')
    await makeWhiteBgFigure(ref, 0)
    await makeWhiteBgFigure(kf, 4)

    const r = await runKeyframeMachineChecks(kf, [ref])
    expect(r.pass).toBe(false)
    expect(
      r.failures.some((f) => f.code === 'reference_copy' || f.code === 'reference_copy_whitebg'),
    ).toBe(true)
  })

  it('白底但画面与参考图完全不同 → pass（不误杀白底场景）', async () => {
    const ref = path.join(tmpDir, 'ref.png')
    const kf = path.join(tmpDir, 'kf.png')
    await makeWhiteBgFigure(ref, 0)
    // 白底 + 角落深色块：边缘并非纯白环、构图与中央立绘完全不同
    await sharp({ create: { width: 200, height: 200, channels: 3, background: '#ffffff' } })
      .composite([
        {
          input: await sharp({
            create: { width: 80, height: 80, channels: 3, background: '#222222' },
          })
            .png()
            .toBuffer(),
          left: 8,
          top: 8,
        },
      ])
      .png()
      .toFile(kf)

    const r = await runKeyframeMachineChecks(kf, [ref])
    expect(r.pass).toBe(true)
  })

  it('纯色图 → flat_or_blank fail', async () => {
    const kf = path.join(tmpDir, 'flat.png')
    await sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } })
      .png()
      .toFile(kf)

    const r = await runKeyframeMachineChecks(kf, [])
    expect(r.pass).toBe(false)
    expect(r.failures.some((f) => f.code === 'flat_or_blank')).toBe(true)
  })

  it('正常噪点图 + 无参考图 → pass', async () => {
    const kf = path.join(tmpDir, 'ok.png')
    await makeNoiseImage(kf)
    const r = await runKeyframeMachineChecks(kf, [])
    expect(r.pass).toBe(true)
    expect(r.failures).toEqual([])
  })

  it('正常图 vs 不相似参考图 → pass', async () => {
    const kf = path.join(tmpDir, 'ok.png')
    const ref = path.join(tmpDir, 'ref.png')
    await makeNoiseImage(kf, 64, 64, 7)
    await makeNoiseImage(ref, 64, 64, 999)
    const r = await runKeyframeMachineChecks(kf, [ref])
    expect(r.pass).toBe(true)
  })

  it('关键帧文件不可读 → 降级放行', async () => {
    const r = await runKeyframeMachineChecks(path.join(tmpDir, 'ghost.png'), [])
    expect(r.pass).toBe(true)
  })

  it('参考图不可读 → 跳过该张，其余照查', async () => {
    const kf = path.join(tmpDir, 'ok.png')
    await makeNoiseImage(kf)
    const r = await runKeyframeMachineChecks(kf, [path.join(tmpDir, 'ghost-ref.png')])
    expect(r.pass).toBe(true)
  })
})
