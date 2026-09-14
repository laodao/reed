/**
 * 长文伴生数据级联清理服务（review 2026-09-14 修复）
 * @module core/platform/services/longwriting/purge.service
 *
 * 背景：lw_events / lw_graph_edges / lw_entity_state_snapshots / lw_vector_indices /
 * lw_custom_entities / lw_foreshadows 建表均无 FK（早期 DDL 纪律未延续到图谱时代的
 * 迁移文件），项目/实体/章节删除时这些伴生数据靠本服务显式清理——仓储层的
 * deleteByXxx 方法大多早已存在，缺的只是删除入口的"最后一公里接线"。
 *
 * 原则：
 * - 每个清理步骤独立容错并聚合结果（PurgeStepResult），不因伴生数据清理失败
 *   而让主数据删除失败——与既有 cleanupEntityGraphEdges 的 fail-soft 语义一致，
 *   但失败显式上报（调用方打 error 日志），不再静默。
 * - 向量库清理委托 LwVectorIndexService（同时清 IVectorStore chunk 与映射表）；
 *   向量子系统未初始化时该步记为 skipped/error，不影响其余步骤。
 */

import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import type { GraphEntityType } from '@shared/types/longwriting.types'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('LwPurge')

/** 单步清理结果 */
export interface PurgeStepResult {
  step: string
  deleted: number
  /** true = 子系统不可用，跳过（非错误） */
  skipped?: boolean
  error?: string
}

const UNREGISTERED_CHARACTER_KIND = '未登记人物'

export class LwPurgeService {
  constructor(private readonly db: ICoreDatabaseManager) {}

  // ==================== 项目级 ====================

  /**
   * 项目删除时清理全部伴生数据。主项目行由调用方（deleteProject）先行删除，
   * 基础表（characters/chapters 等）走 DB 层 FK CASCADE，这里只管无 FK 的伴生表。
   */
  async purgeProjectData(projectId: string): Promise<PurgeStepResult[]> {
    const m = this.db
    const results: PurgeStepResult[] = []
    // fn 允许返回 undefined（可选链调用的仓储可能未初始化）——按 0 计
    const run = async (
      step: string,
      fn: () => number | undefined | Promise<number | undefined>,
    ) => {
      try {
        const n = await fn()
        results.push({ step, deleted: typeof n === 'number' ? n : 0 })
      } catch (e: any) {
        results.push({ step, deleted: 0, error: e?.message || String(e) })
      }
    }

    await run('图谱边', () => m.lwGraphEdges?.deleteByProjectId(projectId))
    await run('事件', () => m.lwEvents?.deleteByProjectId(projectId))
    await run('实体状态切片', () => m.lwEntityStates?.deleteByProjectId(projectId))
    await run('章节状态摘要', () => m.lwChapterStateSummaries?.deleteByProjectId(projectId))
    await run('伏笔', () => m.lwForeshadows?.deleteByProjectId(projectId))
    await run('自定义实体(含未登记队列)', () => m.lwCustomEntities?.deleteByProjectId(projectId))
    await run('向量索引', async () => {
      const { LwVectorIndexService } = await import('./lw-vector-index.service')
      await LwVectorIndexService.getInstance().deleteByProject(projectId)
      return 0
    })
    return results
  }

  // ==================== 实体级 ====================

  /**
   * 实体（人物/地点/物品/技能/势力）删除时清理其伴生数据：
   * 图谱边（双向）、状态切片、向量 chunk；人物另清理未登记队列中同名条目
   * （该队列条目可能正是此角色的来源，留着会持续产生 R9 告警）。
   */
  async purgeEntityData(
    projectId: string,
    entityType: GraphEntityType,
    entityId: string,
    entityName?: string,
  ): Promise<PurgeStepResult[]> {
    const m = this.db
    const results: PurgeStepResult[] = []
    // fn 允许返回 undefined（可选链调用的仓储可能未初始化）——按 0 计
    const run = async (
      step: string,
      fn: () => number | undefined | Promise<number | undefined>,
    ) => {
      try {
        const n = await fn()
        results.push({ step, deleted: typeof n === 'number' ? n : 0 })
      } catch (e: any) {
        results.push({ step, deleted: 0, error: e?.message || String(e) })
      }
    }

    await run('图谱边', () => m.lwGraphEdges?.deleteByEntity(projectId, entityType, entityId))
    await run('状态切片', () => m.lwEntityStates?.deleteByEntity(projectId, entityType, entityId))
    await run('向量索引', async () => {
      const { LwVectorIndexService } = await import('./lw-vector-index.service')
      await LwVectorIndexService.getInstance().deleteByEntity(projectId, entityType, entityId)
      return 0
    })
    if (entityType === 'character' && entityName && m.lwCustomEntities) {
      await run('未登记队列同名条目', async () => {
        const rows = await m.lwCustomEntities!.getByProjectAndKind(projectId, UNREGISTERED_CHARACTER_KIND)
        let n = 0
        for (const r of rows) {
          if (r.name === entityName && (await m.lwCustomEntities!.deleteRow(r.id))) n++
        }
        return n
      })
    }
    return results
  }

  // ==================== 章节级 ====================

  /**
   * 章节删除（删大纲章/节节点）时清理按 (projectId, chapterNumber) 键挂载的伴生数据。
   * 注意：后续章节的伴生数据仍按旧章号键挂（删除会引发整体重排），彻底的重编号
   * 迁移不在本服务范围（已登记为后续项）。
   */
  async purgeChapterDerivedData(projectId: string, chapterNumber: number): Promise<PurgeStepResult[]> {
    const m = this.db
    const results: PurgeStepResult[] = []
    // fn 允许返回 undefined（可选链调用的仓储可能未初始化）——按 0 计
    const run = async (
      step: string,
      fn: () => number | undefined | Promise<number | undefined>,
    ) => {
      try {
        const n = await fn()
        results.push({ step, deleted: typeof n === 'number' ? n : 0 })
      } catch (e: any) {
        results.push({ step, deleted: 0, error: e?.message || String(e) })
      }
    }

    await run('事件', () => m.lwEvents?.deleteByChapter(projectId, chapterNumber))
    await run('关系演变边', () => m.lwGraphEdges?.deleteByOriginChapter(projectId, chapterNumber))
    await run('状态切片', () => m.lwEntityStates?.deleteByChapterNumber(projectId, chapterNumber))
    await run('提取段伏笔', () => m.lwForeshadows?.deleteExtractByChapter(projectId, chapterNumber))
    await run('向量索引', async () => {
      const { LwVectorIndexService } = await import('./lw-vector-index.service')
      await LwVectorIndexService.getInstance().deleteByChapter(projectId, chapterNumber)
      return 0
    })
    return results
  }

  /** 汇总打日志：有失败步骤时 error 级，否则 debug 级 */
  logResults(context: string, results: PurgeStepResult[]): void {
    const failed = results.filter((r) => r.error)
    if (failed.length > 0) {
      logger.error(`[${context}] 伴生数据清理存在失败步骤: ${JSON.stringify(failed)}`)
    } else {
      const total = results.reduce((s, r) => s + r.deleted, 0)
      logger.info(`[${context}] 伴生数据清理完成，共 ${total} 行`)
    }
  }
}
