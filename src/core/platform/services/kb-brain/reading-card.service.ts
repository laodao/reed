/**
 * 知识大脑·章级结构化阅读卡（v4 整书结构化漏斗的地基层）
 * @module platform/services/kb-brain/reading-card.service
 *
 * 每章产出一份分域结构化卡（小说：梗概/事件/人物事实/设定事实/伏笔动作/文风；
 * 知识：梗概/论点/概念/方法/金句；文史：混合），全部事实带章号、程序硬校验。
 * 卡取代章节摘要成为书级产线的统一中间层：名册、编年段、卷、书级成品全部从卡取材。
 *
 * - 模型档位：adjudicate 高档（卡是全漏斗地基，错卡污染全链——v4 总设计 §10 决策）
 * - 解析链：extractJsonFromResponse → ajv → 错误回喂重试 1 次（atomize 同款）
 * - 章号纪律：卡内一切事实 ch 必须等于本章章号，越界整卡拒收
 * - 台账：passType='card'（幂等/断点/封账由编排器管理），本服务只管「章文→卡」
 */
import { createHash } from 'node:crypto'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import {
  buildReadingCardSystem,
  buildReadingCardUser,
} from './prompts'
import {
  validateReadingCardOutput,
  type ReadingCard,
} from './schemas'
import { defaultBrainLlm, type BrainLlmFn, type BrainModelRef } from './llm'

/** 单章正文输入上限（与滚动阅读章截断同量级；超长章保护） */
export const CARD_CHAPTER_TEXT_CAP = 12000

export interface CardInput {
  bookName: string
  chapterNo: number
  total: number
  chapterTitle: string
  content: string
  knownNames?: string[]
  contentType: string
}

export interface ReadingCardDeps {
  llm?: BrainLlmFn
  modelOverride?: () => BrainModelRef
}

export class KbReadingCardService {
  private readonly llm: BrainLlmFn

  constructor(deps: ReadingCardDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride)
  }

  /** 章文 → 卡（校验失败回喂重试 1 次，仍失败抛错——调用方按台账失败处理） */
  async produceCard(input: CardInput): Promise<ReadingCard> {
    const system = buildReadingCardSystem(input.contentType)
    const base = buildReadingCardUser({
      ...input,
      content:
        input.content.length > CARD_CHAPTER_TEXT_CAP
          ? `${input.content.slice(0, CARD_CHAPTER_TEXT_CAP)}\n（本章超长，已截断）`
          : input.content,
    })
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? base
          : `${base}\n\n【上次输出不合法，请修正】\n${lastError}\n请重新输出完整合法的阅读卡 JSON。`
      const raw = await this.llm({ system, user: prompt, maxTokens: 4000 })
      try {
        const parsed = extractJsonFromResponse(raw)
        return validateReadingCardOutput(parsed, { ch: input.chapterNo })
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    throw new Error(`reading-card 两次尝试均失败：${lastError}`)
  }
}

/** 卡序列化（落库前封顶护栏——normalize 已裁剪，此处只防异常输入穿透） */
export function serializeCard(card: ReadingCard): string {
  return JSON.stringify(card)
}

/** 卡解析（消费方入口：名册聚合/编年段/书级归并）；坏卡返回 null（降级链由调用方处理） */
export function parseCard(raw: string | null | undefined): ReadingCard | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as ReadingCard
    if (!data || typeof data !== 'object' || !data.summary) return null
    return data
  } catch {
    return null
  }
}

/** 卡内容指纹（消费方廉价失效判断；落库与消费共用同一算法） */
export function cardHash(card: ReadingCard | string): string {
  const raw = typeof card === 'string' ? card : JSON.stringify(card)
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}
