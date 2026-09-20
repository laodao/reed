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
  mergeBrainConfig,
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
    const base = kb.brainConfig ? parseBrainConfig(kb.brainConfig) ?? defaultBrainConfig(true) : defaultBrainConfig(true)
    // 段级深合并（mergeBrainConfig 与 parseBrainConfig 同段清单——浅合并/漏段会让嵌套 partial 丢 required 字段 → 校验炸）
    const merged: KbBrainConfig = mergeBrainConfig(base, patch)
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
    types?: string[]
    origin?: string
  }): Promise<{ success: boolean; data?: { rows: unknown[]; total: number }; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbAtoms) return { success: false, error: '知识大脑未启用（旧库）' }
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
    // 缺省状态=工作集（supported/suspected/stale）：superseded/archived 不出现在列表
    //（归纳合并后的碎片由归档层管理，显式传 status 可查全量）
    const workingSet = ['supported', 'suspected', 'stale'] as const
    const statusFilter = input.status ? [input.status as never] : [...workingSet]
    // 统一走 findByKb：documentId 与 type/types/origin/status 过滤可自由组合
    const all = await db.kbAtoms.findByKb(input.kbId, {
      status: statusFilter,
      type: input.type,
      types: input.types,
      origin: input.origin,
      documentId: input.documentId,
      // 内存分页的截断上限：翻页序号/总数以此为界（type 过滤已下推 SQL，此处是兜底上限）
      limit: 5000,
    })
    const start = (page - 1) * pageSize
    const rows = all.slice(start, start + pageSize)
    // 来源文档名（批量解析，仅当前页涉及的文档；解析不出保留 null 由前端回退）
    const docNames = new Map<string, string>()
    if (db.kbDocuments) {
      for (const id of [...new Set(rows.map((r) => (r as { sourceDocumentId?: string }).sourceDocumentId ?? ''))]) {
        if (!id) continue
        const doc = await db.kbDocuments.findById(id)
        if (doc) docNames.set(id, doc.name)
      }
    }
    return {
      success: true,
      data: {
        rows: rows.map((r) => {
          const rid = (r as { sourceDocumentId?: string }).sourceDocumentId ?? ''
          return { ...r, documentName: rid ? (docNames.get(rid) ?? null) : null }
        }),
        total: all.length,
      },
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
    const existing = await db.kbNotes.findById(input.noteId)
    if (!existing) return { success: false, error: '卡片不存在' }
    if (existing.status === 'archived') return { success: false, error: '已拒绝的卡片不可再发布（可重新提议）' }
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

  /** M4 技能导出：published 卡 → SKILL.md（YAML frontmatter + markdown，生态互通格式） */
  async exportSkill(noteId: string): Promise<{ success: boolean; data?: { fileName: string; content: string }; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbNotes) return { success: false, error: '知识大脑未启用（旧库）' }
    const note = await db.kbNotes.findById(noteId)
    if (!note) return { success: false, error: '卡片不存在' }
    if (note.status !== 'published') return { success: false, error: '仅已批准的卡片可导出' }
    let evidenceRefs: string[] = []
    try {
      evidenceRefs = (JSON.parse(note.evidence) as Array<Record<string, unknown>>).map((e) => String(e.atomId ?? e.noteId ?? '')).filter(Boolean)
    } catch {
      evidenceRefs = []
    }
    // YAML 标量安全（盲审 P2）：JSON.stringify 输出是合法的 YAML 双引号标量（单行、控制字符已转义）
    const safeName = note.title.replace(/[\\/:*?"<>|[\]{}'&#\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'untitled'
    const frontmatter = [
      '---',
      `name: ${JSON.stringify(safeName)}`,
      `description: ${JSON.stringify(note.description.replace(/\n/g, ' ').slice(0, 200))}`,
      `version: ${note.version}`,
      `origin: kb-brain/${note.type}`,
      `evidence-count: ${evidenceRefs.length}`,
      '---',
    ].join('\n')
    const body = [
      frontmatter,
      '',
      `# ${note.title}`,
      '',
      note.body || note.description,
      '',
      '## 证据锚点',
      ...(evidenceRefs.length > 0 ? evidenceRefs.map((id) => `- atom:${id}`) : ['-（无）']),
    ].join('\n')
    return { success: true, data: { fileName: `${safeName}.SKILL.md`, content: body } }
  }

  /** M4 品味侧写（§5.2）：各视角卡产物的 publish/cited 统计 → brain_state.taste */
  async computeTaste(kbId: string): Promise<{ success: boolean; data?: Record<string, number>; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbNotes || !db.kbAtoms || !db.knowledgeBases) return { success: false, error: '知识大脑未启用' }
    const lenses = await db.kbNotes.listLens(kbId)
    const weights: Record<string, number> = {}
    const rows = (await db.kbAtoms.findByKb(kbId, { limit: 500 })).filter(
      (a) => a.status === 'supported' || a.status === 'suspected',
    )
    for (const lens of lenses) {
      // 视角权重 = 该视角论断的被用次数之和（human 观感 ×2——用户自己的信号最强）
      weights[lens.id] = rows
        .filter((a) => a.lensNoteId === lens.id)
        .reduce((s, a) => s + a.useCount + (a.origin === 'human' ? 2 : 0), 0)
    }
    // 落 brain_state.taste（规范入口：parseBrainState 容错 + stringifyBrainState 统一写）
    const kb = await db.knowledgeBases.findById(kbId)
    if (kb) {
      const { parseBrainState, stringifyBrainState } = await import('./brain-config')
      const state = parseBrainState(kb.brainState)
      state.taste = { lensWeights: weights }
      await db.knowledgeBases.updateBrainState(kbId, stringifyBrainState(state))
    }
    return { success: true, data: weights }
  }

  /** 消化率仪表（§8.5 最小版） */
  async stats(kbId: string): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbAtoms || !db.kbNotes || !db.kbDigestPasses) return { success: false, error: '知识大脑未启用（旧库）' }
    const atomStats = await db.kbAtoms.statsByKb(kbId)
    // 头部「论断」口径=工作集（与列表缺省一致）；superseded/archived 归档层不计入
    const workingTotal =
      (atomStats.byStatus.supported ?? 0) + (atomStats.byStatus.suspected ?? 0) + (atomStats.byStatus.stale ?? 0)
    const proposed = await db.kbNotes.listByStatus(kbId, 'proposed', 1, 1)
    const published = await db.kbNotes.listByStatus(kbId, 'published', 1, 1)
    const lenses = await db.kbNotes.listLens(kbId)
    const cost = await db.kbDigestPasses.costByKb(kbId)
    return {
      success: true,
      data: {
        atoms: { ...atomStats, total: workingTotal },
        notes: { proposed: proposed.total, published: published.total },
        lensCount: lenses.length,
        openQuestions: atomStats.openQuestions ?? 0,
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
