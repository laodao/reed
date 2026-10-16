/**
 * 自定义工具仓库（片1 工具）
 * @module core/database/repositories/custom-tool.repository
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import type { CustomTool, ToolKind, ToolParamField } from '@shared/types/tool.types'
import { TOOL_AUTH_TYPES, TOOL_KINDS } from '@shared/types/tool.types'
import { CustomToolEntity } from '../entities/custom-tool.entity'
import { BaseRepository } from '../base-repository'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('CustomToolRepository')

export interface CreateCustomToolInput {
  name: string
  description?: string | null
  kind?: ToolKind
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'CLI'
  url: string
  headers?: Array<{ key: string; value: string }>
  paramsSchema?: ToolParamField[]
  authType?: string
  credentialId?: string | null
  command?: string | null
  argsTemplate?: string | null
  cwd?: string | null
  timeoutMs?: number | null
  stdoutType?: 'text' | 'json' | null
}

export interface UpdateCustomToolInput {
  name?: string
  description?: string | null
  kind?: ToolKind
  method?: string
  url?: string
  headers?: Array<{ key: string; value: string }>
  paramsSchema?: ToolParamField[]
  authType?: string
  credentialId?: string | null
  command?: string | null
  argsTemplate?: string | null
  cwd?: string | null
  timeoutMs?: number | null
  stdoutType?: 'text' | 'json' | null
}

export class CustomToolRepository extends BaseRepository<CustomToolEntity, CustomTool> {
  constructor(dataSource: DataSource) {
    super(dataSource, CustomToolEntity)
  }

  private generateId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  protected toDto(e: CustomToolEntity): CustomTool {
    let headers: Array<{ key: string; value: string }> = []
    let paramsSchema: ToolParamField[] = []
    try {
      headers = e.headersJson ? JSON.parse(e.headersJson) : []
      paramsSchema = e.paramsSchemaJson ? JSON.parse(e.paramsSchemaJson) : []
    } catch (err) {
      // 损坏数据降级 + 留痕（对齐 app-session 的 safeParse 纪律）
      logger.warn(`[CustomTool] JSON 解析失败（id=${e.id}），按空处理`, err)
    }
    return {
      id: e.id,
      name: e.name,
      description: e.description,
      kind: (e.kind ?? TOOL_KINDS.api) as CustomTool['kind'],
      method: e.method as CustomTool['method'],
      url: e.url,
      headers,
      paramsSchema,
      authType: e.authType as CustomTool['authType'],
      credentialId: e.credentialId,
      command: e.command,
      argsTemplate: e.argsTemplate,
      cwd: e.cwd,
      timeoutMs: e.timeoutMs,
      stdoutType: e.stdoutType as CustomTool['stdoutType'],
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async list(): Promise<CustomTool[]> {
    const rows = await this.scoped.qb('t').orderBy('t.created_at', 'DESC').getMany()
    return this.toDtoList(rows)
  }

  async findById(id: string): Promise<CustomTool | null> {
    const e = await this.scoped.findOne({ id } as FindOptionsWhere<CustomToolEntity>)
    return e ? this.toDto(e) : null
  }

  async create(data: CreateCustomToolInput): Promise<CustomTool> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      name: data.name,
      description: data.description ?? null,
      kind: data.kind ?? TOOL_KINDS.api,
      method: data.method,
      url: data.url,
      headersJson: JSON.stringify(data.headers ?? []),
      paramsSchemaJson: JSON.stringify(data.paramsSchema ?? []),
      authType: data.authType ?? TOOL_AUTH_TYPES.none,
      credentialId: data.credentialId ?? null,
      command: data.command ?? null,
      argsTemplate: data.argsTemplate ?? null,
      cwd: data.cwd ?? null,
      timeoutMs: data.timeoutMs ?? null,
      stdoutType: data.stdoutType ?? null,
      createdAt: now,
      updatedAt: now,
    } as Partial<CustomToolEntity>)
    return this.toDto(entity as CustomToolEntity)
  }

  async update(id: string, patch: UpdateCustomToolInput): Promise<CustomTool | null> {
    const partial: Partial<CustomToolEntity> = { updatedAt: new Date() }
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.description !== undefined) partial.description = patch.description
    if (patch.kind !== undefined) partial.kind = patch.kind
    if (patch.method !== undefined) partial.method = patch.method
    if (patch.url !== undefined) partial.url = patch.url
    if (patch.headers !== undefined) partial.headersJson = JSON.stringify(patch.headers)
    if (patch.paramsSchema !== undefined) partial.paramsSchemaJson = JSON.stringify(patch.paramsSchema)
    if (patch.authType !== undefined) partial.authType = patch.authType
    if (patch.credentialId !== undefined) partial.credentialId = patch.credentialId
    if (patch.command !== undefined) partial.command = patch.command
    if (patch.argsTemplate !== undefined) partial.argsTemplate = patch.argsTemplate
    if (patch.cwd !== undefined) partial.cwd = patch.cwd
    if (patch.timeoutMs !== undefined) partial.timeoutMs = patch.timeoutMs
    if (patch.stdoutType !== undefined) partial.stdoutType = patch.stdoutType
    await this.scoped.update({ id } as FindOptionsWhere<CustomToolEntity>, partial)
    return this.findById(id)
  }

  async delete(id: string): Promise<number> {
    return this.scoped.delete({ id } as FindOptionsWhere<CustomToolEntity>)
  }
}
