/**
 * StoryboardThumbnailGeneratorService · spec（Phase 2 C10，spec 2026-05-09 §3.2 B7）
 *
 * 验证：
 *   - 一张大图 → sharp 切片 9 张（3×3）
 *   - 落地路径符合 temp/thumbnails/{scriptId}-{ts}/frame-N.jpg
 *   - 每张帧尺寸正确（512×512）
 *   - 入参校验
 *   - cleanup 清理目录
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import sharp from 'sharp'
import {
  StoryboardThumbnailGeneratorService,
  type GenerateThumbnailsInput,
} from '@core/modules/episode-production/narrative/ai/storyboard-thumbnail-generator'
import type { ImageGenerator } from '@core/modules/episode-production/assets/services/gallery-derivation.service'

class MockGen implements ImageGenerator {
  bigImagePath: string = ''
  calls: Array<{ prompt: string; width?: number; height?: number; negativePrompt?: string; label: string }> = []

  async generate(opts: any): Promise<{ imagePath: string; thumbnailPath: null }> {
    this.calls.push({
      prompt: opts.prompt,
      negativePrompt: opts.negativePrompt,
      label: opts.label,
      width: opts.width,
      height: opts.height,
    })
    // 用 sharp 实际生成一张 grid 大图（按入参 width/height）
    const w = opts.width ?? 1536
    const h = opts.height ?? 1536
    this.bigImagePath = path.join(os.tmpdir(), `mock-big-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`)
    await sharp({
      create: {
        width: w,
        height: h,
        channels: 3,
        background: { r: 80, g: 120, b: 200 },
      },
    })
      .jpeg({ quality: 80 })
      .toFile(this.bigImagePath)
    return { imagePath: this.bigImagePath, thumbnailPath: null }
  }
}

describe('StoryboardThumbnailGeneratorService', () => {
  let tempDir: string
  let gen: MockGen
  let svc: StoryboardThumbnailGeneratorService

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumb-test-'))
    gen = new MockGen()
    svc = new StoryboardThumbnailGeneratorService(tempDir, gen)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    if (gen.bigImagePath) {
      await fs.rm(gen.bigImagePath, { force: true }).catch(() => {})
    }
  })

  it('count=9 → 切出 9 张帧', async () => {
    const input: GenerateThumbnailsInput = {
      episodeScriptId: 'es1',
      count: 9,
      storySynopsis: '少年阿白的成长历程',
      styleAnchors: ['国风工笔'],
    }
    const result = await svc.generate(input)
    expect(result.frames).toHaveLength(9)
  })

  it('frameIndex 1-based 顺序 1..9', async () => {
    const result = await svc.generate({
      episodeScriptId: 'es1',
      count: 9,
      storySynopsis: 'x',
    })
    expect(result.frames.map((f) => f.frameIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('每张帧 512×512', async () => {
    const result = await svc.generate({
      episodeScriptId: 'es1',
      storySynopsis: 'x',
    })
    for (const f of result.frames) {
      const meta = await sharp(f.imagePath).metadata()
      expect(meta.width).toBe(512)
      expect(meta.height).toBe(512)
    }
  })

  it('落地路径格式 temp/thumbnails/{scriptId}-{ts}/frame-N.jpg', async () => {
    const result = await svc.generate({
      episodeScriptId: 'es1',
      storySynopsis: 'x',
    })
    expect(result.sessionDir).toMatch(/thumbnails\/es1-\d+$/)
    for (const f of result.frames) {
      expect(f.imagePath).toMatch(/frame-\d+\.jpg$/)
      expect(f.imagePath.startsWith(result.sessionDir)).toBe(true)
    }
  })

  it('调 imageGen 入参含 prompt + width/height（grid 总尺寸）', async () => {
    await svc.generate({
      episodeScriptId: 'es1',
      count: 9,
      storySynopsis: '主角的故事',
      styleAnchors: ['国风工笔'],
    })
    expect(gen.calls).toHaveLength(1)
    const call = gen.calls[0]
    expect(call.prompt).toContain('主角的故事')
    expect(call.prompt).toMatch(/3×3|3 ×3|3 x 3/i)
    expect(call.prompt).toContain('国风工笔')
    // 9 帧 = 3x3 → 1536×1536
    expect(call.width).toBe(1536)
    expect(call.height).toBe(1536)
  })

  it('count=16 → 4×4 网格 → 16 张帧', async () => {
    const result = await svc.generate({
      episodeScriptId: 'es1',
      count: 16,
      storySynopsis: 'x',
    })
    expect(result.frames).toHaveLength(16)
  })

  it('storySynopsis 空 → 抛错', async () => {
    await expect(
      svc.generate({
        episodeScriptId: 'es1',
        storySynopsis: '',
      }),
    ).rejects.toThrow(/synopsis/i)
  })

  it('count 不合法 → 抛错', async () => {
    await expect(
      svc.generate({
        episodeScriptId: 'es1',
        count: 7 as any,  // 7 不是 9/16/25 之一
        storySynopsis: 'x',
      }),
    ).rejects.toThrow(/9|16|25/)
  })

  it('cleanup 删除 session 目录', async () => {
    const result = await svc.generate({
      episodeScriptId: 'es1',
      storySynopsis: 'x',
    })
    const exists = await fs.access(result.sessionDir).then(() => true).catch(() => false)
    expect(exists).toBe(true)
    await svc.cleanup(result.sessionDir)
    const existsAfter = await fs.access(result.sessionDir).then(() => true).catch(() => false)
    expect(existsAfter).toBe(false)
  })
})
