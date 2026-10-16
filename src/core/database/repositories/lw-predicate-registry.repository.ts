/**
 * LW 谓词注册表仓库（2026-09-16 结构化设定方案 M0）
 * @module database/repositories/lw-predicate-registry.repository
 *
 * 全局配置表（行 user_id NULL，与 lw_bible_kinds 同类）：读路径走 raw repo
 * 不注租户过滤；写路径仅迁移种子与后续治理入口（M1 设计 pass 消费）。
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { LwPredicateRegistryEntity } from '../entities/lw-predicate-registry.entity'
import { BaseRepository } from '../base-repository'
import { normalizePredicate, type PredicateScope, type PredicateSeed } from '@shared/contracts/longwriting-design'

export interface PredicateEntryDto {
  id: string
  scope: PredicateScope
  key: string
  label: string
  synonyms: string[]
  source: 'builtin' | 'discovered' | 'manual'
  enabled: boolean
}

function parseSynonyms(json: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export class LwPredicateRegistryRepository extends BaseRepository<LwPredicateRegistryEntity, PredicateEntryDto> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwPredicateRegistryEntity)
  }

  protected toDto(e: LwPredicateRegistryEntity): PredicateEntryDto {
    return {
      id: e.id,
      scope: e.scope as PredicateScope,
      key: e.key,
      label: e.label,
      synonyms: parseSynonyms(e.synonyms),
      source: e.source as PredicateEntryDto['source'],
      enabled: e.enabled === 1,
    }
  }

  /** 全量词表（含禁用项，治理视图用） */
  async listAll(): Promise<PredicateEntryDto[]> {
    const rows = await this.repo.find({ order: { scope: 'ASC', createdAt: 'ASC' } } as never)
    return this.toDtoList(rows)
  }

  async getByScopeAndKey(scope: PredicateScope, key: string): Promise<PredicateEntryDto | null> {
    const row = await this.repo.findOne({ where: { scope, key } as never })
    return row ? this.toDto(row) : null
  }

  /**
   * 种子/发现入册：按 (scope,key) 幂等，已存在不覆盖（保住 manual 治理结果）
   */
  async upsertSeed(seed: PredicateSeed & { source?: PredicateEntryDto['source'] }): Promise<void> {
    const existing = await this.getByScopeAndKey(seed.scope, seed.key)
    if (existing) return
    const row = this.repo.create({
      id: `pred_${randomUUID().slice(0, 8)}`,
      scope: seed.scope,
      key: seed.key,
      label: seed.label,
      synonyms: seed.synonyms.length > 0 ? JSON.stringify(seed.synonyms) : null,
      source: seed.source ?? 'builtin',
      enabled: 1,
      userId: null,
    } as never)
    await this.repo.save(row)
  }

  /**
   * 归一一个自由文本谓词：命中词表（key/label/synonym）→ 规范 key；
   * 未命中 → 自动入册 discovered 行并原样返回。M1 起 GraphService/
   * applyRelationChanges 写边前统一过这里。
   */
  async normalizeOrRegister(raw: string, scope: PredicateScope): Promise<string> {
    const entries = await this.listAll()
    const normalized = normalizePredicate(
      raw,
      entries.filter(e => e.enabled).map(e => ({ scope: e.scope, key: e.key, label: e.label, synonyms: e.synonyms })),
      scope
    )
    if (normalized) return normalized
    const trimmed = raw.trim()
    if (trimmed) await this.upsertSeed({ scope, key: trimmed, label: trimmed, synonyms: [], source: 'discovered' })
    return trimmed
  }
}
