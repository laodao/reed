/**
 * ReferenceBoardService 单测（2026-09-21 · D 多角色锚定）
 *
 * 真实 sharp 对小图拼板：
 * - 输出文件落在 images/YYYY/MM/DD/board_*.png（注入临时 dataPath）
 * - members 顺序/编号与输入一致（1..N）
 * - 等高横排 + 编号带：输出高度 > 768 缩放后行高，宽度 = 各图宽 + 间距
 * - 总宽超 2048 时整体缩小
 * - 成员图缺失 → 跳过该成员，其余编号重排
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import sharp from 'sharp'
import { ReferenceBoardService } from '@core/platform/episode-production/render/keyframe/reference-board.service'

let tmpDir: string

/** 生成纯色小图 */
async function makeSolidImage(file: string, color: string, w = 200, h = 300): Promise<void> {
  await sharp({ create: { width: w, height: h, channels: 3, background: color } })
    .png()
    .toFile(file)
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-board-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('ReferenceBoardService', () => {
  it('3 成员拼板：落盘 images/ 目录，members 顺序/编号一致', async () => {
    const a = path.join(tmpDir, 'a.png')
    const b = path.join(tmpDir, 'b.png')
    const c = path.join(tmpDir, 'c.png')
    await makeSolidImage(a, '#aa0000')
    await makeSolidImage(b, '#00aa00')
    await makeSolidImage(c, '#0000aa')

    const svc = new ReferenceBoardService(() => tmpDir)
    const out = await svc.build([
      { imagePath: a, name: '沈云萝', kind: 'character', assetImageId: 'ai_a' },
      { imagePath: b, name: '秦越', kind: 'character', assetImageId: 'ai_b' },
      { imagePath: c, name: '山道', kind: 'location', assetImageId: 'ai_c' },
    ])

    // 相对路径 + 文件真实存在
    expect(out.path).toMatch(/^images\/\d{4}\/\d{2}\/\d{2}\/board_.+\.png$/)
    const abs = path.join(tmpDir, out.path)
    expect(fs.existsSync(abs)).toBe(true)

    // members 顺序即编号顺序
    expect(out.members.map((m) => m.assetImageId)).toEqual(['ai_a', 'ai_b', 'ai_c'])
    expect(out.members.map((m) => m.slot)).toEqual([1, 2, 3])
    expect(out.members[0].name).toBe('沈云萝')
    expect(out.members[2].kind).toBe('location')

    // 布局：3 张 200x300 → 等高 768 后各宽 512，间距 8×2，总宽 1552；
    // 高度 = 768 + 编号带 64
    expect(out.width).toBe(512 * 3 + 8 * 2)
    expect(out.height).toBe(768 + 64)
    const meta = await sharp(abs).metadata()
    expect(meta.width).toBe(out.width)
    expect(meta.height).toBe(out.height)
  })

  it('成员图缺失 → 跳过并继续，编号重排', async () => {
    const a = path.join(tmpDir, 'a.png')
    await makeSolidImage(a, '#aa0000')
    const svc = new ReferenceBoardService(() => tmpDir)
    const out = await svc.build([
      { imagePath: a, name: '甲', kind: 'character', assetImageId: 'ai_a' },
      { imagePath: path.join(tmpDir, 'ghost.png'), name: '乙', kind: 'character', assetImageId: 'ai_ghost' },
    ])
    expect(out.members).toHaveLength(1)
    expect(out.members[0]).toMatchObject({ assetImageId: 'ai_a', slot: 1 })
  })

  it('成员全部不可读 → 抛错（调用方退回原截断逻辑）', async () => {
    const svc = new ReferenceBoardService(() => tmpDir)
    await expect(
      svc.build([{ imagePath: '/nonexistent/x.png', name: '甲', kind: 'character', assetImageId: 'x' }]),
    ).rejects.toThrow(/不可读/)
    await expect(svc.build([])).rejects.toThrow(/为空/)
  })

  it('总宽超 2048 → 整体缩小', async () => {
    // 4 张 1200x300 → 等高 768 后各宽 3072，总宽远超 2048
    const files: string[] = []
    for (let i = 0; i < 4; i++) {
      const f = path.join(tmpDir, `w${i}.png`)
      await makeSolidImage(f, '#808080', 1200, 300)
      files.push(f)
    }
    const svc = new ReferenceBoardService(() => tmpDir)
    const out = await svc.build(
      files.map((f, i) => ({ imagePath: f, name: `m${i}`, kind: 'character' as const, assetImageId: `ai_${i}` })),
    )
    expect(out.width).toBeLessThanOrEqual(2048)
    expect(out.members.map((m) => m.slot)).toEqual([1, 2, 3, 4])
  })
})
