/**
 * LW Token 用量仓库（W3.2）
 * @module database/repositories/lw-token-usage.repository
 */
import type { DataSource } from 'typeorm'
import { LwTokenUsageEntity } from '../entities/lw-token-usage.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '../../context/user-context'

export interface TokenUsageCreateRequest {
  projectId: string
  chapterId?: string | null
  purpose: string
  providerConfigId?: string | null
  modelId?: string | null
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  isEstimated?: boolean
  durationMs?: number
}

export interface TokenUsagePurposeSummary {
  purpose: string
  calls: number
  totalTokens: number
  isEstimated: number
}

export class LwTokenUsageRepository extends BaseRepository<LwTokenUsageEntity, LwTokenUsageEntity> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwTokenUsageEntity)
  }

  protected toDto(e: LwTokenUsageEntity): LwTokenUsageEntity {
    return e
  }

  async create(data: TokenUsageCreateRequest): Promise<LwTokenUsageEntity> {
    const id = `tk_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    // userId 由 BaseRepository 的租户门注入（scoped save）
    const row: LwTokenUsageEntity = {
      id,
      userId: null,
      projectId: data.projectId,
      chapterId: data.chapterId ?? null,
      purpose: data.purpose,
      providerConfigId: data.providerConfigId ?? null,
      modelId: data.modelId ?? null,
      promptTokens: Math.max(0, Math.floor(data.promptTokens ?? 0)),
      completionTokens: Math.max(0, Math.floor(data.completionTokens ?? 0)),
      totalTokens: Math.max(0, Math.floor(data.totalTokens ?? 0)),
      isEstimated: data.isEstimated ? 1 : 0,
      durationMs: Math.max(0, Math.floor(data.durationMs ?? 0)),
      createdAt: Date.now(),
    }
    await this.scoped.save(row)
    return row
  }

  /** 租户过滤（与 BaseRepository.scopeWhere 同语义：Electron 单用户 uid=null → 只看 NULL 行） */
  private userScopeSql(): { sql: string; params: Record<string, unknown> } {
    const uid = getCurrentUserId()
    return uid === null
      ? { sql: 'u.user_id IS NULL', params: {} }
      : { sql: 'u.user_id = :uid', params: { uid } }
  }

  async getByProject(projectId: string, limit = 500): Promise<LwTokenUsageEntity[]> {
    const scope = this.userScopeSql()
    return await this.repo
      .createQueryBuilder('u')
      .where('u.project_id = :pid', { pid: projectId })
      .andWhere(scope.sql, scope.params)
      .orderBy('u.created_at', 'DESC')
      .take(limit)
      .getMany()
  }

  /** 按用途聚合（W3.2 gate：项目页可见汇总） */
  async summaryByPurpose(projectId: string): Promise<TokenUsagePurposeSummary[]> {
    const scope = this.userScopeSql()
    const rows = await this.repo
      .createQueryBuilder('u')
      .select('u.purpose', 'purpose')
      .addSelect('COUNT(1)', 'calls')
      .addSelect('SUM(u.total_tokens)', 'totalTokens')
      .addSelect('MAX(u.is_estimated)', 'isEstimated')
      .where('u.project_id = :pid', { pid: projectId })
      .andWhere(scope.sql, scope.params)
      .groupBy('u.purpose')
      .getRawMany<{ purpose: string; calls: string; totalTokens: string; isEstimated: string }>()
    return (rows ?? []).map((r) => ({
      purpose: r.purpose,
      calls: Number(r.calls) || 0,
      totalTokens: Number(r.totalTokens) || 0,
      isEstimated: Number(r.isEstimated) || 0,
    }))
  }
}
