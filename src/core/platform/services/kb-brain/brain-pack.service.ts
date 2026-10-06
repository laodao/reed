/**
 * 知识包装配（v2 P2 服务层）：从「搜碎片」到「取知识包」
 * @module platform/services/kb-brain/brain-pack.service
 *
 * 对齐写作四时刻中的「写前搭骨架 / 写中取材」（诊断/对标在 backlog，v2 设计 §4）：
 * - 意图路由：规则判定 task 属于写前（大纲/开书/世界观…）还是写中（场面取材）；
 * - sceneType 推断：从任务/情节概要文本推场面类型（不依赖上游章设计卡加字段）；
 * - 类型化取材：写中=套路卡→案例原文→原理→设定论断；写前=品类认知→设定体系→
 *   套路菜单→代表作档案；成品卡（冶炼产物）优先，设定论断经既有检索主路补充；
 * - 预算打包：分段按优先级装填，字符预算收口；每条带出处（自包含、prompt-ready）。
 * 库选择：按任务×库画像（genre/库名）匹配，命中才用，否则回落第一个启用库。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbNoteRepository, KbNoteRecord } from '@core/database/repositories/kb-note.repository'
import type { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { parseBrainConfig } from './brain-config'

const logger = createLogger('KbBrainPack')

/** 打包字符预算（进模型上下文的量级，与 writing-brain-tool RESULT_CHARS 同口径放宽） */
export const PACK_CHAR_BUDGET = 3200
/** 各段条数上限（优先级从高到低装填） */
const LIMITS = {
  scenePatterns: 2,
  sceneCases: 2,
  scenePrinciples: 1,
  sceneAtoms: 3,
  outlineGenre: 1,
  outlineSetting: 3,
  outlinePatternMenu: 5,
  outlineArchives: 2,
} as const

export type BrainPackMode = 'outline' | 'scene'

export interface BrainPackRequest {
  /** 写作任务描述（自然语言） */
  task: string
  knowledgeBaseId?: string
  topK?: number
}

export interface BrainPackResult {
  ok: boolean
  kbId?: string
  mode: BrainPackMode
  sceneType?: string
  /** prompt-ready markdown 知识包（自包含、每条带出处） */
  pack: string
  error?: string
}

interface PackNoteRepo {
  notes: Pick<KbNoteRepository, 'listByStatus'>
  kbs: Pick<KnowledgeBaseRepository, 'findAll' | 'findById'>
}

export interface BrainPackDeps {
  repos?: () => PackNoteRepo | null
  /** 设定论断补充检索（写中模式第 4 段）；缺省走 KnowledgeBaseService.search */
  searchAtoms?: (kbId: string, query: string, topK: number) => Promise<Array<{ content: string; documentName?: string; quote?: string }>>
}

/* ==================== 意图路由与场面推断（纯函数，导出供单测） ==================== */

const OUTLINE_HINTS = [
  '大纲', '开书', '新书', '立项', '世界观', '设定集', '搭骨架', '故事骨架', '第一卷',
  '整体规划', '背景设定', '开篇规划', 'story bible', '品类认知', '读者画像',
]

/** 写前/写中路由（规则判定——无需 LLM，零成本零延迟；缺省写中：生成途中是最高频时刻） */
export function routeIntent(task: string): BrainPackMode {
  return OUTLINE_HINTS.some((k) => task.includes(k)) ? 'outline' : 'scene'
}

const SCENE_KEYWORDS: Array<[string, string[]]> = [
  ['breakthrough', ['突破', '晋级', '渡劫', '进阶', '升阶', '凝结金丹', '结丹', '元婴']],
  ['battle', ['打斗', '战斗', '交手', '出手', '斗法', '厮杀', '对决', '比武', '大比']],
  ['probe', ['试探', '核查', '盘问', '考校', '把脉', '探底', '旁敲侧击', '查探']],
  ['deal', ['交易', '买卖', '交换', '拍卖', '收购', '灵石换', '谈价']],
  ['emotion', ['告白', '离别', '重逢', '情感', '心动', '误会', '和解', '情愫']],
  ['chase', ['追杀', '逃亡', '追逐', '围捕', '遁逃', '追捕']],
  ['scheme', ['谋划', '布局', '算计', '设局', '阴谋', '暗算', '布局落子']],
  ['reveal', ['揭露', '揭秘', '真相', '反转', '暴露', '揭晓', '身世之谜']],
  ['conflict', ['冲突', '对峙', '翻脸', '决裂', '争执', '发难']],
]

/** 从任务/情节概要文本推断场面类型（首Keyword命中；判不出 undefined=不按类型过滤） */
export function inferSceneType(text: string): string | undefined {
  for (const [type, words] of SCENE_KEYWORDS) {
    if (words.some((w) => text.includes(w))) return type
  }
  return undefined
}

/* ==================== 服务 ==================== */

export class KbBrainPackService {
  private readonly reposFn: () => PackNoteRepo | null
  private readonly searchAtomsFn: NonNullable<BrainPackDeps['searchAtoms']>

  constructor(deps: BrainPackDeps = {}) {
    this.reposFn =
      deps.repos ??
      ((): PackNoteRepo | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbNotes || !db.knowledgeBases) return null
        return { notes: db.kbNotes, kbs: db.knowledgeBases }
      })
    this.searchAtomsFn =
      deps.searchAtoms ??
      (async (kbId, query, topK) => {
        try {
          const { KnowledgeBaseService } = await import('@core/platform/services/knowledge-base.service')
          const out = await new KnowledgeBaseService().search({
            knowledgeBaseId: kbId,
            query,
            topK,
            include: ['atom'],
            intent: 'lookup',
          })
          if (!out.success) return []
          return (out.data ?? []).map((r) => ({
            content: r.content,
            documentName: r.documentName,
            quote: r.atom?.quote,
          }))
        } catch {
          return []
        }
      })
  }

  /** 知识包装配主入口（永不 throw——失败以 ok:false 返回，调用方自行降级） */
  async buildPack(req: BrainPackRequest): Promise<BrainPackResult> {
    try {
      const repos = this.reposFn()
      if (!repos) return { ok: false, mode: 'scene', pack: '', error: '大脑未启用' }
      const task = req.task.trim()
      if (!task) return { ok: false, mode: 'scene', pack: '', error: '任务描述为空' }

      const kb = await this.pickKb(repos, task, req.knowledgeBaseId)
      if (!kb) return { ok: false, mode: 'scene', pack: '', error: '没有启用大脑的知识库' }

      const mode = routeIntent(task)
      const sceneType = mode === 'scene' ? inferSceneType(task) : undefined
      const sections =
        mode === 'outline'
          ? await this.buildOutlineSections(kb.id, task, req.topK)
          : await this.buildSceneSections(kb.id, task, sceneType, req.topK)

      const header = `【写作知识包·${mode === 'outline' ? '开书搭骨架' : sceneType ? `场面取材（${sceneType}）` : '场面取材'}】（库：${kb.name}）`
      const pack = renderPack(header, sections)
      return { ok: true, kbId: kb.id, mode, sceneType, pack }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn(`[kb-pack] 装配失败: ${msg}`)
      return { ok: false, mode: 'scene', pack: '', error: msg }
    }
  }

  /** 库选择：任务×画像（genre/库名）token 匹配；无命中回落第一个启用库 */
  private async pickKb(
    repos: PackNoteRepo,
    task: string,
    explicitKbId?: string,
  ): Promise<{ id: string; name: string } | null> {
    if (explicitKbId) {
      const row = await repos.kbs.findById(explicitKbId)
      return row ? { id: row.id, name: row.name } : null
    }
    const all = await repos.kbs.findAll()
    let best: { id: string; name: string; score: number } | null = null
    for (const row of all) {
      let cfg: ReturnType<typeof parseBrainConfig>
      try {
        cfg = parseBrainConfig(row.brainConfig)
      } catch {
        continue
      }
      if (!cfg?.enabled) continue
      const genreTokens = (cfg.profile?.genre ?? '').split(/[/、\s,]+/).filter((t) => t.length >= 2)
      const nameTokens = row.name.split(/[/、\s,]+/).filter((t) => t.length >= 2)
      let score = 0
      for (const t of genreTokens) if (task.includes(t)) score += 2
      for (const t of nameTokens) if (task.includes(t)) score += 1
      if (!best || score > best.score) best = { id: row.id, name: row.name, score }
    }
    return best ? { id: best.id, name: best.name } : null
  }

  /* ---------- 写中：套路→案例原文→原理→设定论断 ---------- */
  private async buildSceneSections(kbId: string, task: string, sceneType: string | undefined, topK?: number) {
    const patterns = await this.published(kbId, 'plot-pattern', 30)
    const cases = await this.published(kbId, 'craft-case', 20)
    const principles = await this.published(kbId, 'principle', 10)

    const byScene = (rows: KbNoteRecord[]) =>
      sceneType ? rows.filter((r) => tagsOf(r).includes(`scene:${sceneType}`)) : []
    const scenePats = byScene(patterns)
    const chosenPats = (scenePats.length > 0 ? scenePats : patterns.slice(0, LIMITS.scenePatterns)).slice(0, LIMITS.scenePatterns)
    const chosenCases = (byScene(cases).length > 0 ? byScene(cases) : cases.slice(0, LIMITS.sceneCases)).slice(0, LIMITS.sceneCases)

    const sections: Array<{ title: string; lines: string[] }> = []
    if (chosenPats.length > 0) {
      sections.push({
        title: '可用套路（骨架 + 边界）',
        lines: chosenPats.map((p) => renderPattern(p)),
      })
    }
    if (chosenCases.length > 0) {
      sections.push({
        title: '经典案例（原文可引）',
        lines: chosenCases.map((c) => {
          const quote = evidenceQuoteOf(c) ?? '（见卡片原文段）'
          return `- ${c.title}\n  原文：“${quote}”`
        }),
      })
    }
    const chosenPrinciples = principles.slice(0, LIMITS.scenePrinciples)
    if (chosenPrinciples.length > 0) {
      sections.push({
        title: '相关原理',
        lines: chosenPrinciples.map((p) => `- ${p.title}：${p.description}`),
      })
    }
    const atoms = await this.searchAtomsFn(kbId, task, topK ?? LIMITS.sceneAtoms)
    if (atoms.length > 0) {
      sections.push({
        title: '设定惯例（论断）',
        lines: atoms.map((a) => `- ${a.content}${a.documentName ? `（出处：${a.documentName}）` : ''}`),
      })
    }
    return sections
  }

  /* ---------- 写前：品类认知→设定体系→套路菜单→代表作档案 ---------- */
  private async buildOutlineSections(kbId: string, task: string, topK?: number) {
    const sections: Array<{ title: string; lines: string[] }> = []

    const genre = await this.published(kbId, 'genre-insight', LIMITS.outlineGenre)
    if (genre.length > 0) sections.push({ title: '品类认知（读者期待/爽点/雷点）', lines: [genre[0]!.body] })

    const settingPatterns = (await this.published(kbId, 'setting-pattern', LIMITS.outlineSetting)).map(
      (p) => `- ${p.title}：${p.description}`,
    )
    const settingIndex = (await this.published(kbId, 'setting-index', LIMITS.outlineSetting)).map(
      (p) => `- ${p.title}（书级设定索引）`,
    )
    if (settingPatterns.length + settingIndex.length > 0) {
      sections.push({ title: '设定体系参考（设计自己的体系用，不是抄）', lines: [...settingPatterns, ...settingIndex] })
    }

    const patterns = await this.published(kbId, 'plot-pattern', 50)
    if (patterns.length > 0) {
      const menu = patterns
        .slice()
        .sort((a, b) => instanceCountOf(b) - instanceCountOf(a))
        .slice(0, LIMITS.outlinePatternMenu)
        .map((p) => `- 「${p.title}」（${instanceCountOf(p)} 实例）——${p.description}`)
      sections.push({ title: '套路菜单（按实例数排序）', lines: menu })
    }

    const archives = await this.published(kbId, 'book-outline', LIMITS.outlineArchives)
    if (archives.length > 0) {
      sections.push({ title: '代表作档案（书级大纲）', lines: archives.map((a) => `- ${a.title}`) })
    }
    void task
    void topK
    return sections
  }

  private async published(kbId: string, type: KbNoteRecord['type'], limit: number): Promise<KbNoteRecord[]> {
    const repos = this.reposFn()
    if (!repos || limit <= 0) return []
    const { rows } = await repos.notes.listByStatus(kbId, 'published', 1, limit, type)
    // 经典分排序（classicScore 由代谢整固按实例×引用重算）
    return rows.slice().sort((a, b) => b.classicScore - a.classicScore)
  }
}

/* ==================== 渲染与工具（导出供单测） ==================== */

function tagsOf(note: KbNoteRecord): string[] {
  try {
    return JSON.parse(note.tags) as string[]
  } catch {
    return []
  }
}

function instanceCountOf(note: KbNoteRecord): number {
  try {
    return (JSON.parse(note.patternInstances ?? '[]') as unknown[]).length
  } catch {
    return 0
  }
}

function evidenceQuoteOf(note: KbNoteRecord): string | null {
  try {
    const ev = JSON.parse(note.evidence) as Array<{ quote?: string }>
    const q = ev.find((e) => typeof e.quote === 'string' && e.quote.length > 0)?.quote
    return q ? q.slice(0, 160) : null
  } catch {
    return null
  }
}

/** 套路卡渲染：标题/频率/骨架/边界（自包含，供 agent 直接引用） */
export function renderPattern(p: KbNoteRecord): string {
  let steps: string[] = []
  try {
    steps = JSON.parse(p.patternSkeleton ?? '[]') as string[]
  } catch {
    steps = []
  }
  const freq = instanceCountOf(p)
  return [
    `- 「${p.title}」（${freq > 0 ? `${freq} 实例` : '已归纳'}）——${p.description}`,
    ...(steps.length ? [`  骨架：${steps.join(' → ')}`] : []),
  ].join('\n')
}

/** 分段按优先级装填 + 预算收口（超预算整段丢弃并注记，不截半段） */
export function renderPack(header: string, sections: Array<{ title: string; lines: string[] }>): string {
  const out: string[] = [header]
  let used = header.length
  let dropped = 0
  for (const s of sections) {
    if (s.lines.length === 0) continue
    const block = `\n\n## ${s.title}\n${s.lines.join('\n')}`
    if (used + block.length > PACK_CHAR_BUDGET) {
      dropped++
      continue
    }
    out.push(block)
    used += block.length
  }
  if (dropped > 0) out.push(`\n（另有 ${dropped} 个分段因篇幅未收录——可收窄任务描述再查。）`)
  return out.join('')
}

let singleton: KbBrainPackService | null = null

export function getKbBrainPackService(): KbBrainPackService {
  if (!singleton) singleton = new KbBrainPackService()
  return singleton
}
