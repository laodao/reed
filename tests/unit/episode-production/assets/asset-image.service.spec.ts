/**
 * AssetImageService 单测（P3a Task 2）
 * @module tests/unit/episode-production/assets/asset-image.service
 *
 * 5 个用例覆盖统一图谱核心 CRUD：
 * - addImage：新增 + 自动生成 ai_xxx ID
 * - setAsMain：切换主图（旧 main → view + isMain=0）
 * - listByCategory：按 category 过滤
 * - deleteImage：删除单张图
 * - getMainImage：取主图（无则 null）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
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
    entities: [AssetImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('AssetImageService', () => {
  let ds: DataSource
  let svc: AssetImageService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new AssetImageService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('addImage 增加一张图，按 (asset_type, asset_id) 查得到', async () => {
    const created = await svc.addImage({
      assetType: 'character',
      assetId: 'cb1',
      category: 'main',
      imagePath: '/img/a.png',
      isMain: true,
      sortOrder: 0,
    })
    expect(created.id).toMatch(/^ai_[0-9a-f]{16}$/)

    const list = await svc.listByAsset('character', 'cb1')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      assetType: 'character',
      assetId: 'cb1',
      category: 'main',
      imagePath: '/img/a.png',
      isMain: 1,
    })
  })

  it('setAsMain 把指定图标 main，同 asset 之前的 main 取消', async () => {
    const a = await svc.addImage({
      assetType: 'character',
      assetId: 'cb1',
      category: 'main',
      imagePath: '/a.png',
      isMain: true,
    })
    const b = await svc.addImage({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      imagePath: '/b.png',
      isMain: false,
    })

    await svc.setAsMain(b.id)

    const list = await svc.listByAsset('character', 'cb1')
    const aAfter = list.find(x => x.id === a.id)!
    const bAfter = list.find(x => x.id === b.id)!
    expect(aAfter.isMain).toBe(0)
    expect(aAfter.category).toBe('view') // 原 main 自动降为 view
    expect(bAfter.isMain).toBe(1)
    expect(bAfter.category).toBe('main') // 新 main 自动升 category
  })

  it('listByCategory 按类别过滤', async () => {
    await svc.addImage({
      assetType: 'character',
      assetId: 'cb1',
      category: 'main',
      imagePath: '/m.png',
      isMain: true,
    })
    await svc.addImage({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      imagePath: '/v1.png',
      isMain: false,
      label: 'front',
      sortOrder: 0,
    })
    await svc.addImage({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      imagePath: '/v2.png',
      isMain: false,
      label: '3q_left',
      sortOrder: 1,
    })

    const views = await svc.listByCategory('character', 'cb1', 'view')
    expect(views).toHaveLength(2)
    expect(views.map(x => x.label)).toEqual(['front', '3q_left'])
  })

  it('deleteImage 删除单张图', async () => {
    const img = await svc.addImage({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      imagePath: '/v.png',
      isMain: false,
    })
    await svc.deleteImage(img.id)
    const list = await svc.listByAsset('character', 'cb1')
    expect(list).toHaveLength(0)
  })

  it('deleteImage 方案A：删除记录时连同清理落盘的图片与缩略图文件', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-img-del-'))
    registerPathProvider(() => new StubPathProvider(tmpDir))
    const imgDir = path.join(tmpDir, 'asset-images')
    fs.mkdirSync(imgDir, { recursive: true })
    const mainFile = path.join(imgDir, 'main.png')
    const thumbFile = path.join(imgDir, 'thumb.png')
    fs.writeFileSync(mainFile, 'x')
    fs.writeFileSync(thumbFile, 'x')

    const img = await svc.addImage({
      assetType: 'character',
      assetId: 'cb1',
      category: 'main',
      imagePath: 'asset-images/main.png',
      thumbnailPath: 'asset-images/thumb.png',
      isMain: true,
    })
    expect(fs.existsSync(mainFile)).toBe(true)
    expect(fs.existsSync(thumbFile)).toBe(true)

    await svc.deleteImage(img.id)

    const list = await svc.listByAsset('character', 'cb1')
    expect(list).toHaveLength(0)
    // 文件也应被删除（方案A：老图片不留磁盘）
    expect(fs.existsSync(mainFile)).toBe(false)
    expect(fs.existsSync(thumbFile)).toBe(false)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('deleteImage 方案A：文件缺失时删除记录不抛错（容错）', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-img-del-'))
    registerPathProvider(() => new StubPathProvider(tmpDir))
    const img = await svc.addImage({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      imagePath: 'asset-images/not-there.png',
      isMain: false,
    })
    await expect(svc.deleteImage(img.id)).resolves.toBeUndefined()
    expect(await svc.listByAsset('character', 'cb1')).toHaveLength(0)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('getMainImage 返回 main，没有则 null', async () => {
    expect(await svc.getMainImage('character', 'cb1')).toBeNull()
    const m = await svc.addImage({
      assetType: 'character',
      assetId: 'cb1',
      category: 'main',
      imagePath: '/m.png',
      isMain: true,
    })
    const main = await svc.getMainImage('character', 'cb1')
    expect(main?.id).toBe(m.id)
  })

  describe('savePrompt（图集 slot 提示词保存）', () => {
    it('有图资产：main slot 更新默认主图 prompt', async () => {
      await svc.addImage({
        assetType: 'character',
        assetId: 'cb1',
        category: 'main',
        imagePath: '/m.png',
        isMain: true,
        prompt: '旧提示词',
      })
      await svc.savePrompt({
        assetType: 'character',
        assetId: 'cb1',
        category: 'main',
        label: null,
        prompt: '新提示词',
      })
      const list = await svc.listByAsset('character', 'cb1')
      expect(list).toHaveLength(1)
      expect(list[0].prompt).toBe('新提示词')
    })

    it('有图资产：view slot 按 label 精确更新，不兜底主图', async () => {
      await svc.addImage({
        assetType: 'character',
        assetId: 'cb1',
        category: 'main',
        imagePath: '/m.png',
        isMain: true,
        prompt: '主图提示词',
      })
      await svc.addImage({
        assetType: 'character',
        assetId: 'cb1',
        category: 'view',
        imagePath: '/v.png',
        isMain: false,
        label: 'front_half',
        prompt: '旧 view 提示词',
      })
      await svc.savePrompt({
        assetType: 'character',
        assetId: 'cb1',
        category: 'view',
        label: 'front_half',
        prompt: '新 view 提示词',
      })
      const list = await svc.listByAsset('character', 'cb1')
      expect(list).toHaveLength(2)
      const view = list.find(x => x.label === 'front_half')!
      const main = list.find(x => x.category === 'main')!
      expect(view.prompt).toBe('新 view 提示词')
      expect(main.prompt).toBe('主图提示词') // 主图未被误写
    })

    it('待生成资产：main slot 创建占位行（imagePath 空、isMain 0、category main）', async () => {
      const p = await svc.savePrompt({
        assetType: 'character',
        assetId: 'cb9',
        category: 'main',
        label: null,
        prompt: '占位提示词',
      })
      expect(p.imagePath).toBe('')
      expect(p.isMain).toBe(0)
      expect(p.category).toBe('main')
      expect(p.prompt).toBe('占位提示词')
      const list = await svc.listByAsset('character', 'cb9')
      expect(list).toHaveLength(1)
      expect(list[0].prompt).toBe('占位提示词')
      // getMainImage（isMain=1）不应把占位行当主图返回
      expect(await svc.getMainImage('character', 'cb9')).toBeNull()
    })

    it('待生成资产：view slot 无匹配行时创建对应 label 占位行，不写主图', async () => {
      await svc.addImage({
        assetType: 'character',
        assetId: 'cb1',
        category: 'main',
        imagePath: '/m.png',
        isMain: true,
        prompt: '主图提示词',
      })
      const p = await svc.savePrompt({
        assetType: 'character',
        assetId: 'cb1',
        category: 'view',
        label: 'front_half',
        prompt: '待生成 view 提示词',
      })
      expect(p.label).toBe('front_half')
      expect(p.imagePath).toBe('')
      const list = await svc.listByAsset('character', 'cb1')
      expect(list).toHaveLength(2)
      const main = list.find(x => x.category === 'main')!
      expect(main.prompt).toBe('主图提示词') // 主图未被误写
    })

    it('占位行已存在时再次保存走 update（不重复建行）', async () => {
      const first = await svc.savePrompt({
        assetType: 'character',
        assetId: 'cb1',
        category: 'main',
        label: null,
        prompt: '第一次',
      })
      const second = await svc.savePrompt({
        assetType: 'character',
        assetId: 'cb1',
        category: 'main',
        label: null,
        prompt: '第二次',
      })
      expect(second.id).toBe(first.id)
      const list = await svc.listByAsset('character', 'cb1')
      expect(list).toHaveLength(1)
      expect(list[0].prompt).toBe('第二次')
    })

    it('空提示词抛错', async () => {
      await expect(
        svc.savePrompt({
          assetType: 'character',
          assetId: 'cb1',
          category: 'main',
          label: null,
          prompt: '   ',
        }),
      ).rejects.toThrow(/提示词/)
    })
  })

  describe('S-05 setConfirmed（定妆确认闸门）', () => {
    it('新图默认 confirmed=0；setConfirmed 置 1 / 撤销回 0', async () => {
      const img = await svc.addImage({
        assetType: 'character',
        assetId: 'cb1',
        category: 'main',
        imagePath: '/m.png',
        isMain: true,
      })
      // addImage 未显式传 confirmed → entity 默认 0
      expect((await svc.getById(img.id))!.confirmed).toBe(0)

      await svc.setConfirmed(img.id, true)
      expect((await svc.getById(img.id))!.confirmed).toBe(1)

      await svc.setConfirmed(img.id, false)
      expect((await svc.getById(img.id))!.confirmed).toBe(0)
    })

    it('setConfirmed 对不存在的图抛错', async () => {
      await expect(svc.setConfirmed('ai_ghost', true)).rejects.toThrow(/不存在/)
    })
  })
})
