/**
 * 对话附件临时检索（C4 临时知识库，spec v2 §4）
 * @module core/modules/workflow/nodes/dialog-file-retriever
 * @description kb-retrieve / kb-qa 的"包含本对话上传的文件"检索范围：
 *              - collectDialogFileTexts：扫对话消息附件（document 类），用 core 的
 *                extract-text 现场解析文本（附件不持久化解析结果——文件本体在磁盘，
 *                运行时按需提取；读失败的单文件降级跳过）
 *              - retrieveFromDialogFiles：无向量的轻量检索——按查询词在分块上的
 *                出现频次打分（TF），score = occ / (occ + 1) 归一到 (0,1)，
 *                与 KB 余弦相似度同量纲可比后合并
 *
 *              与正式 KB 的分工：这里不建索引、不落库、不做嵌入——运行级临时
 *              文档集，零新表（附件元信息已在 messages.attachments 列）。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { extractTextFromFile, inferFileType } from '@core/utils/extract-text'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('DialogFileRetriever')

/** 对话附件解析出的文本文档 */
export interface DialogFileText {
  fileName: string
  /** 附件消息 ID（溯源用） */
  messageId: string
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
  getMessages?: (dialogId: string, limit: number) => Promise<Array<{ id: string; attachments?: Array<{ id?: string; type?: string; fileName?: string; filePath?: string }> | null }>>
  /** 文件解析（默认 extractTextFromFile + inferFileType） */
  extract?: (filePath: string, fileName: string) => Promise<string>
}

/** 收集对话附件文本（document 类；按 filePath 去重；单文件失败跳过不阻断） */
export async function collectDialogFileTexts(
  dialogId: string,
  deps: DialogFileDeps = {}
): Promise<DialogFileText[]> {
  const getMessages = deps.getMessages ?? (async (id, limit) => {
    const db = getCoreDatabaseManager()
    if (!db.messages) return []
    return db.messages.getRecent(id, limit) as never
  })
  const extract = deps.extract ?? (async (filePath, fileName) => {
    const type = inferFileType(fileName)
    if (!type) throw new Error(`不支持的文件类型：${fileName}`)
    return extractTextFromFile(filePath, type)
  })

  const messages = await getMessages(dialogId, MAX_MESSAGES)
  const seen = new Set<string>()
  const out: DialogFileText[] = []
  for (const msg of messages) {
    for (const att of msg.attachments ?? []) {
      if (att.type !== 'document' || !att.filePath) continue
      if (seen.has(att.filePath)) continue
      seen.add(att.filePath)
      try {
        const text = await extract(att.filePath, att.fileName ?? att.filePath)
        if (text.trim()) {
          out.push({ fileName: att.fileName ?? att.filePath, messageId: msg.id, text })
        }
      } catch (e) {
        logger.warn(`[DialogFileRetriever] 附件解析失败（跳过）：${att.fileName}`, e)
      }
    }
  }
  return out
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
  const files = await collectDialogFileTexts(dialogId)
  if (files.length === 0) return []
  return retrieveFromDialogFiles(files, query, topK).map(h => ({ ...h, source: 'dialog-file' as const }))
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
          documentId: `${file.messageId}:${file.fileName}`,
          documentName: file.fileName,
        })
      }
    }
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, Math.max(1, topK))
}
