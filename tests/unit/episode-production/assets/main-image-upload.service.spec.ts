/**
 * MainImageUploadService 单测（主图上传链路）
 * @module tests/unit/episode-production/assets/main-image-upload.service
 *
 * 覆盖：
 * - upload: 合法 jpg/png/webp → 写文件 + 落 asset_image(isMain=1, category='main')
 * - upload: 上传后旧主图 isMain 置 0
 * - upload: 空 buffer / 超 20MB / 非图像 / 不支持格式 → 抛对应 code 的 MainImageUploadValidationError
 *
 * 用真实 sharp 生成测试图（小尺寸即可）；
 * 用 tmp 目录做 PathProvider，验证文件确实写到 dataPath/asset-images/。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import sharp from 'sharp'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import {
  MainImageUploadService,
  MainImageUploadValidationError,
} from '@core/modules/episode-production/assets/services/main-image-upload.service'
import type { IPathProvider } from '@core/interfaces/path.interface'

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
    entities: [AssetImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

/** 用 sharp 生成一张内存里的图，用于校验链路 */
async function makeImage(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp' = 'png',
): Promise<Buffer> {
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
  if (format === 'jpeg') pipeline = pipeline.jpeg()
  else if (format === 'png') pipeline = pipeline.png()
  else if (format === 'webp') pipeline = pipeline.webp()
  return await pipeline.toBuffer()
}

describe('MainImageUploadService', () => {
  let ds: DataSource
  let svc: MainImageUploadService
  let imageSvc: AssetImageService
  let tmpDir: string

  beforeEach(async () => {
    ds = await buildDb()
    imageSvc = new AssetImageService(ds)
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-img-upload-'))
    svc = new MainImageUploadService(new StubPathProvider(tmpDir), imageSvc)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('upload: 合法 PNG → 写文件 + 落 asset_image(isMain=1, category=main)', async () => {
    const buf = await makeImage(512, 512, 'png')
    const result = await svc.upload({
      buffer: buf,
      fileName: 'char.png',
      assetType: 'character',
      assetId: 'ch1',
    })

    expect(result.imagePath).toMatch(/^asset-images\/character-ch1-main-\d+\.png$/)
    expect(result.assetType).toBe('character')
    expect(result.assetId).toBe('ch1')
    expect(result.category).toBe('main')
    expect(result.isMain).toBe(1)

    // 文件落到磁盘
    const absPath = path.join(tmpDir, result.imagePath)
    expect(fs.existsSync(absPath)).toBe(true)

    // DB 主图
    const main = await imageSvc.getMainImage('character', 'ch1')
    expect(main).not.toBeNull()
    expect(main!.id).toBe(result.id)
  })

  it('upload: 合法 JPEG 落盘扩展名为 jpg', async () => {
    const buf = await makeImage(256, 256, 'jpeg')
    const result = await svc.upload({
      buffer: buf,
      fileName: 'char.jpg',
      assetType: 'character',
      assetId: 'ch2',
    })
    expect(result.imagePath).toMatch(/\.jpg$/)
  })

  it('upload: 合法 WebP 也接受', async () => {
    const buf = await makeImage(256, 256, 'webp')
    const result = await svc.upload({
      buffer: buf,
      fileName: 'char.webp',
      assetType: 'item',
      assetId: 'it1',
    })
    expect(result.imagePath).toMatch(/\.webp$/)
    expect(result.assetType).toBe('item')
  })

  it('upload: 第二次上传后，旧主图 isMain 置 0，新图 isMain=1', async () => {
    const buf1 = await makeImage(256, 256, 'png')
    const first = await svc.upload({
      buffer: buf1,
      fileName: 'first.png',
      assetType: 'location',
      assetId: 'loc1',
    })
    expect(first.isMain).toBe(1)

    const buf2 = await makeImage(128, 128, 'png')
    const second = await svc.upload({
      buffer: buf2,
      fileName: 'second.png',
      assetType: 'location',
      assetId: 'loc1',
    })
    expect(second.isMain).toBe(1)
    expect(second.id).not.toBe(first.id)

    // 确认 DB 只有一个 isMain=1
    const allImages = await imageSvc.listByAsset('location', 'loc1')
    const mainImages = allImages.filter((i) => i.isMain === 1)
    expect(mainImages).toHaveLength(1)
    expect(mainImages[0].id).toBe(second.id)
  })

  it('upload: 空 buffer → EMPTY', async () => {
    await expect(
      svc.upload({
        buffer: Buffer.alloc(0),
        fileName: 'x.png',
        assetType: 'character',
        assetId: 'ch1',
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        name: 'MainImageUploadValidationError',
        code: 'EMPTY',
      }) as unknown as Error,
    )
  })

  it('upload: 非图像字节 → BAD_FORMAT', async () => {
    await expect(
      svc.upload({
        buffer: Buffer.from('this is not an image'),
        fileName: 'fake.png',
        assetType: 'character',
        assetId: 'ch1',
      }),
    ).rejects.toThrowError(MainImageUploadValidationError)
  })

  it('upload: 超 20MB → TOO_LARGE', async () => {
    const bigBuffer = Buffer.alloc(21 * 1024 * 1024, 0xff)
    await expect(
      svc.upload({
        buffer: bigBuffer,
        fileName: 'huge.png',
        assetType: 'character',
        assetId: 'ch1',
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'TOO_LARGE' }) as unknown as Error,
    )
  })

  it('upload: 支持三种 assetType（location / item）', async () => {
    const buf = await makeImage(128, 128, 'png')
    const loc = await svc.upload({
      buffer: buf,
      fileName: 'loc.png',
      assetType: 'location',
      assetId: 'l1',
    })
    expect(loc.assetType).toBe('location')

    const item = await svc.upload({
      buffer: buf,
      fileName: 'item.png',
      assetType: 'item',
      assetId: 'i1',
    })
    expect(item.assetType).toBe('item')
  })
})
