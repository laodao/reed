/**
 * 变量与数据表仓库（P0 片4）
 * @module core/database/repositories/variable.repositories
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import type { DataTableDef, DataTableRow, WorkflowVariable } from '@shared/types/variable.types'
import { VARIABLE_SCOPES, type VariableScope } from '@shared/types/variable.types'
import { DataTableDefEntity, DataTableRowEntity, WorkflowVariableEntity } from '../entities/variable.entities'
import { BaseRepository } from '../base-repository'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('VariableRepositories')

function safeParseJson(raw: string, what: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : {}
  } catch (e) {
    logger.warn(`[Variable] ${what} JSON 解析失败，按空对象处理`, e)
    return {}
  }
}

// ==================== 变量 ====================

export class VariableRepository extends BaseRepository<WorkflowVariableEntity, WorkflowVariable> {
  constructor(dataSource: DataSource) {
    super(dataSource, WorkflowVariableEntity)
  }

  protected toDto(e: WorkflowVariableEntity): WorkflowVariable {
    return { id: e.id, scope: e.scope as VariableScope, key: e.key, valueJson: e.valueJson, createdAt: e.createdAt, updatedAt: e.updatedAt }
  }

  /** 按 scope+key 查询（get/set 语义） */
  async findByScopeAndKey(scope: VariableScope, key: string): Promise<WorkflowVariable | null> {
    const e = await this.scoped.findOne({ scope, key } as FindOptionsWhere<WorkflowVariableEntity>)
    return e ? this.toDto(e) : null
  }

  async upsert(scope: VariableScope, key: string, valueJson: string): Promise<WorkflowVariable> {
    const existing = await this.findByScopeAndKey(scope, key)
    const now = new Date()
    if (existing) {
      await this.scoped.update({ id: existing.id } as FindOptionsWhere<WorkflowVariableEntity>, { valueJson, updatedAt: now })
      return { ...existing, valueJson, updatedAt: now }
    }
    const entity = await this.scoped.save({
      id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      scope, key, valueJson, createdAt: now, updatedAt: now,
    } as Partial<WorkflowVariableEntity>)
    return this.toDto(entity as WorkflowVariableEntity)
  }

  async list(scope?: VariableScope): Promise<WorkflowVariable[]> {
    const qb = this.scoped.qb('v')
    if (scope) qb.andWhere('v.scope = :scope', { scope })
    const rows = await qb.orderBy('v.updated_at', 'DESC').getMany()
    return this.toDtoList(rows)
  }

  async delete(id: string): Promise<number> {
    return this.scoped.delete({ id } as FindOptionsWhere<WorkflowVariableEntity>)
  }
}

// ==================== 数据表 ====================

export class DataTableDefRepository extends BaseRepository<DataTableDefEntity, DataTableDef> {
  constructor(dataSource: DataSource) {
    super(dataSource, DataTableDefEntity)
  }

  protected toDto(e: DataTableDefEntity): DataTableDef {
    return { id: e.id, name: e.name, columnsJson: e.columnsJson, createdAt: e.createdAt, updatedAt: e.updatedAt }
  }

  async findById(id: string): Promise<DataTableDef | null> {
    const e = await this.scoped.findOne({ id } as FindOptionsWhere<DataTableDefEntity>)
    return e ? this.toDto(e) : null
  }

  async findByName(name: string): Promise<DataTableDef | null> {
    const e = await this.scoped.findOne({ name } as FindOptionsWhere<DataTableDefEntity>)
    return e ? this.toDto(e) : null
  }

  async create(name: string, columnsJson: string): Promise<DataTableDef> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: `tbl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name, columnsJson, createdAt: now, updatedAt: now,
    } as Partial<DataTableDefEntity>)
    return this.toDto(entity as DataTableDefEntity)
  }

  async list(): Promise<DataTableDef[]> {
    const rows = await this.scoped.qb('t').orderBy('t.created_at', 'DESC').getMany()
    return this.toDtoList(rows)
  }

  async delete(id: string): Promise<number> {
    return this.scoped.delete({ id } as FindOptionsWhere<DataTableDefEntity>)
  }
}

export class DataTableRowRepository extends BaseRepository<DataTableRowEntity, DataTableRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, DataTableRowEntity)
  }

  protected toDto(e: DataTableRowEntity): DataTableRow {
    return { id: e.id, tableId: e.tableId, rowJson: e.rowJson, createdAt: e.createdAt, updatedAt: e.updatedAt }
  }

  async insertRow(tableId: string, rowJson: string): Promise<DataTableRow> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      tableId, rowJson, createdAt: now, updatedAt: now,
    } as Partial<DataTableRowEntity>)
    return this.toDto(entity as DataTableRowEntity)
  }

  async listByTable(tableId: string): Promise<DataTableRow[]> {
    const rows = await this.scoped.qb('r').where('r.table_id = :tableId', { tableId }).orderBy('r.created_at', 'DESC').getMany()
    return this.toDtoList(rows)
  }

  async updateRow(id: string, rowJson: string): Promise<DataTableRow | null> {
    await this.scoped.update({ id } as FindOptionsWhere<DataTableRowEntity>, { rowJson, updatedAt: new Date() })
    return this.findById(id)
  }

  async findById(id: string): Promise<DataTableRow | null> {
    const e = await this.scoped.findOne({ id } as FindOptionsWhere<DataTableRowEntity>)
    return e ? this.toDto(e) : null
  }

  async deleteRow(id: string): Promise<number> {
    return this.scoped.delete({ id } as FindOptionsWhere<DataTableRowEntity>)
  }
}

export { safeParseJson }
export { VARIABLE_SCOPES }
