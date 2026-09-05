/**
 * UserAssetService · spec（Phase 4 D2，spec 2026-05-09 §3.2 D2 · P-7）
 *
 * 验证：
 *   - addToLibrary：拷 snapshot + 拷图 + 写 user_assets
 *   - listLibrary：按 user_id / asset_type 过滤；按 createdAt 倒序
 *   - createFromLibrary：拷 snapshot 创建 binding；拷图作 asset_image 行
 *   - deleteFromLibrary：删 DB + 删目录
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { UserAssetEntity } from '@core/database/entities/episode-production/user-asset.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { UserAssetService } from '@core/platform/episode-production/user-asset/user-asset.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      AssetImageEntity,
      UserAssetEntity,
      LwCharacterEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedCharacterWithImage(
  ds: DataSource,
  storageRoot: string,
  bindingId = 'cb1',
): Promise<string> {
  // 在 storageRoot 模拟一张存在的图
  await fs.mkdir(storageRoot, { recursive: true })
  const imgPath = path.join(storageRoot, 'src-main.jpg')
  await fs.writeFile(imgPath, 'fake-img-bytes')

  const bindingRepo = ds.getRepository(CharacterBindingEntity)
  await bindingRepo.save({
    id: bindingId,
    userId: 'user1',
    projectId: 'p1',
    sourceType: 'standalone',
    standaloneName: '李白',
    standaloneDescription: '诗人',
    voiceConfig: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)

  const imageRepo = ds.getRepository(AssetImageEntity)
  await imageRepo.save({
    id: 'img_main',
    userId: 'user1',
    assetType: 'character',
    assetId: bindingId,
    category: 'main',
    label: null,
    imagePath: imgPath,
    isMain: 1,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)

  return imgPath
}

describe('UserAssetService', () => {
  let ds: DataSource
  let svc: UserAssetService
  let tempRoot: string
  let storageRoot: string
  let projectAssetRoot: string

  beforeEach(async () => {
    ds = await buildDb()
    svc = new UserAssetService(ds)
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'user-asset-test-'))
    storageRoot = path.join(tempRoot, 'user-assets')
    projectAssetRoot = path.join(tempRoot, 'project-assets')
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
  })

  describe('addToLibrary', () => {
    it('character binding → 拷 snapshot + 拷图 + 写 user_assets', async () => {
      await seedCharacterWithImage(ds, tempRoot, 'cb1')
      const result = await svc.addToLibrary({
        bindingId: 'cb1',
        bindingType: 'character',
        storageRoot,
        userId: 'user1',
      })

      expect(result.id).toMatch(/^ua_/)
      expect(result.assetType).toBe('character')
      expect(result.name).toBe('李白')
      expect(result.description).toBe('诗人')
      expect(result.sourceBindingId).toBe('cb1')
      expect(result.imagePaths).toHaveLength(1)
      expect(result.imagePaths![0]).toMatch(/user-assets\/ua_/)

      // 实际拷贝了文件
      const exists = await fs.access(result.imagePaths![0]).then(() => true).catch(() => false)
      expect(exists).toBe(true)
    })

    it('binding 不存在 → 抛错', async () => {
      await expect(
        svc.addToLibrary({
          bindingId: 'cb_not_exist',
          bindingType: 'character',
          storageRoot,
          userId: 'user1',
        }),
      ).rejects.toThrow(/不存在/)
    })

    it('binding 无图 → imagePaths = null', async () => {
      const repo = ds.getRepository(CharacterBindingEntity)
      await repo.save({
        id: 'cb_no_img',
        userId: 'user1',
        projectId: 'p1',
        sourceType: 'standalone',
        standaloneName: '无图角色',
        voiceConfig: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      const result = await svc.addToLibrary({
        bindingId: 'cb_no_img',
        bindingType: 'character',
        storageRoot,
        userId: 'user1',
      })
      expect(result.imagePaths).toBeNull()
    })
  })

  describe('listLibrary', () => {
    it('返回当前 user 的库（按 createdAt 倒序）', async () => {
      await seedCharacterWithImage(ds, tempRoot, 'cb1')
      // 加入 2 个；插入间隔保证 createdAt 不同
      await svc.addToLibrary({ bindingId: 'cb1', bindingType: 'character', storageRoot, userId: 'user1' })
      await new Promise((r) => setTimeout(r, 5))

      // 模拟另一个 binding
      const repo = ds.getRepository(CharacterBindingEntity)
      await repo.save({
        id: 'cb2',
        userId: 'user1',
        projectId: 'p1',
        sourceType: 'standalone',
        standaloneName: '杜甫',
        standaloneDescription: '另一诗人',
        voiceConfig: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      await svc.addToLibrary({ bindingId: 'cb2', bindingType: 'character', storageRoot, userId: 'user1' })

      const list = await svc.listLibrary({ userId: 'user1' })
      expect(list).toHaveLength(2)
      expect(list[0].name).toBe('杜甫')  // 最新的在前
      expect(list[1].name).toBe('李白')
    })

    it('按 assetType 过滤', async () => {
      // 加 character + 模拟 location
      await seedCharacterWithImage(ds, tempRoot, 'cb1')
      await svc.addToLibrary({ bindingId: 'cb1', bindingType: 'character', storageRoot, userId: 'user1' })

      const locationRepo = ds.getRepository(LocationBindingEntity)
      await locationRepo.save({
        id: 'lb1',
        userId: 'user1',
        projectId: 'p1',
        sourceType: 'standalone',
        standaloneName: '黄鹤楼',
        locationName: '黄鹤楼',  // location_bindings 必填
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      await svc.addToLibrary({ bindingId: 'lb1', bindingType: 'location', storageRoot, userId: 'user1' })

      const characters = await svc.listLibrary({ assetType: 'character', userId: 'user1' })
      const locations = await svc.listLibrary({ assetType: 'location', userId: 'user1' })
      expect(characters).toHaveLength(1)
      expect(characters[0].assetType).toBe('character')
      expect(locations).toHaveLength(1)
      expect(locations[0].assetType).toBe('location')
    })

    it('按 keyword 过滤', async () => {
      await seedCharacterWithImage(ds, tempRoot, 'cb1')
      await svc.addToLibrary({ bindingId: 'cb1', bindingType: 'character', storageRoot, userId: 'user1' })

      const matches = await svc.listLibrary({ keyword: '李', userId: 'user1' })
      const noMatches = await svc.listLibrary({ keyword: '不存在的关键词', userId: 'user1' })
      expect(matches).toHaveLength(1)
      expect(noMatches).toHaveLength(0)
    })

    it('user 隔离', async () => {
      await seedCharacterWithImage(ds, tempRoot, 'cb1')
      await svc.addToLibrary({ bindingId: 'cb1', bindingType: 'character', storageRoot, userId: 'user1' })

      const myList = await svc.listLibrary({ userId: 'user1' })
      const otherList = await svc.listLibrary({ userId: 'user2' })
      expect(myList).toHaveLength(1)
      expect(otherList).toHaveLength(0)
    })
  })

  describe('createFromLibrary', () => {
    it('拷 snapshot + 拷图 → 在 target project 创建 binding + asset_image 行', async () => {
      await seedCharacterWithImage(ds, tempRoot, 'cb1')
      const ua = await svc.addToLibrary({
        bindingId: 'cb1',
        bindingType: 'character',
        storageRoot,
        userId: 'user1',
      })

      const result = await svc.createFromLibrary({
        userAssetId: ua.id,
        targetProjectId: 'p_new',
        projectAssetRoot,
        userId: 'user1',
      })
      expect(result.bindingId).toMatch(/^cb_/)

      // 新 binding 存在
      const newBinding = await ds.getRepository(CharacterBindingEntity).findOne({
        where: { id: result.bindingId },
      })
      expect(newBinding).toBeTruthy()
      expect(newBinding!.projectId).toBe('p_new')
      expect(newBinding!.standaloneName).toBe('李白')
      expect(newBinding!.sourceType).toBe('standalone')

      // 新 asset_image 行（main）
      const images = await ds.getRepository(AssetImageEntity).find({
        where: { assetId: result.bindingId },
      })
      expect(images).toHaveLength(1)
      expect(images[0].category).toBe('main')
      expect(images[0].isMain).toBe(1)
    })

    it('user_asset 不存在 → 抛错', async () => {
      await expect(
        svc.createFromLibrary({
          userAssetId: 'ua_not_exist',
          targetProjectId: 'p_new',
          projectAssetRoot,
          userId: 'user1',
        }),
      ).rejects.toThrow(/不存在|无权/)
    })
  })

  describe('deleteFromLibrary', () => {
    it('删 DB 行 + 删 user-assets 目录', async () => {
      await seedCharacterWithImage(ds, tempRoot, 'cb1')
      const ua = await svc.addToLibrary({
        bindingId: 'cb1',
        bindingType: 'character',
        storageRoot,
        userId: 'user1',
      })
      const dir = path.join(storageRoot, ua.id)
      const dirExists = await fs.access(dir).then(() => true).catch(() => false)
      expect(dirExists).toBe(true)

      await svc.deleteFromLibrary({
        userAssetId: ua.id,
        storageRoot,
        userId: 'user1',
      })

      const dirAfter = await fs.access(dir).then(() => true).catch(() => false)
      expect(dirAfter).toBe(false)
      const list = await svc.listLibrary({ userId: 'user1' })
      expect(list).toHaveLength(0)
    })

    it('不存在 → 静默 noop', async () => {
      await expect(
        svc.deleteFromLibrary({
          userAssetId: 'ua_not_exist',
          storageRoot,
          userId: 'user1',
        }),
      ).resolves.toBeUndefined()
    })
  })
})
