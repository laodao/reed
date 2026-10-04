/**
 * 项目 → 库 反向沉淀 + 库→项目同步 diff（P1，2026-09-25，设计 §3.1 决策三 / §6）
 * @module platform/services/longwriting/library/library-sync.service
 *
 * 沉淀：故事中长出来的好设定一键入库，origin.type='promoted' 带项目溯源；
 * 已带血缘的行不再重复入库（它本来就是库条目的实例）。
 * 同步：单向 库→项目（项目侧改动永不上传，设计 §7 风险 1）；
 * preview 产出逐条 diff，apply 只覆写 name/摘要级字段并刷新血缘版本。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpCharacter } from '@shared/types/lw-library.types'

export interface SyncDiffItem {
  entityType: 'location' | 'faction' | 'skill' | 'item' | 'custom'
  projectEntityId: string
  projectName: string
  entryId: string | null
  entryName: string
  kindKey: string
  worldId: string
  worldName: string
  importedVersion: number | null
  currentVersion: number | null
  /** true=血缘指向的库条目已不存在（悬空） */
  orphaned: boolean
  changed: boolean
  diffs: Array<{ field: string; from: string; to: string }>
}

/** 项目实体类型 → 默认库 kind（沉淀映射，与导入映射互逆） */
const PROMOTE_KIND_BY_TYPE: Record<string, string> = {
  location: 'region',
  faction: 'sect',
  skill: 'art',
  item: 'weapon',
}

export class LibrarySyncService {
  private db() {
    return getCoreDatabaseManager()
  }

  private safeParse(v: string | null): Record<string, unknown> | null {
    if (!v) return null
    try {
      const parsed = JSON.parse(v)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  // ==================== 反向沉淀 ====================

  /** 项目角色 → IP 库（四层人设列随行；已带 IP 血源的行拒绝重复沉淀） */
  async promoteCharacterToIp(projectId: string, characterId: string): Promise<{ ok: boolean; ipCharacter: IpCharacter | null; message: string }> {
    const db = this.db()
    const char = await db.lwCharacters?.getById(characterId)
    if (!char) return { ok: false, ipCharacter: null, message: '项目角色不存在' }
    if ((char as any).libraryIpId) {
      return { ok: false, ipCharacter: null, message: '该角色来自 IP 库，无需重复沉淀' }
    }
    const ip = await db.lwIpCharacters!.create({
      name: char.name,
      aliases: (char as any).aliases ?? [],
      worldId: (char as any).libraryWorldId ?? null,
      gender: char.gender ?? null,
      age: char.age != null ? String(char.age) : null,
      race: (char.race as string) ?? null,
      occupation: char.occupation ?? null,
      appearance: char.appearance || null,
      personality: char.personality || null,
      motivation: (char as any).motivation || null,
      flaw: (char as any).flaw || null,
      background: char.background || null,
      abilities: char.abilities || null,
      characterArc: (char as any).characterArc || null,
    })
    await db.lwIpCharacters!.markOrigin(ip.id, { type: 'promoted', projectId, projectCharacterId: characterId })
    return { ok: true, ipCharacter: ip, message: `已沉淀为 IP 角色「${ip.name}」` }
  }

  /** 项目实体 → 世界观条目（kind 缺省按类型映射；custom 建议显式传 kindKey） */
  async promoteEntityToLibrary(
    worldId: string,
    entityType: 'location' | 'faction' | 'skill' | 'item' | 'custom',
    entityId: string,
    kindKey?: string,
  ): Promise<{ ok: boolean; entryId: string | null; message: string }> {
    const db = this.db()
    const world = await db.lwWorlds!.getById(worldId)
    if (!world) return { ok: false, entryId: null, message: '目标世界观不存在' }

    let name = ''
    let summary = ''
    let aliases: string[] = []
    let fields: Record<string, unknown> | null = null
    let resolvedKind = kindKey ?? PROMOTE_KIND_BY_TYPE[entityType] ?? ''

    if (entityType === 'location') {
      const row = await db.lwLocations!.getById(entityId)
      if (!row) return { ok: false, entryId: null, message: '项目地点不存在' }
      if ((row as any).libraryEntryId) return { ok: false, entryId: null, message: '该地点来自库条目，无需重复沉淀' }
      name = row.name
      summary = row.description || ''
    } else if (entityType === 'faction') {
      const row = await db.lwFactions!.getById(entityId)
      if (!row) return { ok: false, entryId: null, message: '项目势力不存在' }
      if ((row as any).libraryEntryId) return { ok: false, entryId: null, message: '该势力来自库条目，无需重复沉淀' }
      name = row.name
      summary = row.description || ''
    } else if (entityType === 'skill') {
      const row = await db.lwSkills!.getById(entityId)
      if (!row) return { ok: false, entryId: null, message: '项目技能不存在' }
      if ((row as any).libraryEntryId) return { ok: false, entryId: null, message: '该技能来自库条目，无需重复沉淀' }
      name = row.name
      summary = row.description || ''
      if (row.level) fields = { rank: row.level }
    } else if (entityType === 'item') {
      const row = await db.lwItems!.getById(entityId)
      if (!row) return { ok: false, entryId: null, message: '项目物品不存在' }
      if ((row as any).libraryEntryId) return { ok: false, entryId: null, message: '该物品来自库条目，无需重复沉淀' }
      name = row.name
      summary = row.description || ''
      if (row.level) fields = { rank: row.level }
    } else {
      const row = await db.lwCustomEntities!.getById(entityId)
      if (!row) return { ok: false, entryId: null, message: '项目自定义设定不存在' }
      const origin = row.origin
      if (origin?.libraryEntryId) return { ok: false, entryId: null, message: '该设定来自库条目，无需重复沉淀' }
      name = row.name
      const parsedFields = row.fields
      if (parsedFields) {
        const { summary: s, __aliases, ...rest } = parsedFields
        summary = typeof s === 'string' ? s : ''
        aliases = Array.isArray(__aliases) ? __aliases.map(String) : []
        fields = Object.keys(rest).length > 0 ? rest : null
      }
      if (!resolvedKind) resolvedKind = row.kindKey || 'rule'
    }

    if (!resolvedKind) resolvedKind = 'rule'
    const entry = await db.lwWorldEntries!.create({
      worldId,
      kindKey: resolvedKind,
      name,
      aliases,
      summary,
      fields,
    })
    await db.lwWorldEntries!.updateOrigin(entry.id, { type: 'promoted', projectEntityType: entityType, projectEntityId: entityId })
    await db.lwWorlds!.bumpVersion(worldId)
    return { ok: true, entryId: entry.id, message: `已沉淀为世界观条目「${name}」` }
  }

  // ==================== 库→项目 同步 diff ====================

  /** 扫描项目内全部带血缘的行，与库当前值比对产出 diff 清单（含悬空标记） */
  async previewSync(projectId: string): Promise<SyncDiffItem[]> {
    const db = this.db()
    const items: SyncDiffItem[] = []
    const entryCache = new Map<string, { entry: any; worldName: string } | null>()

    const resolveEntry = async (entryId: string): Promise<{ entry: any; worldName: string } | null> => {
      if (entryCache.has(entryId)) return entryCache.get(entryId)!
      const entry = await db.lwWorldEntries!.getById(entryId)
      if (!entry) {
        entryCache.set(entryId, null)
        return null
      }
      const world = await db.lwWorlds!.getById(entry.worldId)
      const value = { entry, worldName: world?.name ?? '' }
      entryCache.set(entryId, value)
      return value
    }

    const check = async (
      entityType: SyncDiffItem['entityType'],
      rows: Array<Record<string, any>>,
      fieldGetters: Array<{ field: string; from: (row: any) => string; to: (entry: any) => string }>,
      entryIdOf: (row: any) => string | null,
      versionOf: (row: any) => number | null,
    ) => {
      for (const row of rows) {
        const entryId = entryIdOf(row)
        if (!entryId) continue
        const resolved = await resolveEntry(entryId)
        const importedVersion = versionOf(row)
        if (!resolved) {
          items.push({
            entityType,
            projectEntityId: row.id,
            projectName: row.name ?? '',
            entryId,
            entryName: '',
            kindKey: '',
            worldId: '',
            worldName: '',
            importedVersion,
            currentVersion: null,
            orphaned: true,
            changed: false,
            diffs: [],
          })
          continue
        }
        const { entry, worldName } = resolved
        const diffs: SyncDiffItem['diffs'] = []
        for (const g of fieldGetters) {
          const a = (g.from(row) ?? '').trim()
          const b = (g.to(entry) ?? '').trim()
          if (a !== b) diffs.push({ field: g.field, from: g.from(row) ?? '', to: g.to(entry) ?? '' })
        }
        items.push({
          entityType,
          projectEntityId: row.id,
          projectName: row.name ?? '',
          entryId,
          entryName: entry.name,
          kindKey: entry.kindKey,
          worldId: entry.worldId,
          worldName,
          importedVersion,
          currentVersion: (await db.lwWorlds!.getById(entry.worldId))?.version ?? 1,
          orphaned: false,
          changed: diffs.length > 0,
          diffs,
        })
      }
    }

    const nameDescLevel = [
      { field: 'name', from: (r: any) => r.name ?? '', to: (e: any) => e.name ?? '' },
      { field: 'description', from: (r: any) => r.description ?? '', to: (e: any) => e.summary ?? '' },
    ]

    if (db.lwLocations) {
      await check(
        'location',
        (await db.lwLocations.getByProjectId(projectId)) as any[],
        nameDescLevel,
        r => r.libraryEntryId ?? null,
        r => r.libraryVersion ?? null,
      )
    }
    if (db.lwFactions) {
      await check(
        'faction',
        (await db.lwFactions.getByProjectId(projectId)) as any[],
        nameDescLevel,
        r => r.libraryEntryId ?? null,
        r => r.libraryVersion ?? null,
      )
    }
    if (db.lwSkills) {
      await check(
        'skill',
        (await db.lwSkills.getByProjectId(projectId)) as any[],
        [...nameDescLevel, { field: 'level', from: (r: any) => r.level ?? '', to: (e: any) => String(e.fields?.rank ?? '') }],
        r => r.libraryEntryId ?? null,
        r => r.libraryVersion ?? null,
      )
    }
    if (db.lwItems) {
      await check(
        'item',
        (await db.lwItems.getByProjectId(projectId)) as any[],
        [...nameDescLevel, { field: 'level', from: (r: any) => r.level ?? '', to: (e: any) => String(e.fields?.rank ?? '') }],
        r => r.libraryEntryId ?? null,
        r => r.libraryVersion ?? null,
      )
    }
    await check(
      'custom',
      (await db.lwCustomEntities!.getByProjectId(projectId)) as any[],
      [
        { field: 'name', from: (r: any) => r.name ?? '', to: (e: any) => e.name ?? '' },
        {
          field: 'summary',
          from: (r: any) => {
            const f = this.safeParse(r.fields)
            return (f?.summary as string) ?? ''
          },
          to: (e: any) => e.summary ?? '',
        },
      ],
      r => (r.origin?.libraryEntryId as string) ?? null,
      r => (r.origin?.libraryVersion as number) ?? null,
    )

    return items
  }

  /** 对勾选的行执行同步：库值覆写 name/摘要级字段 + 刷新血缘版本（单向，项目侧其余字段保留） */
  async applySync(projectId: string, targets: Array<{ entityType: SyncDiffItem['entityType']; projectEntityId: string }>): Promise<{ applied: number }> {
    const db = this.db()
    void projectId
    let applied = 0
    for (const t of targets) {
      if (t.entityType === 'location') {
        const row = await db.lwLocations!.getById(t.projectEntityId)
        const entryId = (row as any)?.libraryEntryId
        if (!row || !entryId) continue
        const entry = await db.lwWorldEntries!.getById(entryId)
        if (!entry) continue
        await db.lwLocations!.update(row.id, { name: entry.name, description: entry.summary } as any)
        await db.lwLocations!.applyLibraryLineage(row.id, await this.currentLineage(entry))
        applied++
      } else if (t.entityType === 'faction') {
        const row = await db.lwFactions!.getById(t.projectEntityId)
        const entryId = (row as any)?.libraryEntryId
        if (!row || !entryId) continue
        const entry = await db.lwWorldEntries!.getById(entryId)
        if (!entry) continue
        await db.lwFactions!.update(row.id, { name: entry.name, description: entry.summary } as any)
        await db.lwFactions!.applyLibraryLineage(row.id, await this.currentLineage(entry))
        applied++
      } else if (t.entityType === 'skill') {
        const row = await db.lwSkills!.getById(t.projectEntityId)
        const entryId = (row as any)?.libraryEntryId
        if (!row || !entryId) continue
        const entry = await db.lwWorldEntries!.getById(entryId)
        if (!entry) continue
        await db.lwSkills!.update(row.id, {
          name: entry.name,
          description: entry.summary,
          level: (entry.fields as any)?.rank ?? (row as any).level,
        } as any)
        await db.lwSkills!.applyLibraryLineage(row.id, await this.currentLineage(entry))
        applied++
      } else if (t.entityType === 'item') {
        const row = await db.lwItems!.getById(t.projectEntityId)
        const entryId = (row as any)?.libraryEntryId
        if (!row || !entryId) continue
        const entry = await db.lwWorldEntries!.getById(entryId)
        if (!entry) continue
        await db.lwItems!.update(row.id, {
          name: entry.name,
          description: entry.summary,
          level: (entry.fields as any)?.rank ?? (row as any).level,
        } as any)
        await db.lwItems!.applyLibraryLineage(row.id, await this.currentLineage(entry))
        applied++
      } else {
        const row = await db.lwCustomEntities!.getById(t.projectEntityId)
        if (!row) continue
        const origin = row.origin
        const entryId = (origin?.libraryEntryId as string) ?? null
        if (!entryId) continue
        const entry = await db.lwWorldEntries!.getById(entryId)
        if (!entry) continue
        const fields = row.fields ?? {}
        await db.lwCustomEntities!.updateRow(row.id, {
          name: entry.name,
          fields: { ...fields, summary: entry.summary },
        })
        const newOrigin = {
          ...(origin ?? {}),
          type: 'extract',
          libraryEntryId: entry.id,
          libraryWorldId: entry.worldId,
          libraryVersion: (await this.currentLineage(entry)).libraryVersion,
        }
        await db.dataSource!.query(`UPDATE lw_custom_entities SET origin = ? WHERE id = ?`, [JSON.stringify(newOrigin), row.id])
        applied++
      }
    }
    return { applied }
  }

  private async currentLineage(entry: { id: string; worldId: string }): Promise<{ libraryWorldId: string; libraryEntryId: string; libraryVersion: number }> {
    const world = await this.db().lwWorlds!.getById(entry.worldId)
    return {
      libraryWorldId: entry.worldId,
      libraryEntryId: entry.id,
      libraryVersion: world?.version ?? 1,
    }
  }
}
