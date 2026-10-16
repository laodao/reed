/**
 * 知识大脑·agent 工具（v2 P2 升级：从「搜碎片」到「取知识包」）
 * @module platform/services/kb-brain/kb-brain-tools
 *
 * kb_brain_query v2：入参只要 task（写作任务描述）——意图路由/类型选择/预算
 * 全部服务端做（v2 设计 A/D 修订：参数越少调用失败率越低）。返回 prompt-ready
 * 知识包（套路卡/案例原文/原理/品类认知/书级档案，每条带出处）。
 * 知识包为空（新库还没冶炼产物）时回退旧平铺检索（论断/卡/原文切片）。
 * chat 宿主消费大脑的通道；注册：knowledge-base pack activate（幂等）。
 */
import { z } from 'zod'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'
import { getKbBrainPackService, type BrainPackResult } from './brain-pack.service'
import { recordConsumption } from './consumption-log.service'

const querySchema = z.object({
  task: z
    .string()
    .min(1)
    .describe('写作任务描述（写中取材：「写主角第一次宗门大比的打斗场面」；写前搭骨架：「给新书搭修真世界观大纲」）'),
  knowledgeBaseId: z.string().optional().describe('限定知识库（缺省=按任务品类自动匹配）'),
  topK: z.number().int().min(1).max(20).optional().describe('补充检索条数（缺省 3）'),
})

/** 工具依赖注入（测试）；生产走 brain-pack 单例 + KnowledgeBaseService */
export interface KbBrainQueryToolDeps {
  pack?: (req: { task: string; knowledgeBaseId?: string; topK?: number }) => Promise<BrainPackResult>
  /** 空包回退的平铺检索（缺省 KnowledgeBaseService.search） */
  fallbackSearch?: (req: { knowledgeBaseId?: string; query: string; topK: number }) => Promise<{
    success: boolean
    data?: Array<{ kind?: string; documentName?: string; content: string; atom?: { quote?: string } }>
    error?: string
  }>
}

export function buildKbBrainQueryToolDef(deps?: KbBrainQueryToolDeps): AgentToolDef {
  return {
    name: 'kb_brain_query',
    description:
      '查询知识库大脑，取「写作知识包」：按写作任务自动路由——写具体场面时返回场面套路（可复用骨架）、经典案例原文与相关设定；' +
      '开书搭骨架时返回品类认知（读者期待/爽点/雷点）、设定体系参考（层级树）、结构惯例（阶段链）、角色弧线惯例与套路菜单。每条知识带出处。' +
      '触发时机：动笔前（开新书/写大纲/设计世界观/构思人物，先调一次搭骨架包）与写具体场面时（按场面类型取材包）。' +
      '写小说/写文章需要参考同类作品的方法、套路、设定时调用；闲聊不要调用。',
    inputSchema: querySchema,
    dangerLevel: 'read',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: true,
    execute: async (input) => {
      const raw = (input ?? {}) as { task?: string; knowledgeBaseId?: string; topK?: number }
      const task = (raw.task ?? '').trim()
      if (!task) return { ok: false, error: 'task（写作任务描述）为空' }

      // 主路：知识包装配（意图路由 + 类型化取材 + 预算打包）
      const packFn =
        deps?.pack ??
        (async (req) => getKbBrainPackService().buildPack(req))
      try {
        const packed = await packFn({ task, knowledgeBaseId: raw.knowledgeBaseId, topK: raw.topK })
        if (packed.ok && packed.pack) {
          // v3 M3 消费记账：agent 真实取到知识包（可观测性；fail-soft）
          if (packed.kbId) void recordConsumption({ knowledgeBaseId: packed.kbId, tool: 'tool', mode: packed.mode, sceneType: packed.sceneType, task, packChars: packed.pack.length })
          return { ok: true, data: { mode: packed.mode, sceneType: packed.sceneType, kbId: packed.kbId, pack: packed.pack } }
        }
        if (packed.ok && !packed.pack) {
          return { ok: true, data: { mode: packed.mode, pack: `大脑里还没有与「${task}」相关的成品知识（可能尚未冶炼）——试试平铺检索或等待自动冶炼。` } }
        }
        // 装配失败（无启用库等）→ 降级平铺检索
      } catch {
        /* 主路失败走回退 */
      }

      // 回退：旧平铺检索（新库无冶炼产物时仍有论断/原文可查）
      const searchFn =
        deps?.fallbackSearch ??
        (async (req: { knowledgeBaseId?: string; query: string; topK: number }) => {
          const kbService = new KnowledgeBaseService()
          const kbId = req.knowledgeBaseId ?? (await firstEnabledKbId()) ?? ''
          return kbService.search({ knowledgeBaseId: kbId, query: req.query, topK: req.topK, include: ['chunk', 'atom', 'note'], intent: 'synthesize' })
        })
      const out = await searchFn({ knowledgeBaseId: raw.knowledgeBaseId, query: task, topK: raw.topK ?? 5 })
      if (!out.success) return { ok: false, error: out.error ?? '检索失败' }
      const rows = (out.data ?? []).map((r) => ({
        kind: r.kind ?? 'chunk',
        from: r.documentName,
        content: r.content,
        ...(r.atom?.quote ? { quote: r.atom.quote } : {}),
      }))
      return { ok: true, data: { mode: 'flat', hits: rows, total: rows.length } }
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
