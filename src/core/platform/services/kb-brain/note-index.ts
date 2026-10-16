/**
 * 知识卡检索索引（2026-10 M0-#7）：卡片 published 时写 note: 命名空间向量 + 倒排。
 * @module platform/services/kb-brain/note-index
 *
 * 背景（2026-10-10 审计）：全库不存在任何 note: 索引写入方——brain-query 的 note
 * 通道、平铺回退与 brain-provider 的卡片召回全部空转（读端在，写端从未存在）。
 * 本模块补上写入端：publish 钩子（kb-note.repository 漏斗）+ 启动回填存量 published 卡。
 *
 * 索引文本 = 标题 + 描述 + 正文节选（600 字）：检索命中主要靠论断式标题与
 * 「何时用我」描述（「标题即接口」），正文只保底。re-index 幂等（delete+reinsert），
 * evolveCard 后内容变更索引随之刷新。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbNoteRecord } from '@core/database/repositories/kb-note.repository'
import { setKbNotePublishHook } from '@core/database/repositories/kb-note.repository'
import type { KbVectorRepository } from '@core/database/repositories/kb-vector.repository'
import type { KbInvertedIndexRepository } from '@core/database/repositories/kb-inverted-index.repository'
import type { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { tokenizeForIndex } from '@core/platform/services/kb-tokenize'
import { parseBrainConfig } from './brain-config'
import { defaultBrainEmbed } from './smelt-common'

const logger = createLogger('KbNoteIndex')

const NOTE_BODY_EXCERPT = 600
/** 回填单库扫描上限（published 卡远小于此；防御异常库拖爆启动） */
const BACKFILL_SCAN_LIMIT = 1000

export interface NoteIndexDeps {
  embed: (texts: string[]) => Promise<number[][] | null>
  vectors: Pick<KbVectorRepository, 'createBatch' | 'deleteByChunkId' | 'findByChunkIds'>
  inverted: Pick<KbInvertedIndexRepository, 'insertBatch' | 'deleteByChunkId'> | null
  notes: KbNoteLister
  kbs?: Pick<KnowledgeBaseRepository, 'findById'> | null
}

/** 最小卡列表接口（真实 KbNoteRepository 满足；测试用桩收窄依赖面） */
export interface KbNoteLister {
  listByStatus(
    kbId: string,
    status: 'published',
    page: number,
    limit: number
  ): Promise<{ rows: KbNoteRecord[] }>
}

/** 卡片索引文本（导出供单测） */
export function noteIndexText(note: Pick<KbNoteRecord, 'title' | 'description' | 'body'>): string {
  return [note.title, note.description, (note.body ?? '').slice(0, NOTE_BODY_EXCERPT)]
    .filter((s) => s && s.trim().length > 0)
    .join('\n')
}

/** 单卡索引（幂等：note: 向量与倒推行先删后写）。返回是否实际写入。 */
export async function indexNoteWithDeps(
  deps: Pick<NoteIndexDeps, 'embed' | 'vectors' | 'inverted'>,
  kbId: string,
  note: Pick<KbNoteRecord, 'id' | 'title' | 'description' | 'body'>
): Promise<boolean> {
  const chunkId = `note:${note.id}`
  const text = noteIndexText(note)
  if (!text.trim()) return false
  let vectors: number[][] | null = null
  try {
    vectors = await deps.embed([text])
  } catch (e) {
    logger.warn(`[kb-note-index] 卡片嵌入失败 note=${note.id}: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
  if (!vectors || vectors.length !== 1) {
    logger.warn(`[kb-note-index] 卡片嵌入返回空 note=${note.id}（嵌入服务未配置？）`)
    return false
  }
  await deps.vectors.deleteByChunkId(chunkId)
  await deps.vectors.createBatch([{ chunkId, knowledgeBaseId: kbId, vector: vectors[0]! }])
  if (deps.inverted) {
    await deps.inverted.deleteByChunkId(chunkId)
    const terms = new Map<string, number>()
    for (const t of tokenizeForIndex(text)) terms.set(t, (terms.get(t) ?? 0) + 1)
    await deps.inverted.insertBatch(
      [...terms.entries()].map(([term, tf]) => ({ term, chunkId, knowledgeBaseId: kbId, termFrequency: tf }))
    )
  }
  return true
}

/**
 * 存量回填：为缺 note: 向量的 published 卡补建索引。返回补建张数。
 * 已索引的卡跳过（增量安全，可反复调用）。
 */
export async function ensureNotesIndexedWithDeps(deps: NoteIndexDeps, kbId: string): Promise<number> {
  const { rows } = await deps.notes.listByStatus(kbId, 'published', 1, BACKFILL_SCAN_LIMIT)
  if (rows.length === 0) return 0
  const existing = await deps.vectors.findByChunkIds(rows.map((r) => `note:${r.id}`))
  const missing = rows.filter((r) => !existing.has(`note:${r.id}`))
  let indexed = 0
  for (const note of missing) {
    const ok = await indexNoteWithDeps(
      { embed: (texts) => deps.embed(texts), vectors: deps.vectors, inverted: deps.inverted },
      kbId,
      note
    )
    if (ok) indexed += 1
  }
  return indexed
}

async function kbEmbeddingConfig(
  kbs: Pick<KnowledgeBaseRepository, 'findById'> | null,
  kbId: string
): Promise<string | null> {
  if (!kbs) return null
  try {
    const kb = await kbs.findById(kbId)
    return kb?.embeddingConfig ?? null
  } catch {
    return null
  }
}

interface NoteIndexRepos {
  vectors: KbVectorRepository
  inverted: KbInvertedIndexRepository | null
  notes: KbNoteLister
  kbs: Pick<KnowledgeBaseRepository, 'findById' | 'findAll'> | null
}

function reposFromDb(): NoteIndexRepos | null {
  const db = getCoreDatabaseManager()
  if (!db.kbNotes || !db.kbVectors) return null
  return {
    vectors: db.kbVectors,
    inverted: db.kbInvertedIndex ?? null,
    notes: db.kbNotes,
    kbs: db.knowledgeBases ?? null,
  }
}

/**
 * 装配（digest-orchestrator 安装点调用一次）：
 * 1. publish 钩子——此后任何卡片发布/演进即时建索引；
 * 2. 启动回填——所有启用大脑的库补齐存量 published 卡（后台执行不阻塞装配）。
 */
export function installKbNoteIndex(): void {
  setKbNotePublishHook(async (note) => {
    const repos = reposFromDb()
    if (!repos) return
    const embeddingConfig = await kbEmbeddingConfig(repos.kbs, note.knowledgeBaseId)
    await indexNoteWithDeps(
      {
        embed: (texts) => defaultBrainEmbed(texts, { id: note.knowledgeBaseId, embeddingConfig }),
        vectors: repos.vectors,
        inverted: repos.inverted,
      },
      note.knowledgeBaseId,
      note
    )
  })
  void (async () => {
    try {
      const repos = reposFromDb()
      if (!repos?.kbs) return
      const all = await repos.kbs.findAll()
      for (const kb of all) {
        if (!parseBrainConfig(kb.brainConfig ?? null)?.enabled) continue
        const embeddingConfig = await kbEmbeddingConfig(repos.kbs, kb.id)
        const indexed = await ensureNotesIndexedWithDeps(
          {
            embed: (texts) => defaultBrainEmbed(texts, { id: kb.id, embeddingConfig }),
            vectors: repos.vectors,
            inverted: repos.inverted,
            notes: repos.notes,
            kbs: repos.kbs,
          },
          kb.id
        )
        if (indexed > 0) logger.info(`[kb-note-index] kb=${kb.id} 回填 ${indexed} 张已发布卡片的检索索引`)
      }
    } catch (e) {
      logger.warn(`[kb-note-index] 存量回填失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })()
}
