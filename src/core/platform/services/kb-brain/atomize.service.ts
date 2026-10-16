/**
 * 知识大脑·原子化服务（P-1 基础遍与视角遍共用，详细设计 §3.2/§4）
 * @module platform/services/kb-brain/atomize.service
 *
 * 职责：章节文本 → 原子论断 + 事件对。LLM 输出的解析链：
 * extractJsonFromResponse → ajv 校验 → 失败把错误清单回喂重试 1 次 → 仍失败抛错。
 * 【复核修正 F1】偏移不由模型产出：quote 定位器在窗口文本中推导
 * start/endOffset（窗口起点已知），未命中 → offsets=null（溯源退化章节级）。
 */
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import {
  ATOMIZE_SYSTEM,
  buildAtomizeUser,
  ADJUDICATE_SYSTEM,
  buildAdjudicateUser,
  SCENE_BACKFILL_SYSTEM,
  buildSceneBackfillUser,
} from './prompts'
import {
  validateAtomizeOutput,
  validateAdjudicateOutput,
  validateSceneBackfillOutput,
  type RawAtom,
  type RawScene,
  type AdjudicateOutput,
} from './schemas'
import { defaultBrainLlm, type BrainLlmFn } from './llm'

/** 单窗口字符上限（章内分窗；与章节摘要 maxChars 同量级） */
const MAX_WINDOW_CHARS = 6000

/** 章级场面数上限（护栏：防跑飞；正常章 0-12） */
const MAX_SCENES_PER_CHAPTER = 24

/** 定位后的论断（窗口坐标已换算为章节坐标） */
export type LocatedAtom = RawAtom & {
  startOffset: number | null
  endOffset: number | null
  windowIndex: number
}

export interface LocatedEvent {
  fromStatement: string | null
  toStatement: string | null
  evidence: string
}

/** 定位后的场面事件（故事轨原料；quote 未命中 → offsets=null 溯源退化章节级） */
export interface LocatedScene extends RawScene {
  startOffset: number | null
  endOffset: number | null
  windowIndex: number
}

export interface AtomizeResult {
  atoms: LocatedAtom[]
  events: LocatedEvent[]
  /** 故事轨场面事件（v2 P0：仅小说变体 prompt 产出） */
  scenes: LocatedScene[]
  /** P-2 语义并入：实体规范名词表（含类型），供实体解析 upsert */
  mentions: Array<{ name: string; type: string }>
}


export interface AtomizeDeps {
  llm?: BrainLlmFn
  /** 萃取 system 覆盖（视角遍 P-6 注入视角框架；缺省 ATOMIZE_SYSTEM） */
  systemOverride?: string
  /** 每库模型设置动态解析（brainConfig.models；优先于 env） */
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
}

export class AtomizeService {
  private readonly llm: BrainLlmFn
  private readonly system: string

  constructor(deps: AtomizeDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-atomize', deps.modelOverride)
    this.system = deps.systemOverride ?? ATOMIZE_SYSTEM
  }

  /** 章级入口：按 MAX_WINDOW_CHARS 分窗顺序处理，逐窗收集论断与事件 */
  async atomizeChapter(input: {
    chapterTitle: string
    chapterContent: string
    knownEntityNames?: string[]
  }): Promise<AtomizeResult> {
    const windows = splitWindows(input.chapterContent, MAX_WINDOW_CHARS)
    const atoms: LocatedAtom[] = []
    const events: LocatedEvent[] = []
    const scenes: LocatedScene[] = []
    const mentions = new Map<string, string>()
    for (let i = 0; i < windows.length; i++) {
      const out = await this.atomizeWindow({
        chapterTitle: input.chapterTitle,
        windowText: windows[i].windowText,
        windowStartOffset: windows[i].startOffset,
        windowIndex: i,
        knownEntityNames: input.knownEntityNames,
      })
      atoms.push(...out.atoms)
      events.push(...(out.events ?? []))
      scenes.push(...(out.scenes ?? []))
      for (const m of out.mentions) mentions.set(m.name, m.type)
    }
    return {
      atoms,
      events,
      scenes: dedupeScenes(scenes),
      mentions: [...mentions.entries()].map(([name, type]) => ({ name, type })),
    }
  }

  /**
   * 存量章场面补采（v2 P0）：events-only——不带 atoms 指令（论断已入库且成本已付），
   * 只产出场面原料 + mentions。返回 windowCalls 供台账记成本（每窗一次调用）。
   */
  async captureScenes(input: {
    chapterTitle: string
    chapterContent: string
    knownEntityNames?: string[]
  }): Promise<{ scenes: LocatedScene[]; mentions: Array<{ name: string; type: string }>; windowCalls: number }> {
    const windows = splitWindows(input.chapterContent, MAX_WINDOW_CHARS)
    const scenes: LocatedScene[] = []
    const mentions = new Map<string, string>()
    for (let i = 0; i < windows.length; i++) {
      const out = await this.callWithRetry(
        SCENE_BACKFILL_SYSTEM,
        buildSceneBackfillUser({
          chapterTitle: input.chapterTitle,
          windowText: windows[i].windowText,
          knownEntityNames: input.knownEntityNames,
        }),
        validateSceneBackfillOutput,
      )
      const locator = createQuoteLocator(windows[i].windowText)
      for (const s of out.scenes) {
        const pos = locator(s.quote)
        scenes.push({
          ...s,
          participants: s.participants ?? [],
          startOffset: pos === null ? null : windows[i].startOffset + pos,
          endOffset: pos === null ? null : windows[i].startOffset + pos + s.quote.length,
          windowIndex: i,
        })
      }
      for (const m of out.mentions ?? []) mentions.set(m.name, m.type)
    }
    return {
      scenes: dedupeScenes(scenes),
      mentions: [...mentions.entries()].map(([name, type]) => ({ name, type })),
      windowCalls: windows.length,
    }
  }

  /**
   * 单窗原子化：调用 LLM → 解析链 → 定位。
   * events 的 quote 映射到本窗 atom（跨窗事件边在 M2 事件链完善中处理）。
   */
  async atomizeWindow(input: {
    chapterTitle: string
    windowText: string
    windowStartOffset: number
    windowIndex: number
    knownEntityNames?: string[]
  }): Promise<{ atoms: LocatedAtom[]; events: LocatedEvent[]; scenes: LocatedScene[]; mentions: Array<{ name: string; type: string }> }> {
    const out = await this.callWithRetry(
      this.system,
      buildAtomizeUser({
        chapterTitle: input.chapterTitle,
        windowText: input.windowText,
        knownEntityNames: input.knownEntityNames,
      }),
      validateAtomizeOutput,
    )

    const locator = createQuoteLocator(input.windowText)
    const atoms: LocatedAtom[] = out.atoms.map((a) => {
      const pos = locator(a.quote)
      return {
        ...a,
        certainty: a.certainty ?? 0.8,
        startOffset: pos === null ? null : input.windowStartOffset + pos,
        endOffset: pos === null ? null : input.windowStartOffset + pos + a.quote.length,
        windowIndex: input.windowIndex,
      }
    })

    // events：quote → 本窗 atom 映射（顺序定位器保证同 quote 多条按出现次序对应）
    const evLocator = createQuoteLocator(input.windowText)
    const statementsByPos = atoms
      .filter((a) => a.startOffset !== null)
      .map((a) => ({ pos: (a.startOffset as number) - input.windowStartOffset, statement: a.statement }))
      .sort((x, y) => x.pos - y.pos)
    const resolveEventEnd = (quote: string): string | null => {
      const pos = evLocator(quote)
      if (pos === null) return null
      // 事件端点=位置在 quote 位置处或其后的最近论断
      const hit = statementsByPos.find((s) => s.pos >= pos)
      return hit?.statement ?? null
    }
    // events 可选（schema 只必填 atoms）——模型省略时为 undefined，不能直接 .map
    const events: LocatedEvent[] = (out.events ?? [])
      .map((ev) => ({
        fromStatement: resolveEventEnd(ev.fromQuote),
        toStatement: resolveEventEnd(ev.toQuote),
        evidence: ev.evidence,
      }))
      .filter((ev) => ev.fromStatement !== null && ev.toStatement !== null && ev.fromStatement !== ev.toStatement)

    // scenes（故事轨，v2 P0）：quote 定位（同 quote 多次出现按次序命中——同 atoms 定位器）
    const sceneLocator = createQuoteLocator(input.windowText)
    const scenes: LocatedScene[] = (out.scenes ?? []).map((s) => {
      const pos = sceneLocator(s.quote)
      return {
        ...s,
        participants: s.participants ?? [],
        startOffset: pos === null ? null : input.windowStartOffset + pos,
        endOffset: pos === null ? null : input.windowStartOffset + pos + s.quote.length,
        windowIndex: input.windowIndex,
      }
    })

    return { atoms, events, scenes, mentions: out.mentions ?? [] }
  }

  /**
   * 调用 + 解析 + 校验失败回喂重试 1 次（cogen 范式）。
   */
  private async callWithRetry<T>(
    system: string,
    user: string,
    validate: (data: unknown) => T,
  ): Promise<T> {
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? user
          : `${user}\n\n【上次输出不合法，请修正】\n${lastError}\n请重新输出完整合法的 JSON。`
      const raw = await this.llm({ system, user: prompt, maxTokens: 4000 })
      let parsed: unknown
      try {
        parsed = extractJsonFromResponse(raw)
      } catch (e) {
        lastError = `无法从响应中提取 JSON：${(e as Error).message}`
        continue
      }
      try {
        return validate(parsed)
      } catch (e) {
        lastError = (e as Error).message
      }
    }
    throw new Error(`atomize 两次尝试均失败：${lastError}`)
  }
}

/** 裁决服务（P-3）：一次调用输出 duplicate/contradictions/novel */
export class AdjudicateService {
  private readonly llm: BrainLlmFn

  constructor(deps: { llm?: BrainLlmFn; modelOverride?: () => { providerConfigId?: string; modelId?: string } } = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride)
  }

  async adjudicate(input: {
    newItems: Array<{ idx: number; statement: string }>
    existingItems: Array<{ idx: number; statement: string; status: string }>
  }): Promise<AdjudicateOutput> {
    const system = ADJUDICATE_SYSTEM
    const user = buildAdjudicateUser(input)
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0 ? user : `${user}\n\n【上次输出不合法，请修正】\n${lastError}\n请重新输出完整合法的 JSON。`
      const raw = await this.llm({ system, user: prompt, maxTokens: 3000 })
      try {
        const parsed = extractJsonFromResponse(raw)
        return validateAdjudicateOutput(parsed, {
          newCount: input.newItems.length,
          oldCount: input.existingItems.length,
        })
      } catch (e) {
        lastError = (e as Error).message
      }
    }
    throw new Error(`adjudicate 两次尝试均失败：${lastError}`)
  }
}

/* ==================== 纯函数：窗口切分与 quote 定位 ==================== */

/** 章级场面收敛：summary 去重 + 章级上限（窗口间近重复场面取首见） */
export function dedupeScenes(scenes: LocatedScene[]): LocatedScene[] {
  const seen = new Set<string>()
  const out: LocatedScene[] = []
  for (const s of scenes) {
    const key = s.summary.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= MAX_SCENES_PER_CHAPTER) break
  }
  return out
}

/** 章内分窗（段落边界优先，无段落则硬切） */
export function splitWindows(
  content: string,
  maxChars: number,
): Array<{ windowText: string; startOffset: number }> {
  if (content.length <= maxChars) return [{ windowText: content, startOffset: 0 }]
  const windows: Array<{ windowText: string; startOffset: number }> = []
  let cursor = 0
  while (cursor < content.length) {
    let end = Math.min(cursor + maxChars, content.length)
    if (end < content.length) {
      // 段落边界回退（最后一段落符之后切，避免截断句）
      const boundary = content.lastIndexOf('\n', end)
      if (boundary > cursor + maxChars * 0.5) end = boundary + 1
    }
    windows.push({ windowText: content.slice(cursor, end), startOffset: cursor })
    cursor = end
  }
  return windows
}

/**
 * quote 定位器（F1）：同一 quote 多次出现时按调用次序依次命中第 n 次出现位置
 * （模型按原文顺序产出，多条同文 quote 与出现次序一致）；用尽返回 null。
 * 返回相对窗口文本的位置；未命中/空 quote 返回 null。
 */
export function createQuoteLocator(windowText: string): (quote: string) => number | null {
  const used = new Map<string, number>()
  const positionsCache = new Map<string, number[]>()
  const positionsOf = (q: string): number[] => {
    let arr = positionsCache.get(q)
    if (!arr) {
      arr = []
      let i = windowText.indexOf(q)
      while (i !== -1) {
        arr.push(i)
        i = windowText.indexOf(q, i + q.length)
      }
      positionsCache.set(q, arr)
    }
    return arr
  }
  return (quote) => {
    const q = quote?.trim()
    if (!q) return null
    const arr = positionsOf(q)
    const n = used.get(q) ?? 0
    if (n >= arr.length) return null
    used.set(q, n + 1)
    return arr[n]
  }
}
