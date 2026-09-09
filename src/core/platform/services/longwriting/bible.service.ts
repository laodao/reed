/**
 * 故事圣经统一读模型（P0-2026-09-09，设计文档 bible-p0-p3 §P0.2）
 * @module core/platform/services/longwriting/bible.service
 *
 * 一个聚合接口把「既有 lw_* 强表 + lw_custom_entities 自定义实体」投影为统一的
 * 分类化条目列表——研讨室设定集与写作台资产面板共用（架构统一：一处抽象两处消费）。
 * 分类由 lw_bible_kinds 驱动：storage='entity' 路由到既有仓储，'custom' 查自定义实体。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { BibleKindDto } from '@core/database/repositories/lw-bible-kind.repository'
import type { CustomEntityDto } from '@core/database/repositories/lw-custom-entity.repository'

const logger = createLogger('BibleQuery')

export interface BibleEntryView {
  id: string
  name: string
  sub: string
  aliases?: string[]
  fields: Record<string, unknown>
  origin?: { type: string; turns?: number[]; cardId?: string } | null
}

export interface BibleGroupView {
  kindKey: string
  label: string
  icon: string | null
  storage: 'entity' | 'custom'
  fieldsSchema: BibleKindDto['fieldsSchema']
  entries: BibleEntryView[]
}

/** entity 类的名称/摘要提取（键名与内置种子一一对应） */
const ENTITY_ADAPTERS: Record<string, { nameField: string; subFields: string[] }> = {
  overview: { nameField: 'title', subFields: ['summary'] },
  character: { nameField: 'name', subFields: ['occupation', 'rolePosition'] },
  plot: { nameField: 'title', subFields: ['summary'] },
  outline: { nameField: 'name', subFields: ['nodeType'] },
  faction: { nameField: 'name', subFields: ['description'] },
  skill: { nameField: 'name', subFields: ['type'] },
  item: { nameField: 'name', subFields: ['type'] },
  location: { nameField: 'name', subFields: ['description'] },
}

const outlineSub = (t: unknown) => (t === 'volume' ? '卷' : t === 'chapter' ? '章' : t === 'section' ? '节' : '')

export class BibleQueryService {
  private static instance: BibleQueryService | null = null

  static getInstance(db?: any): BibleQueryService {
    if (!BibleQueryService.instance) {
      BibleQueryService.instance = new BibleQueryService(db)
    }
    return BibleQueryService.instance
  }

  constructor(private db?: any) {}

  private manager(): any {
    return this.db ?? getCoreDatabaseManager()
  }

  async listKinds(): Promise<BibleKindDto[]> {
    return (await this.manager().lwBibleKinds?.getEnabled()) || []
  }

  /** 分类化条目列表（设定集/资产面板主数据源） */
  async list(projectId: string): Promise<BibleGroupView[]> {
    const m = this.manager()
    const kinds = await this.listKinds()
    const groups: BibleGroupView[] = []

    for (const kind of kinds) {
      if (kind.storage === 'custom') {
        const rows = (await m.lwCustomEntities?.getByProjectAndKind(projectId, kind.key)) || []
        groups.push({
          kindKey: kind.key,
          label: kind.label,
          icon: kind.icon,
          storage: 'custom',
          fieldsSchema: kind.fieldsSchema,
          entries: rows.map((r: CustomEntityDto) => ({
            id: r.id,
            name: r.name,
            sub: this.firstStr(r.fields, kind),
            fields: r.fields || {},
            origin: r.origin ?? undefined,
          })),
        })
        continue
      }

      // entity 路由
      const repo = kind.entityRepo ? m[kind.entityRepo] : null
      if (!repo?.getByProjectId && !repo?.getTreeByProjectId) {
        groups.push({ kindKey: kind.key, label: kind.label, icon: kind.icon, storage: 'entity', fieldsSchema: kind.fieldsSchema, entries: [] })
        continue
      }
      const adapter = ENTITY_ADAPTERS[kind.key] || { nameField: 'name', subFields: [] }
      let rows: Array<Record<string, any>> = []
      try {
        rows = kind.key === 'outline'
          ? (await repo.getTreeByProjectId(projectId)) || []
          : (await repo.getByProjectId(projectId)) || []
      } catch (e) {
        logger.warn(`[bible] ${kind.key} 读取失败（降级为空组）`, e)
      }
      const entries: BibleEntryView[] = []
      for (const row of rows) {
        const name = String(row[adapter.nameField] || '').trim()
        if (!name) continue
        if (kind.key === 'overview' && rows.length > 1) continue // 概要单行
        const subParts = adapter.subFields
          .map((f) => (kind.key === 'outline' ? outlineSub(row[f]) : String(row[f] || '').trim()))
          .filter(Boolean)
        entries.push({
          id: String(row.id),
          name,
          sub: subParts.join(' · ').slice(0, 24),
          aliases: Array.isArray(row.aliases) ? row.aliases : undefined,
          fields: row,
          origin: undefined,
        })
      }
      groups.push({ kindKey: kind.key, label: kind.label, icon: kind.icon, storage: 'entity', fieldsSchema: kind.fieldsSchema, entries })
    }
    return groups
  }

  private firstStr(fields: Record<string, unknown> | null, kind: BibleKindDto): string {
    if (!fields) return ''
    const schema = kind.fieldsSchema || []
    for (const f of schema) {
      if (f.key === 'name') continue
      const v = fields[f.key]
      if (typeof v === 'string' && v.trim()) return v.slice(0, 24)
    }
    return ''
  }

  /** 单实体详情：全字段 + 关系（P1 加 progression） */
  async detail(projectId: string, kindKey: string, id: string): Promise<{
    kind: BibleKindDto
    fields: Record<string, unknown>
    relations: Array<{ targetName?: string; target?: string; relationType?: string; description?: string; validFromChapter?: number | null }>
  } | null> {
    const m = this.manager()
    const kinds = await this.listKinds()
    const kind = kinds.find((k) => k.key === kindKey)
    if (!kind) return null

    let fields: Record<string, unknown> | null = null
    if (kind.storage === 'custom') {
      const rows = (await m.lwCustomEntities?.getByProjectAndKind(projectId, kindKey)) || []
      fields = rows.find((r: CustomEntityDto) => r.id === id)?.fields || {}
    } else {
      const repo = kind.entityRepo ? m[kind.entityRepo] : null
      if (kindKey === 'overview') {
        fields = (await repo?.getByProjectId(projectId)) || {}
      } else if (repo?.getById) {
        fields = (await repo.getById(id)) || {}
      }
    }

    // 关系边（数据在 lw_graph_edges——P0 只做读取小节）
    let relations: Array<Record<string, unknown>> = []
    try {
      const graph = m.lwGraphEdges
      if (graph?.getByEntity) {
        relations = (await graph.getByEntity(projectId, id)) || []
      } else if (graph?.findByEntity) {
        relations = (await graph.findByEntity(projectId, id)) || []
      }
    } catch (e) {
      logger.warn('[bible] 关系读取失败（降级为空）', e)
    }

    return { kind, fields: fields || {}, relations: relations as never }
  }

  customCreate(projectId: string, kindKey: string, name: string, fields: Record<string, unknown> | null, origin?: CustomEntityDto['origin']) {
    return this.manager().lwCustomEntities.createRow(projectId, kindKey, name, fields, origin)
  }

  customUpdate(projectId: string, id: string, patch: { name?: string; fields?: Record<string, unknown> | null }) {
    void projectId
    return this.manager().lwCustomEntities.updateRow(id, patch)
  }

  customDelete(id: string) {
    return this.manager().lwCustomEntities.deleteRow(id)
  }
}
