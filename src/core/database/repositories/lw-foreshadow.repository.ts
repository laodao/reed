/**
 * LW 伏笔仓库（P1-2026-09-09）
 * @module database/repositories/lw-foreshadow.repository
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { LwForeshadowEntity } from '../entities/lw-foreshadow.entity'
import { BaseRepository } from '../base-repository'

export interface ForeshadowDto {
  id: string
  projectId: string
  content: string
  plantedChapter: number | null
  payoffChapter: number | null
  status: 'open' | 'paid' | 'dropped'
  origin: { type: 'discussion' | 'extract' | 'manual'; cardId?: string; turns?: number[]; chapter?: number } | null
  /** 暗线关联（2026-09-16 结构化设定 M1） */
  involves: Array<{ type: string; id: string }> | null
  developChapters: number[] | null
  rolledTo: number | null
  createdAt: number
  updatedAt: number
}

export class LwForeshadowRepository extends BaseRepository<LwForeshadowEntity, ForeshadowDto> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwForeshadowEntity)
  }

  private parse<T>(json: string | null): T | null {
    if (!json) return null
    try {
      return JSON.parse(json) as T
    } catch {
      return null
    }
  }

  protected toDto(e: LwForeshadowEntity): ForeshadowDto {
    return {
      id: e.id,
      projectId: e.projectId,
      content: e.content,
      plantedChapter: e.plantedChapter,
      payoffChapter: e.payoffChapter,
      status: e.status as ForeshadowDto['status'],
      origin: this.parse<ForeshadowDto['origin']>(e.origin),
      involves: this.parse<ForeshadowDto['involves']>(e.involves),
      developChapters: this.parse<number[]>(e.developChapters),
      rolledTo: e.rolledTo,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  /** 卷设计 threads 分解落库：回填暗线关联字段（M1） */
  async updateDesignFields(
    id: string,
    fields: { payoffChapter?: number | null; involves?: Array<{ type: string; id: string }> | null; developChapters?: number[] | null },
  ): Promise<void> {
    const row = await this.scoped.findOne({ id } as any)
    if (!row) return
    if (fields.payoffChapter !== undefined) row.payoffChapter = fields.payoffChapter
    if (fields.involves !== undefined) row.involves = fields.involves ? JSON.stringify(fields.involves) : null
    if (fields.developChapters !== undefined)
      row.developChapters = fields.developChapters ? JSON.stringify(fields.developChapters) : null
    row.updatedAt = Date.now()
    await this.scoped.save(row)
  }

  async getByProjectId(projectId: string): Promise<ForeshadowDto[]> {
    const rows = await this.scoped.find({
      where: { projectId } as any,
      order: { plantedChapter: 'ASC' as const, createdAt: 'ASC' as const },
    })
    return this.toDtoList(rows)
  }

  async createRow(
    projectId: string,
    content: string,
    plantedChapter: number | null,
    origin?: ForeshadowDto['origin'],
  ): Promise<ForeshadowDto> {
    const id = `fb_${Date.now()}_${randomUUID().slice(0, 6)}`
    await this.scoped.save(this.repo.create({
      id,
      projectId,
      content,
      plantedChapter: plantedChapter ?? null,
      payoffChapter: null,
      status: 'open',
      origin: origin ? JSON.stringify(origin) : null,
    } as never) as never)
    const row = await this.scoped.findOne({ id } as any)
    return this.toDto(row!)
  }

  /** 删除某章的提取段伏笔（流水线重跑幂等；只动 origin.type='extract' 的行） */
  async deleteExtractByChapter(projectId: string, chapterNumber: number): Promise<number> {
    const rows = await this.getByProjectId(projectId)
    let n = 0
    for (const r of rows) {
      if (r.origin?.type === 'extract' && r.origin.chapter === chapterNumber) {
        if (await this.deleteRow(r.id)) n++
      }
    }
    return n
  }

  async setStatus(id: string, status: 'open' | 'paid' | 'dropped', payoffChapter?: number | null): Promise<ForeshadowDto | null> {
    const row = await this.scoped.findOne({ id } as any)
    if (!row) return null
    row.status = status
    if (payoffChapter !== undefined) row.payoffChapter = payoffChapter
    row.updatedAt = Date.now()
    await this.scoped.save(row)
    return this.toDto(row)
  }

  async deleteRow(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  /** 项目删除级联清理（lw_foreshadows 无 FK，靠显式 purge） */
  async deleteByProjectId(projectId: string): Promise<number> {
    return this.scoped.delete({ projectId } as any)
  }
}
