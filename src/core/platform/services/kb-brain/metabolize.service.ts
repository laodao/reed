/**
 * 知识大脑·代谢整固（T20/M4 v1，详细设计 §6.3）
 * @module platform/services/kb-brain/metabolize.service
 *
 * 周期整固（「睡眠巩固」类比）：classicScore 重算（实例×引用×收藏浮现经典性）、
 * 孤儿边收敛（端点已 stale/merged 的 leads-to 边降置信）、实体摘要凝练。
 * 软衰减只作用于调度/呈现层（当前为登记：检索 boost 待 brain 查询接入衰减因子）。
 * 触发：Electron 挂机时段 interval（dl-pace 先例；Web 端 web-disabled 同款限制）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import type { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'

const logger = createLogger('KbBrainMetabolize')

export interface MetabolizeDeps {
  repos?: () => {
    notes: KbNoteRepository
    edges: KbKnowledgeEdgeRepository
    atoms: { findByIds(ids: string[]): Promise<Array<{ id: string; status: string }>> }
    /** 全库 kbId 列表（原 allKbIds 私有全局调用，入注） */
    allKbIds: () => Promise<string[]>
  } | null
  intervalMs?: number
}

export class KbBrainMetabolizeService {
  private readonly reposFn: NonNullable<MetabolizeDeps['repos']>
  private readonly intervalMs: number
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(deps: MetabolizeDeps = {}) {
    this.reposFn =
      deps.repos ??
      (() => {
        const db = getCoreDatabaseManager()
        const kbs = db.knowledgeBases
        if (!db.kbNotes || !db.kbKnowledgeEdges || !db.kbAtoms || !kbs) return null
        return {
          notes: db.kbNotes,
          edges: db.kbKnowledgeEdges,
          atoms: db.kbAtoms,
          allKbIds: async () => (await kbs.findAll()).map((k) => k.id),
        }
      })
    this.intervalMs = deps.intervalMs ?? 24 * 60 * 60 * 1000
  }

  /** Electron 挂机整固（Web 多租户不启用——dl-pace 同款限制）；幂等，可重复调用 */
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.runAll().catch((e) => logger.warn(`[kb-metabolize] 周期整固失败: ${e instanceof Error ? e.message : String(e)}`))
    }, this.intervalMs)
    logger.info(`[kb-metabolize] 周期整固已启动（每 ${Math.round(this.intervalMs / 3600000)}h）`)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 全库整固（逐 kb；单 kb 失败不阻断） */
  async runAll(): Promise<{ kbs: number; classic: number; orphanEdges: number }> {
    if (this.running) return { kbs: 0, classic: 0, orphanEdges: 0 }
    this.running = true
    try {
      const repos = this.reposFn()
      if (!repos) return { kbs: 0, classic: 0, orphanEdges: 0 }
      const kbIds = await repos.allKbIds()
      let classic = 0
      let orphanEdges = 0
      for (const kbId of kbIds) {
        try {
          classic += await repos.notes.recomputeClassic(kbId)
          // 端点状态映射由服务层查询（仓储不做跨仓储调用）
          const allEdges = await repos.edges.graphSnapshot(kbId)
          const endpointIds = [...new Set(allEdges.edges.flatMap(([s, t]) => [s, t]))]
          const endpointAtoms = await repos.atoms.findByIds(endpointIds)
          const statusById = new Map(endpointAtoms.map((a) => [a.id, a.status]))
          orphanEdges += await repos.edges.decayOrphans(kbId, statusById)
        } catch (e) {
          logger.warn(`[kb-metabolize] kb=${kbId} 整固失败: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      if (kbIds.length > 0) {
        logger.info(`[kb-metabolize] 整固完成: kbs=${kbIds.length} classic 重算=${classic} 孤儿边降权=${orphanEdges}`)
      }
      return { kbs: kbIds.length, classic, orphanEdges }
    } finally {
      this.running = false
    }
  }


}
