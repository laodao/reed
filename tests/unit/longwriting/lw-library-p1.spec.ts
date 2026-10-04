/**
 * 设定资产库 P1 单测（2026-09-25）
 *
 * 覆盖：AI 输出 JSON 提取（纯函数）、2c 触发式命中器（纯函数）、
 * 反向沉淀（项目角色→IP / 项目实体→世界条目）、同步 diff（preview/apply）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { createLwLibraryTables } from '@core/database/migrations/create-lw-library-tables'
import { registerCoreDatabaseManager } from '@core/database/database-manager.interface'
import {
  extractJsonArray,
  extractJsonObject,
} from '@core/platform/services/longwriting/library/library-ai.service'
import { matchEntriesInText } from '@core/platform/services/longwriting/library/library-context'
import { LibrarySyncService } from '@core/platform/services/longwriting/library/library-sync.service'
import { WorldLibraryService } from '@core/platform/services/longwriting/library/world-library.service'
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
  for (const t of ['lw_story_characters', 'lw_story_locations', 'lw_project_factions', 'lw_story_skills', 'lw_story_items', 'lw_custom_entities']) {
    for (const c of ['library_world_id', 'library_entry_id', 'library_version']) {
      await ds.query(`ALTER TABLE ${t} ADD COLUMN ${c} ${c === 'library_version' ? 'INTEGER' : 'TEXT'}`)
    }
  }
  for (const c of ['library_ip_id', 'motivation', 'flaw', 'character_arc']) {
    await ds.query(`ALTER TABLE lw_story_characters ADD COLUMN ${c} TEXT`)
  }

  const manager = {
    dataSource: ds,
    providerConfigs: null,
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

describe('AI 输出 JSON 提取（纯函数）', () => {
  it('裸数组 / markdown 包裹 / 前后杂文三种形态都能提取', () => {
    const bare = extractJsonArray('[{"name":"青云门"}]')
    expect(bare).toEqual([{ name: '青云门' }])
    const fenced = extractJsonArray('好的，如下：\n```json\n[{"name":"A"},{"name":"B"}]\n```\n以上。')
    expect(fenced?.length).toBe(2)
    const noisy = extractJsonArray('以下是设定：[{"name":"C","fields":{"rank":"上品"}}] 希望有帮助')
    expect(noisy?.[0]).toEqual({ name: 'C', fields: { rank: '上品' } })
    expect(extractJsonArray('完全没有 JSON')).toBeNull()
  })

  it('单对象提取（IP 卡）', () => {
    const obj = extractJsonObject('```json\n{"name":"林晓","motivation":"长生"}\n```')
    expect(obj?.name).toBe('林晓')
    expect(extractJsonObject('[1,2]')).toBeNull()
  })
})

describe('交互式创建·步骤校验（纯函数）', () => {
  it('step1 缺姓名报错；tags 规整为数组；字符串裁边', async () => {
    const { IP_WIZARD_STEPS, validateIpStepData } = await import('@shared/types/lw-library.types')
    const step1 = IP_WIZARD_STEPS.find(s => s.step === 1)!
    const bad = validateIpStepData(step1, { aliases: ['外号'] })
    expect(bad.ok).toBe(false)
    const good = validateIpStepData(step1, { name: ' 林晓 ', aliases: ['晓哥', ' ', 3], gender: 'male', age: '17', occupation: '散修', appearance: '普通' })
    expect(good.ok).toBe(true)
    expect(good.data.name).toBe('林晓')
    expect(good.data.aliases).toEqual(['晓哥', '3'])
    // 四步定义完整且字段 key 无重复
    expect(IP_WIZARD_STEPS).toHaveLength(4)
    for (const st of IP_WIZARD_STEPS) {
      const keys = st.fields.map(f => f.key)
      expect(new Set(keys).size).toBe(keys.length)
      expect(st.fields.every(f => f.hint.length > 0)).toBe(true)
    }
  })
})

describe('2c 触发式命中器（纯函数）', () => {
  const entries = [
    { id: '1', name: '青云门', aliases: ['青门'], summary: '', aliases2: undefined },
    { id: '2', name: '筑基丹', aliases: ['破境丹'], summary: '' },
    { id: '3', name: '天劫', aliases: [], summary: '' },
  ] as any

  it('名称与别名都命中；短名（<2字）不参与；封顶生效', () => {
    const hits = matchEntriesInText(entries, '他吞下破境丹，赶回青门。')
    expect(hits.map(h => h.id).sort()).toEqual(['1', '2'])
    expect(matchEntriesInText(entries, '普通的一天').length).toBe(0)
    const pool = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `条目${i}甲`, aliases: [] }))
    const scan = pool.slice(0, 12).map(e => e.name).join('，')  // 文本含前 12 个条目名
    const many = matchEntriesInText(pool, scan, 8)
    expect(many.length).toBe(8)  // 命中 12 > 封顶 8
  })
})

describe('反向沉淀', () => {
  it('项目角色 → IP 库：四层人设随行，origin=promoted；库源角色拒绝重复沉淀', async () => {
    const projectId = `proj_p1_${Date.now()}`
    await ds.query(
      `INSERT INTO lw_projects (id, name, type, created_at, updated_at) VALUES ('${projectId}', '沉淀项目', 'story', datetime('now'), datetime('now'))`,
    )
    const charRepo = new LwCharacterRepository(ds)
    const char = await charRepo.create({
      projectId,
      name: '韩立',
      aliases: ['韩师弟'],
      appearance: '相貌普通',
      background: '山村出身，性情坚韧',
      personality: '谨慎',
      abilities: '自带小瓶',
      rolePosition: 'protagonist',
    } as any)
    await charRepo.applyLibraryLineage(char.id, {
      motivation: '逆天改命',
      flaw: '过于谨慎',
      characterArc: '从苟到担当',
    })

    const svc = new LibrarySyncService()
    const result = await svc.promoteCharacterToIp(projectId, char.id)
    expect(result.ok).toBe(true)
    const ipRepo = new LwIpCharacterRepository(ds)
    const ip = await ipRepo.getById(result.ipCharacter!.id)
    expect(ip!.name).toBe('韩立')
    expect(ip!.motivation).toBe('逆天改命')
    expect(ip!.flaw).toBe('过于谨慎')
    expect(ip!.characterArc).toBe('从苟到担当')
    expect(ip!.origin?.type).toBe('promoted')

    // 已带 IP 血源的角色（模拟导入行）拒绝
    await charRepo.applyLibraryLineage(char.id, { libraryIpId: 'ipc_x' })
    const again = await svc.promoteCharacterToIp(projectId, char.id)
    expect(again.ok).toBe(false)
  })

  it('项目地点 → 世界条目：kind 映射 region；已导入行拒绝；世界版本自增', async () => {
    const worldSvc = new WorldLibraryService()
    const world = await worldSvc.createWorld({ name: '沉淀世界', genre: 'xiuzhen' })
    const versionBefore = (await worldSvc.getWorld(world.id))!.version
    const projectId = `proj_p1b_${Date.now()}`
    await ds.query(
      `INSERT INTO lw_projects (id, name, type, created_at, updated_at) VALUES ('${projectId}', 'P1B', 'story', datetime('now'), datetime('now'))`,
    )
    const locRepo = new LwLocationRepository(ds)
    const loc = await locRepo.create({ projectId, name: '落云谷', type: 'other', importance: 'main', description: '云雾缭绕的山谷' })

    const svc = new LibrarySyncService()
    const result = await svc.promoteEntityToLibrary(world.id, 'location', loc.id)
    expect(result.ok).toBe(true)
    const entry = await new LwWorldEntryRepository(ds).getById(result.entryId!)
    expect(entry!.kindKey).toBe('region')
    expect(entry!.summary).toBe('云雾缭绕的山谷')
    expect(entry!.origin?.type).toBe('promoted')
    expect((await worldSvc.getWorld(world.id))!.version).toBeGreaterThan(versionBefore)

    // 原生项目实体可重复沉淀为不同世界（不拒绝）——但已导入行拒绝
    await locRepo.applyLibraryLineage(loc.id, { libraryEntryId: entry.id, libraryWorldId: world.id, libraryVersion: 1 })
    const again = await svc.promoteEntityToLibrary(world.id, 'location', loc.id)
    expect(again.ok).toBe(false)
  })
})

describe('世界包导出/导入（P2）', () => {
  it('导出→导入回路：条目/常驻标记/关系边按名称重建；同名世界自动加后缀', async () => {
    const worldSvc = new WorldLibraryService()
    const world = await worldSvc.createWorld({ name: '回路世界', genre: 'xiuzhen', fromTemplate: 'xiuzhen' })
    // 追加两个条目 + 一条边
    const sect1 = await worldSvc.createEntry({ worldId: world.id, kindKey: 'sect', name: '青云门', summary: '正道领袖', pinned: true })
    const region1 = await worldSvc.createEntry({ worldId: world.id, kindKey: 'region', name: '青云山', summary: '青云门驻地' })
    await worldSvc.createEdge({ worldId: world.id, sourceId: sect1.id, targetId: region1.id, relationType: '驻于' })

    const pkg = await worldSvc.exportWorld(world.id)
    expect(pkg).not.toBeNull()
    expect((pkg as any).format).toBe('lw-world-package')
    expect((pkg as any).world.name).toBe('回路世界')
    expect((pkg as any).kinds.length).toBeGreaterThanOrEqual(15)
    const names = (pkg as any).entries.map((e: any) => e.name)
    expect(names).toContain('青云门')
    expect(names).toContain('修真体系')

    // 导入（同名 → 自动后缀）
    const imported = await worldSvc.importWorld(pkg as never)
    expect(imported.name).toMatch(/^回路世界（导入）$/)
    const detail = await worldSvc.getWorld(imported.id)
    expect(detail!.entries.length).toBe((pkg as any).entries.length)
    const importedSect = detail!.entries.find(e => e.name === '青云门')!
    expect(importedSect.pinned).toBe(true)
    // 关系边按名称重建
    expect(detail!.edges.length).toBeGreaterThanOrEqual(1)
    expect(detail!.edges.some(e => e.relationType === '驻于')).toBe(true)
  })

  it('导入缺 world.name 报错', async () => {
    const worldSvc = new WorldLibraryService()
    await expect(worldSvc.importWorld({ format: 'lw-world-package' } as never)).rejects.toThrow('格式')
  })
})

describe('同步 diff（库→项目单向）', () => {
  it('preview 检出名称/描述 diff；apply 覆写并刷新血缘版本', async () => {
    const worldSvc = new WorldLibraryService()
    const world = await worldSvc.createWorld({ name: '同步世界', genre: 'xiuzhen' })
    const region = await worldSvc.createEntry({ worldId: world.id, kindKey: 'region', name: '黄枫谷', summary: '越国七大派之一' })
    const projectId = `proj_sync_${Date.now()}`
    await ds.query(
      `INSERT INTO lw_projects (id, name, type, created_at, updated_at) VALUES ('${projectId}', '同步项目', 'story', datetime('now'), datetime('now'))`,
    )
    const locRepo = new LwLocationRepository(ds)
    const loc = await locRepo.create({ projectId, name: '黄枫谷（旧名）', type: 'other', importance: 'main', description: '旧描述' })
    await locRepo.applyLibraryLineage(loc.id, { libraryEntryId: region.id, libraryWorldId: world.id, libraryVersion: 1 })

    const svc = new LibrarySyncService()
    const preview = await svc.previewSync(projectId)
    const mine = preview.find(p => p.projectEntityId === loc.id)
    expect(mine).toBeDefined()
    expect(mine!.orphaned).toBe(false)
    expect(mine!.changed).toBe(true)
    expect(mine!.diffs.map(d => d.field).sort()).toEqual(['description', 'name'])

    const applied = await svc.applySync(projectId, [{ entityType: 'location', projectEntityId: loc.id }])
    expect(applied.applied).toBe(1)
    const after = await locRepo.getById(loc.id)
    expect(after!.name).toBe('黄枫谷')
    expect(after!.description).toBe('越国七大派之一')
    expect((after as any).libraryVersion).toBeGreaterThanOrEqual(1)

    // 同步后无 diff
    const preview2 = await svc.previewSync(projectId)
    expect(preview2.find(p => p.projectEntityId === loc.id)!.changed).toBe(false)
  })

  it('悬空血缘（库条目已删）标记 orphaned 而不报错', async () => {
    const projectId = `proj_sync2_${Date.now()}`
    await ds.query(
      `INSERT INTO lw_projects (id, name, type, created_at, updated_at) VALUES ('${projectId}', 'S2', 'story', datetime('now'), datetime('now'))`,
    )
    const locRepo = new LwLocationRepository(ds)
    const loc = await locRepo.create({ projectId, name: '孤儿地点', type: 'other', importance: 'main', description: '' })
    await locRepo.applyLibraryLineage(loc.id, { libraryEntryId: 'we_deleted', libraryWorldId: 'wld_deleted', libraryVersion: 3 })
    const preview = await new LibrarySyncService().previewSync(projectId)
    const mine = preview.find(p => p.projectEntityId === loc.id)
    expect(mine!.orphaned).toBe(true)
  })
})
