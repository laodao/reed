/**
 * E1 待删文件收集器单测（2026-09-25 一致性修复第二批）
 *
 * 背景：cleanupStoryboards 并入调用方事务后，deleteKeyframeWithAsset 在事务内
 * fs.unlinkSync 物理删除关键帧磁盘文件；事务回滚后 DB 行恢复、文件已没，
 * imagePath 悬空。修复：事务内只登记待删路径（ALS 收集器），提交成功后统一删，
 * 回滚整批丢弃。
 *
 * 覆盖：
 * - E1-a 回滚：调用方事务抛错 → DB 行恢复、磁盘文件仍在（不悬空）
 * - E1-b 提交：调用方事务成功 → DB 行删除、磁盘文件删除
 * - E1-c 并发隔离：两个并发收集器各删各的，互不串扰
 * - E1-d 嵌套复用：内层收集器并入外层，flush 只在外层提交点发生
 * - E1-e flush 失败兜底：单个文件删除失败只 warn 不阻断
 * - E1-f 无收集器（非事务路径）保持立即删除
 * - E1-g EntityManager 模式漏接收集器 → warn 自检告警（兜底行为同修复前）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { cleanupStoryboards } from '@core/platform/episode-production/narrative/storyboard-cleanup.service'
import {
  deferKeyframeFileDeletion,
  withPendingKeyframeFileDeletions,
} from '@core/platform/episode-production/render/keyframe/keyframe-cleanup'
import { registerPathProvider, type IPathProvider } from '@core/interfaces/path.interface'

class StubPathProvider implements IPathProvider {
  constructor(private readonly dataPath: string) {}
  getUserDataPath(): string { return this.dataPath }
  getAppDataPath(): string { return this.dataPath }
  getTempPath(): string { return this.dataPath }
  getDataPath(): string { return this.dataPath }
  getSubDirectories(): never { throw new Error('not used') }
  getSubDirectoryPath(): never { throw new Error('not used') }
  toAssetUrl(rel: string): string { return `/assets/${rel}` }
}

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      StoryboardEntity,
      StoryboardCharacterEntity,
      StoryboardKeyframeEntity,
      ImageAssetEntity,
      EpVideoSegmentEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

/** 一套「分镜 + 关键帧 + image_assets（带真实磁盘文件）」 */
async function seedStoryboardWithAsset(ds: DataSource, tmpDir: string): Promise<void> {
  fs.writeFileSync(path.join(tmpDir, 'kf1.png'), 'x')
  const now = new Date()
  await ds.getRepository(ImageAssetEntity).save({
    id: 'a1',
    projectId: 'p1',
    type: 'keyframe',
    provider: null,
    model: null,
    prompt: '',
    negativePrompt: null,
    imagePath: 'kf1.png',
    thumbnailPath: null,
    width: 1024,
    height: 1024,
    metadata: null,
    createdAt: Date.now(),
  } as any)
  await ds.getRepository(StoryboardEntity).save({
    id: 'sb1',
    sceneScriptId: 's1',
    shotNumber: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    movementDuration: null,
    frameDescription: '',
    subject: null,
    composition: null,
    characters: null,
    narrationId: null,
    dialogueIds: [],
    actionIds: [],
    frameImage: null,
    frameImageId: null,
    videoPath: null,
    segmentId: null,
    segmentSeq: null,
    duration: 4,
    transition: '{}',
    transitionType: null,
    transitionDurationMs: null,
    transitionDirection: null,
    transitionEasing: null,
    transitionColor: null,
    status: 'completed',
    keyframeCount: 1,
    videoProviderId: null,
    videoModelId: null,
    videoMode: null,
    use3dStaging: 0,
    stagingLayoutId: null,
    backgroundRefImageId: null,
    createdAt: now,
    updatedAt: now,
  } as any)
  await ds.getRepository(StoryboardKeyframeEntity).save({
    id: 'kf1',
    storyboardId: 'sb1',
    frameIndex: 0,
    timePercent: 0,
    frameRole: 'start',
    imageAssetId: 'a1',
    derivedFromKeyframeId: null,
    prompt: null,
    negativePrompt: null,
    userPromptOverride: null,
    referenceOverrides: null,
    createdAt: now,
    updatedAt: null,
  } as any)
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

describe('E1：磁盘文件在事务提交后删除', () => {
  let ds: DataSource
  let tmpDir: string
  const kfFile = () => path.join(tmpDir, 'kf1.png')

  beforeEach(async () => {
    ds = await buildDb()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-deferred-'))
    registerPathProvider(() => new StubPathProvider(tmpDir))
    await seedStoryboardWithAsset(ds, tmpDir)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (ds.isInitialized) await ds.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('E1-a：调用方事务回滚 → DB 行恢复、磁盘文件仍在（imagePath 不悬空）', async () => {
    await expect(
      withPendingKeyframeFileDeletions(() =>
        ds.transaction(async manager => {
          await cleanupStoryboards(manager, ['sb1'])
          throw new Error('模拟事务中途失败')
        }),
      ),
    ).rejects.toThrow('模拟事务中途失败')

    // DB 行随回滚恢复
    expect(await ds.getRepository(StoryboardEntity).find()).toHaveLength(1)
    expect(await ds.getRepository(StoryboardKeyframeEntity).find()).toHaveLength(1)
    expect(await ds.getRepository(ImageAssetEntity).find()).toHaveLength(1)
    // 磁盘文件未被删（修复前此处已没，imagePath 悬空）
    expect(fs.existsSync(kfFile())).toBe(true)
  })

  it('E1-b：调用方事务提交成功 → DB 行删除、磁盘文件删除', async () => {
    await withPendingKeyframeFileDeletions(() =>
      ds.transaction(async manager => {
        await cleanupStoryboards(manager, ['sb1'])
      }),
    )

    expect(await ds.getRepository(StoryboardEntity).find()).toHaveLength(0)
    expect(await ds.getRepository(StoryboardKeyframeEntity).find()).toHaveLength(0)
    expect(await ds.getRepository(ImageAssetEntity).find()).toHaveLength(0)
    expect(fs.existsSync(kfFile())).toBe(false)
  })

  it('E1-c：两个并发收集器互不串扰——先完成的只删自己收集的文件', async () => {
    const fileA = path.join(tmpDir, 'a.png')
    const fileB = path.join(tmpDir, 'b.png')
    fs.writeFileSync(fileA, 'x')
    fs.writeFileSync(fileB, 'x')
    const gate = deferred()

    const scopeA = withPendingKeyframeFileDeletions(async () => {
      deferKeyframeFileDeletion(fileA)
      await gate.promise // A 挂起，等 B 先完成
    })
    const scopeB = withPendingKeyframeFileDeletions(async () => {
      deferKeyframeFileDeletion(fileB)
    })

    await scopeB // B 先提交：只应删 fileB
    expect(fs.existsSync(fileB)).toBe(false)
    expect(fs.existsSync(fileA)).toBe(true) // 没被 B 的 flush 串走

    gate.resolve()
    await scopeA
    expect(fs.existsSync(fileA)).toBe(false)
  })

  it('E1-d：嵌套收集器并入外层——flush 只在外层提交点发生', async () => {
    const file = path.join(tmpDir, 'nested.png')
    fs.writeFileSync(file, 'x')
    let afterInner!: () => void

    await withPendingKeyframeFileDeletions(async () => {
      await withPendingKeyframeFileDeletions(async () => {
        deferKeyframeFileDeletion(file)
      })
      // 内层已返回，但外层收集器未提交：文件应仍在（内层没有自己的 flush 点）
      afterInner = () => expect(fs.existsSync(file)).toBe(true)
      afterInner()
    })
    expect(fs.existsSync(file)).toBe(false)
  })

  it('E1-e：flush 单个文件删除失败只 warn 不阻断', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 目录路径：unlinkSync 抛 EISDIR，模拟删除失败
    const dir = path.join(tmpDir, 'not-a-file')
    fs.mkdirSync(dir)

    await expect(
      withPendingKeyframeFileDeletions(async () => {
        deferKeyframeFileDeletion(dir)
      }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[keyframe-cleanup] 事务提交后删除文件失败'),
      expect.anything(),
    )
  })

  it('E1-f：无活跃收集器（非事务路径）保持立即删除', () => {
    const file = path.join(tmpDir, 'immediate.png')
    fs.writeFileSync(file, 'x')
    deferKeyframeFileDeletion(file)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('E1-g：EntityManager 模式漏接收集器 → warn 自检告警，兜底立即删除（行为同修复前）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // 故意不包 withPendingKeyframeFileDeletions，模拟「新调用方漏接」
    await ds.transaction(async manager => {
      await cleanupStoryboards(manager, ['sb1'])
    })

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('无活跃文件删除收集器'))
    // 兜底行为与修复前一致：DB 行已删、文件立即删
    expect(await ds.getRepository(StoryboardEntity).find()).toHaveLength(0)
    expect(fs.existsSync(kfFile())).toBe(false)
  })
})
