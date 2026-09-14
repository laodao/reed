/**
 * 长文写作一致性校验服务（阶段 2）
 * @module core/platform/services/longwriting/graph/consistency.service
 *
 * 把 generateChapter systemPrompt 里的"禁止"文案升级为数据驱动检测：
 * - validateBeforeGeneration：章节生成前，检查本章大纲涉及实体的时间线冲突
 * - scanContradictions：全项目矛盾扫描（规则 R1-R6）
 *
 * 规则：
 * - R1 死亡后出场（确定性）：角色最新切片含死亡语义，且后续章节大纲仍 involved 该角色
 * - R2 关系失效后仍同框（确定性）：关系边 valid_until < 章节，后续大纲仍同时涉及两端角色
 * - R3 物品易主（半确定性）：物品切片 keyChanges 含易主语义，后续大纲仍涉及该物品
 * - R4 技能时间线（半确定性）：人物→技能 masters 边 valid_from > 引用章节
 * - R5 回忆冲突（标记检测）：大纲节点标记"回忆/闪回"，其涉及实体的历史与当前状态差异显著
 * - R6 状态回退（确定性）：实体切片序列出现"死亡/覆灭"后状态又恢复非终态
 * - R7 钩子节拍（49 号，script 分集项目）：缺集尾卡点标注 / 卡点未标钩型 / 相邻集钩子同型
 * - R8 伏笔台账（49 号，promise/payoff 台账）：回收早于埋设（倒置）/ 超期未收
 * - R9 名册外人名（52 号，来自图谱提取的「未登记人物」队列）：正文出现圣经外的人名，
 *   直指《大宋女捕》实跑最大的漂移症状，且不依赖关系边/状态切片数据
 */

import { getCoreDatabaseManager, type ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { listAcknowledgedKeys, filterBlockingConflicts } from '../conflict-gate'
import { buildOutlineDocOrder, outlineChapterNumber, type OutlineDocOrder } from '../outline-order'
import type { GraphEntityType } from '@shared/types/longwriting.types'
import { CLIFFHANGER_MARKER } from '../../writing-methodology'

export type ConflictSeverity = 'error' | 'warning'

export interface ConflictItem {
  rule: string
  severity: ConflictSeverity
  message: string
  entityType?: GraphEntityType
  entityId?: string
  entityName?: string
  chapterNumber?: number
}

/** 死亡语义关键词（状态切片文本命中即视为"已死亡"） */
const DEATH_KEYWORDS = ['死亡', '牺牲', '阵亡', '遇害', '战死', '陨落', '离世', '被杀', '丧生', '身亡']
/** 物品易主语义关键词 */
const TRANSFER_KEYWORDS = ['易主', '转手', '交出', '夺得', '夺走', '落入', '赠予', '获得', '易手', '失窃']
/** 回忆/闪回标记 */
const RECALL_KEYWORDS = ['回忆', '闪回', '回想', '往事', '记忆深处']
/** R8：伏笔埋设后超过该章数仍未回收 → 超期提醒（叙事节奏惯例 3-5 章一个悬念单元） */
const FORESHADOW_OVERDUE_CHAPTERS = 5

/**
 * R9 v2（52 号复测）：文本级人名候选扫描。
 * 常见姓氏 + 1~2 字，后接动作/言说类字词；排除名册名及其子串、排除常见非名词汇。
 * 出现 ≥minCount 次才报告——克制误报，交由人工确认「新角色入册 / 提取误报」。
 */
export const NAME_SCAN_SURNAMES =
  '王李张刘陈杨赵黄周吴徐孙马朱胡郭何高林郑谢罗宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'

const NAME_SCAN_STOPWORDS = new Set([
  '白色', '黑色', '红色', '黄色', '周围', '向自己', '怎么知', '我知', '你知', '她知', '他知', '一抹', '自家',
  '大人', '老爷', '小子', '老人', '少年', '女子', '男子', '众人', '左右', '下方', '上方', '背后', '面前',
  '早已', '已然', '忽然', '突然', '低声', '厉声', '沉声', '缓缓', '轻轻', '微微', '冷冷',
])

export function scanNameCandidates(
  chapters: Array<{ name: string; content: string }>,
  knownNames: string[],
  minCount = 3,
): Array<{ name: string; chapters: string[]; count: number }> {
  const known = new Set<string>()
  for (const k of knownNames) {
    const trimmed = String(k || '').trim()
    if (!trimmed) continue
    known.add(trimmed)
    // 名册名与其去括号核心互为已知，防止「乔镜知」vs「乔镜知（补充）」误报
    const core = trimmed.replace(/[（(][^）)]*[）)]/g, '').trim()
    if (core) known.add(core)
  }
  // 已知判定：完全相等 / 子串关系 / 同姓+称谓后缀（魏大人→魏宗简 尊称不报）
  const isKnown = (w: string): boolean => {
    if (known.has(w)) return true
    for (const k of known) {
      if (k.includes(w) || w.includes(k)) return true
      if (w.length >= 2 && k.length >= 2 && w[0] === k[0] && /[大人爷头儿老奶叔嫂]/.test(w.slice(1))) return true
    }
    return false
  }
  const counts = new Map<string, { count: number; chapters: Set<string> }>()
  for (const { name: chName, content } of chapters) {
    const text = content || ''
    for (const m of text.matchAll(new RegExp(`[${NAME_SCAN_SURNAMES}][\u4e00-\u9fa5]{1,2}?(?=的|说|道|看|问|站|走|伸手|抬|冷|沉|低|喊|带|让|把|在|和|与|已|曾|要|指|冲|退|押|皱|点|摇|回|瞪|盯|瞧|笑|哭|追|拦|挥|递|接|派|跟|到|来|去|提|应|答|劝|骂|训|扶|拉|推|挡|迎|送|陪|领|率|传|召|命|求|劝)`, 'g'))) {
      const w = m[0]
      if (NAME_SCAN_STOPWORDS.has(w)) continue
      if (isKnown(w)) continue
      const rec = counts.get(w) ?? { count: 0, chapters: new Set() }
      rec.count++
      rec.chapters.add(chName)
      counts.set(w, rec)
    }
  }
  return [...counts.entries()]
    .filter(([w, rec]) => rec.count >= minCount && !isKnown(w))
    .map(([name, rec]) => ({ name, chapters: [...rec.chapters], count: rec.count }))
    .sort((a, b) => b.count - a.count)
}

export class ConsistencyService {
  private static instance: ConsistencyService | null = null

  private readonly db: ICoreDatabaseManager | null

  constructor(db?: ICoreDatabaseManager | null) {
    this.db = db ?? null
  }

  static getInstance(): ConsistencyService {
    if (!ConsistencyService.instance) {
      ConsistencyService.instance = new ConsistencyService()
    }
    return ConsistencyService.instance
  }

  static resetInstance(): void {
    ConsistencyService.instance = null
  }

  private manager(): ICoreDatabaseManager | null {
    return this.db ?? getCoreDatabaseManager()
  }

  /**
   * 写前校验：生成章节 N 前，检查本章大纲节点涉及实体的时间线冲突。
   * @param projectId 项目
   * @param outlineId 目标章节大纲节点
   * @param chapterNumber 目标章节号（默认由 outline 推算）
   */
  async validateBeforeGeneration(projectId: string, outlineId: string, chapterNumber?: number): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []

    const outline = await m.lwOutlines?.getById(outlineId)
    if (!outline) return []

    const chapterNo = chapterNumber ?? this.calcChapterNumber(projectId, outlineId)
    const conflicts: ConflictItem[] = []

    // 涉及角色：查"目标章节时间点"的状态切片（而非最新），检测死亡后出场
    const involvedCharIds = outline.involvedCharacters || []
    if (involvedCharIds.length > 0) {
      const characters = (await m.lwCharacters?.getByProjectId(projectId)) || []
      for (const charId of involvedCharIds) {
        const char = characters.find(c => c.id === charId)
        const state = await m.lwEntityStates?.getEntityStateAtChapter(projectId, 'character', charId, chapterNo)
        if (state && this.hasDeathSemantics(state.stateSummary)) {
          conflicts.push({
            rule: 'R1',
            severity: 'error',
            message: `角色「${char?.name || charId}」在该时间点已死亡（第 ${state.chapterNumber} 章确认），本章大纲仍安排其出场`,
            entityType: 'character',
            entityId: charId,
            entityName: char?.name || charId,
            chapterNumber: chapterNo,
          })
        }
      }
    }

    // 涉及地点：检测被毁/覆灭（目标章节时间点）
    const involvedLocIds = outline.involvedLocations || []
    if (involvedLocIds.length > 0) {
      const locations = (await m.lwLocations?.getByProjectId(projectId)) || []
      for (const locId of involvedLocIds) {
        const loc = locations.find(l => l.id === locId)
        const state = await m.lwEntityStates?.getEntityStateAtChapter(projectId, 'location', locId, chapterNo)
        if (state && /被毁|毁灭|夷为平地|覆灭/.test(state.stateSummary)) {
          conflicts.push({
            rule: 'R1',
            severity: 'warning',
            message: `地点「${loc?.name || locId}」在该时间点已被毁（第 ${state.chapterNumber} 章确认），本章仍安排在此发生`,
            entityType: 'location',
            entityId: locId,
            entityName: loc?.name || locId,
            chapterNumber: chapterNo,
          })
        }
      }
    }

    return conflicts
  }

  /**
   * 全项目矛盾扫描。
   */
  /** 目标 outlineId 对应的章号（逐章门禁用） */
  async chapterNumberOf(projectId: string, outlineId: string): Promise<number> {
    return this.calcChapterNumber(projectId, outlineId)
  }

  /**
   * 52 号流程闭环：扫描第 1..uptoChapter 章（已写范围）的一致性疑点，
   * 剔除作者已登记（解决/知情保留）的与只引用未来章节的，剩余即阻断项。
   */
  async scanBlockingConflicts(projectId: string, uptoChapter: number): Promise<ConflictItem[]> {
    const all = await this.scanContradictions(projectId)
    const ack = await listAcknowledgedKeys(this.manager(), projectId)
    return filterBlockingConflicts(all, uptoChapter, ack)
  }

  async scanContradictions(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    conflicts.push(...await this.scanR1DeathAppearance(projectId))
    conflicts.push(...await this.scanR2ExpiredRelation(projectId))
    conflicts.push(...await this.scanR3ItemTransfer(projectId))
    conflicts.push(...await this.scanR4SkillTimeline(projectId))
    conflicts.push(...await this.scanR5Recall(projectId))
    conflicts.push(...await this.scanR6StateRegression(projectId))
    conflicts.push(...await this.scanR7HookRhythm(projectId))
    conflicts.push(...await this.scanR8ForeshadowLedger(projectId))
    conflicts.push(...await this.scanR9UnregisteredNames(projectId))
    return conflicts
  }

  // ==================== R1：死亡/覆灭后仍出场 ====================

  private async scanR1DeathAppearance(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const characters = (await m.lwCharacters?.getByProjectId(projectId)) || []
    const outlines = await this.sortedOutlines(projectId)

    for (const char of characters) {
      const latest = await m.lwEntityStates?.getLatestEntityState(projectId, 'character', char.id)
      if (!latest || !this.hasDeathSemantics(latest.stateSummary)) continue
      // 死亡章节之后仍被大纲涉及
      for (const o of outlines) {
        const chapterNo = await this.calcChapterNumber(projectId, o.id)
        if (chapterNo > latest.chapterNumber && (o.involvedCharacters || []).includes(char.id)) {
          conflicts.push({
            rule: 'R1',
            severity: 'error',
            message: `角色「${char.name}」已于第 ${latest.chapterNumber} 章死亡，但第 ${chapterNo} 章大纲仍涉及`,
            entityType: 'character',
            entityId: char.id,
            entityName: char.name,
            chapterNumber: chapterNo,
          })
        }
      }
    }
    return conflicts
  }

  // ==================== R2：关系失效后仍同框 ====================

  private async scanR2ExpiredRelation(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const edges = (await m.lwGraphEdges?.getByProjectId(projectId)) || []
    const outlines = await this.sortedOutlines(projectId)
    const characters = (await m.lwCharacters?.getByProjectId(projectId)) || []

    for (const edge of edges) {
      if (edge.validUntilChapter === undefined) continue
      // 只检查人物间关系
      if (edge.sourceType !== 'character' || edge.targetType !== 'character') continue
      const srcName = characters.find(c => c.id === edge.sourceId)?.name || edge.sourceId
      const tgtName = characters.find(c => c.id === edge.targetId)?.name || edge.targetId
      for (const o of outlines) {
        const chapterNo = await this.calcChapterNumber(projectId, o.id)
        const involved = o.involvedCharacters || []
        if (chapterNo > edge.validUntilChapter && involved.includes(edge.sourceId) && involved.includes(edge.targetId)) {
          conflicts.push({
            rule: 'R2',
            severity: 'warning',
            message: `关系「${srcName}↔${tgtName}（${edge.relationType}）」已于第 ${edge.validUntilChapter} 章失效，但第 ${chapterNo} 章大纲仍同时涉及双方（若非敌对互动请忽略）`,
            entityType: 'character',
            entityId: edge.sourceId,
            entityName: srcName,
            chapterNumber: chapterNo,
          })
        }
      }
    }
    return conflicts
  }

  // ==================== R3：物品易主后仍按旧持有引用 ====================

  private async scanR3ItemTransfer(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const items = (await m.lwItems?.getByProjectId(projectId)) || []
    const outlines = await this.sortedOutlines(projectId)

    for (const item of items) {
      const latest = await m.lwEntityStates?.getLatestEntityState(projectId, 'item', item.id)
      if (!latest) continue
      const changed = (latest.keyChanges || []).some(k => TRANSFER_KEYWORDS.some(kw => k.includes(kw)))
      if (!changed) continue
      for (const o of outlines) {
        const chapterNo = await this.calcChapterNumber(projectId, o.id)
        if (chapterNo > latest.chapterNumber && (o.involvedItems || []).includes(item.id)) {
          conflicts.push({
            rule: 'R3',
            severity: 'warning',
            message: `物品「${item.name}」在第 ${latest.chapterNumber} 章发生持有权变化，第 ${chapterNo} 章大纲仍涉及（请确认持有者一致）`,
            entityType: 'item',
            entityId: item.id,
            entityName: item.name,
            chapterNumber: chapterNo,
          })
        }
      }
    }
    return conflicts
  }

  // ==================== R4：技能时间线（学会前使用） ====================

  private async scanR4SkillTimeline(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const edges = (await m.lwGraphEdges?.getByProjectId(projectId)) || []
    const outlines = await this.sortedOutlines(projectId)
    const characters = (await m.lwCharacters?.getByProjectId(projectId)) || []
    const skills = (await m.lwSkills?.getByProjectId(projectId)) || []

    for (const edge of edges) {
      if (edge.sourceType !== 'character' || edge.targetType !== 'skill') continue
      if (edge.validFromChapter === undefined) continue
      const charName = characters.find(c => c.id === edge.sourceId)?.name || edge.sourceId
      const skillName = skills.find(s => s.id === edge.targetId)?.name || edge.targetId
      for (const o of outlines) {
        const chapterNo = await this.calcChapterNumber(projectId, o.id)
        const involved = o.involvedCharacters || []
        if (chapterNo > 0 && chapterNo < edge.validFromChapter && involved.includes(edge.sourceId)) {
          conflicts.push({
            rule: 'R4',
            severity: 'warning',
            message: `角色「${charName}」在第 ${edge.validFromChapter} 章才学会「${skillName}」，但第 ${chapterNo} 章大纲已涉及该角色（若本章未使用该技能可忽略）`,
            entityType: 'character',
            entityId: edge.sourceId,
            entityName: charName,
            chapterNumber: chapterNo,
          })
        }
      }
    }
    return conflicts
  }

  // ==================== R5：回忆/闪回标记检测 ====================

  private async scanR5Recall(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const outlines = await this.sortedOutlines(projectId)

    for (const o of outlines) {
      const summary = o.summary || ''
      if (!RECALL_KEYWORDS.some(kw => summary.includes(kw))) continue
      // 回忆章节：涉及实体若当前状态与历史差异大（如已死亡角色被回忆为活着），提示作者确认时间点
      const involvedCharIds = o.involvedCharacters || []
      if (involvedCharIds.length === 0) continue
      const characters = (await m.lwCharacters?.getByProjectId(projectId)) || []
      for (const charId of involvedCharIds) {
        const latest = await m.lwEntityStates?.getLatestEntityState(projectId, 'character', charId)
        const charName = characters.find(c => c.id === charId)?.name || charId
        if (latest && this.hasDeathSemantics(latest.stateSummary)) {
          conflicts.push({
            rule: 'R5',
            severity: 'warning',
            message: `本章标记为回忆（${summary.slice(0, 30)}…），角色「${charName}」当前已死亡（第 ${latest.chapterNumber} 章）；回忆内容须与回忆时间点一致`,
            entityType: 'character',
            entityId: charId,
            entityName: charName,
            chapterNumber: await this.calcChapterNumber(projectId, o.id),
          })
        }
      }
    }
    return conflicts
  }

  // ==================== R6：状态回退（死亡/覆灭后恢复） ====================

  private async scanR6StateRegression(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const snapshots = (await m.lwEntityStates?.getByProjectId(projectId)) || []

    // 按实体分组，按章节排序
    const byEntity = new Map<string, typeof snapshots>()
    for (const s of snapshots) {
      const key = `${s.entityType}:${s.entityId}`
      if (!byEntity.has(key)) byEntity.set(key, [])
      byEntity.get(key)!.push(s)
    }

    for (const [, list] of byEntity) {
      const sorted = [...list].sort((a, b) => a.chapterNumber - b.chapterNumber)
      let terminal = false
      for (const s of sorted) {
        const isTerminal = s.entityType === 'character'
          ? this.hasDeathSemantics(s.stateSummary)
          : /被毁|毁灭|覆灭/.test(s.stateSummary)
        if (terminal && !isTerminal) {
          conflicts.push({
            rule: 'R6',
            severity: 'warning',
            message: `实体「${s.entityName}」在章节 ${sorted.find(x => x.chapterNumber < s.chapterNumber && (x.entityType === 'character' ? this.hasDeathSemantics(x.stateSummary) : /被毁|毁灭|覆灭/.test(x.stateSummary)))?.chapterNumber ?? '?'} 章已进入终态（死亡/覆灭），第 ${s.chapterNumber} 章状态又恢复为非终态（若非重生/复活设定请检查）`,
            entityType: s.entityType as GraphEntityType,
            entityId: s.entityId,
            entityName: s.entityName,
            chapterNumber: s.chapterNumber,
          })
          terminal = false
        } else {
          terminal = isTerminal
        }
      }
    }
    return conflicts
  }

  // ==================== R7：钩子节拍（script 分集项目） ====================

  /**
   * R7 钩子节拍（49 号，仅对 script 分集项目生效——大纲 summary 带【集尾卡点】标记的过半判定）：
   * - 某集缺【集尾卡点】标注
   * - 卡点未标钩子类型（无法做轮换检查）
   * - 相邻两集钩子类型连续同型（行业惯例要求轮换防审美疲劳）
   */
  private async scanR7HookRhythm(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const outlines = (await m.lwOutlines?.getByProjectId(projectId)) || []
    // 集号 = 文档序章号（复核修复：orderIndex 兄弟序在多卷树上扁平排序会交错）
    const docOrder = buildOutlineDocOrder(outlines)
    const chapters = outlines
      .filter((o) => o.nodeType === 'chapter')
      .sort((a, b) => (docOrder.leafNumbers.get(a.id) ?? 0) - (docOrder.leafNumbers.get(b.id) ?? 0))
    if (chapters.length === 0) return []

    const marked = chapters.filter((c) => (c.summary || '').includes(CLIFFHANGER_MARKER))
    const isScriptProject = marked.length >= 2 && marked.length * 2 >= chapters.length
    if (!isScriptProject) return []

    const conflicts: ConflictItem[] = []
    let prevType: string | null = null
    let prevNo = 0
    for (const c of chapters) {
      const no = docOrder.leafNumbers.get(c.id) ?? (c.orderIndex || 0) + 1
      const summary = c.summary || ''
      if (!summary.includes(CLIFFHANGER_MARKER)) {
        conflicts.push({
          rule: 'R7',
          severity: 'warning',
          message: `第 ${no} 集缺【集尾卡点】标注（script 分集项目要求每集结尾必有卡点）`,
          chapterNumber: no,
        })
        prevType = null
        continue
      }
      const type = summary.match(/【集尾卡点】[^【]*（(.+?)钩）/)?.[1] || null
      if (!type) {
        conflicts.push({
          rule: 'R7',
          severity: 'warning',
          message: `第 ${no} 集卡点未标注钩子类型（悬念/危机/情绪/信息/反转），无法做轮换检查`,
          chapterNumber: no,
        })
        prevType = type
      } else if (prevType && prevType === type) {
        conflicts.push({
          rule: 'R7',
          severity: 'warning',
          message: `第 ${prevNo}-${no} 集钩子类型连续同型（${type}），建议轮换（悬念/危机/情绪/信息/反转）防审美疲劳`,
          chapterNumber: no,
        })
        prevType = type
      } else {
        prevType = type
      }
      prevNo = no
    }
    return conflicts
  }

  // ==================== R8：伏笔 promise/payoff 台账 ====================

  /**
   * R8 伏笔台账（49 号）：
   * - 台账倒置（error）：回收章早于埋设章——数据或提取错误
   * - 超期未收（warning）：status=open 且已写章节数超过埋设章 + 5（叙事节奏 3-5 章一个悬念单元）
   */
  /**
   * R9 名册外人名（52 号）：图谱提取时解析失败的人名会被登记进
   * 「未登记人物」队列（lw_custom_entities, kindKey=未登记人物）——
   * 每个名字出一条 warning，提示确认是新角色（入册）还是提取误报（忽略）。
   */
  private async scanR9UnregisteredNames(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m?.lwCustomEntities) return []
    const conflicts: ConflictItem[] = []
    // 1) 提取队列：解析失败的人名（52 号主实现）
    let rows: Array<{ id: string; name: string; fields?: Record<string, unknown> | null }> = []
    try {
      rows = await m.lwCustomEntities.getByProjectAndKind(projectId, '未登记人物')
    } catch {
      rows = []
    }
    for (const r of rows) {
      const ch = (r.fields as any)?.firstChapter
      conflicts.push({
        rule: 'R9',
        severity: 'warning',
        message: `正文出现名册外人名「${r.name}」（第 ${ch ?? '?'} 章提取）——若为新角色请补入人物圣经，若为提取误报请忽略`,
        entityType: 'character',
        entityId: r.id,
        entityName: r.name,
      })
    }
    // 2) R9 v2：正文姓氏扫描（52 号复测验证——提取器不提案的小人物（赵德全/陈头等）队列抓不到）
    try {
      if (m.lwCharacters && m.lwOutlines && m.lwChapters) {
        const chars = (await m.lwCharacters.getByProjectId(projectId)) || []
        const outlines = (await m.lwOutlines.getByProjectId(projectId)) || []
        const chapters: Array<{ name: string; content: string }> = []
        for (const o of outlines) {
          if (o.nodeType !== 'chapter') continue
          const c = await m.lwChapters.getByOutlineId(o.id)
          if (c?.content) chapters.push({ name: o.name, content: c.content })
        }
        const known = chars.map((c: any) => c.name)
        for (const cand of scanNameCandidates(chapters, known, 3)) {
          conflicts.push({
            rule: 'R9',
            severity: 'warning',
            message: `正文出现名册外人名「${cand.name}」（出现 ${cand.count} 次：${cand.chapters.join('、')}）——若为新角色请补入人物圣经，若为提取误报请忽略`,
            entityType: 'character',
            entityName: cand.name,
          })
        }
      }
    } catch {
      // 文本扫描失败不影响队列告警
    }
    return conflicts
  }

  private async scanR8ForeshadowLedger(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const foreshadows = (await m.lwForeshadows?.getByProjectId(projectId)) || []
    if (foreshadows.length === 0) return []

    // 已写章节数 = 有正文章节的最大文档序章号（复核修复：章号走文档序原语）
    const docOrder = await this.docOrderOf(projectId)
    const outlines = (await m.lwOutlines?.getByProjectId(projectId)) || []
    const chapterOutlines = outlines.filter((o) => o.nodeType === 'chapter')
    let writtenMax = 0
    for (const o of chapterOutlines) {
      const no = docOrder.leafNumbers.get(o.id)
      if (!no) continue
      const ch = await m.lwChapters?.getByOutlineId(o.id)
      if (ch?.content && ch.content.trim().length > 0) writtenMax = Math.max(writtenMax, no)
    }

    const conflicts: ConflictItem[] = []
    for (const f of foreshadows) {
      const label = (f.content || '').slice(0, 20)
      if (f.status === 'paid' && f.plantedChapter != null && f.payoffChapter != null && f.payoffChapter < f.plantedChapter) {
        conflicts.push({
          rule: 'R8',
          severity: 'error',
          message: `伏笔「${label}…」台账倒置：回收章（第 ${f.payoffChapter} 章）早于埋设章（第 ${f.plantedChapter} 章）`,
          chapterNumber: f.payoffChapter,
        })
      }
      if (f.status === 'open' && f.plantedChapter != null && writtenMax >= f.plantedChapter + FORESHADOW_OVERDUE_CHAPTERS) {
        conflicts.push({
          rule: 'R8',
          severity: 'warning',
          message: `伏笔「${label}…」第 ${f.plantedChapter} 章埋下，已写至第 ${writtenMax} 章仍未回收——考虑安排回收或标记弃置`,
          chapterNumber: f.plantedChapter,
        })
      }
    }
    return conflicts
  }

  // ==================== 内部工具 ====================

  private hasDeathSemantics(text: string): boolean {
    return DEATH_KEYWORDS.some(kw => text.includes(kw))
  }

  private async sortedOutlines(projectId: string): Promise<Array<{ id: string; nodeType?: string; level?: number; involvedCharacters?: string[]; involvedLocations?: string[]; involvedItems?: string[]; summary?: string }>> {
    const m = this.manager()
    if (!m) return []
    const all = (await m.lwOutlines?.getByProjectId(projectId)) || []
    return [...all].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
  }

  private async calcChapterNumber(projectId: string, outlineId: string): Promise<number> {
    const m = this.manager()
    if (!m) return 1
    // 复核修复 P1-1：orderIndex 是兄弟序，扁平全局排序在多卷/含节树上交错错位——
    // 统一走文档序原语（唯一章号权威）
    const all = (await m.lwOutlines?.getByProjectId(projectId)) || []
    const order = buildOutlineDocOrder(all)
    return outlineChapterNumber(order, outlineId) ?? 1
  }

  /** 项目大纲的文档序缓存（R7/R8 等多处消费；单次扫描内复用一次构建） */
  private async docOrderOf(projectId: string): Promise<OutlineDocOrder> {
    const m = this.manager()
    const all = m ? (await m.lwOutlines?.getByProjectId(projectId)) || [] : []
    return buildOutlineDocOrder(all)
  }
}
