/**
 * 世界观库服务（设定资产库 P0-2026-09-24）
 * @module platform/services/longwriting/library/world-library.service
 *
 * 库 = 「世界常量」：CRUD + 题材模板播种 + 版本自增（血缘同步依据）。
 * 删除语义（设计 §4.5）：删库级联删 kinds/entries/edges；绑定行保留（悬空，
 * 靠 world_name 快照兜底展示），项目内已导入行不受影响。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type {
  World,
  WorldKind,
  WorldEntry,
  WorldEdge,
  CreateWorldRequest,
  UpdateWorldRequest,
  CreateWorldEntryRequest,
  UpdateWorldEntryRequest,
} from '@shared/types/lw-library.types'
import { WORLD_TEMPLATES } from './world-templates'

export interface WorldReferencingInfo {
  referencingProjects: number
}

export class WorldLibraryService {
  private db() {
    return getCoreDatabaseManager()
  }

  // ---------- 世界 ----------

  async listWorlds(includeArchived = false): Promise<World[]> {
    return includeArchived ? this.db().lwWorlds!.listAll() : this.db().lwWorlds!.listActive()
  }

  async getWorld(id: string): Promise<
    | (World & {
        kinds: WorldKind[]
        entries: WorldEntry[]
        edges: WorldEdge[]
        referencingProjects: number
      })
    | null
  > {
    const world = await this.db().lwWorlds!.getById(id)
    if (!world) return null
    const [kinds, entries, edges, bindings] = await Promise.all([
      this.db().lwWorldKinds!.listByWorldId(id),
      this.db().lwWorldEntries!.listByWorldId(id),
      this.db().lwWorldEdges!.listByWorldId(id),
      this.db().lwWorldBindings!.listByWorldId(id),
    ])
    return { ...world, kinds, entries, edges, referencingProjects: bindings.length }
  }

  async createWorld(req: CreateWorldRequest): Promise<World> {
    const id = `wld_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const world = await this.db().lwWorlds!.create({
      id,
      name: req.name,
      genre: req.genre || 'custom',
      tagline: req.tagline,
      description: req.description,
      tags: req.tags,
    })
    if (req.fromTemplate) {
      await this.seedFromTemplate(world.id, req.fromTemplate)
    }
    return world
  }

  /** 模板播种：kinds 全量 + 示范条目（origin.type='manual'，用户可删） */
  async seedFromTemplate(worldId: string, templateId: string): Promise<number> {
    const template = WORLD_TEMPLATES[templateId]
    if (!template) return 0
    for (const kind of template.kinds) {
      await this.db().lwWorldKinds!.upsertSeed({ worldId, ...kind })
    }
    for (const entry of template.entries) {
      await this.db().lwWorldEntries!.create({
        worldId,
        kindKey: entry.kindKey,
        name: entry.name,
        aliases: entry.aliases,
        summary: entry.summary,
        fields: entry.fields ?? null,
        pinned: entry.pinned,
        rankValue: entry.rankValue ?? null,
      })
    }
    return template.kinds.length
  }

  async updateWorld(id: string, req: UpdateWorldRequest): Promise<World | null> {
    return this.db().lwWorlds!.updateRow(id, req)
  }

  async deleteWorld(id: string): Promise<{ ok: boolean; referencingProjects: number }> {
    const bindings = await this.db().lwWorldBindings!.listByWorldId(id)
    // 删除语义：项目侧只留悬空绑定（不级联），库表本身级联清空
    await this.db().lwWorldEdges!.deleteByWorldId(id)
    await this.db().lwWorldEntries!.deleteByWorldId(id)
    await this.db().lwWorldKinds!.deleteByWorldId(id)
    await this.db().lwWorlds!.deleteRow(id)
    return { ok: true, referencingProjects: bindings.length }
  }

  // ---------- 分类 ----------

  async listKinds(worldId: string): Promise<WorldKind[]> {
    return this.db().lwWorldKinds!.listByWorldId(worldId)
  }

  async createKind(data: {
    worldId: string
    key: string
    label: string
    icon?: string | null
    sortOrder?: number
    fieldsSchema?: import('@shared/types/lw-library.types').LibraryFieldSchemaItem[] | null
    promptHint?: string | null
  }): Promise<WorldKind> {
    const kind = await this.db().lwWorldKinds!.create(data)
    await this.db().lwWorlds!.bumpVersion(data.worldId)
    return kind
  }

  async deleteKind(id: string, worldId: string): Promise<boolean> {
    const ok = await this.db().lwWorldKinds!.deleteRow(id)
    if (ok) await this.db().lwWorlds!.bumpVersion(worldId)
    return ok
  }

  // ---------- 条目 ----------

  async listEntries(worldId: string, kindKey?: string): Promise<WorldEntry[]> {
    return kindKey
      ? this.db().lwWorldEntries!.listByWorldAndKind(worldId, kindKey)
      : this.db().lwWorldEntries!.listByWorldId(worldId)
  }

  async getEntry(id: string): Promise<WorldEntry | null> {
    return this.db().lwWorldEntries!.getById(id)
  }

  async createEntry(req: CreateWorldEntryRequest): Promise<WorldEntry> {
    const entry = await this.db().lwWorldEntries!.create(req)
    await this.db().lwWorlds!.bumpVersion(req.worldId)
    return entry
  }

  async updateEntry(id: string, req: UpdateWorldEntryRequest): Promise<WorldEntry | null> {
    const entry = await this.db().lwWorldEntries!.updateRow(id, req)
    if (entry) await this.db().lwWorlds!.bumpVersion(entry.worldId)
    return entry
  }

  async deleteEntry(id: string): Promise<WorldEntry | null> {
    const entry = await this.db().lwWorldEntries!.getById(id)
    if (!entry) return null
    await this.db().lwWorldEntries!.deleteRow(id)
    await this.db().lwWorlds!.bumpVersion(entry.worldId)
    return entry
  }

  async reorderEntries(orderList: { id: string; order: number }[]): Promise<void> {
    await this.db().lwWorldEntries!.reorder(orderList)
  }

  // ---------- 库内关系边 ----------

  async listEdges(worldId: string): Promise<WorldEdge[]> {
    return this.db().lwWorldEdges!.listByWorldId(worldId)
  }

  async createEdge(data: {
    worldId: string
    sourceId: string
    targetId: string
    relationType: string
    label?: string | null
  }): Promise<WorldEdge> {
    return this.db().lwWorldEdges!.create(data)
  }

  async deleteEdge(id: string): Promise<boolean> {
    return this.db().lwWorldEdges!.deleteRow(id)
  }
}
