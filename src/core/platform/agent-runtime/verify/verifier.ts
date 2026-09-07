/**
 * 质量门验证器（26 号 M3 批3 / 01 号 §6）
 * @module core/platform/agent-runtime/verify/verifier
 *
 * 子任务没有"完成"，只有"通过验收"（01 号 §6.1）。四层验证（便宜优先，昂贵兜底）：
 *   ① 规则（毫秒级必跑）：JSON 可解析 / requiredFields 非空 / 长度上下限
 *   ② 工具：codeCheck 存在时走沙箱（仅桌面端；Web 端跳过并注记）
 *   ③ LLM 评判：rubric 打分（相关性/完整性/事实性）→ 0-1 + 缺陷列表
 *   ④ 人工：灰区 [grayLow, grayHigh) / humanRequired / 重试尽 → 需人工裁决
 *
 * 结论统一 VerifierDecision：passed / retry(带缺陷反馈) / human(灰区裁决) / failed。
 * 缺陷列表喂回 agent 再来一轮（Reflexion 式——26 号 §3）。
 */

import { createLogger } from '@core/utils/logger'
import type { z } from 'zod'

const logger = createLogger('AgentVerifier')

/** 灰区阈值（缺省 0.6-0.8；spec.verification 可覆盖） */
export const DEFAULT_GRAY_LOW = 0.6
export const DEFAULT_GRAY_HIGH = 0.8

/** 任务 spec 中的验证器声明（任务即契约——验收标准在规划期声明） */
export interface VerificationSpec {
  /** ① 规则层：产出须为 JSON 且含这些顶层字段 */
  requiredFields?: string[]
  /** 产出 JSON 的 zod schema（规划器生成 / 宿主注入） */
  schema?: z.ZodType<unknown>
  /** ② 工具层：检查器代码（沙箱执行，return {ok, message}；仅桌面端） */
  codeCheck?: string
  /** 产出最小长度（字符；纯文本产出适用） */
  minLength?: number
  /** ③ LLM 评判开关（缺省 true——规则层无法判定的语义质量） */
  llmJudge?: boolean
  /** ③ rubric 追加要点（拼进评判提示词） */
  rubricHints?: string[]
  /** ④ 强制人工验收 */
  humanRequired?: boolean
  /** ④ 灰区覆盖（缺省 0.6/0.8） */
  grayZone?: { low: number; high: number }
}

export interface VerifierContext {
  /** 任务目标（LLM 评判的 rubric 依据） */
  goal: string
  /** 验收标准（规划期声明） */
  acceptance?: string
}

export interface VerifierInput {
  output: unknown
  spec: VerificationSpec
  ctx: VerifierContext
  /** 已重试次数（LLM 评判失败降级/人工判定参考） */
  retryCount: number
}

export type VerifierDecision =
  | { action: 'pass'; score: number; defects: string[] }
  | { action: 'retry'; score: number; defects: string[]; feedback: string }
  | { action: 'human'; score: number; defects: string[]; reason: string }
  | { action: 'fail'; score: number; defects: string[]; reason: string }

/** 规则层结论（层间传递） */
interface RuleResult {
  ok: boolean
  defects: string[]
  score: number
}

/** 依赖端口：LLM 评判 / 沙箱检查（宿主注入，本模块不直连数据库/沙箱） */
export interface VerifierDeps {
  /** LLM 评判（resolveModel + generateText 由宿主封装；返回 0-1 分 + 缺陷） */
  llmJudge?: (input: { goal: string; acceptance?: string; output: string; rubricHints?: string[]; signal?: AbortSignal }) => Promise<{ score: number; defects: string[] }>
  /** ② 工具层：代码检查器（return {ok, message}）；宿主实现沙箱执行 */
  codeCheck?: (input: { output: unknown; code: string; signal?: AbortSignal }) => Promise<{ ok: boolean; message?: string }>
}

/** LLM 评判输出解析（容错：模型输出包裹文本时提取首个 JSON 对象） */
export function parseJudgeResponse(text: string): { score: number; defects: string[] } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as { score?: unknown; defects?: unknown }
      const score = Math.max(0, Math.min(1, Number(parsed.score) || 0))
      const defects = Array.isArray(parsed.defects) ? parsed.defects.map(String).slice(0, 10) : []
      return { score, defects }
    } catch {
      // fallthrough
    }
  }
  logger.warn('[verifier] 评判输出解析失败，按 0 分处理')
  return { score: 0, defects: ['评判输出不可解析'] }
}

/** ① 规则层（毫秒级必跑；失败即缺陷列表——retry 依据） */
export function runRuleChecks(input: VerifierInput): RuleResult {
  const defects: string[] = []
  const spec = input.spec
  const out = input.output
  if (spec.requiredFields && spec.requiredFields.length > 0) {
    if (out === null || out === undefined || typeof out !== 'object') {
      defects.push('产出不是 JSON 对象')
    } else {
      for (const field of spec.requiredFields) {
        const v = (out as Record<string, unknown>)[field]
        if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
          defects.push(`缺少必填字段：${field}`)
        }
      }
    }
  }
  if (spec.minLength !== undefined) {
    const text = typeof out === 'string' ? out : JSON.stringify(out ?? '')
    if (text.length < spec.minLength) {
      defects.push(`产出长度不足（${text.length} < ${spec.minLength}）`)
    }
  }
  if (spec.schema) {
    const parsed = spec.schema.safeParse(out)
    if (!parsed.success) {
      defects.push(`schema 校验失败：${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    }
  }
  return { ok: defects.length === 0, defects, score: defects.length === 0 ? 1 : 0 }
}

export class Verifier {
  private readonly deps: VerifierDeps

  constructor(deps: VerifierDeps = {}) {
    this.deps = deps
  }

  async verify(input: VerifierInput, signal?: AbortSignal): Promise<VerifierDecision> {
    const { spec, ctx } = input
    const grayLow = spec.grayZone?.low ?? DEFAULT_GRAY_LOW
    const grayHigh = spec.grayZone?.high ?? DEFAULT_GRAY_HIGH

    // ① 规则层：失败 = 确定性缺陷 → retry（带反馈自纠）
    const rule = runRuleChecks(input)
    if (!rule.ok) {
      return { action: 'retry', score: 0, defects: rule.defects, feedback: `规则校验未通过：${rule.defects.join('；')}` }
    }

    // ② 工具层（可选；异常按未执行处理并注记——验证器自身失败不该判死任务）
    if (spec.codeCheck && this.deps.codeCheck) {
      try {
        const r = await this.deps.codeCheck({ output: input.output, code: spec.codeCheck, signal })
        if (!r.ok) {
          return { action: 'retry', score: 0, defects: [r.message ?? '代码检查未通过'], feedback: `代码检查未通过：${r.message ?? ''}` }
        }
      } catch (e) {
        logger.warn(`[verifier] 代码检查执行失败（跳过该层）：${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // ③ LLM 评判（缺省启用；失败降级为仅规则结论 + 人工灰区裁决）
    let score = 1
    let defects: string[] = []
    if (spec.llmJudge !== false && this.deps.llmJudge) {
      try {
        const outputText = typeof input.output === 'string' ? input.output : JSON.stringify(input.output ?? null)
        const judge = await this.deps.llmJudge({ goal: ctx.goal, acceptance: ctx.acceptance, output: outputText.slice(0, 16_000), rubricHints: spec.rubricHints, signal })
        score = judge.score
        defects = judge.defects
      } catch (e) {
        logger.warn(`[verifier] LLM 评判失败（降级为规则结论）：${e instanceof Error ? e.message : String(e)}`)
        return { action: 'human', score: -1, defects: ['LLM 评判不可用'], reason: 'LLM 评判失败，需人工确认' }
      }
    }

    // ④ 分流（humanRequired 优先于 pass——review T11：强制人工验收曾可被高分旁路）
    if (spec.humanRequired) {
      return { action: 'human', score, defects, reason: '配置强制人工验收' }
    }
    if (score >= grayHigh) {
      return { action: 'pass', score, defects }
    }
    if (score >= grayLow) {
      if (spec.humanRequired) {
        return { action: 'human', score, defects, reason: '配置强制人工验收' }
      }
      // 灰区：带反馈重试一轮是廉价兜底；重试仍灰区 → 人工
      return input.retryCount === 0
        ? { action: 'retry', score, defects, feedback: `质量分 ${score.toFixed(2)} 未达验收线：${defects.join('；') || '请提升完整性与准确性'}` }
        : { action: 'human', score, defects, reason: `灰区分 ${score.toFixed(2)} 重试后仍未通过` }
    }
    // 低分：首试一律 retry（review T12：评判返回低分不附缺陷并不罕见，
    // defects 为空不再豁免；反馈用分数构造兜底文案）
    if (input.retryCount === 0) {
      return { action: 'retry', score, defects, feedback: `验收未通过（${score.toFixed(2)}）：${defects.join('；') || '请提升产出质量'}` }
    }
    return { action: 'fail', score, defects, reason: `质量分 ${score.toFixed(2)} 低于下限 ${grayLow}` }
  }
}
