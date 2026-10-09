/**
 * 信息搜集：蓝图起草服务（主设计 §3 阶段 0/1）
 * @module core/packs/info-collection/services/ic-blueprint.service
 *
 * 蓝图 = 运行时 AI 对当前主题现场起草的通用计划（非预制配置）：
 * 快速模式 AI 起草 → 自检通过自动确认即锁；精调模式人审确认后锁。
 * 归一纪律照搬 kb-brain：先归一后校验，别名映射 + 缺省填充 + 坏条目剔除——
 * 模型多吐字段/近义命名不致命；自检不过（error 级）调用方不得放行执行。
 */

import type { IcLlmFn } from './ic-deps'
import { checkBlueprint } from '@shared/utils/info-collection-blueprint'
import type { IcBlueprintCheckResult } from '@shared/utils/info-collection-blueprint'
import type { IcBlueprint, IcPriority, IcRequirement, IcRequirementForm, IcSourceTier } from '@shared/types/info-collection.types'
import { parseJsonObject } from '@shared/utils/info-collection-json'
import { generateCompletionText } from '@core/platform/services/simple-llm'

const BLUEPRINT_SYSTEM = `你是信息搜集规划师。把用户的主题变成一份"采集蓝图"JSON——先规格后采集，蓝图质量决定后续一切搜集质量。

纪律：
1. 信息需求（requirements）原子化：一条只问一件事，每条必须可独立判定"满足/不满足"；id 用 R1/R2/…；必答项标 must，重要非必须 should，锦上添花 nice。
2. 需求形态 form 取：data（数值/表格）| fact（事实要点）| document（文件/政策/报告）| opinion（观点）| case（案例）。data 类需求配 schema（jsonSchema + convention 映射）。
3. convention 只支持 type='measure'（数值投影 value/unit/period/metric/dims）；非数值的结构/清单/条款类 schema 不要写 convention，只给 jsonSchema。convention.map 的字段名必须真实出现在 jsonSchema.properties 里（抽不到的字段不许出现）。
4. 种子查询（seedQueries）覆盖全部 must 级需求：同义扩展 + 中英双语 + 不同切入角度（机构视角/数据视角/事件视角）；primaryHint 列出该主题应优先直取的权威域名或出版物。
5. 文件型资料：法规原文、统计年鉴、办事指南、白皮书、财报常以文档直链发布——主题涉及这类资料时，seedQueries 必须附加 filetype:pdf / filetype:docx 算子的查询（如「主题词 filetype:pdf」），系统会优先抓取文档原件并提取全文（比网页转述更权威）。
6. 图片资料（照片/图表/示意图）：图片以直链（.jpg/.png 等结尾）出现时会被抓取建档并生成视觉描述；图表数据类需求可在 seedQueries 附加「图表」「示意图」等词。
7. 用户没有明说的口径（时间范围/地域/语言/单位）不要替用户决定——写进 assumptions。
8. 只输出一个 JSON 对象，不要输出任何其他文字。`

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function asTier(v: unknown): IcSourceTier | undefined {
  return v === 1 || v === 2 || v === 3 || v === 4 ? v : undefined
}

function asForm(v: unknown): IcRequirementForm {
  return v === 'data' || v === 'document' || v === 'opinion' || v === 'case' ? v : 'fact'
}

function asPriority(v: unknown): IcPriority {
  return v === 'must' || v === 'nice' ? v : 'should'
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(x => asString(x)).filter((x): x is string => !!x)
}

/** 整理产出物规格归一：接受字符串或 {kind,title} 对象；空则给安全缺省 */
function normalizeDeliverables(v: unknown): IcBlueprint['organizationSpec'] {
  const fallback: IcBlueprint['organizationSpec'] = [{ kind: 'summary-cards' }, { kind: 'source-list' }]
  if (!Array.isArray(v)) return fallback
  const out: IcBlueprint['organizationSpec'] = []
  for (const d of v) {
    if (typeof d === 'string' && d.trim()) {
      out.push({ kind: d.trim() })
      continue
    }
    if (d && typeof d === 'object') {
      const rec = d as Record<string, unknown>
      const kind = asString(rec.kind)
      if (kind) out.push({ kind, title: asString(rec.title) ?? undefined })
    }
  }
  return out.length > 0 ? out : fallback
}

/**
 * 归一模型起草的蓝图（先归一后校验）：
 * 填缺省、修 id 冲突、丢弃悬空 schemaId 引用、剔除坏条目。
 */
export function normalizeBlueprintDraft(raw: unknown): IcBlueprint {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const goal = asString(obj.goal) ?? '未命名主题'
  const assumptions = asStringArray(obj.assumptions)

  // requirements：剔除问题为空的条目；id 缺失/重复时重编
  const seenIds = new Set<string>()
  const requirements: IcBlueprint['requirements'] = []
  const rawReqs = Array.isArray(obj.requirements) ? obj.requirements : []
  rawReqs.forEach((r, i) => {
    const rec = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const question = asString(rec.question)
    if (!question) return
    let id = asString(rec.id) ?? `R${i + 1}`
    while (seenIds.has(id)) id = `${id}x`
    seenIds.add(id)
    requirements.push({
      id,
      question,
      form: asForm(rec.form),
      priority: asPriority(rec.priority),
      schemaId: asString(rec.schemaId) ?? undefined,
      timeWindow:
        rec.timeWindow && typeof rec.timeWindow === 'object'
          ? (rec.timeWindow as IcRequirement['timeWindow'])
          : undefined,
      tierFloor: asTier(rec.tierFloor),
    })
  })

  // schemas：只保留 id + jsonSchema 结构合法的条目
  const schemaIds = new Set<string>()
  const schemas: IcBlueprint['schemas'] = []
  const rawSchemas = Array.isArray(obj.schemas) ? obj.schemas : []
  for (const s of rawSchemas) {
    const rec = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
    const id = asString(rec.id)
    const jsonSchema = rec.jsonSchema
    if (!id || schemaIds.has(id) || !jsonSchema || typeof jsonSchema !== 'object') continue
    schemaIds.add(id)
    // convention 只支持 measure（数值投影）；模型发明的其它类型（catalog/clause 等）丢弃
    // convention 但保留 schema——非数值结构表仍可走纯 jsonSchema 抽取（2026-10-08 真机：
    // 模型给"文本结构目录"发明了 catalog 导致整份蓝图自检判死，与宽进严出相悖）。
    const rawConvention = rec.convention && typeof rec.convention === 'object' ? rec.convention : null
    const convention =
      rawConvention && (rawConvention as { type?: unknown }).type === 'measure'
        ? (rawConvention as IcBlueprint['schemas'][number]['convention'])
        : undefined
    const checks = Array.isArray(rec.checks) ? (rec.checks as IcBlueprint['schemas'][number]['checks']) : undefined
    schemas.push({
      id,
      title: asString(rec.title) ?? id,
      jsonSchema: jsonSchema as Record<string, unknown>,
      convention,
      checks,
    })
  }
  // 悬空 schemaId 引用直接丢弃（比整份打回更符合"尽力而为归一"）
  for (const req of requirements) {
    if (req.schemaId && !schemaIds.has(req.schemaId)) req.schemaId = undefined
  }

  const rawStrategy = (obj.sourceStrategy && typeof obj.sourceStrategy === 'object' ? obj.sourceStrategy : {}) as Record<string, unknown>
  const hasMust = requirements.some(r => r.priority === 'must')
  const rawRules = (obj.stopRules && typeof obj.stopRules === 'object' ? obj.stopRules : {}) as Record<string, unknown>
  const rawBudget = (rawRules.budget && typeof rawRules.budget === 'object' ? rawRules.budget : {}) as Record<string, unknown>

  const minTierRaw = asTier(rawStrategy.minTier)
  const blueprint: IcBlueprint = {
    version: 1,
    goal,
    assumptions,
    requirements,
    schemas,
    sourceStrategy: {
      channels: ['search'],
      minTier: minTierRaw ?? (hasMust ? 1 : 2),
      languages: asStringArray(rawStrategy.languages).length > 0 ? asStringArray(rawStrategy.languages) : ['zh'],
      seedQueries: asStringArray(rawStrategy.seedQueries),
      primaryHint: asStringArray(rawStrategy.primaryHint),
    },
    stopRules: {
      coverageTarget: typeof rawRules.coverageTarget === 'number' ? rawRules.coverageTarget : 0.8,
      minIndependentSources: typeof rawRules.minIndependentSources === 'number' ? rawRules.minIndependentSources : 2,
      marginalRounds: typeof rawRules.marginalRounds === 'number' ? rawRules.marginalRounds : 2,
      budget: {
        maxToolCalls: typeof rawBudget.maxToolCalls === 'number' ? rawBudget.maxToolCalls : 300,
        maxMinutes: typeof rawBudget.maxMinutes === 'number' ? rawBudget.maxMinutes : 120,
      },
    },
    organizationSpec: normalizeDeliverables(obj.organizationSpec),
    autoConfirm: false, // 安全缺省：确认动作永远由调用方（快速模式自检通过后 / 精调模式人审）显式置位
  }
  return blueprint
}

export interface IcBlueprintDraft {
  blueprint: IcBlueprint
  check: IcBlueprintCheckResult
}

/**
 * AI 起草蓝图：goal → LLM → 归一 → 自检。
 * LLM 不可用 / 输出无 JSON / 需求清单为空 → 抛中文错误（响亮失败）。
 * check.errors 非空时**不抛**——返回给调用方展示（快速模式据此拒绝自动确认）。
 */
export async function draftBlueprint(
  goal: string,
  opts?: { llm?: IcLlmFn },
): Promise<IcBlueprintDraft> {
  const trimmed = (goal ?? '').trim()
  if (!trimmed) throw new Error('主题描述为空，无法起草蓝图')
  const llm: IcLlmFn =
    opts?.llm ??
    (req => generateCompletionText('ic-blueprint', req))

  const user = `主题：${trimmed}

请起草采集蓝图，JSON 形状：
{
  "goal": "主题与边界的一句话表述",
  "assumptions": ["未被用户确认的口径假设"],
  "requirements": [{ "id": "R1", "question": "…", "form": "data|fact|document|opinion|case", "priority": "must|should|nice", "schemaId": "可选，data 类指向 schemas" }],
  "schemas": [{ "id": "s1", "title": "…", "jsonSchema": { "type": "object", "properties": { … } },
                "convention": { "type": "measure", "map": { "value": "字段", "unit": "字段", "period": "字段", "metric": "字段", "dims": ["字段"] } } }],
  "sourceStrategy": { "channels": ["search"], "minTier": 1, "languages": ["zh"], "seedQueries": ["…"], "primaryHint": ["权威域名"] },
  "stopRules": { "coverageTarget": 0.8, "minIndependentSources": 2, "marginalRounds": 2, "budget": { "maxToolCalls": 300, "maxMinutes": 120 } },
  "organizationSpec": [{ "kind": "summary-cards" }, { "kind": "data-table" }, { "kind": "source-list" }]
}`
  const text = await llm({ system: BLUEPRINT_SYSTEM, user, maxTokens: 8000 })
  const parsed = parseJsonObject(text)
  if (!parsed) {
    // 响亮失败：把模型原始输出头部记进日志（否则"输出无法解析"永远无法诊断）
    const { createLogger } = await import('@core/utils/logger')
    createLogger('IcBlueprint').warn(
      `[blueprint] 模型输出无法解析为 JSON（len=${text?.length ?? 0}）：${String(text ?? '').slice(0, 600)}`,
    )
    throw new Error('蓝图起草失败：模型输出无法解析为 JSON，请重试')
  }
  const blueprint = normalizeBlueprintDraft(parsed)
  if (blueprint.requirements.length === 0) {
    throw new Error('蓝图起草失败：模型未能拆解出任何信息需求，请换个说法重试')
  }
  return { blueprint, check: checkBlueprint(blueprint) }
}
