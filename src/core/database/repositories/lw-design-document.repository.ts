/**
 * LW 设计文档仓库（2026-09-16 结构化设定方案 M1）
 * @module database/repositories/lw-design-document.repository
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { LwDesignDocumentEntity } from '../entities/lw-design-document.entity'
import { BaseRepository } from '../base-repository'

export type DesignDocKind = 'spine' | 'volume'
export type DesignDocStatus = 'draft' | 'confirmed' | 'discarded'

export interface DesignDocumentDto {
  id: string
  projectId: string
  kind: DesignDocKind
  volumeId: string | null
  title: string
  doc: unknown
  idMap: Record<string, string> | null
  status: DesignDocStatus
  version: number
  createdAt: number
  updatedAt: number
}

function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

export class LwDesignDocumentRepository extends BaseRepository<LwDesignDocumentEntity, DesignDocumentDto> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwDesignDocumentEntity)
  }

  protected toDto(e: LwDesignDocumentEntity): DesignDocumentDto {
    return {
      id: e.id,
      projectId: e.projectId,
      kind: e.kind as DesignDocKind,
      volumeId: e.volumeId,
      title: e.title,
      doc: parseJson<unknown>(e.docJson, null),
      idMap: parseJson<Record<string, string> | null>(e.idMap, null),
      status: e.status as DesignDocStatus,
      version: e.version,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async getById(id: string): Promise<DesignDocumentDto | null> {
    const row = await this.scoped.findOne({ id } as never)
    return row ? this.toDto(row) : null
  }

  async listByProject(projectId: string): Promise<DesignDocumentDto[]> {
    const rows = await this.scoped.find({ where: { projectId } as never, order: { createdAt: 'ASC' } as never })
    return this.toDtoList(rows)
  }

  /** 最新一份同 kind（+volumeId）文档（任意状态）——volume 校验取 spine 上下文用 */
  async getLatest(projectId: string, kind: DesignDocKind, volumeId?: string): Promise<DesignDocumentDto | null> {
    const rows = await this.listByProject(projectId)
    const matched = rows.filter(r => r.kind === kind && (volumeId === undefined || r.volumeId === volumeId))
    return matched.length > 0 ? matched[matched.length - 1] : null
  }

  async create(input: {
    projectId: string
    kind: DesignDocKind
    volumeId?: string | null
    title: string
    doc: unknown
  }): Promise<DesignDocumentDto> {
    const now = Date.now()
    const entity = this.repo.create({
      id: `dd_${randomUUID().slice(0, 12)}`,
      userId: null,
      projectId: input.projectId,
      kind: input.kind,
      volumeId: input.volumeId ?? null,
      title: input.title,
      docJson: JSON.stringify(input.doc),
      idMap: null,
      status: 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    } as Partial<LwDesignDocumentEntity>)
    const saved = await this.repo.save(entity as LwDesignDocumentEntity)
    return this.toDto(saved)
  }

  /** 草稿演进：同卷重存 = 替换 doc_json + version+1（历史不保留多份，当前态即可回放） */
  async updateDraftJson(id: string, doc: unknown): Promise<DesignDocumentDto | null> {
    const row = await this.scoped.findOne({ id } as never)
    if (!row) return null
    row.docJson = JSON.stringify(doc)
    row.version += 1
    row.updatedAt = Date.now()
    const saved = await this.repo.save(row)
    return this.toDto(saved)
  }

  async setStatus(id: string, status: DesignDocStatus, idMap?: Record<string, string>): Promise<DesignDocumentDto | null> {
    const row = await this.scoped.findOne({ id } as never)
    if (!row) return null
    row.status = status
    row.updatedAt = Date.now()
    if (idMap) row.idMap = JSON.stringify(idMap)
    const saved = await this.repo.save(row)
    return this.toDto(saved)
  }
}
