/**
 * 知识大脑·agent 工具（T17/N4，详细设计 §8.3）
 * @module platform/services/kb-brain/kb-brain-tools
 *
 * kb_brain_query：agent 在对话/创作中主动查大脑（论断/思想卡/原文统一池）。
 * chat 宿主消费大脑的通道（system-agent scope=null 进不了装配通道，走工具化）。
 * 注册：knowledge-base pack activate（幂等；宿主 bindings 接线随创作试点）。
 */
import { z } from 'zod'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'

const querySchema = z.object({
  query: z.string().min(1).describe('检索词（自然语言或关键词）'),
  knowledgeBaseId: z.string().optional().describe('限定知识库（缺省=检索全部启用大脑的库）'),
  topK: z.number().int().min(1).max(20).optional().describe('返回条数（缺省 5）'),
})

export function buildKbBrainQueryToolDef(): AgentToolDef {
  return {
    name: 'kb_brain_query',
    description:
      '查询知识库大脑：返回与检索词相关的原子论断、思想卡与原文切片（带出处与原文引句）。' +
      '当需要创作素材、设定事实、类型规律、方法论或跨文档综合时调用；闲聊不要调用。',
    inputSchema: querySchema,
    dangerLevel: 'read',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: true,
    execute: async (input) => {
      const raw = (input ?? {}) as { query?: string; knowledgeBaseId?: string; topK?: number }
      const kbService = new KnowledgeBaseService()
      const out = await kbService.search({
        knowledgeBaseId: raw.knowledgeBaseId ?? (await firstEnabledKbId()) ?? '',
        query: raw.query ?? '',
        topK: raw.topK ?? 5,
        include: ['chunk', 'atom', 'note'],
        intent: 'synthesize',
      })
      if (!out.success) return { ok: false, error: out.error ?? '检索失败' }
      const rows = (out.data ?? []).map((r) => ({
        kind: r.kind ?? 'chunk',
        from: r.documentName,
        content: r.content,
        ...(r.atom ? { quote: r.atom.quote, status: r.atom.status } : {}),
        ...(r.context ? { context: r.context } : {}),
      }))
      return { ok: true, data: { hits: rows, total: rows.length } }
    },
  }
}

async function firstEnabledKbId(): Promise<string | null> {
  const { getCoreDatabaseManager } = await import('@core/database/database-manager.interface')
  const { parseBrainConfig } = await import('./brain-config')
  const all = await getCoreDatabaseManager().knowledgeBases?.findAll()
  if (!all) return null
  for (const kb of all) {
    try {
      if (parseBrainConfig(kb.brainConfig)?.enabled) return kb.id
    } catch {
      continue // 损坏配置视为未启用
    }
  }
  return null
}

const KB_BRAIN_PACK_ID = 'knowledge-base'

/** pack activate 注册（幂等） */
export function registerKbBrainTools(registry: AgentToolRegistry): void {
  const existing = new Set(registry.listSpecs().map((s) => s.name))
  if (!existing.has(`pack:${KB_BRAIN_PACK_ID}:kb_brain_query`)) {
    registry.register(buildKbBrainQueryToolDef(), { packId: KB_BRAIN_PACK_ID })
  }
}
