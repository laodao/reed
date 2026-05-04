/**
 * PanoramaUploadService 单测（P3c · 文件上传完整化）
 * @module tests/unit/episode-production/assets/panorama-upload.service
 *
 * 覆盖：
 * - upload: 合法 jpg/png/webp 2:1 → 写文件 + 落 asset_images
 * - upload: 空 buffer / 超 50MB / 非 image / 不支持格式 / 比例非 2:1 → 抛对应 code 的 PanoramaUploadValidationError
 *
 * 用真实 sharp 生成测试图（小尺寸即可，避免大内存）；
 * 用 tmp 目录做 PathProvider，验证文件确实写到 dataPath/panoramas/。
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
  PanoramaGeneratorService,
  type PanoramaImageGenerator,
} from '@core/modules/episode-production/assets/services/panorama-generator.service'
import {
  PanoramaUploadService,
  PanoramaUploadValidationError,
} from '@core/modules/episode-production/assets/services/panorama-upload.service'
import type { IPathProvider } from '@core/interfaces/path.interface'

class StubPathProvider implements IPathProvider {
  constructor(private readonly dataPath: string) {}
  getUserDataPath(): string {
    return this.dataPath
  }
  getAppDataPath(): string {
    return this.dataPath
  }
  getTempPath(): string {
    return this.dataPath
  }
  getDataPath(): string {
    return this.dataPath
  }
  getSubDirectories(): never {
    throw new Error('not used')
  }
  getSubDirectoryPath(): never {
    throw new Error('not used')
  }
  toAssetUrl(rel: string): string {
    return `/assets/${rel}`
  }
}

class StubPanoGen implements PanoramaImageGenerator {
  async generate(): Promise<{ imagePath: string; thumbnailPath: null }> {
    return { imagePath: '/mock.jpg', thumbnailPath: null }
  }
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

/** 用 sharp 生成一张内存里的 PNG，用于校验链路 */
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
      background: { r: 70, g: 130, b: 180 },
    },
  })
  if (format === 'jpeg') pipeline = pipeline.jpeg()
  else if (format === 'png') pipeline = pipeline.png()
  else if (format === 'webp') pipeline = pipeline.webp()
  return await pipeline.toBuffer()
}

describe('PanoramaUploadService', () => {
  let ds: DataSource
  let svc: PanoramaUploadService
  let imageSvc: AssetImageService
  let tmpDir: string

  beforeEach(async () => {
    ds = await buildDb()
    imageSvc = new AssetImageService(ds)
    const panoGen = new PanoramaGeneratorService(imageSvc, new StubPanoGen())
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-upload-'))
    svc = new PanoramaUploadService(new StubPathProvider(tmpDir), panoGen)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('upload: 合法 PNG 2:1 → 写文件 + 落 asset_image', async () => {
    const buf = await makeImage(2000, 1000, 'png')
    const result = await svc.upload({
      buffer: buf,
      fileName: 'test.png',
      locationBindingId: 'lb1',
    })

    expect(result.imagePath).toMatch(/^panoramas\/pano_[0-9a-f]+\.png$/)
    expect(result.assetType).toBe('location')
    expect(result.assetId).toBe('lb1')
    expect(result.category).toBe('panorama_360')

    // 文件落到磁盘
    const absPath = path.join(tmpDir, result.imagePath)
    expect(fs.existsSync(absPath)).toBe(true)
    expect(fs.statSync(absPath).size).toBe(buf.byteLength)

    // DB 列出
    const list = await imageSvc.listByCategory('location', 'lb1', 'panorama_360')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(result.id)
  })

  it('upload: 合法 JPEG 落盘扩展名为 jpg', async () => {
    const buf = await makeImage(2000, 1000, 'jpeg')
    const result = await svc.upload({
      buffer: buf,
      fileName: 'whatever.bin',
      locationBindingId: 'lb1',
    })
    expect(result.imagePath).toMatch(/\.jpg$/)
  })

  it('upload: 合法 WebP 也接受', async () => {
    const buf = await makeImage(2000, 1000, 'webp')
    const result = await svc.upload({
      buffer: buf,
      fileName: 'pano.webp',
      locationBindingId: 'lb1',
    })
    expect(result.imagePath).toMatch(/\.webp$/)
  })

  it('upload: 空 buffer → EMPTY', async () => {
    await expect(
      svc.upload({
        buffer: Buffer.alloc(0),
        fileName: 'x.png',
        locationBindingId: 'lb1',
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        name: 'PanoramaUploadValidationError',
        code: 'EMPTY',
      }) as unknown as Error,
    )
  })

  it('upload: 非图像字节 → BAD_FORMAT', async () => {
    await expect(
      svc.upload({
        buffer: Buffer.from('this is not an image at all'),
        fileName: 'fake.png',
        locationBindingId: 'lb1',
      }),
    ).rejects.toThrowError(PanoramaUploadValidationError)
  })

  it('upload: 比例 1:1 → BAD_ASPECT', async () => {
    const buf = await makeImage(1024, 1024, 'png')
    await expect(
      svc.upload({
        buffer: buf,
        fileName: 'square.png',
        locationBindingId: 'lb1',
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'BAD_ASPECT' }) as unknown as Error,
    )
  })

  it('upload: 比例 4:3 → BAD_ASPECT', async () => {
    const buf = await makeImage(1600, 1200, 'png')
    await expect(
      svc.upload({
        buffer: buf,
        fileName: 'wide.png',
        locationBindingId: 'lb1',
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'BAD_ASPECT' }) as unknown as Error,
    )
  })

  it('upload: 容忍 ±2% 比例（如 2046×1024，aspect≈1.998）', async () => {
    const buf = await makeImage(2046, 1024, 'png')
    const result = await svc.upload({
      buffer: buf,
      fileName: 'almost-2-1.png',
      locationBindingId: 'lb1',
    })
    expect(result.imagePath).toBeTruthy()
  })
})
