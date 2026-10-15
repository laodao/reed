/**
 * ReferenceVideoAnalysisService · spec（Phase 4 D5，spec 2026-05-09 §3.2 D5 · P-22）
 *
 * 验证视频解析服务行为。用真实 ffmpeg 生成一个 4 秒测试视频做端到端验证。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import { DataSource } from 'typeorm'
import { ReferenceVideoAnalysisEntity } from '@core/database/entities/episode-production/reference-video-analysis.entity'
import { ReferenceVideoAnalysisService } from '@core/platform/episode-production/reference-video/analysis.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [ReferenceVideoAnalysisEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

/**
 * 生成一个 4 秒测试视频（颜色渐变；3 个 shot：红 / 绿 / 蓝 各约 1.3 秒）
 * 用 ffmpeg 的 testsrc + lavfi color 滤镜。
 */
async function generateTestVideo(outPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  // 用 lavfi 生成纯色拼接视频；3 个 1.3s 段，总 ~4s
  const args = [
    '-f', 'lavfi', '-i', 'color=c=red:s=320x240:d=1.3',
    '-f', 'lavfi', '-i', 'color=c=green:s=320x240:d=1.3',
    '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=1.3',
    '-filter_complex', '[0][1][2]concat=n=3:v=1:a=0[v]',
    '-map', '[v]',
    '-y', outPath,
  ]
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: false,
    })
    let stderr = ''
    proc.stderr.on('data', (c) => { stderr += c.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`generate test video failed (${code}): ${stderr.slice(-300)}`))
    })
    proc.on('error', reject)
  })
}

describe('ReferenceVideoAnalysisService', () => {
  let ds: DataSource
  let svc: ReferenceVideoAnalysisService
  let tempDir: string
  let videoPath: string

  beforeEach(async () => {
    ds = await buildDb()
    svc = new ReferenceVideoAnalysisService(ds)
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ref-video-test-'))
    videoPath = path.join(tempDir, 'test.mp4')
    await generateTestVideo(videoPath)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  })

  it('analyze 4 秒 3 段颜色视频 → 检测到多个 shot + 落库', async () => {
    const result = await svc.analyze({
      videoPath,
      tempDir,
      userId: 'user1',
      sceneThreshold: 0.3,
    })
    expect(result.analysisId).toMatch(/^rva_/)
    expect(result.videoDurationSec).toBeGreaterThan(3.5)
    expect(result.videoDurationSec).toBeLessThan(5)
    // 颜色 concat 视频应至少检测到 2-3 个 shot
    expect(result.shotCount).toBeGreaterThanOrEqual(2)

    // 落库 status='ready'
    const row = await svc.getById(result.analysisId)
    expect(row?.status).toBe('ready')
    expect(row?.shots).toBeTruthy()
    expect(row!.shots!.length).toBe(result.shotCount)

    // 每个 shot 有 representativeFramePath 且文件存在
    for (const shot of row!.shots!) {
      const exists = await fs.access(shot.representativeFramePath).then(() => true).catch(() => false)
      expect(exists).toBe(true)
    }
  })

  it('视频文件不存在 → 抛错', async () => {
    await expect(
      svc.analyze({
        videoPath: '/non/existent/video.mp4',
        tempDir,
        userId: 'user1',
      }),
    ).rejects.toThrow(/不存在/)
  })

  it('listByUser 返回当前用户的分析记录', async () => {
    await svc.analyze({ videoPath, tempDir, userId: 'user1' })
    await svc.analyze({ videoPath, tempDir, userId: 'user1' })
    const list = await svc.listByUser('user1')
    expect(list.length).toBe(2)
    // 倒序
    expect(list[0].createdAt).toBeGreaterThanOrEqual(list[1].createdAt)
  })

  it('user 隔离', async () => {
    await svc.analyze({ videoPath, tempDir, userId: 'user1' })
    const myList = await svc.listByUser('user1')
    const otherList = await svc.listByUser('user2')
    expect(myList.length).toBe(1)
    expect(otherList.length).toBe(0)
  })

  it('delete 删 DB 行 + temp 目录', async () => {
    const result = await svc.analyze({ videoPath, tempDir, userId: 'user1' })
    const sessionDir = path.join(tempDir, 'reference-video', result.analysisId)
    expect(await fs.access(sessionDir).then(() => true).catch(() => false)).toBe(true)

    await svc.delete(result.analysisId, tempDir)

    expect(await fs.access(sessionDir).then(() => true).catch(() => false)).toBe(false)
    expect(await svc.getById(result.analysisId)).toBeNull()
  })

  it('vlmInfer 注入 → 用 VLM 推断字段替换占位（spec D5 follow-up · #48）', async () => {
    let invocations = 0
    const fakeVlmInfer = async (framePath: string, durationSec: number) => {
      invocations++
      // 验证传入的代表帧路径能 access
      expect(await fs.access(framePath).then(() => true).catch(() => false)).toBe(true)
      expect(durationSec).toBeGreaterThan(0)
      return {
        shotType: 'close_up',
        cameraAngle: 'low',
        cameraMovement: 'push',
        frameDescription: '红色画面渐入',
        emotion: '紧张',
      }
    }

    const result = await svc.analyze({
      videoPath,
      tempDir,
      userId: 'user1',
      sceneThreshold: 0.3,
      vlmInfer: fakeVlmInfer,
    })

    expect(invocations).toBeGreaterThan(0)
    expect(invocations).toBe(result.shotCount)

    // 落库的 shots 应包含 VLM 推断字段
    const row = await svc.getById(result.analysisId)
    for (const shot of row!.shots!) {
      expect(shot.shotType).toBe('close_up')
      expect(shot.cameraAngle).toBe('low')
      expect(shot.cameraMovement).toBe('push')
      expect(shot.frameDescription).toBe('红色画面渐入')
      expect(shot.emotion).toBe('紧张')
    }
  })

  it('vlmInfer 抛错 → 该 shot 沿用占位字段（不致命）', async () => {
    const fakeVlmInfer = async () => {
      throw new Error('VLM 配额不足')
    }
    const result = await svc.analyze({
      videoPath,
      tempDir,
      userId: 'user1',
      vlmInfer: fakeVlmInfer,
    })
    const row = await svc.getById(result.analysisId)
    // 占位字段保留
    for (const shot of row!.shots!) {
      expect(shot.shotType).toBe('medium')
      expect(shot.frameDescription).toBe('（待 VLM 反推）')
    }
  })

  it('vlmInfer 返回部分字段 → 缺失字段沿用占位', async () => {
    const fakeVlmInfer = async () => ({
      shotType: 'wide',
      // 仅返回 shotType；其他字段保持默认
    })
    const result = await svc.analyze({
      videoPath,
      tempDir,
      userId: 'user1',
      vlmInfer: fakeVlmInfer,
    })
    const row = await svc.getById(result.analysisId)
    for (const shot of row!.shots!) {
      expect(shot.shotType).toBe('wide')         // VLM 给的
      expect(shot.cameraAngle).toBe('eye_level') // 占位
      expect(shot.frameDescription).toBe('（待 VLM 反推）')
    }
  })
})
