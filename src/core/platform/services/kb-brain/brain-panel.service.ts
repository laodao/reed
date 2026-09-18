/**
 * 知识大脑·面板聚合服务（T12）
 * @module platform/services/kb-brain/brain-panel.service
 *
 * 渲染面板（配置/论断列表/卡片收件箱/视角卡/观感捕捉/统计）的读写聚合。
 * 薄服务：组装仓储调用，业务规则在编排器/蒸馏服务。
 * 多租户：仓储走 scoped（ALS 自动注入）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { randomUUID } from 'crypto'
import {
  parseBrainConfig,
  stringifyBrainConfig,
  defaultBrainConfig,
  type KbBrainConfig,
} from './brain-config'

export class KbBrainPanelService {
  /** 读取库的大脑配置（未配置返回缺省开启态的 null 语义：brainConfig=null=关闭） */
  async getConfig(kbId: string): Promise<{ success: boolean; data?: { config: KbBrainConfig | null; raw: string | null }; error?: string }> {
    const db = getCoreDatabaseManager()
    const kb = await db.knowledgeBases?.findById(kbId)
    if (!kb) return { success: false, error: '知识库不存在' }
    let config: KbBrainConfig | null = null
    try {
      config = parseBrainConfig(kb.brainConfig)
    } catch {
      config = null // 损坏配置面板显示为关闭（写回时 stringify 会响亮失败）
    }
    return { success: true, data: { config, raw: kb.brainConfig ?? null } }
  }

  /** 保存大脑配置（写前 stringify 校验——响亮失败，非法配置写不进库） */
  async updateConfig(kbId: string, patch: Partial<KbBrainConfig>): Promise<{ success: boolean; data?: KbBrainConfig; error?: string }> {
    const db = getCoreDatabaseManager()
    const kb = await db.knowledgeBases?.findById(kbId)
    if (!kb) return { success: false, error: '知识库不存在' }
    const merged: KbBrainConfig = { ...(kb.brainConfig ? parseBrainConfig(kb.brainConfig) ?? defaultBrainConfig(true) : defaultBrainConfig(true)), ...patch }
    const raw = stringifyBrainConfig(merged)
    const ok = await db.knowledgeBases!.update(kbId, { brainConfig: raw })
    if (!ok) return { success: false, error: '保存失败' }
    return { success: true, data: merged }
  }

  async listAtoms(input: {
    kbId: string
    documentId?: string
    page?: number
    pageSize?: number
    status?: string
    type?: string
  }): Promise<{ success: boolean; data?: { rows: unknown[]; total: number }; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbAtoms) return { success: false, error: '知识大脑未启用（旧库）' }
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
    const all = await db.kbAtoms.findByDocument(input.documentId ?? '', {
      status: input.status ? [input.status as never] : undefined,
    })
    const filtered = input.type ? all.filter((a) => a.type === input.type) : all
    const start = (page - 1) * pageSize
    return {
      success: true,
      data: { rows: filtered.slice(start, start + pageSize), total: filtered.length },
    }
  }

  async getAtom(atomId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbAtoms) return { success: false, error: '知识大脑未启用（旧库）' }
    const atom = await db.kbAtoms.findById(atomId)
    if (!atom) return { success: false, error: '论断不存在' }
    // superseded 血缘（§7.1 get-atom）
    let supersededBy: { id: string; statement: string } | null = null
    if (atom.supersededByAtomId) {
      const next = await db.kbAtoms.findById(atom.supersededByAtomId)
      if (next) supersededBy = { id: next.id, statement: next.statement }
    }
    return { success: true, data: { ...atom, supersededBy } }
  }

  async listNotes(input: { kbId: string; status?: string; type?: string; page?: number; pageSize?: number }): Promise<{ success: boolean; data?: { rows: unknown[]; total: number }; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbNotes) return { success: false, error: '知识大脑未启用（旧库）' }
    const status = input.status ?? 'published'
    const out = await db.kbNotes.listByStatus(input.kbId, status as never, Math.max(1, input.page ?? 1), Math.min(100, input.pageSize ?? 20), input.type as never)
    return { success: true, data: out }
  }

  async proposalInbox(input: { kbId: string; page?: number; pageSize?: number }): Promise<{ success: boolean; data?: { rows: unknown[]; total: number }; error?: string }> {
    return this.listNotes({ ...input, status: 'proposed' })
  }

  /** 审批动线：publish（可改写）/ reject（archived 留档） */
  async decideProposal(input: { noteId: string; action: 'publish' | 'publish-edited' | 'reject'; patch?: { title?: string; body?: string; description?: string } }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbNotes) return { success: false, error: '知识大脑未启用（旧库）' }
    if (input.action === 'reject') {
      const row = await db.kbNotes.reject(input.noteId)
      return row ? { success: true, data: row } : { success: false, error: '卡片不存在' }
    }
    const row = await db.kbNotes.publish(input.noteId, input.action === 'publish-edited' ? input.patch : undefined)
    return row ? { success: true, data: row } : { success: false, error: '卡片不存在' }
  }

  async listLenses(kbId: string): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbNotes) return { success: false, error: '知识大脑未启用（旧库）' }
    return { success: true, data: await db.kbNotes.listLens(kbId) }
  }

  /** 创建/更新视角卡（直接 published；lens_attention JSON） */
  async upsertLens(input: { kbId: string; id?: string; title: string; description: string; attendTo: string[]; questions: string[] }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbNotes) return { success: false, error: '知识大脑未启用（旧库）' }
    const row = await db.kbNotes.upsertLens(input.kbId, {
      id: input.id,
      title: input.title,
      description: input.description,
      lensAttention: JSON.stringify({ attendTo: input.attendTo, questions: input.questions }),
    })
    return { success: true, data: row }
  }

  /** 观感捕捉（human origin；原话保留，不参与自动裁决） */
  async captureReading(input: {
    kbId: string
    documentId: string
    chapterId?: string
    chapterHash?: string
    quote: string
    remark: string
    startOffset?: number
    endOffset?: number
    lensNoteId?: string
  }): Promise<{ success: boolean; data?: { atomId: string }; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbAtoms) return { success: false, error: '知识大脑未启用（旧库）' }
    if (!input.remark.trim()) return { success: false, error: '观感内容不能为空' }
    const [row] = await db.kbAtoms.createBatch([
      {
        knowledgeBaseId: input.kbId,
        statement: input.remark.trim().slice(0, 200),
        type: 'claim',
        certainty: 1.0,
        sourceDocumentId: input.documentId,
        sourceChapterId: input.chapterId ?? null,
        sourceChapterHash: input.chapterHash ?? null,
        sourceQuote: input.quote.slice(0, 200),
        startOffset: input.startOffset ?? null,
        endOffset: input.endOffset ?? null,
        lensNoteId: input.lensNoteId ?? null,
        extractionPass: 'human:ui',
        origin: 'human',
      },
    ])
    return { success: true, data: { atomId: row.id } }
  }

  /** 消化率仪表（§8.5 最小版） */
  async stats(kbId: string): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbAtoms || !db.kbNotes || !db.kbDigestPasses) return { success: false, error: '知识大脑未启用（旧库）' }
    const atomStats = await db.kbAtoms.statsByKb(kbId)
    const proposed = await db.kbNotes.listByStatus(kbId, 'proposed', 1, 1)
    const published = await db.kbNotes.listByStatus(kbId, 'published', 1, 1)
    const lenses = await db.kbNotes.listLens(kbId)
    const cost = await db.kbDigestPasses.costByKb(kbId)
    return {
      success: true,
      data: {
        atoms: atomStats,
        notes: { proposed: proposed.total, published: published.total },
        lensCount: lenses.length,
        openQuestions: atomStats.byType['open-question'] ?? 0,
        cost,
      },
    }
  }
}

let singleton: KbBrainPanelService | null = null

export function getKbBrainPanelService(): KbBrainPanelService {
  if (!singleton) singleton = new KbBrainPanelService()
  return singleton
}

// randomUUID 保留给后续 distill 批次 id 生成（M2 T14）
void randomUUID
