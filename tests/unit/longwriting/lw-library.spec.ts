/**
 * 世界观库 + 角色 IP 库服务流单测（2026-09-24 P0）
 *
 * 用真实仓储 + 内存 SQLite 走通核心流：
 *   1. 建世界 → 修真模板播种 kinds/示范条目 → 条目 CRUD 且世界版本自增（血缘同步依据）；
 *   2. pinned 条目可被 library-context 序列化（写前注入的纯函数部分）；
 *   3. IP 角色建卡 → 导入实例化到项目（sourceType='library' + 血缘列 + 四层人设落列）；
 *   4. 删除语义：删库不级联项目（绑定行保留为悬空，world_name 快照兜底）。
 *
 * registerCoreDatabaseManager 注入测试管理器（services 经 getCoreDatabaseManager 取库）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { createLwLibraryTables } from '@core/database/migrations/create-lw-library-tables'
import { createUnifiedGraphTables } from '@core/database/migrations/create-unified-graph-tables'
import { registerCoreDatabaseManager } from '@core/database/database-manager.interface'
import { LwWorldRepository } from '@core/database/repositories/lw-world.repository'
import { LwWorldKindRepository } from '@core/database/repositories/lw-world-kind.repository'
import { LwWorldEntryRepository } from '@core/database/repositories/lw-world-entry.repository'
import { LwWorldEdgeRepository } from '@core/database/repositories/lw-world-edge.repository'
import { LwIpCharacterRepository } from '@core/database/repositories/lw-ip-character.repository'
import { LwIpEdgeRepository } from '@core/database/repositories/lw-ip-edge.repository'
import { LwWorldBindingRepository } from '@core/database/repositories/lw-world-binding.repository'
import { LwIpBindingRepository } from '@core/database/repositories/lw-ip-binding.repository'
import { LwProjectRepository } from '@core/database/repositories/lw-project.repository'
import { LwCharacterRepository } from '@core/database/repositories/lw-character.repository'
import { LwLocationRepository } from '@core/database/repositories/lw-location.repository'
import { LwCustomEntityRepository } from '@core/database/repositories/lw-custom-entity.repository'
import { WorldLibraryService } from '@core/platform/services/longwriting/library/world-library.service'
import { IpLibraryService } from '@core/platform/services/longwriting/library/ip-library.service'
import { LibraryBindingService } from '@core/platform/services/longwriting/library/binding.service'
import { serializeWorldEntry } from '@core/platform/services/longwriting/library/library-context'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

let ds: DataSource

beforeAll(async () => {
  ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: Object.values(entities),
    synchronize: false,
  })
  await ds.initialize()
  await createLwLibraryTables(ds)
  // IP/世界观边仓储已是统一图存储 facade——graph_edges 必须就绪
  await createUnifiedGraphTables(ds)
  // 项目/角色/地点等既有表（测试只需要最小列集——用 synchronize=false 手工建）
  await ds.query(`CREATE TABLE lw_projects (
    id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL, type TEXT DEFAULT 'story',
    stage TEXT, progress INTEGER DEFAULT 0, wizard_state TEXT, cover_path TEXT,
    created_at DATETIME, updated_at DATETIME
  )`)
  await ds.query(`CREATE TABLE lw_story_characters (
    id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, name TEXT NOT NULL,
    gender TEXT, age INTEGER, height INTEGER, weight INTEGER, race TEXT, occupation TEXT,
    position TEXT, appearance TEXT, background TEXT, personality TEXT, abilities TEXT,
    aliases TEXT, role_position TEXT, importance TEXT DEFAULT 'secondary', template_type TEXT,
    major_events TEXT, source_type TEXT DEFAULT 'longwriting', source_episode_id TEXT,
    created_at DATETIME, updated_at DATETIME
  )`)
  await ds.query(`CREATE TABLE lw_story_locations (
    id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, name TEXT NOT NULL,
    type TEXT, description TEXT, importance TEXT, entity_importance TEXT, template_type TEXT,
    map_id TEXT, source_type TEXT DEFAULT 'longwriting', source_episode_id TEXT,
    created_at DATETIME, updated_at DATETIME
  )`)
  await ds.query(`CREATE TABLE lw_project_factions (
    id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, faction_type TEXT,
    name TEXT NOT NULL, location_id TEXT, description TEXT, sort_order INTEGER DEFAULT 0,
    created_at DATETIME, updated_at DATETIME
  )`)
  await ds.query(`CREATE TABLE lw_story_skills (
    id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, name TEXT NOT NULL,
    type TEXT, level TEXT, description TEXT, system TEXT, character_ids TEXT,
    created_at DATETIME, updated_at DATETIME
  )`)
  await ds.query(`CREATE TABLE lw_story_items (
    id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, name TEXT NOT NULL,
    type TEXT, level TEXT, description TEXT, owner_id TEXT, importance TEXT DEFAULT 'secondary',
    template_type TEXT, source_type TEXT DEFAULT 'longwriting', source_episode_id TEXT,
    created_at DATETIME, updated_at DATETIME
  )`)
  await ds.query(`CREATE TABLE lw_custom_entities (
    id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, kind_key TEXT NOT NULL,
    name TEXT NOT NULL, fields TEXT, parent_id TEXT, origin TEXT,
    created_at DATETIME, updated_at DATETIME
  )`)
  // 血缘列
  for (const t of ['lw_story_characters', 'lw_story_locations', 'lw_project_factions', 'lw_story_skills', 'lw_story_items', 'lw_custom_entities']) {
    for (const c of ['library_world_id', 'library_entry_id', 'library_version']) {
      await ds.query(`ALTER TABLE ${t} ADD COLUMN ${c} ${c === 'library_version' ? 'INTEGER' : 'TEXT'}`)
    }
  }
  for (const c of ['library_ip_id', 'motivation', 'flaw', 'character_arc']) {
    await ds.query(`ALTER TABLE lw_story_characters ADD COLUMN ${c} TEXT`)
  }

  const manager: ICoreDatabaseManager = {
    dataSource: ds,
    lwProjects: new LwProjectRepository(ds),
    lwCharacters: new LwCharacterRepository(ds),
    lwLocations: new LwLocationRepository(ds),
    lwFactions: null,
    lwSkills: null,
    lwItems: null,
    lwCustomEntities: new LwCustomEntityRepository(ds),
    lwWorlds: new LwWorldRepository(ds),
    lwWorldKinds: new LwWorldKindRepository(ds),
    lwWorldEntries: new LwWorldEntryRepository(ds),
    lwWorldEdges: new LwWorldEdgeRepository(ds),
    lwIpCharacters: new LwIpCharacterRepository(ds),
    lwIpEdges: new LwIpEdgeRepository(ds),
    lwWorldBindings: new LwWorldBindingRepository(ds),
    lwIpBindings: new LwIpBindingRepository(ds),
  } as unknown as ICoreDatabaseManager
  registerCoreDatabaseManager(() => manager)
})

afterAll(async () => {
  await ds?.destroy()
})

describe('世界观库服务', () => {
  it('建世界 + 修真模板播种：kinds 与示范条目就位，力量体系 pinned', async () => {
    const svc = new WorldLibraryService()
    const world = await svc.createWorld({
      name: '雪麓修真界',
      genre: 'xiuzhen',
      tagline: '测试世界',
      fromTemplate: 'xiuzhen',
    })
    const detail = await svc.getWorld(world.id)
    expect(detail).not.toBeNull()
    expect(detail!.kinds.length).toBeGreaterThanOrEqual(15)
    expect(detail!.entries.length).toBeGreaterThanOrEqual(9)
    const pinned = detail!.entries.filter(e => e.pinned)
    expect(pinned.some(e => e.name === '修真体系')).toBe(true)
    expect(pinned.some(e => e.name === '灵根体系')).toBe(true)
  })

  it('条目 CRUD 使世界版本自增（血缘同步依据）', async () => {
    const svc = new WorldLibraryService()
    const world = await svc.createWorld({ name: '版本世界', genre: 'custom' })
    const before = (await svc.getWorld(world.id))!.version
    const entry = await svc.createEntry({
      worldId: world.id,
      kindKey: 'sect',
      name: '青云门',
      aliases: ['青门'],
      summary: '测试门派',
    })
    const afterCreate = (await svc.getWorld(world.id))!.version
    expect(afterCreate).toBeGreaterThan(before)
    await svc.updateEntry(entry.id, { summary: '改过的门派' })
    expect((await svc.getWorld(world.id))!.version).toBeGreaterThan(afterCreate)
  })

  it('bumpVersion 两次 → version 精确 +2 且刷新 updatedAt（review M15：原子自增语义）', async () => {
    const worldRepo = new LwWorldRepository(ds)
    const created = await worldRepo.create({ id: 'wld_bump', name: '版本自增世界', genre: 'custom' })
    expect(created.version).toBe(1)

    await worldRepo.bumpVersion(created.id)
    await worldRepo.bumpVersion(created.id)

    const after = await worldRepo.getById(created.id)
    // 读-改-存实现在并发下会丢自增；单条 UPDATE version = version + 1 语义下
    // 串行两次必为 3
    expect(after!.version).toBe(3)
    expect(after!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt)

    // 不存在的 id：静默 no-op（与旧实现 findOne 未命中返回一致）
    await expect(worldRepo.bumpVersion('no-such-world')).resolves.toBeUndefined()
  })

  it('serializeWorldEntry 产出紧凑 prompt 行（名称/别名/品阶/摘要/字段）', () => {
    const line = serializeWorldEntry({
      id: 'we_x', worldId: 'wld_x', kindKey: 'pill', name: '筑基丹',
      aliases: ['破境丹'], summary: '助结丹修士破境',
      fields: { rank: '上品', effect: '突破成功率提升' },
      parentId: null, sortOrder: 0, rankValue: null, pinned: true,
      origin: null, createdAt: 0, updatedAt: 0,
    })
    expect(line).toContain('筑基丹')
    expect(line).toContain('破境丹')
    expect(line).toContain('[上品]')
    expect(line).toContain('助结丹修士破境')
    expect(line).toContain('effect=突破成功率提升')
  })
})

describe('角色 IP 库与导入实例化', () => {
  it('IP 建卡 → 导入项目：项目行 sourceType=library、血缘与四层人设落列、绑定回填', async () => {
    const worldSvc = new WorldLibraryService()
    const ipSvc = new IpLibraryService()
    const bindSvc = new LibraryBindingService()

    const world = await worldSvc.createWorld({ name: '导入世界', genre: 'xiuzhen' })
    const ip = await ipSvc.createCharacter({
      name: '林晓',
      aliases: ['晓哥'],
      worldId: world.id,
      gender: 'male',
      occupation: '散修',
      motivation: '逆天改命求长生',
      flaw: '重情重义易被拿捏',
      background: '山村孤儿',
      talents: '四属性伪灵根',
      characterArc: '从独行到守护',
    })

    // 建项目（直接走仓储：服务外的最小夹具）
    const projectId = `proj_${Date.now()}`
    await ds.query(
      `INSERT INTO lw_projects (id, name, type, created_at, updated_at) VALUES ('${projectId}', '测试项目', 'story', datetime('now'), datetime('now'))`,
    )

    const { ipBinding, projectCharacterId } = await bindSvc.importIpCharacter({
      projectId,
      ipCharacterId: ip.id,
      rolePosition: 'protagonist',
    })
    expect(ipBinding.projectCharacterId).toBe(projectCharacterId)

    const charRepo = new LwCharacterRepository(ds)
    const imported = await charRepo.getById(projectCharacterId)
    expect(imported).not.toBeNull()
    expect(imported!.sourceType).toBe('library')
    expect(imported!.libraryIpId).toBe(ip.id)
    expect(imported!.libraryWorldId).toBe(world.id)
    expect(imported!.motivation).toBe('逆天改命求长生')
    expect(imported!.flaw).toBe('重情重义易被拿捏')
    expect(imported!.characterArc).toBe('从独行到守护')
    expect(imported!.rolePosition).toBe('protagonist')
    expect(imported!.aliases).toContain('晓哥')

    // 重复导入幂等：返回同一项目角色
    const again = await bindSvc.importIpCharacter({ projectId, ipCharacterId: ip.id })
    expect(again.projectCharacterId).toBe(projectCharacterId)
  })

  it('世界条目导入映射：region→location、体系类→custom_entities', async () => {
    const worldSvc = new WorldLibraryService()
    const bindSvc = new LibraryBindingService()
    const world = await worldSvc.createWorld({ name: '导入世界2', genre: 'xiuzhen' })
    const region = await worldSvc.createEntry({ worldId: world.id, kindKey: 'region', name: '青牛镇' })
    const realm = await worldSvc.createEntry({ worldId: world.id, kindKey: 'realm', name: '金丹' })

    const projectId = `proj_${Date.now()}_b`
    await ds.query(
      `INSERT INTO lw_projects (id, name, type, created_at, updated_at) VALUES ('${projectId}', '导入项目B', 'story', datetime('now'), datetime('now'))`,
    )

    const locResult = await bindSvc.importWorldEntry(projectId, region.id)
    expect(locResult.ok).toBe(true)
    expect(locResult.target).toBe('location')
    const loc = await new LwLocationRepository(ds).getById(locResult.projectEntityId!)
    expect(loc!.name).toBe('青牛镇')
    expect((loc as any).libraryEntryId).toBe(region.id)

    const customResult = await bindSvc.importWorldEntry(projectId, realm.id)
    expect(customResult.target).toBe('custom')
    const customRepo = new LwCustomEntityRepository(ds)
    const custom = await customRepo.getByProjectAndKind(projectId, 'realm')
    expect(custom.length).toBe(1)
    expect(custom[0].name).toBe('金丹')
  })

  it('删除语义：删库不级联项目——绑定悬空保留，world_name 快照兜底', async () => {
    const worldSvc = new WorldLibraryService()
    const bindSvc = new LibraryBindingService()
    const world = await worldSvc.createWorld({ name: '将删世界', genre: 'custom', tagline: 't' })
    const projectId = `proj_${Date.now()}_c`
    await ds.query(
      `INSERT INTO lw_projects (id, name, type, created_at, updated_at) VALUES ('${projectId}', '导入项目C', 'story', datetime('now'), datetime('now'))`,
    )
    await bindSvc.bindWorld({ projectId, worldId: world.id })
    expect((await bindSvc.listWorldBindings(projectId)).length).toBe(1)

    await worldSvc.deleteWorld(world.id)
    const bindings = await bindSvc.listWorldBindings(projectId)
    expect(bindings.length).toBe(1)
    expect(bindings[0].worldName).toBe('将删世界')
    // 活引用注入对悬空绑定安全：不抛错、按无库处理
    const { buildWorldLibraryContext } = await import('@core/platform/services/longwriting/library/library-context')
    await expect(buildWorldLibraryContext(projectId)).resolves.toBe('')
  })
})
