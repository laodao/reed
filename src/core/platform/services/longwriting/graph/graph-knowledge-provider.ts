/**
 * 长文图谱结构化知识提供方（KE-4，34 号 v2 §4）
 * @module platform/services/longwriting/graph/graph-knowledge-provider
 *
 * 把 GraphService（关系）与 ConsistencyService（矛盾风险）组装为 KnowledgeSegment
 * 供给知识飞轮装配层。存储不收编——图谱表留在长文域。
 *
 * 名称→ID 解析：resolveEntities 要求 {type, name}（精确匹配）——对 topics 做
 * 6 类逐类尝试，未命中跳过（宁可少给不给错的）。目标实体名经 getNode 回查。
 */

import type {
  KnowledgeSegment,
  StructuredKnowledgeQuery,
} from '@core/platform/agent-runtime/memory/structured-provider'
import { registerStructuredProvider } from '@core/platform/agent-runtime/memory/structured-provider'
import { GraphService } from './graph.service'
import { ConsistencyService } from './consistency.service'
import { listResolutions, isAcknowledgedConflict } from '../conflict-gate'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'

const ENTITY_TYPES = ['character', 'location', 'item', 'faction', 'skill', 'event'] as const

interface GraphKnowledgeDeps {
  /** 可选：当前章推导（缺省不过滤章节——全时段有效关系） */
  resolveCurrentChapter?: (projectId: string) => Promise<number | null>
}

let installer: GraphKnowledgeDeps | null = null

/** 由长文侧装配（deps 仅提供章节推导；图服务按查询现场构造） */
export function installGraphKnowledgeProvider(d: GraphKnowledgeDeps): void {
  installer = d
  registerStructuredProvider({
    id: 'longwriting-graph',
    supports: (scope: { bizModule?: string; projectId?: string }) => scope.bizModule === 'longwriting' && !!scope.projectId,
    query: (req: StructuredKnowledgeQuery) => queryGraph(req),
  })
}

async function queryGraph(req: StructuredKnowledgeQuery): Promise<KnowledgeSegment[]> {
  const projectId = req.scope.projectId as string
  const budget = req.budget
  const graph = new GraphService()
  const consistency = new ConsistencyService()
  const segments: KnowledgeSegment[] = []
  let chars = 0
  const chapter = installer?.resolveCurrentChapter ? await installer.resolveCurrentChapter(projectId) : null

  for (const topic of req.topics) {
    if (segments.length >= budget.maxSegments || chars >= budget.maxChars) break
    for (const type of ENTITY_TYPES) {
      if (segments.length >= budget.maxSegments || chars >= budget.maxChars) break
      try {
        const [resolved] = await graph.resolveEntities(projectId, [{ type, name: topic }] as never)
        if (!resolved?.resolved || !resolved.id) continue
        const edges = await graph.getRelations(projectId, type, resolved.id, chapter ?? undefined)
        if (edges.length === 0) continue
        const text = `${topic} 当前关系：${edges
          .slice(0, 3)
          .map((e) => `${e.label || e.relationType}（${e.targetType}）`)
          .join('；')}`
        segments.push({ layer: 'L3', kind: 'structured-fact', text, source: { provider: 'longwriting-graph', ref: `${type}:${resolved.id}` } })
        chars += text.length
        break // 该 topic 已解析到实体，不再试其他类型
      } catch {
        /* 该类无此实体/查询失败——跳过（宁可少给不给错的） */
      }
    }
  }

  if (segments.length < budget.maxSegments && chars < budget.maxChars) {
    try {
      // 只注入待处理疑点：已登记（解决/知情保留）的是作者拍板"没问题"的，
      // 再当矛盾喂给生成等于把已了结的疑点重新渗进正文（忘川渡 8 疑点实测教训）
      // db 先于 Promise.all 解析——同步抛错不会孤儿化已创建的扫描 rejection
      const db = getCoreDatabaseManager()
      const [conflicts, rows] = await Promise.all([
        consistency.scanContradictions(projectId),
        listResolutions(db, projectId),
      ])
      const top = conflicts.filter((c) => !isAcknowledgedConflict(c, rows)).slice(0, 3)
      if (top.length > 0) {
        const text = `已知设定矛盾（生成时规避）：${top
          .map((c) => String((c as { description?: string }).description ?? (c as { message?: string }).message ?? ''))
          .filter(Boolean)
          .join('；')}`
        segments.push({ layer: 'L3', kind: 'structured-fact', text, source: { provider: 'longwriting-consistency', ref: projectId } })
        chars += text.length
      }
    } catch {
      /* 一致性检查失败不影响事实段 */
    }
  }
  return segments
}
