/**
 * 对话附件临时检索（C4 临时知识库，spec v2 §4）
 * @module core/platform/workflow/nodes/dialog-file-retriever
 * @description kb-retrieve / kb-qa 的"包含本对话上传的文件"检索范围：
 *              - collectDialogFileTexts：扫对话消息附件（document 类），用 core 的
 *                extract-text 现场解析文本（附件不持久化解析结果——文件本体在磁盘，
 *                运行时按需提取；读失败的单文件降级跳过）
 *              - retrieveFromDialogFiles：无向量的轻量检索——按查询词在分块上的
 *                出现频次打分（TF），score = occ / (occ + 1) ∈ (0,1)。
 *                注意：与 KB 余弦**不同量纲**（TF 命中一次即 0.5），合并时 dialog 命中
 *                按融合分排序而非直接比较数值——见 mergeRetrievalResults
 *
 *              与正式 KB 的分工：这里不建索引、不落库、不做嵌入——运行级临时
 *              文档集，零新表（附件元信息已在 messages.attachments 列）。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { Message } from '@shared/types/message.types'
import { extractTextFromFile, inferFileType } from '@core/utils/extract-text'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('DialogFileRetriever')

/** 对话附件解析出的文本文档 */
export interface DialogFileText {
  fileName: string
  /** 附件消息 ID（溯源用） */
  messageId: string
  /** 落盘路径（唯一标识与命中 documentId） */
  filePath: string
  text: string
}

/** 检索命中（与 KB SearchResult 对齐的最小面；documentId 用附件 id） */
export interface DialogFileHit {
  content: string
  score: number
  documentId: string
  documentName: string
}

/** 分块参数：~800 字符、100 重叠（与 KB chunk 量级一致，短文档单块） */
const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100
/** 扫描的消息条数上限（防超长对话全表扫） */
const MAX_MESSAGES = 200

/** 依赖注入面（测试用；默认走真实仓库与解析） */
export interface DialogFileDeps {
  /** 取对话消息（默认 getCoreDatabaseManager().messages.getRecent） */
  getMessages?: (dialogId: string, limit: number) => Promise<Message[]>
  /** 文件解析（默认 extractTextFromFile + inferFileType；测试注入） */
  extract?: (filePath: string, fileName: string) => Promise<string>
}

/** F8：附件类型常量（'document' 才参与文本检索；与 AttachmentType 联动） */
const ATTACHMENT_TYPE_DOCUMENT = 'document' as const

/** F6：命中标识用 filePath（同消息同名附件不再碰撞） */
const dialogDocumentId = (filePath: string): string => `dialog:${filePath}`

/** 收集对话附件文本（document 类；按 filePath 去重；单文件失败跳过不阻断） */
export async function collectDialogFileTexts(
  dialogId: string,
  deps: DialogFileDeps = {}
): Promise<DialogFileText[]> {
  const getMessages = deps.getMessages ?? (async (id, limit) => {
    const db = getCoreDatabaseManager()
    if (!db.messages) return []
    return db.messages.getRecent(id, limit) as Promise<Message[]>
  })
  const extract = deps.extract ?? (async (filePath, fileName) => {
    // F4：fileName 可能无扩展名（"季度报告"），回退用 filePath 推断
    const type = inferFileType(fileName) ?? inferFileType(filePath)
    if (!type) throw new Error(`不支持的文件类型：${fileName}`)
    return extractTextFromFile(filePath, type)
  })

  const messages = await getMessages(dialogId, MAX_MESSAGES)
  const seen = new Set<string>()
  const out: DialogFileText[] = []
  for (const msg of messages) {
    for (const att of msg.attachments ?? []) {
      if (att.type !== ATTACHMENT_TYPE_DOCUMENT || !att.filePath) continue
      if (seen.has(att.filePath)) continue
      seen.add(att.filePath)
      try {
        const text = await extract(att.filePath, att.fileName ?? att.filePath)
        if (text.trim()) {
          out.push({ fileName: att.fileName ?? att.filePath, messageId: msg.id, filePath: att.filePath, text })
        }
      } catch (e) {
        logger.warn(`[DialogFileRetriever] 附件解析失败（跳过）：${att.fileName}`, e)
      }
    }
  }
  return out
}

// ==================== F2：运行级附件解析缓存 ====================
// 同一 runId 内附件不会变——多个 kb 节点（kb-retrieve + kb-qa）复用解析结果，
// 避免 PDF/epub 重复解析（同步 IO 在主进程服务内，重复解析会显著拖慢运行）。
const dialogFileCache = new Map<string, DialogFileText[]>()
const DIALOG_CACHE_MAX_ENTRIES = 16

async function collectCached(dialogId: string): Promise<DialogFileText[]> {
  const hit = dialogFileCache.get(dialogId)
  if (hit) return hit
  const files = await collectDialogFileTexts(dialogId)
  if (dialogFileCache.size >= DIALOG_CACHE_MAX_ENTRIES) {
    // 简单淘汰：删最早键（run 生命周期内命中率高，超过 16 个并发对话的场景可忽略）
    dialogFileCache.delete(dialogFileCache.keys().next().value as string)
  }
  dialogFileCache.set(dialogId, files)
  return files
}

/** 测试用：清空缓存 */
export function resetDialogFileCache(): void {
  dialogFileCache.clear()
}

/** 中文兼顾的查询分词：CJK 双字滑窗 + 西文词元（≥2 字符） */
export function tokenizeQuery(query: string): string[] {
  const tokens: string[] = []
  const normalized = query.toLowerCase()
  // 西文/数字词元
  for (const m of normalized.matchAll(/[a-z0-9]{2,}/g)) tokens.push(m[0])
  // CJK 双字滑窗（单字歧义太大）
  const cjk = normalized.match(/[一-鿿]+/g) ?? []
  for (const seg of cjk) {
    for (let i = 0; i + 2 <= seg.length; i++) tokens.push(seg.slice(i, i + 2))
  }
  return [...new Set(tokens)]
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text]
  const chunks: string[] = []
  const step = CHUNK_SIZE - CHUNK_OVERLAP
  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + CHUNK_SIZE))
    if (i + CHUNK_SIZE >= text.length) break
  }
  return chunks
}

/** KB 检索结果最小面（与 SearchResult 对齐；dialog 命中同样落这个形状） */
export interface RetrievedChunk {
  documentId: string
  documentName: string
  content: string
  score: number
  source: 'kb' | 'dialog-file'
}

/**
 * 节点侧统一入口：include 开关 + triggerInfo.dialogId → 追加对话附件命中。
 * - 未开启 → 空数组（零开销）
 * - 开启但非对话触发（无 dialogId）→ 警告 + 空数组（向后兼容降级）
 */
export async function augmentWithDialogFiles(
  ctx: {
    triggerInfo: Readonly<Record<string, unknown>>
    logger: { warn(message: string, extra?: unknown): void }
  },
  include: boolean | undefined,
  query: string,
  topK: number
): Promise<RetrievedChunk[]> {
  if (!include) return []
  const dialogId = ctx.triggerInfo.dialogId
  if (typeof dialogId !== 'string' || !dialogId) {
    ctx.logger.warn('「包含对话文件」仅从 AI 对话中触发时生效（本次运行无对话来源，已忽略）')
    return []
  }
  const files = await collectCached(dialogId)
  if (files.length === 0) return []
  return retrieveFromDialogFiles(files, query, topK).map(h => ({ ...h, source: 'dialog-file' as const }))
}

/**
 * F1：合并 KB 与 dialog 命中（kb-retrieve / kb-qa 共用）。
 * 两路 score 不同量纲（余弦 vs TF），不能直接数值比较——dialog 命中按
 * 「用户刚上传的文件优先」原则排在 KB 命中之前，整体截断 topK。
 */
export function mergeRetrievalResults<T extends { source?: string }>(
  kbResults: T[],
  dialogHits: T[],
  topK: number
): T[] {
  return [...dialogHits, ...kbResults].slice(0, Math.max(1, topK))
}

/** topK 归一（catalog/表单/服务三处默认值的唯一计算点） */
export function effectiveTopK(v: number | undefined, fallback = 5): number {
  return v && v > 0 ? v : fallback
}

/**
 * 轻量检索：查询 token 在分块上的出现频次打分。
 * score = occ / (occ + 1)（命中越多越接近 1，无命中 0——不进结果）。
 */
export function retrieveFromDialogFiles(
  files: DialogFileText[],
  query: string,
  topK: number
): DialogFileHit[] {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0 || files.length === 0) return []
  const hits: DialogFileHit[] = []
  for (const file of files) {
    for (const chunk of chunkText(file.text)) {
      const chunkLower = chunk.toLowerCase()
      let occ = 0
      for (const token of tokens) {
        let idx = chunkLower.indexOf(token)
        while (idx >= 0) { occ++; idx = chunkLower.indexOf(token, idx + token.length) }
      }
      if (occ > 0) {
        hits.push({
          content: chunk,
          score: Number((occ / (occ + 1)).toFixed(4)),
          documentId: dialogDocumentId(file.filePath ?? file.fileName),
          documentName: file.fileName,
        })
      }
    }
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, Math.max(1, topK))
}
