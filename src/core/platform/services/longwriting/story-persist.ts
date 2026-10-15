/**
 * 故事结构化成果落库（故事研讨室 v2.1 M1：从 agent-actions.ts 抽取的落库段）
 * @module core/platform/services/longwriting/story-persist
 *
 * 纯落库函数：输入 = 解析后的结构化数据（整理器卡片与旧 agent 生成结果同构），
 * 内部不做任何 AI 调用（章节图谱流水线例外，经参数注入 ai）。旧 agent-actions
 * 与研讨室 adoptCard 共用本模块——「复用经过测试的持久化逻辑，与旧对话 UI 无关」。
 * 落库行为与原内联实现逐字段等价（对照单测 + 旧 workflow spec 回归双保险）；
 * 两处已登记的刻意差异：回执 data 形状（characters/plots 包一层对象键）与
 * write_chapter 的 outlineId 校验时机（提前到生成前）——消费方均已核实不受影响。
 */

import { createLogger } from '@core/utils/logger'

const logger = createLogger('StoryPersist')

/** 落库结果（研讨室卡片采纳回执 / 旧动作摘要的共同底座） */
export interface StoryPersistResult {
  ok: boolean
  /** ok=false 时区分「全部已存在（跳过）」与「数据无效（失败）」 */
  skipped?: boolean
  message: string
  changed: string[]
  data?: Record<string, unknown>
}

// ==================== JSON 容错解析（原 agent-actions 同款，迁出共用） ====================

/** 从 AI 输出提取 JSON 对象（容忍 markdown 代码块/前后杂文） */
export function extractJsonObject(text: string): any | null {
  if (!text) return null
  let s = text.trim()
  s = s.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(s.substring(first, last + 1))
    } catch {
      /* 继续尝试数组提取 */
    }
  }
  return null
}

/** 从 AI 输出提取 JSON 数组 */
export function extractJsonArray(text: string): any[] | null {
  if (!text) return null
  let s = text.trim()
  s = s.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const first = s.indexOf('[')
  const last = s.lastIndexOf(']')
  if (first !== -1 && last > first) {
    try {
      const v = JSON.parse(s.substring(first, last + 1))
      return Array.isArray(v) ? v : null
    } catch {
      return null
    }
  }
  return null
}

// ==================== 概要 ====================

/**
 * 概要 upsert（原 executeGenerateOverview 落库段）。
 * data 字段缺省时回落库内现有值；overview 行缺失时先建行再更新（防假成功）。
 */
/** 按候选键序列取第一个非空字符串值（概要卡中英文键名兼容） */
function pickOverviewText(obj: any, keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

/**
 * 概要卡归一化（复测实跑修复）：模型产出 {书名/一句话前提/核心冲突/钩子/主要人物…}
 * 中文键名，统一映射到概要实体字段；钩子并入 summary（无独立字段）。
 */
export function normalizeOverviewInput(data: any): any {
  if (!data || typeof data !== 'object') return data
  const title = pickOverviewText(data, ['title', '书名', '作品名', '标题']) || data.title
  const summary = pickOverviewText(data, ['summary', '一句话前提', '前提', '故事梗概', '梗概', '故事简介', '简介', '概要'])
  const hook = pickOverviewText(data, ['hook', '钩子'])
  const coreConflict = pickOverviewText(data, ['coreConflict', '核心冲突', '冲突', '主线冲突'])
  const coreIdea = pickOverviewText(data, ['coreIdea', '核心构想', '核心创意'])
  const estimatedChapters = Number(pickOverviewText(data, ['estimatedChapters', '预估章节数', '章节数'])) || data.estimatedChapters
  const keyCharacters = Array.isArray(data.keyCharacters) ? data.keyCharacters : (Array.isArray(pickOverviewText2Arr(data, ['主要人物', '人物'])) ? pickOverviewText2Arr(data, ['主要人物', '人物']) : data.keyCharacters)
  const keyLocations = Array.isArray(data.keyLocations) ? data.keyLocations : (Array.isArray(pickOverviewText2Arr(data, ['主要地点', '地点'])) ? pickOverviewText2Arr(data, ['主要地点', '地点']) : data.keyLocations)
  return {
    ...data,
    title,
    summary: [summary, hook].filter(Boolean).join('\n钩子：') || data.summary,
    coreConflict: coreConflict || data.coreConflict,
    coreIdea: coreIdea || data.coreIdea,
    estimatedChapters: estimatedChapters ?? data.estimatedChapters,
    keyCharacters,
    keyLocations,
  }
}

function pickOverviewText2Arr(obj: any, keys: string[]): any[] | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (Array.isArray(v)) return v
  }
  return null
}

export async function persistOverview(
  db: any,
  projectId: string,
  rawData: {
    title?: string
    storyType?: string | null
    summary?: string
    styleTone?: string
    coreConflict?: string
    keyCharacters?: any[]
    keyLocations?: any[]
    estimatedChapters?: number | null
  },
  input?: string,
): Promise<StoryPersistResult> {
  const data = normalizeOverviewInput(rawData)
  let overview = await db?.lwStoryOverviews?.getByProjectId(projectId)
  // 风格基调与写作指导：概要是后续每章的写作准绳，风格段随 summary 一起持久化并在
  // 每章生成时注入（无独立列，拼装在 summary 尾部，键名【风格基调】供下游识别）
  const styleTone = String((rawData as { styleTone?: string }).styleTone || (rawData as { styleGuide?: string }).styleGuide || '').trim()
  const baseSummary = String(data.summary || overview?.summary || '').replace(/\n*【风格基调】[\s\S]*$/, '').trim()
  const summary = styleTone ? `${baseSummary}\n【风格基调】${styleTone}` : baseSummary
  const patch = {
    title: data.title || overview?.title || '未命名',
    storyType: data.storyType || overview?.storyType || null,
    summary: summary || '',
    coreConflict: data.coreConflict || overview?.coreConflict || '',
    coreIdea: input || overview?.coreIdea || null,
    keyCharacters: data.keyCharacters || [],
    keyLocations: data.keyLocations || [],
    estimatedChapters: data.estimatedChapters ?? overview?.estimatedChapters ?? null,
    isSaved: true,
  }
  if (overview) {
    await db.lwStoryOverviews.update(overview.id, patch)
  } else {
    // overview 行缺失（历史遗留/异常库）：先建行再更新——否则结构化成果被丢弃，
    // 却仍返回成功（假成功反馈，前端按 changed 刷新拿到的是空数据）
    overview = await db.lwStoryOverviews.create(projectId)
    await db.lwStoryOverviews.update(overview.id, patch)
  }

  const title = patch.title
  return {
    ok: true,
    message: `已保存故事概要「${title}」（预估 ${data.estimatedChapters || '?'} 章）`,
    changed: ['overview'],
    data: { title, estimatedChapters: data.estimatedChapters },
  }
}

// ==================== 实体关系同步（图谱动态更新，幂等） ====================

export interface EntityRelationInput {
  sourceType: string
  sourceName: string
  targetType: string
  targetName: string
  relationType: string
  description?: string
}

/**
 * 从落库条目提取实体关系并幂等落库。
 * 提取器失败/无关系时不抛错（不阻断主流程）。
 */
export async function syncRelationsFromInput(
  db: any,
  projectId: string,
  items: any[],
  extractor: (item: any) => EntityRelationInput[],
): Promise<void> {
  if (!db?.lwGraphEdges || !Array.isArray(items) || items.length === 0) return
  try {
    const relations: any[] = []
    for (const item of items) {
      for (const rel of extractor(item)) {
        const src = rel.sourceName.trim()
        const tgt = rel.targetName.trim()
        if (!src || !tgt || src === tgt) continue
        relations.push({
          sourceType: rel.sourceType || 'character',
          sourceName: src,
          targetType: rel.targetType || 'character',
          targetName: tgt,
          relationType: rel.relationType || '关联',
          description: rel.description || '',
        })
      }
    }
    if (relations.length === 0) return
    const { GraphService } = await import('./graph/graph.service')
    await new GraphService(db).syncEntityRelations(projectId, relations)
  } catch (e) {
    logger.warn('实体关系同步失败（不影响主流程）', e)
  }
}

// ==================== 人物 ====================

/**
 * 人物入库（原 executeGenerateCharacters 落库段）：按名称去重只入新增，
 * AI 输出 relations → 人物间关系边。
 */
/**
 * 人物卡字段归一化（研讨室实跑修复）：模型产出的卡片数据键名不统一
 * （姓名/年龄/身份/外形… 或英文名），统一映射到实体字段后再落库；
 * rolePosition 中文定位同步映射为主角/反派/配角枚举。
 */
export function normalizeCharacterInput(c: any): any {
  if (!c || typeof c !== 'object') return c
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = c[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (typeof v === 'number') return String(v)
      // 主编自由产卡时字段可能是字符串数组（如「能力与代价」逐条列出）
      if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string' && x.trim())) return v.join('；')
    }
    return undefined
  }
  const rawRole = pick('rolePosition', '角色定位', '定位')
  const rolePosition = rawRole
    ? ({ 主角: 'protagonist', 反派: 'antagonist', 配角: 'supporting' } as Record<string, string>)[rawRole] ?? rawRole
    : /主角|女主|男主/.test(pick('identity', '身份') ?? '') ? 'protagonist' : undefined
  const ageRaw = pick('age', '年龄')
  const rawName = pick('name', '姓名', '名字') ?? c.name
  const normalized = {
    ...c,
    // 复测实跑修复：模型会把「乔镜知（补充，感情线载体）」这类注解写进名字——剥掉括号注解
    name: rawName ? rawName.replace(/[（(][^）)]*[）)]\s*$/, '').trim() : c.name,
    gender: pick('gender', '性别') ?? c.gender,
    age: ageRaw ? Number(ageRaw.replace(/[^\d]/g, '')) || c.age : c.age,
    occupation: pick('occupation', '职业', '身份') ?? c.occupation,
    position: pick('position', '职位') ?? c.position,
    rolePosition: rolePosition ?? c.rolePosition,
    appearance: pick('appearance', '外形', '外貌', '形象', '体质') ?? c.appearance,
    background: pick('background', '背景', '来历', '内在处境', '人物处境', '经历', '核心欲望') ?? c.background,
    personality: pick('personality', '性格') ?? c.personality,
    abilities: pick('abilities', '能力', '技能', '特长', '能力与代价', '能力代价', 'ability', '能力设定') ?? c.abilities,
    majorEvents: pick('majorEvents', '主要事件', '关键事件') ?? c.majorEvents,
    aliases: Array.isArray(c.aliases) ? c.aliases : c.aliases ? [String(c.aliases)] : (pick('别名') ? [pick('别名')!] : c.aliases),
  }
  // 自由键收敛：未能映射到结构化字段的键一律拼入 background——保证主编产卡的信息
  // 不因键名自由而丢失（实跑：《长夜提灯人》人物卡背景全 0 字）。此前仅 background
  // 为空才拼：修正版人物卡带显式 background 时 secret/写法约束等自由键被静默丢弃，
  // 圣经得不到修正，设计卡每轮把旧口径织回来（忘川渡第2章六轮回退根因之一）
  {
    const KNOWN = new Set([
      'name', '姓名', '名字', 'gender', '性别', 'age', '年龄', 'occupation', '职业', '身份', 'position', '职位',
      'rolePosition', '角色定位', '定位', 'appearance', '外形', '外貌', '形象', '体质', 'personality', '性格',
      'abilities', '能力', '技能', '特长', '能力与代价', '能力代价', 'ability', '能力设定', 'majorEvents', '主要事件', '关键事件',
      'aliases', '别名', 'background', '背景', '来历', '内在处境', '人物处境', '经历', '核心欲望',
      'taskTitle', 'note', 'kind', 'title', 'id',
    ])
    const extra = Object.entries(c)
      .filter(([k, v]) => !KNOWN.has(k) && ((typeof v === 'string' && v.trim()) || (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string' && x.trim()))))
      .map(([k, v]) => `${k}：${Array.isArray(v) ? v.join('；') : String(v).trim()}`)
    const base = String(normalized.background ?? '').trim()
    const merged = [base, ...extra].filter(Boolean).join('\n')
    if (merged) normalized.background = merged
  }
  return normalized
}

/**
 * 故事线卡归一化（研讨室实跑修复）：模型用 lineName/oneLine/起止状态等键名，
 * 统一映射到 plots 落库需要的 title/summary。
 */
export function normalizePlotInput(p: any): any {
  if (!p || typeof p !== 'object') return p
  const title = (p.title || p.lineName || p.name || '').trim()
  const summary = p.summary || [p.oneLine, p.startingState, p.upgradeChain, p.endingState]
    .filter((v: unknown) => typeof v === 'string' && v.trim())
    .join('；')
  return { ...p, title, summary: String(summary || '') }
}

/**
 * 大纲卡归一化（研讨室实跑修复）：模型产出 volumeTitle + chapters[{number,title,beat,
 * summary,estWords,characters,darkLineHook}]，统一映射成 persistOutlineTree 的
 * 卷→章树；节拍与暗线钩并入章概要，作为逐章生成的任务文本。
 */
/** 按候选键序列取第一个非空值（卡片键名中英文兼容） */
function pickKey(obj: any, keys: string[]): any {
  for (const k of keys) {
    const v = obj?.[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

/**
 * 人物卡容器归一化（复测实跑修复）：一张人物卡可能装 8 个角色——
 * data 直接是数组、或 {人物:[...]}、{characters:[...]}、或单人物对象，统一摊平成列表。
 * 实跑补（《长夜提灯人》）：主编产卡还可能是人名键字典形态 {程野:{...},苏晚棠:{...}}——
 * 键即人名，摊平为 [{name:键, ...值}]，否则整卡被当单人物且缺姓名而拒收。
 */
export function extractCharacterList(data: any): any[] {
  if (!data || typeof data !== 'object') return []
  if (Array.isArray(data)) return data
  const nested = pickKey(data, ['人物', 'characters', '角色', 'list', '人物卡', '主要人物'])
  if (Array.isArray(nested)) return nested
  if (pickKey(data, ['name', '姓名', '名字'])) return [data]
  const META = new Set(['taskTitle', 'note', 'kind', 'title'])
  const entries = Object.entries(data).filter(([k]) => !META.has(k))
  if (entries.length > 0 && entries.every(([, v]) => v && typeof v === 'object' && !Array.isArray(v))) {
    return entries.map(([k, v]) => ({ name: k, ...(v as Record<string, unknown>) }))
  }
  return [data]
}

/**
 * 世界卡清单归一化：模型产出 {地点:[...],势力:[...],物品:[...],技能:[...]}（中文名/字符串数组），
 * 统一映射为 persistWorld 的 locations/factions/skills/items（元素统一成 {name,...} 对象）。
 */
/**
 * 故事线卡容器归一化（复测实跑修复）：可能是数组、{故事线:[...]} 嵌套，
 * 或 {主线:{...},副线:{...}} 字典形态——统一摊平成 [{title, summary}] 列表。
 */
export function extractPlotList(data: any): any[] {
  if (!data || typeof data !== 'object') return []
  if (Array.isArray(data)) return data
  const nested = pickKey(data, ['故事线', '故事线卡', 'plots', 'lines', 'list'])
  if (Array.isArray(nested)) return nested
  if (pickKey(data, ['title', 'lineName', 'name'])) return [data]
  const META = new Set(['taskTitle', 'note', 'kind', 'title'])
  return Object.entries(data)
    .filter(([k]) => !META.has(k))
    .map(([k, v]) => {
      if (typeof v === 'string') return { title: k, summary: v }
      const o = v as Record<string, unknown>
      const summary = [pickKey(o, ['oneLine', '一句话', 'summary']), pickKey(o, ['起点', 'startingState', 'start']), pickKey(o, ['升级链', 'upgradeChain']), pickKey(o, ['终点', 'endingState', 'end'])]
        .filter((x) => typeof x === 'string' && x.trim())
        .join('；')
      return { title: pickKey(o, ['name', 'title', '线名']) ?? k, summary: summary || JSON.stringify(v) }
    })
}

export function extractWorldLists(data: any): { locations?: any[]; factions?: any[]; skills?: any[]; items?: any[]; specialRules?: string } {
  if (!data || typeof data !== 'object') return {}
  // 嵌套容器：{world:{...}}（主编自由产卡实跑形态）先摊开一层
  const inner = pickKey(data, ['world', '世界'])
  const source = inner && typeof inner === 'object' && !Array.isArray(inner) ? { ...(data as Record<string, unknown>), ...(inner as Record<string, unknown>) } : data
  const asNamedList = (v: any): any[] => {
    if (!Array.isArray(v)) return []
    return v
      .map((x: any) => (typeof x === 'string' ? { name: x } : x))
      .map((x: any) => ({ ...x, name: String(pickKey(x, ['名称', '名字', 'name']) ?? x.name ?? '').trim() }))
      .filter((x: any) => x.name)
  }
  // 自由键兜底：主编产卡的规则/因果链/组织层级等不属于四类实体，
  // 拼成 specialRules 文本并入背景设定，保证设定信息不因结构不符而丢失
  const KNOWN = new Set(['locations', '地点', 'factions', '势力', '门派', '阵营', 'skills', '技能', '武功', 'items', '物品', 'world', '世界', 'taskTitle', 'note', 'kind', 'title', '背景'])
  const extra = Object.entries(source)
    .filter(([k, v]) => !KNOWN.has(k) && v !== null && v !== undefined && v !== '' && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0))
    .map(([k, v]) => {
      if (typeof v === 'string') return `【${k}】${v}`
      if (Array.isArray(v)) {
        const parts = v.map((x: any) => (typeof x === 'string' ? x : (() => { const n = pickKey(x, ['名称', '名字', 'name']); return n ? `${n}：${x.desc ?? x.description ?? ''}` : JSON.stringify(x) })()))
        return `【${k}】${parts.filter(Boolean).join('\n')}`
      }
      const o = v as Record<string, unknown>
      const body = Object.entries(o).map(([ok, ov]) => `${ok}：${Array.isArray(ov) ? ov.join('；') : String(ov)}`).join('\n')
      return `【${k}】${body}`
    })
  return {
    locations: asNamedList(pickKey(source, ['locations', '地点'])),
    factions: asNamedList(pickKey(source, ['factions', '势力', '门派', '阵营'])),
    skills: asNamedList(pickKey(source, ['skills', '技能', '武功'])),
    items: asNamedList(pickKey(source, ['items', '物品'])),
    specialRules: extra.length ? extra.join('\n\n') : undefined,
  }
}

export function normalizeOutlineVolume(data: any): { name: string; summary: string; estimatedWords: number; chapters: any[] } {
  const rawChapters = Array.isArray(data?.chapters) ? data.chapters : Array.isArray(pickKey(data, ['章节', '章'])) ? pickKey(data, ['章节', '章']) : []
  const chapters = (rawChapters as any[]).map((c: any, i: number) => {
    const num = c.number ?? i + 1
    const title = c.title ?? pickKey(c, ['章名', '章节名', 'name', '标题'])
    return {
      name: c.name || (title ? `${num} ${title}`.trim() : `第${num ?? i + 1}章`),
      summary: [pickKey(c, ['概要', '简介', 'summary', 'content']), c.beat, pickKey(c, ['暗线', 'hook', 'darkLineHook'])]
        .filter(Boolean)
        .join('\n'),
      estimatedWords: Number(pickKey(c, ['estimatedWords', 'estWords', '字数', '预估字数'])) || 0,
    }
  })
  return {
    name: data.name || data.volumeTitle || pickKey(data, ['卷名', 'workTitle']) || '第一卷',
    summary: String(data.summary || pickKey(data, ['spec', '体量', '说明']) || ''),
    estimatedWords: chapters.reduce((s: number, c: any) => s + (c.estimatedWords || 0), 0),
    chapters,
  }
}

/**
 * 单章大纲卡识别（忘川渡实跑修复）：主编会按章逐卡落大纲（每张卡 data 无 chapters
 * 数组、只带章号/章名），旧实现一律 normalizeOutlineVolume 当卷建——每张章卡都误建
 * 一个「第一卷」卷节点。带 chapters 数组的整卷卡返回 null 走原路径；识别规则：
 * 显式章号键（number/chapterNo/章号），或卡片标题里的「第N章」前缀；有章名无章号不猜。
 */
export function matchOutlineChapterCard(
  data: any,
  cardTitle: string,
): { no: number; name: string; summary: string } | null {
  if (!data || typeof data !== 'object') return null
  if (Array.isArray(data.chapters) || Array.isArray(pickKey(data, ['章节', '章']))) return null
  const noRaw = Number(data.number ?? data.chapterNo ?? pickKey(data, ['章号', '序号']))
  const no = Number.isFinite(noRaw) && noRaw > 0 ? noRaw : NaN
  const title = String(data.title ?? data.章名 ?? data.集名 ?? data.chapterTitle ?? '').trim()
  if (!Number.isFinite(no)) {
    const m = /第\s*(\d+)\s*[章集]/.exec(String(cardTitle || ''))
    if (!m) return null
    const noFromTitle = Number(m[1])
    if (!Number.isFinite(noFromTitle) || noFromTitle <= 0) return null
    if (title) {
      return { no: noFromTitle, name: `${noFromTitle} ${title}`, summary: outlineChapterSummary(data) }
    }
    // 卡片标题形如「… 第1章 · 不喝汤的活人（第1日）」：取章名
    const tm = /^(?:[^·]*·)?\s*第\s*\d+\s*[章集]\s*[·:：、]?\s*(.+?)\s*(?:（[^）]*）)?\s*$/.exec(String(cardTitle))
    const t = tm?.[1]?.trim()
    if (!t) return null
    return { no: noFromTitle, name: `${noFromTitle} ${t}`, summary: outlineChapterSummary(data) }
  }
  if (!title) return { no, name: `第${no}章`, summary: outlineChapterSummary(data) }
  return { no, name: `${no} ${title}`, summary: outlineChapterSummary(data) }
}

function outlineChapterSummary(data: any): string {
  return [pickKey(data, ['summary', '概要', '简介', '本集事件概要']), pickKey(data, ['hook', '钩子', '章尾卡点', '结尾钩子']), pickKey(data, ['beat', '要点'])]
    .filter(Boolean)
    .map(String)
    .join('\n')
}

/** 从既有章名解析章号：「第N章 …」「N …」「N. …」；无章号返回 NaN */
function outlineChapterNoOf(name: string | null | undefined): number {
  const s = String(name ?? '').trim()
  if (!s) return NaN
  let m = /^第\s*(\d+)\s*章/.exec(s)
  if (m) return Number(m[1])
  m = /^(\d+)(?:[\s.、:：]|$)/.exec(s)
  if (m) return Number(m[1])
  return NaN
}

/**
 * 单章卡落库：挂到首卷（无卷先建卷）下，按章号幂等（同名/同号章已存在则更新概要，
 * 不重复建——设计包可能多次确认同一章卡）。
 */
export async function upsertOutlineChapter(
  db: any,
  projectId: string,
  ch: { no: number; name: string; summary: string },
): Promise<{ created: number; updated: number }> {
  const outlines = ((await db?.lwOutlines?.getByProjectId(projectId)) || []) as Array<Record<string, any>>
  let vol = outlines.find((o) => (o.nodeType ?? (o as any).node_type) === 'volume')
  if (!vol) {
    vol = await db?.lwOutlines?.create({ projectId, name: '第一卷', nodeType: 'volume' })
    if (!vol) return { created: 0, updated: 0 }
  }
  const children = outlines.filter((o) => o.parentId === vol!.id)
  const prefix = `${ch.no} `
  const existing = children.find((o) => {
    const n = String(o.name ?? '')
    if (n === ch.name || n.startsWith(prefix)) return true
    // 0916 review：向导/AI 大纲的章名是「第N章 标题」，与单章卡产出的「N 标题」格式
    // 互不为前缀——此前永不命中 → 同章重复节点挂卷尾 → 全文档序章号错位。按解析出的
    // 章号对齐（无章号的同名仍走上面的精确匹配兜底）。
    const no = outlineChapterNoOf(n)
    return Number.isFinite(no) && no === ch.no
  })
  if (existing) {
    await db?.lwOutlines?.update(existing.id, { summary: ch.summary || (existing as any).summary })
    return { created: 0, updated: 1 }
  }
  const c = await db?.lwOutlines?.create({
    projectId, parentId: vol.id, name: ch.name, nodeType: 'chapter',
    summary: ch.summary || '', estimatedWords: 0,
  })
  return { created: c ? 1 : 0, updated: 0 }
}

export async function persistCharacters(db: any, projectId: string, list: any[]): Promise<StoryPersistResult> {
  const chars = (Array.isArray(list) ? list : []).map(normalizeCharacterInput)
  if (chars.length === 0) {
    return { ok: false, message: 'AI 未返回有效的人物数据', changed: [] }
  }

  const existing = (await db?.lwCharacters?.getByProjectId(projectId)) || []
  const existingByName = new Map(existing.map((c: any) => [String(c.name), c]))
  const newChars: any[] = []
  const updates: Array<{ before: any; next: any }> = []
  for (const c of chars) {
    if (!c?.name?.trim()) continue
    const hit = existingByName.get(c.name.trim())
    if (hit) updates.push({ before: hit, next: c })
    else newChars.push(c)
  }

  if (newChars.length === 0 && updates.length === 0) {
    // 实跑修复：全部缺姓名 = 数据不合格，按失败返回（确认流据此保留条目），
    // 不再当 skipped 静默吞卡
    const allNameless = chars.every((c: any) => !c?.name?.trim())
    return {
      ok: false,
      skipped: !allNameless,
      message: allNameless
        ? '人物卡缺少姓名字段（name/姓名），已保留待模型补正'
        : '人物卡缺少有效姓名',
      changed: [],
    }
  }

  // 同名人物卡 = 权威修正：覆盖可归档字段（新值为空则保留旧值），不再静默跳过。
  // 旧实现「人都已存在→skipped」+ 确认流把 skipped 条目移出草稿包 = 修正整体丢失
  // （忘川渡实跑：阿蘅修正卡确认后被吞，圣经停在旧口径，章法设计卡六轮回退）
  const UPDATABLE = [
    'gender', 'age', 'height', 'weight', 'race', 'occupation', 'position', 'rolePosition',
    'appearance', 'background', 'personality', 'abilities', 'majorEvents',
  ] as const
  const updatedNames: string[] = []
  for (const u of updates) {
    const patch: Record<string, unknown> = {}
    for (const f of UPDATABLE) {
      const nv = u.next[f]
      if (nv !== undefined && nv !== null && String(nv).trim() !== '') patch[f] = nv
    }
    if (Array.isArray(u.next.aliases) && u.next.aliases.length) patch.aliases = u.next.aliases
    if (Object.keys(patch).length === 0) continue
    await db?.lwCharacters?.update(u.before.id, patch)
    updatedNames.push(u.next.name.trim())
  }

  const created: any[] = []
  for (const c of newChars) {
    const saved = await db?.lwCharacters?.create({
      projectId,
      name: c.name.trim(),
      gender: c.gender || 'other',
      age: c.age ?? 0,
      height: c.height,
      weight: c.weight,
      race: c.race,
      occupation: c.occupation,
      position: c.position,
      rolePosition: c.rolePosition,
      appearance: c.appearance,
      background: c.background,
      personality: c.personality,
      abilities: c.abilities,
      majorEvents: c.majorEvents,
      aliases: Array.isArray(c.aliases) ? c.aliases : null,
    })
    if (saved) created.push(saved)
  }

  await syncRelationsFromInput(db, projectId, [...newChars, ...updates.map((u) => u.next)], (c: any) =>
    (c.relations || []).map((rel: any) => ({
      sourceType: 'character',
      sourceName: c.name.trim(),
      targetType: 'character',
      targetName: String(rel.targetName || '').trim(),
      relationType: rel.relationType || '关联',
      description: rel.description || '',
    })),
  )

  const parts: string[] = []
  if (updatedNames.length) parts.push(`更新人物：${updatedNames.join('、')}`)
  if (created.length) parts.push(`新增人物：${created.map((c: any) => c.name).join('、')}`)

  return {
    ok: true,
    message: parts.join('；') || '人物卡已处理（无可写字段）',
    changed: ['characters'],
    data: { characters: [...created, ...updates.map((u) => ({ ...u.before, ...u.next }))].map((c: any) => ({ id: c.id, name: c.name, rolePosition: c.rolePosition })) },
  }
}

// ==================== 故事线 ====================

/** 故事线入库（原 executeGeneratePlots 落库段）：按标题去重 + batchCreate + 实体关系边 */
export async function persistPlots(db: any, projectId: string, list: any[]): Promise<StoryPersistResult> {
  const plots = Array.isArray(list) ? list : []
  if (plots.length === 0) {
    return { ok: false, message: 'AI 未返回有效的故事线数据', changed: [] }
  }

  const existing = (await db?.lwPlots?.getByProjectId(projectId)) || []
  const existingTitles = new Set(existing.map((p: any) => p.title))
  const newPlots = plots.filter((p: any) => p?.title?.trim() && !existingTitles.has(p.title))

  if (newPlots.length === 0) {
    return { ok: false, skipped: true, message: '没有新的故事线需要添加（都已存在）', changed: [] }
  }

  await db?.lwPlots?.batchCreate(
    projectId,
    newPlots.map((p: any) => ({
      title: p.title.trim(),
      summary: p.summary || '',
      involvedCharacters: p.involvedCharacters || [],
    })),
  )

  await syncRelationsFromInput(db, projectId, newPlots, (p: any) =>
    (p.entityRelations || []).map((rel: any) => ({
      sourceType: rel.sourceType || 'character',
      sourceName: String(rel.sourceName || '').trim(),
      targetType: rel.targetType || 'character',
      targetName: String(rel.targetName || '').trim(),
      relationType: rel.relationType || '关联',
      description: rel.description || '',
    })),
  )

  return {
    ok: true,
    message: `新增故事线 ${newPlots.length} 条：${newPlots.map((p: any) => p.title).join('、')}`,
    changed: ['plots'],
    data: { plots: newPlots.map((p: any) => ({ title: p.title })) },
  }
}

// ==================== 世界设定 ====================

/**
 * specialRules 追加式合并（0916 review）：按 \n\n 分块，比较时折叠全部空白——
 * 语义相同（仅换行/空格差异）的块不重复追加；全为旧块时原样返回（不触发无谓 update）。
 */
function mergeSpecialRules(existing: string | null | undefined, incoming: string): string {
  const norm = (s: string): string => s.replace(/\s+/g, '')
  const have = new Set(
    String(existing ?? '')
      .split(/\n{2,}/)
      .map((b) => norm(b))
      .filter(Boolean),
  )
  const fresh = String(incoming)
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b && !have.has(norm(b)))
  const base = String(existing ?? '').trim()
  if (fresh.length === 0) return String(existing ?? '')
  return base ? `${base}\n\n${fresh.join('\n\n')}` : fresh.join('\n\n')
}

/**
 * 世界设定四类入库（原 executeGenerateWorld 落库段；背景润色属生成不在此层）。
 * data 各数组可选，按名称去重只入新增。
 */
export async function persistWorld(
  db: any,
  projectId: string,
  data: { locations?: any[]; factions?: any[]; skills?: any[]; items?: any[]; specialRules?: string },
): Promise<StoryPersistResult> {
  const done: string[] = []

  // 自由键设定文本（规则/因果链/组织层级等）→ 背景设定·特殊规则（追加不覆盖）
  try {
    const rules = String((data as { specialRules?: string }).specialRules ?? '').trim()
    if (rules) {
      const existing = await db?.lwBackgrounds?.getByProjectId(projectId)
      if (existing) {
        // 0916 review：旧实现纯字符串拼接——同一规则文本每确认一张世界卡就追加一次
        // （agent 重复产卡/设计包多次确认），specialRules 线性膨胀不可逆且注入每章
        // prompt。改为按归一化块（\n\n 分块、比较时折叠空白）去重后追加。
        const merged = mergeSpecialRules(existing.specialRules, rules)
        if (merged !== existing.specialRules) {
          await db?.lwBackgrounds?.update(existing.id, { specialRules: merged })
        }
      } else {
        const created = await db?.lwBackgrounds?.create(projectId)
        if (created) await db?.lwBackgrounds?.update(created.id, { specialRules: rules })
      }
      done.push('特殊规则')
    }
  } catch (e) {
    logger.warn('特殊规则落库失败', e)
  }

  // 地点
  try {
    const list = Array.isArray(data.locations) ? data.locations : []
    if (list.length > 0) {
      const existing = (await db?.lwLocations?.getByProjectId(projectId)) || []
      const names = new Set(existing.map((l: any) => l.name))
      const fresh = list.filter((l: any) => l?.name?.trim() && !names.has(l.name))
      for (const l of fresh) {
        await db?.lwLocations?.create({
          projectId,
          name: l.name.trim(),
          type: l.type || 'other',
          importance: l.importance || 'auxiliary',
          description: l.description || '',
          mapId: l.suggestedMapId,
        })
      }
      if (fresh.length > 0) done.push(`地点${fresh.length}个`)
    }
  } catch (e) {
    logger.warn('地点落库失败', e)
  }

  // 势力
  try {
    const list = Array.isArray(data.factions) ? data.factions : []
    if (list.length > 0) {
      const existing = (await db?.lwFactions?.getByProjectId(projectId)) || []
      const names = new Set(existing.map((f: any) => f.name))
      const fresh = list.filter((f: any) => f?.name?.trim() && !names.has(f.name))
      for (const f of fresh) {
        await db?.lwFactions?.create({
          projectId,
          factionType: f.factionType || 'other',
          name: f.name.trim(),
          description: f.description || '',
        })
      }
      if (fresh.length > 0) done.push(`势力${fresh.length}个`)
    }
  } catch (e) {
    logger.warn('势力落库失败', e)
  }

  // 技能 + 物品
  try {
    const skills = Array.isArray(data.skills) ? data.skills : []
    const items = Array.isArray(data.items) ? data.items : []
    if (skills.length > 0) {
      const existing = (await db?.lwSkills?.getByProjectId(projectId)) || []
      const names = new Set(existing.map((s: any) => s.name))
      const fresh = skills.filter((s: any) => s?.name?.trim() && !names.has(s.name))
      for (const s of fresh) {
        await db?.lwSkills?.create({
          projectId,
          name: s.name.trim(),
          type: s.type || 'ability',
          level: s.level || 'beginner',
          description: s.description || '',
          system: s.system || '',
          characterIds: [],
        })
      }
      if (fresh.length > 0) done.push(`技能${fresh.length}个`)
    }
    if (items.length > 0) {
      const existing = (await db?.lwItems?.getByProjectId(projectId)) || []
      const names = new Set(existing.map((i: any) => i.name))
      const fresh = items.filter((i: any) => i?.name?.trim() && !names.has(i.name))
      for (const i of fresh) {
        await db?.lwItems?.create({
          projectId,
          name: i.name.trim(),
          type: i.type || 'artifact',
          level: i.level || 'common',
          description: i.description || '',
        })
      }
      if (fresh.length > 0) done.push(`物品${fresh.length}个`)
    }
  } catch (e) {
    logger.warn('技能物品落库失败', e)
  }

  if (done.length === 0) {
    return { ok: false, message: '没有新的世界设定需要添加（结构化数据为空或都已存在）', changed: [] }
  }
  return { ok: true, message: `已保存世界设定：${done.join('、')}`, changed: ['world'] }
}

// ==================== 大纲 ====================

/**
 * 大纲建树（原 createOutlineTree 原样迁出；复刻 OutlineStage 前端逻辑：
 * 卷→章→节 / 章→节 / 章）。返回成功创建的节点数。
 */
export async function persistOutlineTree(db: any, projectId: string, tree: any[], level: number): Promise<number> {
  let count = 0
  if (level === 3) {
    for (const vol of tree) {
      const v = await db?.lwOutlines?.create({
        projectId, name: vol.name, nodeType: 'volume',
        summary: vol.summary || '', estimatedWords: vol.estimatedWords || 0,
      })
      if (!v) continue
      count++
      for (const ch of vol.chapters || []) {
        const c = await db?.lwOutlines?.create({
          projectId, parentId: v.id, name: ch.name, nodeType: 'chapter',
          summary: ch.summary || '', estimatedWords: ch.estimatedWords || 0,
        })
        if (!c) continue
        count++
        for (const sec of ch.sections || []) {
          await db?.lwOutlines?.create({
            projectId, parentId: c.id, name: sec.name, nodeType: 'section',
            summary: sec.summary || '', estimatedWords: sec.estimatedWords || 0,
          })
          count++
        }
      }
    }
  } else if (level === 2) {
    for (const ch of tree) {
      const c = await db?.lwOutlines?.create({
        projectId, name: ch.name, nodeType: 'chapter',
        summary: ch.summary || '', estimatedWords: ch.estimatedWords || 0,
      })
      if (!c) continue
      count++
      for (const sec of ch.sections || []) {
        await db?.lwOutlines?.create({
          projectId, parentId: c.id, name: sec.name, nodeType: 'section',
          summary: sec.summary || '', estimatedWords: sec.estimatedWords || 0,
        })
        count++
      }
    }
  } else {
    for (const ch of tree) {
      await db?.lwOutlines?.create({
        projectId, name: ch.name, nodeType: 'chapter',
        summary: ch.summary || '', estimatedWords: ch.estimatedWords || 0,
      })
      count++
    }
  }
  return count
}

// ==================== 章节 ====================

/**
 * 章节正文落库（原 executeWriteChapter 落库段；复刻 saveChapter 语义：
 * create/updateContent + createVersion）+ 图谱流水线（事件提取→状态切片→
 * 自动建边→章节状态摘要，分步容错）。ai 缺省时跳过图谱流水线（正文照常保存）。
 */
export async function persistChapter(
  db: any,
  projectId: string,
  params: { outlineId: string; content: string; providerConfigId?: string; modelId?: string },
  ai?: any,
): Promise<StoryPersistResult> {
  const { outlineId, content } = params
  const outline = await db?.lwOutlines?.getById(outlineId)
  if (!outline) {
    return { ok: false, message: '大纲节点不存在（outlineId 无效）', changed: [] }
  }
  if (!content || !content.trim()) {
    return { ok: false, message: '章节正文为空', changed: [] }
  }

  const existingChapter = await db?.lwChapters?.getByOutlineId(outlineId)
  let chapter = existingChapter
  if (!chapter) {
    chapter = await db?.lwChapters?.create(outlineId, content)
  } else {
    chapter = await db?.lwChapters?.updateContent(chapter.id, content)
  }
  if (chapter) {
    await db?.lwChapters?.createVersion(chapter.id, content, 'manual')
  }

  // 进度状态同步（与 saveChapter 同口径）：写完正文的章节大纲 pending → progressing
  try {
    if (outline?.status === 'pending') {
      await db?.lwOutlines?.update(outlineId, { status: 'progressing' })
    }
  } catch { /* 状态同步失败不影响正文保存 */ }

  if (ai) {
    try {
      const { ChapterGraphProcessor } = await import('./graph/chapter-graph.processor')
      const processor = new ChapterGraphProcessor(db, ai)
      // 复核修复 P1-1：章号走文档序原语（旧实现把 chapter+section 按 orderIndex
      // 扁平排序后 findIndex——多卷/含节树全局排序交错，章号系统性错位）
      const { buildOutlineDocOrder, outlineChapterNumber } = await import('./outline-order')
      const allNodes = (await db?.lwOutlines?.getByProjectId(projectId)) || []
      const docOrder = buildOutlineDocOrder(allNodes)
      const chapterNumber = outlineChapterNumber(docOrder, outlineId) ?? 1
      await processor.process({
        projectId,
        outlineId,
        chapterContent: content,
        chapterNumber,
        providerConfigId: params.providerConfigId,
        modelId: params.modelId,
      })
    } catch (e) {
      logger.warn('章节图谱流水线失败（正文已保存）', e)
    }
  }

  const words = content.length
  return {
    ok: true,
    message: `已保存「${outline.name}」（约 ${Math.round(words / 100) / 10} 千字）`,
    changed: ['chapters', 'outline'],
    data: { outlineId, name: outline.name, words },
  }
}
