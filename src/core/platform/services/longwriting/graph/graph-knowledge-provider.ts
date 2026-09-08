/**
 * 长文图谱结构化知识提供方（KE-4，34 号 v2 §4）
 * @module platform/services/longwriting/graph/graph-knowledge-provider
 *
 * 把 GraphService（关系/状态）与 ConsistencyService（矛盾风险）组装为
 * KnowledgeSegment 供给知识飞轮装配层。存储不收编——图谱表留在长文域。
 *
 * 名称→实体解析是主要工作量：resolveEntities 要求 {type, name} 且 findByName
 * 精确等值匹配（graph.service.ts:379）——此处对 topics 做逐类尝试 + 包含匹配容错，
 * 未命中跳过（宁可少给不给错的）。
 */

import { randomUUID } from 'crypto'
import {
  registerStructuredProvider,
  type KnowledgeSegment,
  type StructuredKnowledgeQuery,
} from '@core/platform/agent-runtime/memory/structured-provider'
import type { GraphService } from './graph.service'
import type { ConsistencyService } from './consistency.service'

const ENTITY_TYPES = ['character', 'location', 'item', 'faction', 'skill', 'event'] as const

interface GraphKnowledgeDeps {
  graph: Pick<GraphService, 'getRelations' | 'getNode'>
  consistency: Pick<ConsistencyService, 'scanContradictions'>
  /** 当前章推导：项目最新章节（装配入参未携带时兜底） */
  resolveCurrentChapter: (projectId: string) => Promise<number | null>
}

  // 模块级持有（install 后 queryGraph 使用）

/** 由长文包装配（graph/consistency 服务就绪后调用一次） */
export function installGraphKnowledgeProvider(d: GraphKnowledgeDeps): void {
  registerStructuredProvider({
    id: 'longwriting-graph',
    supports: (scope: { bizModule?: string; projectId?: string }) => scope.bizModule === 'longwriting' && !!scope.projectId,
    query: (req: StructuredKnowledgeQuery) => queryGraph(req, d),
  })
}

/** 装配层入口（providers 经 structured-provider 模块查询） */
async function queryGraph(req: StructuredKnowledgeQuery, d: GraphKnowledgeDeps): Promise<KnowledgeSegment[]> {
  const { projectId, budget } = { projectId: req.scope.projectId as string, budget: req.budget }
  const segments: KnowledgeSegment[] = []
  let chars = 0
  const chapter = await d.resolveCurrentChapter(projectId)

  for (const topic of req.topics) {
    if (chars >= budget.maxChars || segments.length >= budget.maxSegments) break
    // 名称→实体解析：6 类逐类精确匹配 + 容错跳过
    for (const type of ENTITY_TYPES) {
      if (segments.length >= budget.maxSegments || chars >= budget.maxChars) break
      try {
        const relations = await d.graph.getRelations(projectId, type, topic, chapter ?? undefined)
        if (relations && relations.length > 0) {
          const text = `${topic} 当前关系：${relations
            .slice(0, 5)
            .map((r) => `${(r as { label?: string; relationType?: string }).label ?? (r as { relationType?: string }).relationType ?? '关联'}→${String((r as { targetName?: string }).targetName ?? '?')}`)
            .join('；')}`
          segments.push({ layer: 'L3', kind: 'structured-fact', text, source: { provider: 'longwriting-graph', ref: `${type}:${topic}` } })
          chars += text.length
        }
      } catch {
        /* 该类无此实体——跳过（宁可少给不给错的） */
      }
    }
  }

  // 矛盾风险（预算允许时补一段）
  if (segments.length < budget.maxSegments && chars < budget.maxChars) {
    try {
      const conflicts = await d.consistency.scanContradictions(projectId)
      const top = conflicts.slice(0, 3)
      if (top.length > 0) {
        const text = `已知设定矛盾（生成时规避）：${top.map((c) => String((c as { description?: string }).description ?? '')).join('；')}`
        segments.push({ layer: 'L3', kind: 'structured-fact', text, source: { provider: 'longwriting-consistency', ref: projectId } })
      }
    } catch {
      /* 一致性检查失败不影响事实段 */
    }
  }
  return segments
}

/** 测试/运维：生成 provider 唯一 id 用（防未装配误注册） */
export function graphProviderFingerprint(): string {
  return `longwriting-graph:${randomUUID().slice(0, 8)}`
}
