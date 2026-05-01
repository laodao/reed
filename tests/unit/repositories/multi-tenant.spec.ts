/**
 * 多租户 user_id 行级隔离 - BaseRepository.scoped API 测试
 * @description 通过 DialogRepository（已改造）验证：
 *   1. find / findOne / findAndCount / count / exists 自动按 ALS userId 过滤
 *   2. save / insert 自动注入当前 ALS userId
 *   3. update 的 partialEntity 中 userId 字段被剥离（防越权）
 *   4. update / delete 不能跨用户操作（user_id 不匹配的不动）
 *   5. qb（QueryBuilder）自动 andWhere user_id
 *   6. ALS userId 为 null 时（无登录上下文），where userId IS NULL 隔离
 *   7. RoleRepository 内置角色（user_id NULL）跨用户共享
 *   8. UserRepository（useRawRepo）不做 user_id 过滤
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { runWithUserAsync, setDefaultUser } from '@core/context/user-context'
import { DialogRepository } from '@core/database/repositories/dialog.repository'
import { RoleRepository } from '@core/database/repositories/role.repository'
import { UserRepository } from '@core/database/repositories/user.repository'
import { ImageRepository } from '@core/database/repositories/image.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import { PortraitProjectRepository } from '@core/database/repositories/portrait-project.repository'
import { PortraitCharacterRepository } from '@core/database/repositories/portrait-character.repository'
import { PortraitVariantRepository } from '@core/database/repositories/portrait-variant.repository'
import { ensureUsersTable } from '@core/database/migrations/ensure-users-table'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'

const USER_A = 'user-A'
const USER_B = 'user-B'

describe.each(getTestDialects())('multi-tenant scoped repository (%s)', dialect => {
  let testDs: TestDataSource
  let dialogRepo: DialogRepository
  let roleRepo: RoleRepository
  let userRepo: UserRepository
  let imageRepo: ImageRepository
  let imageAssetRepo: ImageAssetRepository
  let portraitProjectRepo: PortraitProjectRepository
  let portraitCharRepo: PortraitCharacterRepository
  let portraitVariantRepo: PortraitVariantRepository

  beforeAll(async () => {
    testDs = await createTestDataSource(dialect)
    await ensureUsersTable(testDs.ds)
    dialogRepo = new DialogRepository(testDs.ds)
    roleRepo = new RoleRepository(testDs.ds)
    userRepo = new UserRepository(testDs.ds)
    imageRepo = new ImageRepository(testDs.ds)
    imageAssetRepo = new ImageAssetRepository(testDs.ds)
    portraitProjectRepo = new PortraitProjectRepository(testDs.ds)
    portraitCharRepo = new PortraitCharacterRepository(testDs.ds)
    portraitVariantRepo = new PortraitVariantRepository(testDs.ds)
  })

  afterAll(async () => {
    await testDs.close()
  })

  beforeEach(async () => {
    setDefaultUser('')
    await testDs.truncateAll()
  })

  // ========================================================================
  // 1. 基础读隔离：find / findOne / findAndCount
  // ========================================================================
  describe('读操作的 user_id 过滤', () => {
    it('A 创建的 dialog 在 B 的 find 里看不到', async () => {
      await runWithUserAsync(USER_A, async () => {
        await dialogRepo.create({
          title: 'A 的对话',
          modelId: 'm',
          providerConfigId: 'p',
          roleId: null,
        } as any)
      })

      const aListed = await runWithUserAsync(USER_A, () => dialogRepo.getAll())
      const bListed = await runWithUserAsync(USER_B, () => dialogRepo.getAll())

      expect(aListed.length).toBe(1)
      expect(aListed[0].title).toBe('A 的对话')
      expect(bListed.length).toBe(0)
    })

    it('A 的 dialog 用 B 身份 getById 返回 null', async () => {
      const created = await runWithUserAsync(USER_A, () =>
        dialogRepo.create({
          title: 'A only',
          modelId: 'm',
          providerConfigId: 'p',
          roleId: null,
        } as any),
      )

      const aFound = await runWithUserAsync(USER_A, () => dialogRepo.getById(created.id))
      const bFound = await runWithUserAsync(USER_B, () => dialogRepo.getById(created.id))

      expect(aFound).not.toBeNull()
      expect(bFound).toBeNull()
    })
  })

  // ========================================================================
  // 2. 写入注入 user_id
  // ========================================================================
  describe('写操作自动注入 user_id', () => {
    it('save 写入实体后 user_id 被打上当前 ALS userId', async () => {
      const created = await runWithUserAsync(USER_A, () =>
        dialogRepo.create({
          title: 'A',
          modelId: 'm',
          providerConfigId: 'p',
          roleId: null,
        } as any),
      )

      // 用裸 repo 越权读，验证 DB 里 user_id 字段
      const raw = await testDs.ds
        .getRepository((dialogRepo as any).repo.metadata.target)
        .findOne({ where: { id: created.id } as any })
      expect((raw as any).userId).toBe(USER_A)
    })

    it('update 不允许通过 partialEntity 改 user_id（防越权）', async () => {
      const created = await runWithUserAsync(USER_A, () =>
        dialogRepo.create({
          title: 'A',
          modelId: 'm',
          providerConfigId: 'p',
          roleId: null,
        } as any),
      )

      await runWithUserAsync(USER_A, () =>
        dialogRepo.update(created.id, { title: 'A2', userId: USER_B } as any),
      )

      const raw = await testDs.ds
        .getRepository((dialogRepo as any).repo.metadata.target)
        .findOne({ where: { id: created.id } as any })
      expect((raw as any).userId).toBe(USER_A)
      expect((raw as any).title).toBe('A2')
    })
  })

  // ========================================================================
  // 3. update / delete 不能跨用户
  // ========================================================================
  describe('update / delete 不能跨用户操作', () => {
    it('B 不能更新 A 的 dialog', async () => {
      const created = await runWithUserAsync(USER_A, () =>
        dialogRepo.create({
          title: 'A',
          modelId: 'm',
          providerConfigId: 'p',
          roleId: null,
        } as any),
      )

      await runWithUserAsync(USER_B, () =>
        dialogRepo.update(created.id, { title: 'B 的篡改' } as any),
      )

      const stillA = await runWithUserAsync(USER_A, () => dialogRepo.getById(created.id))
      expect(stillA?.title).toBe('A') // 没被改
    })

    it('B 不能删除 A 的 dialog', async () => {
      const created = await runWithUserAsync(USER_A, () =>
        dialogRepo.create({
          title: 'A',
          modelId: 'm',
          providerConfigId: 'p',
          roleId: null,
        } as any),
      )

      await runWithUserAsync(USER_B, () => dialogRepo.delete(created.id))
      const stillA = await runWithUserAsync(USER_A, () => dialogRepo.getById(created.id))
      expect(stillA).not.toBeNull()
    })
  })

  // ========================================================================
  // 4. RoleRepository 内置角色（user_id NULL）跨用户共享
  // ========================================================================
  describe('内置角色跨用户共享', () => {
    it('initBuiltinRoles 后 A 和 B 都能看到内置角色', async () => {
      // RoleRepository.initBuiltinRoles 不依赖当前用户上下文
      await runWithUserAsync('', () => roleRepo.initBuiltinRoles())

      const aRoles = await runWithUserAsync(USER_A, () => roleRepo.getAll())
      const bRoles = await runWithUserAsync(USER_B, () => roleRepo.getAll())

      expect(aRoles.some(r => r.isBuiltin)).toBe(true)
      expect(bRoles.some(r => r.isBuiltin)).toBe(true)
    })

    it('A 的自定义 role 在 B 看不到，但内置角色 B 能看到', async () => {
      await runWithUserAsync('', () => roleRepo.initBuiltinRoles())
      await runWithUserAsync(USER_A, () =>
        roleRepo.create({ name: 'A 的角色', systemPrompt: 'sp' } as any),
      )

      const aRoles = await runWithUserAsync(USER_A, () => roleRepo.getAll())
      const bRoles = await runWithUserAsync(USER_B, () => roleRepo.getAll())

      const aCustom = aRoles.filter(r => !r.isBuiltin)
      const bCustom = bRoles.filter(r => !r.isBuiltin)
      expect(aCustom.length).toBe(1)
      expect(aCustom[0].name).toBe('A 的角色')
      expect(bCustom.length).toBe(0)

      // 内置角色双方都看到
      const aBuiltin = aRoles.filter(r => r.isBuiltin).length
      const bBuiltin = bRoles.filter(r => r.isBuiltin).length
      expect(aBuiltin).toBe(bBuiltin)
      expect(aBuiltin).toBeGreaterThan(0)
    })

    it('initBuiltinRoles 重新执行会把误回填的内置角色 user_id 重置回 NULL', async () => {
      await runWithUserAsync('', () => roleRepo.initBuiltinRoles())

      // 模拟 PC 端 ensureUserIdColumns 误把内置角色 user_id 回填为
      // local-default-user 的情况。用 typeorm 的 update 而不是 raw query，
      // 这样 PG 的 schema 隔离自动生效。
      const RoleEntity = (await import('@core/database/entities/role.entity'))
        .RoleEntity
      await testDs.ds
        .getRepository(RoleEntity)
        .createQueryBuilder()
        .update()
        .set({ userId: 'local-default-user' } as any)
        .where('is_builtin = 1')
        .execute()

      // 再次 initBuiltinRoles 应当把 user_id 重置回 NULL
      await runWithUserAsync('', () => roleRepo.initBuiltinRoles())

      const rows = await testDs.ds
        .getRepository(RoleEntity)
        .find({ where: { isBuiltin: 1 } as any })
      for (const r of rows) {
        expect(r.userId).toBeNull()
      }
    })
  })

  // ========================================================================
  // 5. UserRepository（useRawRepo）不做过滤
  // ========================================================================
  describe('共享配置 Repository（useRawRepo）不做 user_id 过滤', () => {
    it('UserRepository.getByEmail 在没有 ALS userId 时也能找到用户', async () => {
      // ALS 中没 userId（注册/登录场景）
      const created = await runWithUserAsync('', async () =>
        userRepo.create({
          email: 'shared@example.com',
          displayName: 'shared',
        }),
      )
      const found = await runWithUserAsync('', () => userRepo.getByEmail('shared@example.com'))
      expect(found?.id).toBe(created.id)

      // 即使在某个用户上下文里也能查任意 user
      const fromAContext = await runWithUserAsync(USER_A, () =>
        userRepo.getByEmail('shared@example.com'),
      )
      expect(fromAContext?.id).toBe(created.id)
    })
  })

  // ========================================================================
  // 6. 跨表事务的隔离（DialogRepository.delete 联动 messages）
  // ========================================================================
  describe('跨表事务的 user_id 隔离', () => {
    it('B 调 dialogRepo.delete(A 的 id) 不会删 A 的 messages', async () => {
      // A 创建 dialog 并发一条消息
      const dialog = await runWithUserAsync(USER_A, () =>
        dialogRepo.create({
          title: 'A',
          modelId: 'm',
          providerConfigId: 'p',
          roleId: null,
        } as any),
      )

      // 直接用裸 manager 插入一条 message（带 userId 字段）
      const MessageEntity = (await import('@core/database/entities/message.entity'))
        .MessageEntity
      await testDs.ds.getRepository(MessageEntity).save({
        id: 'msg-1',
        dialogId: dialog.id,
        role: 'user',
        content: 'hi',
        userId: USER_A,
        createdAt: new Date(),
      } as any)

      // B 尝试删除 A 的 dialog
      await runWithUserAsync(USER_B, () => dialogRepo.delete(dialog.id))

      // dialog 还在
      const stillA = await runWithUserAsync(USER_A, () => dialogRepo.getById(dialog.id))
      expect(stillA).not.toBeNull()

      // message 也还在
      const msg = await testDs.ds
        .getRepository(MessageEntity)
        .findOne({ where: { id: 'msg-1' } as any })
      expect(msg).not.toBeNull()
    })

    it('A 删除自己的 dialog 会级联删除自己的 messages', async () => {
      const dialog = await runWithUserAsync(USER_A, () =>
        dialogRepo.create({
          title: 'A',
          modelId: 'm',
          providerConfigId: 'p',
          roleId: null,
        } as any),
      )
      const MessageEntity = (await import('@core/database/entities/message.entity'))
        .MessageEntity
      await testDs.ds.getRepository(MessageEntity).save({
        id: 'msg-2',
        dialogId: dialog.id,
        role: 'user',
        content: 'hi',
        userId: USER_A,
        createdAt: new Date(),
      } as any)

      await runWithUserAsync(USER_A, () => dialogRepo.delete(dialog.id))

      const dialogAfter = await runWithUserAsync(USER_A, () => dialogRepo.getById(dialog.id))
      expect(dialogAfter).toBeNull()
      const msgAfter = await testDs.ds
        .getRepository(MessageEntity)
        .findOne({ where: { id: 'msg-2' } as any })
      expect(msgAfter).toBeNull()
    })
  })

  // ========================================================================
  // 7. ImageRepository / ImageAssetRepository 多租户隔离
  // ========================================================================
  describe('ImageRepository 隔离', () => {
    it('A 创建的 image 在 B 的 getList 里看不到', async () => {
      await runWithUserAsync(USER_A, () =>
        imageRepo.create({
          filePath: 'images/a.png',
          prompt: 'A 的图',
          providerId: 'p',
          modelId: 'm',
        } as any),
      )

      const aPage = await runWithUserAsync(USER_A, () => imageRepo.getList(1, 20))
      const bPage = await runWithUserAsync(USER_B, () => imageRepo.getList(1, 20))

      expect(aPage.images.length).toBe(1)
      expect(aPage.total).toBe(1)
      expect(bPage.images.length).toBe(0)
      expect(bPage.total).toBe(0)
    })

    it('B 不能 toggleFavorite A 的 image', async () => {
      const created = await runWithUserAsync(USER_A, () =>
        imageRepo.create({
          filePath: 'images/a.png',
          prompt: 'A',
          providerId: 'p',
          modelId: 'm',
        } as any),
      )

      // B 调 toggleFavorite 应该拿不到该 image，抛错
      await expect(
        runWithUserAsync(USER_B, () => imageRepo.toggleFavorite(created.id)),
      ).rejects.toThrow()

      // A 看自己的 favorite 仍是 false
      const stillA = await runWithUserAsync(USER_A, () => imageRepo.getById(created.id))
      expect(stillA?.favorite).toBe(false)
    })

    it('B 不能删除 A 的 image，deleteMany 跨用户也不删 A 的', async () => {
      const a1 = await runWithUserAsync(USER_A, () =>
        imageRepo.create({ filePath: 'a1.png', prompt: 'A1', providerId: 'p', modelId: 'm' } as any),
      )
      const b1 = await runWithUserAsync(USER_B, () =>
        imageRepo.create({ filePath: 'b1.png', prompt: 'B1', providerId: 'p', modelId: 'm' } as any),
      )

      // B 调 deleteMany 传 A 的 id + B 自己的 id：A 不应被删
      const affected = await runWithUserAsync(USER_B, () =>
        imageRepo.deleteMany([a1.id, b1.id]),
      )
      expect(affected).toBe(1) // 只删除 B 的

      const aStill = await runWithUserAsync(USER_A, () => imageRepo.getById(a1.id))
      expect(aStill).not.toBeNull()
    })

    it('updateStatusByTaskId 限定 user_id：B 的 taskId 同名也不能改 A 的 status', async () => {
      // A 和 B 创建两条 image，taskId 同名（极端场景）
      const a1 = await runWithUserAsync(USER_A, () =>
        imageRepo.create({
          filePath: 'a.png',
          prompt: 'A',
          providerId: 'p',
          modelId: 'm',
          taskId: 'shared-task-id',
          status: 'pending',
        } as any),
      )
      await runWithUserAsync(USER_B, () =>
        imageRepo.create({
          filePath: 'b.png',
          prompt: 'B',
          providerId: 'p',
          modelId: 'm',
          taskId: 'shared-task-id',
          status: 'pending',
        } as any),
      )

      // B 想把 status 改成 completed —— 只应改 B 自己的
      const affected = await runWithUserAsync(USER_B, () =>
        imageRepo.updateStatusByTaskId('shared-task-id', 'completed'),
      )
      expect(affected).toBe(1)

      const aImg = await runWithUserAsync(USER_A, () => imageRepo.getById(a1.id))
      expect(aImg?.status).toBe('pending') // A 的不动
    })
  })

  describe('ImageAssetRepository 隔离', () => {
    it('A 的 image_asset 在 B 的 getByProjectId 里看不到', async () => {
      await runWithUserAsync(USER_A, () =>
        imageAssetRepo.create({
          projectId: 'proj-1',
          type: 'character' as any,
          prompt: 'A',
          imagePath: 'a.png',
          width: 100,
          height: 100,
        }),
      )

      const aList = await runWithUserAsync(USER_A, () =>
        imageAssetRepo.getByProjectId('proj-1'),
      )
      const bList = await runWithUserAsync(USER_B, () =>
        imageAssetRepo.getByProjectId('proj-1'),
      )

      expect(aList.length).toBe(1)
      expect(bList.length).toBe(0)
    })

    it('deleteByProjectId 限定 user_id：B 调用同 projectId 不删 A 的', async () => {
      await runWithUserAsync(USER_A, () =>
        imageAssetRepo.create({
          projectId: 'shared-proj',
          type: 'character' as any,
          prompt: 'A',
          imagePath: 'a.png',
          width: 100,
          height: 100,
        }),
      )
      await runWithUserAsync(USER_B, () =>
        imageAssetRepo.create({
          projectId: 'shared-proj',
          type: 'character' as any,
          prompt: 'B',
          imagePath: 'b.png',
          width: 100,
          height: 100,
        }),
      )

      const bAffected = await runWithUserAsync(USER_B, () =>
        imageAssetRepo.deleteByProjectId('shared-proj'),
      )
      expect(bAffected).toBe(1)

      const aStill = await runWithUserAsync(USER_A, () =>
        imageAssetRepo.getByProjectId('shared-proj'),
      )
      expect(aStill.length).toBe(1)
    })
  })

  // ========================================================================
  // 8. 人像设计模块（PortraitProject / PortraitCharacter / PortraitVariant）
  // ========================================================================
  describe('人像设计模块隔离', () => {
    it('A 创建的 portrait project 在 B 看不到', async () => {
      await runWithUserAsync(USER_A, () =>
        portraitProjectRepo.create({ name: 'A 的项目' }),
      )

      const aList = await runWithUserAsync(USER_A, () =>
        portraitProjectRepo.getList(),
      )
      const bList = await runWithUserAsync(USER_B, () =>
        portraitProjectRepo.getList(),
      )

      expect(aList.projects.length).toBe(1)
      expect(aList.total).toBe(1)
      expect(bList.projects.length).toBe(0)
      expect(bList.total).toBe(0)
    })

    it('B 不能 update 或 delete A 的 portrait project', async () => {
      const projA = await runWithUserAsync(USER_A, () =>
        portraitProjectRepo.create({ name: 'A 的项目' }),
      )

      const updResult = await runWithUserAsync(USER_B, () =>
        portraitProjectRepo.update({ id: projA.id, name: 'B 篡改' } as any),
      )
      expect(updResult).toBeNull() // findOne 返回 null

      await runWithUserAsync(USER_B, () => portraitProjectRepo.delete(projA.id))

      const stillA = await runWithUserAsync(USER_A, () =>
        portraitProjectRepo.getById(projA.id),
      )
      expect(stillA?.name).toBe('A 的项目')
    })

    it('PortraitCharacter 按 user_id 隔离', async () => {
      const projA = await runWithUserAsync(USER_A, () =>
        portraitProjectRepo.create({ name: 'A 的项目' }),
      )

      await runWithUserAsync(USER_A, () =>
        portraitCharRepo.create({
          projectId: projA.id,
          name: 'A 的角色',
          gender: 'male' as any,
          age: 25,
          height: 180,
          weight: 70,
          race: 'asian' as any,
        }),
      )

      const aChars = await runWithUserAsync(USER_A, () =>
        portraitCharRepo.getByProjectId(projA.id),
      )
      const bChars = await runWithUserAsync(USER_B, () =>
        portraitCharRepo.getByProjectId(projA.id),
      )

      expect(aChars.length).toBe(1)
      expect(bChars.length).toBe(0)
    })

    it('PortraitVariant 按 user_id 隔离 + JOIN 查询不跨用户', async () => {
      const projA = await runWithUserAsync(USER_A, () =>
        portraitProjectRepo.create({ name: 'A 的项目' }),
      )
      const charA = await runWithUserAsync(USER_A, () =>
        portraitCharRepo.create({
          projectId: projA.id,
          name: 'A 的角色',
          gender: 'male' as any,
          age: 25,
          height: 180,
          weight: 70,
          race: 'asian' as any,
        }),
      )

      await runWithUserAsync(USER_A, () =>
        portraitVariantRepo.create({
          characterId: charA.id,
          type: 'base' as any,
          angle: 'front' as any,
          imagePath: 'a-front.png',
          prompt: 'a',
        }),
      )

      // A 用 getByCharacterId / getByProjectId / getFrontVariant 都能看到
      expect(
        (await runWithUserAsync(USER_A, () => portraitVariantRepo.getByCharacterId(charA.id))).length,
      ).toBe(1)
      expect(
        (await runWithUserAsync(USER_A, () => portraitVariantRepo.getByProjectId(projA.id))).length,
      ).toBe(1)
      expect(
        await runWithUserAsync(USER_A, () => portraitVariantRepo.getFrontVariant(charA.id)),
      ).not.toBeNull()

      // B 用同样 ID 都看不到
      expect(
        (await runWithUserAsync(USER_B, () => portraitVariantRepo.getByCharacterId(charA.id))).length,
      ).toBe(0)
      expect(
        (await runWithUserAsync(USER_B, () => portraitVariantRepo.getByProjectId(projA.id))).length,
      ).toBe(0)
      expect(
        await runWithUserAsync(USER_B, () => portraitVariantRepo.getFrontVariant(charA.id)),
      ).toBeNull()
    })

    it('createBatch 在事务里给所有 variant 都打上当前 user_id', async () => {
      const projA = await runWithUserAsync(USER_A, () =>
        portraitProjectRepo.create({ name: 'A 的项目' }),
      )
      const charA = await runWithUserAsync(USER_A, () =>
        portraitCharRepo.create({
          projectId: projA.id,
          name: 'A 的角色',
          gender: 'male' as any,
          age: 25,
          height: 180,
          weight: 70,
          race: 'asian' as any,
        }),
      )

      await runWithUserAsync(USER_A, () =>
        portraitVariantRepo.createBatch([
          {
            characterId: charA.id,
            type: 'base' as any,
            angle: 'front' as any,
            imagePath: 'f.png',
            prompt: 'f',
          },
          {
            characterId: charA.id,
            type: 'base' as any,
            angle: 'left' as any,
            imagePath: 'l.png',
            prompt: 'l',
          },
        ]),
      )

      const aVariants = await runWithUserAsync(USER_A, () =>
        portraitVariantRepo.getByCharacterId(charA.id),
      )
      expect(aVariants.length).toBe(2)

      const bVariants = await runWithUserAsync(USER_B, () =>
        portraitVariantRepo.getByCharacterId(charA.id),
      )
      expect(bVariants.length).toBe(0)
    })

    it('B 调 deleteByProjectId（A 的 projectId）不会删 A 的 variants', async () => {
      const projA = await runWithUserAsync(USER_A, () =>
        portraitProjectRepo.create({ name: 'A 的项目' }),
      )
      const charA = await runWithUserAsync(USER_A, () =>
        portraitCharRepo.create({
          projectId: projA.id,
          name: 'A 的角色',
          gender: 'male' as any,
          age: 25,
          height: 180,
          weight: 70,
          race: 'asian' as any,
        }),
      )
      await runWithUserAsync(USER_A, () =>
        portraitVariantRepo.create({
          characterId: charA.id,
          type: 'base' as any,
          angle: 'front' as any,
          imagePath: 'a.png',
          prompt: 'a',
        }),
      )

      // B 用 A 的 projectId 调 deleteByProjectId
      await runWithUserAsync(USER_B, () =>
        portraitVariantRepo.deleteByProjectId(projA.id),
      )

      const aStill = await runWithUserAsync(USER_A, () =>
        portraitVariantRepo.getByCharacterId(charA.id),
      )
      expect(aStill.length).toBe(1)
    })
  })
})
