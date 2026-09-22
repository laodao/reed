/**
 * 知识大脑·写作侧查询工具（AI SDK tool 形态）
 * @module platform/services/kb-brain/writing-brain-tool
 *
 * 长文章法生成（设计卡/正文）的拉取式消费通道：把 kb_brain_query 以 ai@6 tool
 * 形态交给写作模型，由模型在动笔前自主决定是否检索——与装配层被动注入互补
 * （用户决策 2026-09-22：提供查询工具，不做自动注入）。检索面=全部启用大脑
 * 的库（cap 3，与 brain-provider 同口径）。工具永不 throw：失败以文本返回，
 * 模型可自行继续写作，不阻断主链路。
 */
import { z } from 'zod'
import { tool } from 'ai'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('KbBrainWritingTool')

/** 检索面：启用大脑的库数量上限（与 brain-provider maxKbs 同口径） */
export const WRITING_BRAIN_MAX_KBS = 3
/** 单条结果正文截断（工具结果进模型上下文，体积必须收口） */
const HIT_CONTENT_CHARS = 240
/** 工具结果总体积上限（超限截断并注记） */
const RESULT_CHARS = 2600
/** 缺省每库条数 */
const DEFAULT_TOP_K = 4

export const WRITING_BRAIN_TOOL_NAME = 'kb_brain_query'

/** 动笔可用工具说明（仅拼接在工具位路径的 system prompt 末尾；非知识注入） */
export const BRAIN_TOOL_SYSTEM_NOTE =
  '\n\n【可用工具 kb_brain_query】动笔前你可以调用它检索「知识大脑」——跨作品沉淀的写作方法论' +
  '（经验卡）、类型套路与设定事实（论断）及原文出处。需要参考其他作品的写作手法、结构设计' +
  '或事实设定时先检索再写（至多 3 轮）；没有需要就不必调用。'

/** 检索命中行的最小形态（与 KnowledgeBaseService.search 的 SearchResult 结构子集对齐） */
export interface BrainSearchHit {
  kind?: string
  documentName?: string
  content: string
}

/** 可注入（测试）；生产走真实库与真实检索 */
export interface WritingBrainToolDeps {
  search?: (req: { knowledgeBaseId: string; query: string; topK: number }) => Promise<{
    success: boolean
    data?: BrainSearchHit[]
    error?: string
  }>
  listEnabledKbs?: () => Promise<Array<{ id: string }>>
}

/** 生产检索（与 kb_brain_query agent 工具同通道：brain 池 synthesize 查询） */
async function realSearch(req: { knowledgeBaseId: string; query: string; topK: number }) {
  const { KnowledgeBaseService } = await import('@core/platform/services/knowledge-base.service')
  const kbService = new KnowledgeBaseService()
  return kbService.search({
    knowledgeBaseId: req.knowledgeBaseId,
    query: req.query,
    topK: req.topK,
    include: ['chunk', 'atom', 'note'],
    intent: 'synthesize',
  }) as Promise<{ success: boolean; data?: BrainSearchHit[]; error?: string }>
}

/** 启用大脑的库列表（损坏配置视为未启用；无库=空） */
export async function listEnabledBrainKbs(deps?: Pick<WritingBrainToolDeps, 'listEnabledKbs'>): Promise<Array<{ id: string }>> {
  if (deps?.listEnabledKbs) return deps.listEnabledKbs()
  try {
    const { getCoreDatabaseManager } = await import('@core/database/database-manager.interface')
    const { parseBrainConfig } = await import('./brain-config')
    const all = (await getCoreDatabaseManager().knowledgeBases?.findAll()) ?? []
    return all
      .filter((kb) => {
        try {
          return parseBrainConfig(kb.brainConfig)?.enabled ?? false
        } catch {
          return false
        }
      })
      .slice(0, WRITING_BRAIN_MAX_KBS)
      .map((kb) => ({ id: kb.id }))
  } catch (e) {
    logger.warn('启用大脑库列表读取失败（视为无大脑）:', e instanceof Error ? e.message : String(e))
    return []
  }
}

/** 是否存在启用大脑的库（无→调用方直接走原链路，零行为变化） */
export async function hasEnabledBrainKb(deps?: Pick<WritingBrainToolDeps, 'listEnabledKbs'>): Promise<boolean> {
  return (await listEnabledBrainKbs(deps)).length > 0
}

const KIND_LABELS: Record<string, string> = { note: '经验卡', atom: '论断', chunk: '原文' }

/** 渲染单条命中（统一编号 + 类型中文标签 + 来源文档；content 收口） */
function renderHit(idx: number, hit: BrainSearchHit): string {
  const kindLabel = KIND_LABELS[hit.kind ?? ''] ?? '知识'
  const content = (hit.content || '').slice(0, HIT_CONTENT_CHARS)
  return `[${idx}] ${kindLabel}｜来源：${hit.documentName || '—'}｜${content}`
}

/**
 * 写作侧大脑查询工具（ai@6 ToolSet 条目）。
 * 结果为紧凑编号文本；无命中/失败均返回可读文本（模型自行决策继续），永不 throw。
 */
export function buildWritingBrainTool(deps?: WritingBrainToolDeps) {
  return tool({
    description:
      '查询知识大脑：跨作品检索已提炼的写作方法论（经验卡）、叙事套路与设定事实（论断）及原文出处。' +
      '动笔前需要参考类型规律、结构设计、吸引力手法或事实设定时调用；无需参考时不要调用。',
    inputSchema: z.object({
      query: z.string().min(1).describe('检索词（自然语言，如「开篇钩子手法」「修炼体系境界划分」）'),
      topK: z.number().int().min(1).max(8).optional().describe('每个知识库返回条数（缺省 4）'),
    }),
    execute: async (input) => {
      const query = typeof input?.query === 'string' ? input.query.trim() : ''
      if (!query) return '检索词为空，未执行检索。'
      const topK = Math.min(8, Math.max(1, Number(input?.topK) || DEFAULT_TOP_K))
      try {
        const kbs = await listEnabledBrainKbs(deps)
        if (kbs.length === 0) return '（当前没有启用的大脑，跳过检索。）'
        const lines: string[] = []
        let failedKbs = 0
        let failReason = ''
        let total = 0
        let idx = 1
        for (const kb of kbs.slice(0, WRITING_BRAIN_MAX_KBS)) {
          let res
          try {
            res = deps?.search
              ? await deps.search({ knowledgeBaseId: kb.id, query, topK })
              : await realSearch({ knowledgeBaseId: kb.id, query, topK })
          } catch (e) {
            failedKbs++
            failReason = e instanceof Error ? e.message : String(e)
            continue
          }
          if (!res.success) {
            failedKbs++
            failReason = res.error || '检索失败'
            continue
          }
          if (!res.data?.length) continue
          for (const hit of res.data) {
            const line = renderHit(idx++, hit)
            if (total + line.length > RESULT_CHARS) {
              lines.push('（结果已达体积上限，截断——如需更多请收窄检索词再查。）')
              return lines.join('\n')
            }
            lines.push(line)
            total += line.length
          }
        }
        if (lines.length === 0) {
          // 全库失败 ≠ 语料为空：不能把检索故障说成没有知识（误导模型）
          if (failedKbs > 0) {
            return `（大脑检索失败：${failedKbs}/${kbs.length} 个知识库不可用${failReason ? `：${failReason}` : ''}；请基于既有信息继续。）`
          }
          return `大脑中没有检索到与「${query}」直接相关的知识。`
        }
        return lines.join('\n')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logger.warn('写作侧大脑检索失败（返回文本降级）:', msg)
        return `（大脑检索失败：${msg}；请基于既有信息继续。）`
      }
    },
  })
}
