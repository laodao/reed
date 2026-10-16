/**
 * 领域学习「讲义版本管理」服务（2026-09-15 用户需求：历史查看/预览/恢复）
 * @module packs/domain-learning/services/dl-lesson-version
 *
 * 语义对齐平台既有范式（workflow_definition_versions / lw_chapter_versions）：
 *  - 列表：按 version 降序，标注 isCurrent；
 *  - 取版本：只读预览，归属校验；
 *  - 恢复：**新建最新版**（version = 当前最大 + 1），旧版全部保留、永不删改；
 *    新稿 status='draft'、verification=null（核验需针对新内容重跑）、
 *    changeSource='restore'、revisionNote='恢复自 v{n}'。
 *
 * 与导出服务联动：前端可从历史抽屉里直接"导出这一版"（传 cardId）。
 */

import { randomUUID } from 'crypto'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { DlCardVersionItem, DlCardRestoreResult } from '@shared/types/domain-learning.types'
import type { DlCardRow } from '@core/database/repositories/dl-card.repository'

const logger = createLogger('DlLessonVersion')

export class DlLessonVersionService {
  constructor(private readonly db: ICoreDatabaseManager) {}

  /** 某知识点的全部讲义版本（降序；isCurrent 标注最新版） */
  async listVersions(spaceId: string, conceptId: string): Promise<DlCardVersionItem[]> {
    const cards = (await this.db.dlCards?.listVersionsByConcept(spaceId, conceptId)) ?? []
    if (!cards.length) return []
    const currentVersion = cards[cards.length - 1].version
    return cards
      .slice()
      .reverse()
      .map((c) => ({
        cardId: c.id,
        version: c.version,
        status: (c.status === 'published' ? 'published' : 'draft') as 'draft' | 'published',
        essenceType: c.essenceType,
        sectionsCount: c.sections?.length ?? 0,
        worksCount: c.works?.length ?? 0,
        evidenceCount: c.evidenceSources?.length ?? 0,
        verifyStatus: c.verification?.status ?? null,
        revisionNote: c.revisionNote,
        changeSource: c.changeSource,
        createdAt: c.createdAt?.toISOString() ?? null,
        updatedAt: c.updatedAt?.toISOString() ?? null,
        isCurrent: c.version === currentVersion,
      }))
  }

  /** 取单版讲义（只读预览；归属校验） */
  async getVersion(spaceId: string, cardId: string): Promise<DlCardRow | null> {
    const row = await this.db.dlCards?.getById(cardId)
    if (!row || row.projectId !== spaceId) return null
    return row
  }

  /**
   * 恢复到草稿：以目标历史版本的内容新建一版（version = 当前最大 + 1）。
   * 旧版全部保留、不删不改；新稿 verification 置空（核验需针对新内容重跑）。
   */
  async restore(
    spaceId: string,
    conceptId: string,
    sourceCardId: string,
  ): Promise<DlCardRestoreResult> {
    const source = await this.db.dlCards?.getById(sourceCardId)
    if (!source || source.projectId !== spaceId || source.conceptId !== conceptId) {
      throw new Error('指定的讲义版本不存在或不属于该知识点')
    }
    const current = await this.db.dlCards?.getCurrentByConcept(spaceId, conceptId)
    const nextVersion = (current?.version ?? 0) + 1
    const newId = randomUUID()
    await this.db.dlCards!.create({
      id: newId,
      projectId: spaceId,
      conceptId,
      essenceType: source.essenceType,
      sections: source.sections,
      works: source.works,
      evidenceSources: source.evidenceSources,
      version: nextVersion,
      status: 'draft',
      // 核验不继承：新内容需重新核验（与 saveCard 升版同口径）
      verification: null,
      changeSource: 'restore',
      revisionNote: `恢复自 v${source.version}`,
    })
    // 概念挂最新 card（研究态保持 extracted；若之前是 unresearched 也提到 extracted，
    // 因为已有可阅读正文——与 saveCard 一致）
    await this.db.dlConcepts!.patch(conceptId, { cardId: newId, researchState: 'extracted' })
    logger.info(
      `[version] restore space=${spaceId} concept=${conceptId} v${source.version}→v${nextVersion} newCard=${newId}`,
    )
    return { cardId: newId, version: nextVersion, restoredFrom: source.version }
  }
}