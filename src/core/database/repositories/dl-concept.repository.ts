/**
 * 领域学习概念节点仓库（dl_concept，design-v3 §9）
 * @module database/repositories/dl-concept.repository
 *
 * 树与图共享本表：node_type='group' 为目录节点，其余为知识节点。
 * 树查询（listByParent）、同级唯一（项目+父+名）约束由 DDL 保证（SQLite/PG 的
 * UNIQUE 不把 NULL 视为冲突值，根节点唯一性由服务层建空间时兜底）。
 * mastery/research_state 状态机由 learning-graph/learning-loop 服务收口。
 */

import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { DlConceptEntity } from '../entities/domain-learning/dl-concept.entity'
import { BaseRepository } from '../base-repository'

/** dl_concept 行 DTO（attrs JSON 已解析） */
export interface DlConceptRow {
  id: string
  userId: string | null
  projectId: string
  nodeType: string
  name: string
  en: string | null
  parentId: string | null
  definitionShort: string | null
  researchState: string
  mastery: string
  source: string
  attrs: Record<string, unknown> | null
  cardId: string | null
  note: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

export type DlConceptPatch = Partial<{
  nodeType: string
  name: string
  en: string | null
  parentId: string | null
  definitionShort: string | null
  researchState: string
  mastery: string
  source: string
  attrs: Record<string, unknown> | null
  cardId: string | null
  note: string | null
}>

function safeParse(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

/** 项目+状态等组合查询的 where 类型 */
type ConceptWhere = FindOptionsWhere<DlConceptEntity>

export class DlConceptRepository extends BaseRepository<DlConceptEntity, DlConceptRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, DlConceptEntity)
  }

  async create(input: {
    id: string
    projectId: string
    nodeType: string
    name: string
    en?: string | null
    parentId?: string | null
    definitionShort?: string | null
    researchState?: string
    mastery?: string
    source?: string
    attrs?: Record<string, unknown> | null
    note?: string | null
  }): Promise<DlConceptRow> {
    const now = new Date()
    const e = new DlConceptEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.nodeType = input.nodeType
    e.name = input.name
    e.en = input.en ?? null
    e.parentId = input.parentId ?? null
    e.definitionShort = input.definitionShort ?? null
    e.researchState = input.researchState ?? 'unresearched'
    e.mastery = input.mastery ?? 'untouched'
    e.source = input.source ?? 'material'
    e.attrs = input.attrs ? JSON.stringify(input.attrs) : null
    e.note = input.note ?? null
    e.createdAt = now
    e.updatedAt = now
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<DlConceptRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  /** 某项目全部概念（图/树聚合用；个人规模全量内存遍历即可） */
  async listByProject(projectId: string): Promise<DlConceptRow[]> {
    const rows = await this.scoped.find({
      where: { projectId } as ConceptWhere,
      order: { createdAt: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  /** 树查询：某父下的直接子节点（parentId null = 根层） */
  async listByParent(projectId: string, parentId: string | null): Promise<DlConceptRow[]> {
    const rows = await this.scoped.find({
      where: { projectId, parentId } as ConceptWhere,
      order: { createdAt: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  /** 同父同级下是否存在同名（服务层幂等/校验用；根层 parentId null 也覆盖） */
  async existsSiblingName(
    projectId: string,
    parentId: string | null,
    name: string,
    excludeId?: string,
  ): Promise<boolean> {
    const rows = await this.scoped.find({
      where: { projectId, parentId, name } as ConceptWhere,
    })
    return rows.some((r) => r.id !== excludeId)
  }

  async countByProject(projectId: string): Promise<number> {
    return this.scoped.count({ projectId } as ConceptWhere)
  }

  async patch(id: string, patch: DlConceptPatch): Promise<void> {
    const partial: Partial<DlConceptEntity> = { updatedAt: new Date() }
    if (patch.nodeType !== undefined) partial.nodeType = patch.nodeType
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.en !== undefined) partial.en = patch.en
    if (patch.parentId !== undefined) partial.parentId = patch.parentId
    if (patch.definitionShort !== undefined) partial.definitionShort = patch.definitionShort
    if (patch.researchState !== undefined) partial.researchState = patch.researchState
    if (patch.mastery !== undefined) partial.mastery = patch.mastery
    if (patch.source !== undefined) partial.source = patch.source
    if (patch.attrs !== undefined)
      partial.attrs = patch.attrs ? JSON.stringify(patch.attrs) : null
    if (patch.cardId !== undefined) partial.cardId = patch.cardId
    if (patch.note !== undefined) partial.note = patch.note
    await this.scoped.update({ id }, partial)
  }

  async deleteById(id: string): Promise<number> {
    return this.scoped.delete({ id })
  }

  protected toDto(e: DlConceptEntity): DlConceptRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      nodeType: e.nodeType,
      name: e.name,
      en: e.en,
      parentId: e.parentId,
      definitionShort: e.definitionShort,
      researchState: e.researchState,
      mastery: e.mastery,
      source: e.source,
      attrs: safeParse(e.attrs),
      cardId: e.cardId,
      note: e.note,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}
