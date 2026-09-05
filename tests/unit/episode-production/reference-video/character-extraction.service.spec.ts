/**
 * CharacterExtractionService · spec（Phase 5 E1，spec 2026-05-09 §3.2 E1 · P-22）
 *
 * 端到端：用 ffmpeg 生成测试视频 → 服务抽 N 帧 → 验证返回结构 + 文件落地。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import { DataSource } from 'typeorm'
import { CharacterExtractionService } from '@core/platform/episode-production/reference-video/character-extraction.service'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

async function generateTestVideo(outPath: string, durationSec = 4): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  const args = [
    '-f', 'lavfi', '-i', `color=c=red:s=320x240:d=${durationSec}`,
    '-y', outPath,
  ]
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args, { stdio: ['ignore', 'ignore', 'pipe'], shell: false })
    let stderr = ''
    proc.stderr.on('data', (c) => { stderr += c.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`generate test video failed (${code}): ${stderr.slice(-300)}`))
    })
    proc.on('error', reject)
  })
}

describe('CharacterExtractionService', () => {
  let svc: CharacterExtractionService
  let tempDir: string
  let videoPath: string

  beforeEach(async () => {
    svc = new CharacterExtractionService()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cex-test-'))
    videoPath = path.join(tempDir, 'test.mp4')
    await generateTestVideo(videoPath, 4)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  })

  it('extractFrames 默认抽 4 帧', async () => {
    const result = await svc.extractFrames({ videoPath, tempDir })
    expect(result.sessionId).toMatch(/^cex_/)
    expect(result.videoDurationSec).toBeGreaterThan(3)
    expect(result.frames.length).toBe(4)
  })

  it('每帧文件落地 + suggestedLabel 合理', async () => {
    const result = await svc.extractFrames({ videoPath, tempDir })
    const labels = result.frames.map((f) => f.suggestedLabel)
    expect(labels).toEqual(['正', '侧前', '侧后', '背'])
    for (const f of result.frames) {
      const exists = await fs.access(f.framePath).then(() => true).catch(() => false)
      expect(exists).toBe(true)
      expect(f.timeSec).toBeGreaterThanOrEqual(0)
      expect(f.timeSec).toBeLessThanOrEqual(4)
    }
  })

  it('frameCount 自定义 + label 适配', async () => {
    const r3 = await svc.extractFrames({ videoPath, tempDir, frameCount: 3 })
    expect(r3.frames.length).toBe(3)
    expect(r3.frames.map((f) => f.suggestedLabel)).toEqual(['正', '侧', '背'])

    const r1 = await svc.extractFrames({ videoPath, tempDir, frameCount: 1 })
    expect(r1.frames.length).toBe(1)
    expect(r1.frames[0].suggestedLabel).toBe('正')
  })

  it('frameCount 边界 clamp 到 [1, 8]', async () => {
    const r0 = await svc.extractFrames({ videoPath, tempDir, frameCount: 0 })
    expect(r0.frames.length).toBe(1)

    const r99 = await svc.extractFrames({ videoPath, tempDir, frameCount: 99 })
    expect(r99.frames.length).toBe(8)
  })

  it('视频不存在 → 抛错', async () => {
    await expect(
      svc.extractFrames({ videoPath: '/non/existent.mp4', tempDir }),
    ).rejects.toThrow(/不存在/)
  })

  it('cleanup 清 temp 目录', async () => {
    const result = await svc.extractFrames({ videoPath, tempDir })
    const sessionDir = path.join(tempDir, 'character-extract', result.sessionId)
    expect(await fs.access(sessionDir).then(() => true).catch(() => false)).toBe(true)
    await svc.cleanup(result.sessionId, tempDir)
    expect(await fs.access(sessionDir).then(() => true).catch(() => false)).toBe(false)
  })

  it('帧时间分布在 [5%, 95%] 区间', async () => {
    const result = await svc.extractFrames({ videoPath, tempDir, frameCount: 4 })
    const dur = result.videoDurationSec
    for (const f of result.frames) {
      expect(f.timeSec).toBeGreaterThanOrEqual(dur * 0.04)  // 留 1% 浮点容差
      expect(f.timeSec).toBeLessThanOrEqual(dur * 0.96)
    }
  })

  describe('importFramesToAsset', () => {
    let ds: DataSource
    let projectAssetRoot: string

    beforeEach(async () => {
      ds = new DataSource({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [AssetImageEntity],
        synchronize: true,
      })
      await ds.initialize()
      projectAssetRoot = path.join(tempDir, 'asset-images')
    })

    afterEach(async () => {
      if (ds.isInitialized) await ds.destroy()
    })

    it('选中帧拷到 projectAssetRoot/${bindingId}/ + 写 asset_image 行', async () => {
      const ext = await svc.extractFrames({ videoPath, tempDir, frameCount: 3 })

      const imported = await svc.importFramesToAsset({
        ds,
        bindingId: 'cb_test',
        frames: [
          { framePath: ext.frames[0].framePath, label: '正' },
          { framePath: ext.frames[1].framePath, label: '侧' },
        ],
        projectAssetRoot,
        userId: 'u1',
      })
      expect(imported.imageIds.length).toBe(2)

      // 拷贝文件落到正式目录
      const destDir = path.join(projectAssetRoot, 'cb_test')
      const files = await fs.readdir(destDir)
      expect(files.length).toBe(2)

      // asset_image 行写入正确
      const repo = ds.getRepository(AssetImageEntity)
      const rows = await repo.find({ where: { assetId: 'cb_test' } })
      expect(rows.length).toBe(2)
      for (const r of rows) {
        expect(r.assetType).toBe('character')
        expect(r.category).toBe('view')
        expect(r.userId).toBe('u1')
        expect(r.isMain).toBe(0)
      }
      const labels = rows.map((r) => r.label).sort()
      expect(labels).toEqual(['侧', '正'])
    })

    it('帧文件不存在 → 跳过该帧（不致命）', async () => {
      const ext = await svc.extractFrames({ videoPath, tempDir, frameCount: 2 })
      const imported = await svc.importFramesToAsset({
        ds,
        bindingId: 'cb_test',
        frames: [
          { framePath: ext.frames[0].framePath, label: '正' },
          { framePath: '/non/existent.jpg', label: '背' },
        ],
        projectAssetRoot,
        userId: 'u1',
      })
      // 仅成功 1 帧
      expect(imported.imageIds.length).toBe(1)
      const rows = await ds.getRepository(AssetImageEntity).find({})
      expect(rows.length).toBe(1)
      expect(rows[0].label).toBe('正')
    })

    it('frames 空数组 → 返回空 imageIds', async () => {
      const imported = await svc.importFramesToAsset({
        ds,
        bindingId: 'cb_test',
        frames: [],
        projectAssetRoot,
      })
      expect(imported.imageIds).toEqual([])
    })

    it('label 缺省 → fallback view-N', async () => {
      const ext = await svc.extractFrames({ videoPath, tempDir, frameCount: 1 })
      await svc.importFramesToAsset({
        ds,
        bindingId: 'cb_test',
        frames: [{ framePath: ext.frames[0].framePath, label: '' }],
        projectAssetRoot,
      })
      const row = await ds.getRepository(AssetImageEntity).findOne({ where: { assetId: 'cb_test' } })
      expect(row?.label).toBe('view-1')
    })
  })
})
