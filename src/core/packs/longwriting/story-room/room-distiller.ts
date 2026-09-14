/**
 * 故事研讨室整理器（Distiller，v2.1 M4）
 * @module core/packs/longwriting/story-room/room-distiller
 *
 * 结构化的唯一来源（设计文档 §2.2）：HostKit 宿主 `story-room-distiller`，
 * 零工具、JSON-in-prompt，每轮产出一组结构化卡片。触发：按需提炼 / 单卡重提
 * （带反馈）。输出与 story-persist 落库函数的输入同构——采纳即直接落库。
 * 阶段门整编（全量提炼）复用 distill(scope)（M5 接线到门确认卡）。
 */

import { createLogger } from '@core/utils/logger'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { computeProductionState } from '@core/platform/services/longwriting/agent/agent-deps'
import { stateToSummary } from '@core/platform/services/longwriting/agent/agent-context'
import { extractJsonObject, persistChapter, persistCharacters, persistOverview, persistOutlineTree, persistPlots, persistWorld, type StoryPersistResult } from '@core/platform/services/longwriting/story-persist'
import { assessBibleReadiness, buildBibleGateError } from '@core/platform/services/longwriting/bible-readiness-gate'
import type { ArtifactCard, ArtifactCardKind, BibleDistillScope, DistillScope, RoomWorkspaceState } from '@shared/types/story-room.types'
import { emitRoomEvent } from './room-events'
import { getRoomState, patchRoomState } from './room-state'
import { ledgerSnapshotText } from './room-ledger'
import { generateRoomText } from './room-llm'
import { longwritingParams } from '@shared/utils/longwriting-params'

const logger = createLogger('StoryRoomDistiller')

export const ROOM_DISTILLER_DEFINITION_ID = 'story-room-distiller'

/**
 * 50 号评审 P1-3：研讨室是固定流程的旁路——大纲卡/章节草稿卡落库前与写作台同受圣经就绪门约束。
 * 概要/人物/故事线卡是圣经建设本身，不设门（否则流程无法起步）。
 */
async function bibleGateForPersist(m: any, projectId: string, purpose: string): Promise<string | null> {
  const [overview, characters, plots] = await Promise.all([
    m?.lwStoryOverviews?.getByProjectId(projectId),
    m?.lwCharacters?.getByProjectId(projectId),
    m?.lwPlots?.getByProjectId(projectId),
  ])
  return buildBibleGateError(purpose, assessBibleReadiness({ overview, characters, plots }).missing)
}

// 单次提炼卡片数上限 / 大纲叶子节点列出上限
// 见「参数设置 → 长文写作 → 故事研讨室」（`longwriting:storyRoom`），使用点现读。

// ==================== 提炼 prompt（输出与 story-persist 输入同构） ====================

const DISTILLER_PERSONA = `你是创作研讨室的「整理器」——把研讨共识整理为结构化卡片的后台角色。你不参与对话、不发挥创意：只依据「故事圣经」「共识账本」「研讨上下文」忠实整理，讨论中未确定的内容宁缺毋滥。

纪律：
1. 只输出一个 JSON 对象（可含数组字段），不加 markdown 代码块、不加解释文字。
2. 讨论中没有依据的字段留空字符串或空数组，不要编造。
3. 与共识账本冲突的内容以账本为准；已否决（rejected）的方向绝不能出现。`

function outlineStrategyNovel(nextVolume: number): string {
  return `本任务是第 ${nextVolume} 卷大纲（逐卷产出）。输出：
{"name":"卷名","summary":"本卷主线概述","estimatedWords":300000,"chapters":[{"name":"第N章 章节名","summary":"一句话要点+钩子","estimatedWords":3000}]}`
}

function outlineStrategyScript(nextEpisode: number): string {
  return `本任务是第 ${nextEpisode} 集分集大纲（逐集产出，短剧节奏）。输出：
{"index":${nextEpisode},"title":"集名","hook":"开头10秒钩子","reversal":"集尾反转/卡点","characters":["出场人物"],"scenes":[{"name":"场名","summary":"一场概要","timeOfDay":"日/夜"}]}`
}

const SCOPE_PROMPTS: Partial<Record<DistillScope, string>> = {
  overview: `整理「故事概要卡」。输出：
{"title":"作品名","storyType":"题材","summary":"两百字内概要","coreConflict":"核心冲突","hook":"钩子","keyCharacters":["主角名",...],"keyLocations":["关键地点",...],"estimatedChapters":预估章节数}`,
  characters: `整理「人物卡」——一次整理一个最重要的人物（依据讨论优先级）。输出：
{"name":"人物名","aliases":["别名/称呼，如 晓哥/林师妹"],"gender":"male/female/other","age":年龄或0,"rolePosition":"protagonist/supporting/minor","occupation":"身份","appearance":"外貌","background":"背景","personality":"性格","arc":"人物弧光","relations":[{"targetName":"对方名","relationType":"关系","description":"备注"}]}`,
  plots: `整理「故事线卡」——一次整理一条故事线。输出：
{"title":"故事线名","summary":"起点→冲突升级→终点","involvedCharacters":["人物名"],"entityRelations":[{"sourceName":"实体","targetName":"实体","relationType":"关系","description":"备注"}]}`,
  world: `整理「世界设定卡」（地点/势力/技能/物品四类，只收讨论中明确提到的）。输出：
{"locations":[{"name":"名称","type":"类型","importance":"core/main/auxiliary","description":"描述"}],"factions":[{"name":"名称","factionType":"类型","description":"描述"}],"skills":[{"name":"名称","type":"类型","level":"等级","description":"描述"}],"items":[{"name":"名称","type":"类型","level":"品级","description":"描述"}]}`,
  outline: '大纲（分卷/分集策略见任务说明）',
  foreshadow: `整理「伏笔卡」——一次整理一条伏笔（第 N 章埋、计划第 M 章收；章号未定则填 null）。输出：
{"content":"伏笔内容一句话","plantedChapter":埋设章节号或null,"planPayoffChapter":计划回收章节号或null}`,
  chapter: `整理「章节卡」——研讨室不产出正文，本卡是写作交接凭据（开头预览+本章要点）。输出：
{"outlineId":"对应大纲节点id（若上下文给了）","outlineName":"章节名","hook":"开场钩子","points":["本章要点1","本章要点2"],"preview":"开头两三句的预览（可写正文时直接续写）"}`,
}

function taskInstruction(scope: BibleDistillScope, state: RoomWorkspaceState, extra: string, dynamic?: { label: string; hint: string }): string {
  const target = state.contentTarget === 'script' ? '短剧剧本' : '长篇小说'
  const prompt = dynamic
    ? dynamic.hint
    : (SCOPE_PROMPTS as Record<string, string>)[scope] || ''
  return `【任务】把当前研讨成果整理为「${dynamic ? dynamic.label : scope}」卡片（内容目标：${target}）。${extra}
【输出要求】${prompt}`
}

/** `kind:<key>` 动态分类的 prompt 组装素材（P0：lw_bible_kinds 驱动） */
async function dynamicKindDef(m: any, scope: BibleDistillScope): Promise<{ key: string; label: string; hint: string } | null> {
  if (!scope.startsWith('kind:')) return null
  const key = scope.slice(5)
  const kind = await m?.lwBibleKinds?.getByKey(key)
  if (!kind) return null
  const fields = Array.isArray(kind.fieldsSchema) ? kind.fieldsSchema : []
  const fieldList = fields.map((f: any) => `"${f.key}":${f.type === 'number' ? '0' : '""'}`).join(',')
  const hint = kind.promptHint || `{${fieldList}}`
  return { key, label: kind.label, hint }
}

// ==================== 服务 ====================

export interface DistillResult {
  cards: ArtifactCard[]
  stopReason: string
}

export class StoryRoomDistillerService {
  private static instance: StoryRoomDistillerService | null = null

  private readonly busy = new Map<string, AbortController>()

  static getInstance(db?: any): StoryRoomDistillerService {
    if (!StoryRoomDistillerService.instance) {
      StoryRoomDistillerService.instance = new StoryRoomDistillerService(db)
    }
    return StoryRoomDistillerService.instance
  }

  constructor(private db?: any) {}

  private manager(): any {
    return this.db ?? getCoreDatabaseManager()
  }

  cancel(projectId: string): void {
    this.busy.get(projectId)?.abort(new Error('用户取消'))
  }

  /** 按需提炼：scope 卡片（pending 状态入账 + card:ready 事件）；scope 支持 `kind:<key>` 动态分类 */
  async distill(
    projectId: string,
    scope: BibleDistillScope,
    opts: { providerConfigId?: string; modelId?: string; feedback?: string; presetCard?: Partial<ArtifactCard> } = {},
  ): Promise<DistillResult> {
    if (this.busy.has(projectId)) {
      throw new Error('整理器正在整理中，请稍候')
    }
    const controller = new AbortController()
    this.busy.set(projectId, controller)
    try {
      return await this.doDistill(projectId, scope, opts, controller)
    } finally {
      this.busy.delete(projectId)
    }
  }

  private async doDistill(
    projectId: string,
    scope: BibleDistillScope,
    opts: { providerConfigId?: string; modelId?: string; feedback?: string; presetCard?: Partial<ArtifactCard> },
    controller: AbortController,
  ): Promise<DistillResult> {
    const m = this.manager()
    const state = await getRoomState(m, projectId)

    // 上下文：圣经 + 账本 + 摘要 + 范围素材
    let bibleText = ''
    try {
      bibleText = stateToSummary(await computeProductionState(m, projectId))
    } catch { /* fail-soft */ }
    const dynamic = await dynamicKindDef(m, scope)
    if (scope.startsWith('kind:') && !dynamic) {
      throw new Error(`未知的设定分类：${scope}`)
    }
    const extra = await this.scopeContext(m, projectId, scope, state)
    const system = DISTILLER_PERSONA
    // 研讨实录：整理器的原始素材——没有它，宁缺毋滥纪律会产出全空卡（真机评估教训）
    const transcript = await this.recentTranscript(m, projectId, 12)
    const user = [
      transcript && `【研讨实录】（最近对话原文，是你的整理素材）\n${transcript}`,
      `【故事圣经】\n${bibleText || '（暂无入库设定）'}`,
      ledgerSnapshotText(state.ledger) || '【共识账本】（空）',
      state.summary ? `【前情提要】\n${state.summary}` : '',
      taskInstruction(scope, state, opts.feedback ? `\n【用户反馈（按反馈重新提炼）】${opts.feedback}` : extra, dynamic ? { label: dynamic.label, hint: dynamic.hint } : undefined),
    ].filter(Boolean).join('\n\n')

    // 真机实测：JSON-only 指令经 loop/streamText 偶发空输出（NoOutputGenerated），
    // 同模型直调（generateText）稳定——整理器是单轮生成，统一走直调（保留 busy/事件/落库；
    // 代价：直调不经 RunRegistry/轨迹，观测面由本服务日志与卡片产物承担）。
    const raw = await generateRoomText('distill', { system, user }, opts, controller.signal)

    const parsed = extractJsonObject(raw)
    if (!parsed) {
      throw new Error(`整理器输出无法解析为结构化数据${raw ? `：${raw.slice(0, 80)}` : ''}`)
    }

    // 卡片化（人物/故事线可能一拆多；大纲按内容目标一卷/一集一张）
    const cards = this.buildCards(scope, parsed, state)
    if (opts.presetCard) {
      // 重提：继承原卡标识
      if (cards.length > 0 && opts.presetCard.volumeIndex) cards[0].volumeIndex = opts.presetCard.volumeIndex
    }
    if (cards.length === 0) {
      throw new Error('讨论素材尚不充分，整理不出有效卡片——先继续聊定关键要素吧')
    }

    const next: RoomWorkspaceState = {
      ...state,
      pendingCards: [...state.pendingCards, ...cards],
      cardSeq: state.cardSeq + cards.length,
    }
    await patchRoomState(m, projectId, { pendingCards: next.pendingCards, cardSeq: next.cardSeq })
    emitRoomEvent(projectId, { type: 'card:ready', cards })

    logger.info(`[story-room] 整理完成 project=${projectId} scope=${scope} cards=${cards.length}`)
    return { cards, stopReason: 'final' }
  }

  /** 最近研讨实录（lw_design_messages room 会话，压缩后作为整理素材） */
  private async recentTranscript(m: any, projectId: string, limit: number): Promise<string> {
    try {
      const rows = (await m.lwDesignMessages.getByConversationId(`room:${projectId}`)) || []
      return rows
        .slice(-limit)
        .map((r: any) => `${r.role === 'user' ? '作者' : '主编'}：${String(r.content ?? '').slice(0, 800)}`)
        .join('\n\n')
    } catch {
      return ''
    }
  }

  /** 范围素材：大纲需知道当前卷/集序号与已有结构 */
  private async scopeContext(m: any, projectId: string, scope: BibleDistillScope, state: RoomWorkspaceState): Promise<string> {
    // 「参数设置 → 长文写作 → 大纲叶子节点上限」：现读
    const { outlineLeafLimit } = longwritingParams().storyRoom
    if (scope === 'chapter') {
      const tree = (await m?.lwOutlines?.getTreeByProjectId(projectId)) || []
      const leaves = tree
        .filter((n: any) => n.nodeType === 'chapter' || n.nodeType === 'section')
        .slice(0, outlineLeafLimit)
      if (leaves.length === 0) return '\n【大纲】（空）——请先让用户完成大纲，或把章节对应到讨论中的章节划分'
      return `\n【大纲叶子节点】（章节卡对应其中一个）\n${leaves.map((n: any) => `- id=${n.id} ${n.name}`).join('\n')}`
    }
    if (scope !== 'outline') return ''
    if (state.contentTarget === 'script') {
      const adoptedCount = state.pendingCards.filter((c) => c.kind === 'outline' && c.status === 'adopted').length
      return outlineStrategyScript(adoptedCount + 1)
    }
    const tree = (await m?.lwOutlines?.getTreeByProjectId(projectId)) || []
    const volumes = tree.filter((n: any) => n.nodeType === 'volume')
    return outlineStrategyNovel(volumes.length + 1)
  }

  /** 解析结果 → 卡片（kind 决定拆分方式；标题/来源轮次/序号） */
  private buildCards(scope: BibleDistillScope, parsed: Record<string, any>, state: RoomWorkspaceState): ArtifactCard[] {
    const now = Date.now()
    const sourceTurns = [state.turnNo]
    const mk = (kind: ArtifactCardKind, title: string, data: Record<string, any>, volumeIndex?: number): ArtifactCard => ({
      id: `card_${state.cardSeq + 1}_${Math.random().toString(36).slice(2, 7)}`,
      kind,
      title,
      data,
      status: 'pending',
      sourceTurns,
      volumeIndex,
      createdAt: now,
    })

    // 「参数设置 → 长文写作 → 单次提炼卡片上限」：现读
    const { maxCardsPerDistill } = longwritingParams().storyRoom
    const out: ArtifactCard[] = []
    if (scope === 'characters') {
      const name = String(parsed.name || '').trim() || '未命名人物'
      out.push(mk('character', `人物卡 · ${name}`, parsed))
    } else if (scope === 'plots') {
      out.push(mk('plot', `故事线卡 · ${String(parsed.title || '').trim() || '未命名'}`, parsed))
    } else if (scope === 'overview') {
      out.push(mk('overview', `概要卡 · ${String(parsed.title || '').trim() || '未命名'}`, parsed))
    } else if (scope === 'world') {
      const counts = ['locations', 'factions', 'skills', 'items']
        .map((k) => (Array.isArray(parsed[k]) ? parsed[k].length : 0))
        .reduce((a: number, b: number) => a + b, 0)
      if (counts > 0) out.push(mk('world', '世界设定卡', parsed))
    } else if (scope === 'outline') {
      if (state.contentTarget === 'script') {
        out.push(mk('outline', `分集大纲卡 · 第 ${parsed.index ?? '?'} 集`, parsed, Number(parsed.index) || undefined))
      } else {
        out.push(mk('outline', `大纲卡 · ${String(parsed.name || '').trim() || '未命名卷'}`, parsed))
      }
    } else if (scope === 'chapter') {
      out.push(mk('chapter', `章节卡 · ${String(parsed.outlineName || parsed.name || '').trim() || '未命名章节'}`, parsed))
    } else if (scope === 'foreshadow') {
      const content = String(parsed.content || '').trim()
      if (content) out.push(mk('foreshadow', `伏笔卡 · ${content.slice(0, 12)}`, parsed))
    } else if (scope.startsWith('kind:')) {
      const key = scope.slice(5)
      const name = String(parsed.name || '').trim() || '未命名'
      out.push(mk('custom', `${key}卡 · ${name}`, { ...parsed, _kindKey: key }))
    }
    return out.slice(0, maxCardsPerDistill)
  }

  // ==================== 卡片操作 ====================

  private readonly adopting = new Set<string>()

  /** 采纳（可带轻编辑 patch）→ story-persist 落库 → 卡片终态（单飞防双击重复落库，评审 P2-11） */
  async adoptCard(
    projectId: string,
    cardId: string,
    patch?: Record<string, any>,
  ): Promise<ArtifactCard> {
    const m = this.manager()
    if (this.adopting.has(cardId)) throw new Error('该卡片正在采纳中')
    this.adopting.add(cardId)
    try {
      return await this.doAdopt(m, projectId, cardId, patch)
    } finally {
      this.adopting.delete(cardId)
    }
  }

  private async doAdopt(
    m: any,
    projectId: string,
    cardId: string,
    patch?: Record<string, any>,
  ): Promise<ArtifactCard> {
    const state = await getRoomState(m, projectId)
    const card = state.pendingCards.find((c) => c.id === cardId)
    if (!card) throw new Error(`卡片不存在：${cardId}`)

    // 轻编辑：patch 深度合并进 data（改一句话级别）
    const data = mergePatch(card.data, patch || {})
    let r: StoryPersistResult
    try {
      r = await this.persistByKind(m, projectId, card, data)
    } catch (e: any) {
      r = { ok: false, message: e?.message || '落库异常', changed: [] }
    }

    // skipped（全部已存在）视为已入库；失败置 failed（可再次采纳重试——find 不筛状态）
    const updated: ArtifactCard = {
      ...card,
      data,
      status: r.ok || r.skipped ? 'adopted' : 'failed',
      resultNote: r.ok || r.skipped ? r.message : r.message,
    }

    const pendingCards = state.pendingCards.map((c) => (c.id === cardId ? updated : c))
    await patchRoomState(m, projectId, { pendingCards })
    emitRoomEvent(projectId, { type: 'card:update', card: updated })
    return updated
  }

  /** 卡片按类型落库（public：设计包确认与 ⚡ 采纳共用同一路径） */
  async persistByKind(
    m: any,
    projectId: string,
    card: ArtifactCard,
    data: Record<string, any>,
  ): Promise<StoryPersistResult> {
    switch (card.kind) {
      case 'overview':
        return persistOverview(m, projectId, data)
      case 'character':
        return persistCharacters(m, projectId, [data])
      case 'plot':
        return persistPlots(m, projectId, [data])
      case 'world':
        return persistWorld(m, projectId, data)
      case 'outline': {
        if (card.data?.index !== undefined || data?.index !== undefined) {
          // 分集大纲卡：研讨室定稿即采纳（转短剧桥的分集种子，不落 lw_outlines）
          return { ok: true, message: '分集大纲已定稿（转短剧时作为该集种子）', changed: ['outline'] }
        }
        const gateErr = await bibleGateForPersist(m, projectId, '大纲')
        if (gateErr) return { ok: false, message: gateErr, changed: [] }
        const created = await persistOutlineTree(m, projectId, [data], 3)
        return { ok: true, message: `已建大纲卷「${data.name || ''}」（${created} 个节点）`, changed: ['outline'], data: { nodes: created } }
      }
      case 'chapter': {
        // 设计 §6.1「内容已写入草稿」：预览作为章节草稿落库（评审 A2），要点仍在卡上
        const outlineId = String(data.outlineId || '')
        if (!outlineId) {
          return { ok: true, message: '章节卡已定稿（未关联大纲节点，正文草稿未写入）', changed: ['chapters'] }
        }
        const gateErr = await bibleGateForPersist(m, projectId, '章节草稿')
        if (gateErr) return { ok: false, message: gateErr, changed: [] }
        const draft = [String(data.preview || ''), String(data.hook || '')].filter(Boolean).join('\n')
        const r2 = await persistChapter(m, projectId, { outlineId, content: draft || '（待写）' })
        if (!r2.ok) return r2
        const points = Array.isArray(data.points) ? data.points : []
        return { ok: true, message: `章节草稿已写入「${r2.data?.name ?? ''}」并建版本${points.length ? `（${points.length} 条要点见卡）` : ''}`, changed: ['chapters'] }
      }
      case 'foreshadow': {
        const row = await m?.lwForeshadows?.createRow(
          projectId, String(data.content || ''), (Number(data.plantedChapter) || null) as never,
          { type: 'discussion', turns: card.sourceTurns },
        )
        return { ok: !!row, message: row ? `伏笔已登记（${row.status === 'open' ? '未收' : row.status}）` : '伏笔落库失败', changed: ['world'] }
      }
      case 'custom': {
        const kindKey = String(data._kindKey || card.title.split('卡 · ')[0] || '')
        if (!kindKey) return { ok: false, message: '自定义分类缺失（_kindKey）', changed: [] }
        const rest: Record<string, unknown> = { ...data }
        delete rest._kindKey
        const row = await m?.lwCustomEntities?.createRow(
          projectId, kindKey, String(rest.name || ''), rest,
          { type: 'discussion', turns: card.sourceTurns },
        )
        return { ok: !!row, message: row ? `已保存「${row.name}」（${kindKey}）` : '自定义实体落库失败', changed: ['world'], data: { id: row?.id } }
      }
      default:
        return { ok: false, message: `卡片类型不支持采纳：${card.kind}`, changed: [] }
    }
  }

  /** 带反馈重提单卡：旧卡标记 ignored，新卡 pending（继承卷/集序号） */
  async regenerateCard(
    projectId: string,
    cardId: string,
    feedback: string,
    opts: { providerConfigId?: string; modelId?: string } = {},
  ): Promise<DistillResult> {
    const m = this.manager()
    const state = await getRoomState(m, projectId)
    const card = state.pendingCards.find((c) => c.id === cardId)
    if (!card) throw new Error(`卡片不存在：${cardId}`)
    const scope: BibleDistillScope = card.kind === 'character'
      ? 'characters'
      : card.kind === 'custom'
        ? (`kind:${(card.data as any)?._kindKey || ''}` as BibleDistillScope)
        : (card.kind as BibleDistillScope)
    const r = await this.distill(projectId, scope, { ...opts, feedback, presetCard: { volumeIndex: card.volumeIndex } })
    const m2 = await getRoomState(m, projectId)
    let oldCard: ArtifactCard | null = null
    const pendingCards = m2.pendingCards.map((c) => {
      if (c.id !== cardId) return c
      oldCard = { ...c, status: 'ignored' as const, feedback }
      return oldCard
    })
    await patchRoomState(m, projectId, { pendingCards })
    if (oldCard) emitRoomEvent(projectId, { type: 'card:update', card: oldCard })  // 评审 A7：旧卡终态广播
    return r
  }

  /** 忽略卡片 */
  async ignoreCard(projectId: string, cardId: string): Promise<ArtifactCard> {
    const m = this.manager()
    const state = await getRoomState(m, projectId)
    const card = state.pendingCards.find((c) => c.id === cardId)
    if (!card) throw new Error(`卡片不存在：${cardId}`)
    const updated: ArtifactCard = { ...card, status: 'ignored' }
    await patchRoomState(m, projectId, {
      pendingCards: state.pendingCards.map((c) => (c.id === cardId ? updated : c)),
    })
    emitRoomEvent(projectId, { type: 'card:update', card: updated })
    return updated
  }

}

/** 轻编辑 patch 深合并（对象递归、其余覆盖） */
function mergePatch(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = mergePatch(out[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}

/** 供 M5 阶段门使用：提炼 + 失败尾注（不抛错的包装） */
export async function distillSafe(
  projectId: string,
  scope: DistillScope,
  opts: { providerConfigId?: string; modelId?: string } = {},
): Promise<DistillResult | { error: string }> {
  try {
    return await StoryRoomDistillerService.getInstance().distill(projectId, scope, opts)
  } catch (e: any) {
    return { error: e?.message || '提炼失败' }
  }
}
