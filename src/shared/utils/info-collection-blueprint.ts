/**
 * 信息搜集：蓝图程序化自检（纯函数，双端可用）
 * @module shared/utils/info-collection-blueprint
 *
 * 背景（主设计 §3 阶段 1 质量闸门）：蓝图质量决定一切后续质量，自检全部程序化——
 * 不过自检不允许执行（快速模式不允许自动确认；精调模式不允许提交确认）。
 *
 * 可得上性定位：自检是启发式，真正的可得性只有执行能证实（§3 阶段 1）。
 * 本检查钉死的是**结构性缺陷**（不可判定/无查询词/预算不匹配），不是内容正确性。
 */

import type {
  IcBlueprint,
  IcMeasureConvention,
  IcRequirement,
} from '@shared/types/info-collection.types'

export interface IcBlueprintIssue {
  severity: 'error' | 'warning'
  /** 违规位置（可定位：requirements[R2] / schemas[s1] / stopRules…） */
  path: string
  message: string
}

export interface IcBlueprintCheckResult {
  ok: boolean
  errors: IcBlueprintIssue[]
  warnings: IcBlueprintIssue[]
}

/** 每 IR 预留的最少工具调用次数（阶段 1 自检 ⑤ 的 N） */
export const MIN_TOOL_CALLS_PER_REQUIREMENT = 8

function checkRequirement(req: IcRequirement, index: number, out: IcBlueprintIssue[]): void {
  const path = `requirements[${req.id || `#${index}`}]`
  if (!req.id) out.push({ severity: 'error', path, message: 'IR 缺少稳定 id' })
  if (!req.question || !req.question.trim()) {
    out.push({ severity: 'error', path, message: 'IR 问题为空（不可判定满足与否）' })
  }
  if (req.question && req.question.length > 200) {
    out.push({ severity: 'warning', path, message: 'IR 问题过长，疑似多条需求未原子化（一条 IR 只问一件事）' })
  }
}

/** measure 约定映射的字段必须真实存在于 schema properties（③ 可得上性） */
function checkConvention(
  schemaId: string,
  convention: IcMeasureConvention,
  properties: Set<string>,
  out: IcBlueprintIssue[],
): void {
  const path = `schemas[${schemaId}].convention`
  if (convention.type !== 'measure') {
    out.push({ severity: 'error', path, message: `未知约定类型 ${String(convention.type)}` })
    return
  }
  const requiredFields: Array<[string, string | undefined]> = [
    ['value', convention.map.value],
    ['unit', convention.map.unit],
    ['period', convention.map.period],
    ['metric', convention.map.metric],
  ]
  for (const [name, field] of requiredFields) {
    if (!field) {
      out.push({ severity: 'error', path, message: `measure 约定缺少 ${name} 字段映射` })
    } else if (!properties.has(field)) {
      out.push({ severity: 'error', path, message: `约定列 ${name} 映射的字段 "${field}" 不在 schema properties 中（抽不到的字段不许出现）` })
    }
  }
  for (const dim of convention.map.dims ?? []) {
    if (!properties.has(dim)) {
      out.push({ severity: 'error', path, message: `维度 "${dim}" 不在 schema properties 中` })
    }
  }
}

/**
 * 蓝图自检（阶段 1 ①-⑤）。errors 非空 = 不允许执行。
 * 返回值永远是完整清单（错误+警告），调用方决定展示方式。
 */
export function checkBlueprint(bp: IcBlueprint): IcBlueprintCheckResult {
  const issues: IcBlueprintIssue[] = []

  // ① 每条 IR 可判定满足与否（问题非空 + 形态/优先级合法 + id 唯一）
  const reqIds = new Set<string>()
  ;(bp.requirements ?? []).forEach((req, i) => {
    if (req.id && reqIds.has(req.id)) {
      issues.push({ severity: 'error', path: `requirements[${req.id}]`, message: 'IR id 重复' })
    }
    reqIds.add(req.id)
    checkRequirement(req, i, issues)
  })
  if ((bp.requirements ?? []).length === 0) {
    issues.push({ severity: 'error', path: 'requirements', message: '信息需求清单为空：没有可判定目标，任务无法判停' })
  }

  // schema：properties 存在且非空；convention/checks 引用合法；schema id 唯一
  const schemaIds = new Set<string>()
  for (const schema of bp.schemas ?? []) {
    const path = `schemas[${schema.id || '?'}]`
    if (!schema.id) issues.push({ severity: 'error', path, message: 'schema 缺少 id' })
    if (schema.id && schemaIds.has(schema.id)) {
      issues.push({ severity: 'error', path, message: 'schema id 重复' })
    }
    schemaIds.add(schema.id)
    const props = (schema.jsonSchema as { properties?: Record<string, unknown> } | undefined)?.properties
    if (!props || typeof props !== 'object' || Object.keys(props).length === 0) {
      issues.push({ severity: 'error', path, message: 'schema 无 properties 或为空（不可校验抽取结果）' })
      continue
    }
    const propNames = new Set(Object.keys(props))
    // IR 引用的 schemaId 必须存在
    if (schema.id && !bp.requirements.some(r => r.schemaId === schema.id)) {
      issues.push({ severity: 'warning', path, message: 'schema 未被任何 IR 引用（死规格）' })
    }
    if (schema.convention) checkConvention(schema.id, schema.convention, propNames, issues)
  }
  for (const req of bp.requirements ?? []) {
    if (req.schemaId && !schemaIds.has(req.schemaId)) {
      issues.push({
        severity: 'error',
        path: `requirements[${req.id}]`,
        message: `引用的 schema "${req.schemaId}" 不存在`,
      })
    }
  }

  // ② 每条 IR 至少映射到一条种子查询（程序化下界：种子非空，且数量足以覆盖 must 级）
  const seeds = bp.sourceStrategy?.seedQueries ?? []
  if (seeds.length === 0) {
    issues.push({ severity: 'error', path: 'sourceStrategy.seedQueries', message: '查询词种子为空：IR 无任何检索入口' })
  } else {
    const mustCount = (bp.requirements ?? []).filter(r => r.priority === 'must').length
    if (mustCount > 0 && seeds.length < mustCount) {
      issues.push({
        severity: 'warning',
        path: 'sourceStrategy.seedQueries',
        message: `种子查询（${seeds.length}）少于 must 级 IR（${mustCount}）：疑似部分需求无检索入口`,
      })
    }
  }

  // ④ must 级 IR 的独立源下限 ≥2
  const hasMust = (bp.requirements ?? []).some(r => r.priority === 'must')
  const minSources = bp.stopRules?.minIndependentSources ?? 0
  if (hasMust && minSources < 2) {
    issues.push({
      severity: 'error',
      path: 'stopRules.minIndependentSources',
      message: '存在 must 级 IR 但独立源下限 <2：关键结论将只能孤证支撑',
    })
  }

  // ⑤ 预算与 IR 数量匹配
  const budget = bp.stopRules?.budget
  const irCount = (bp.requirements ?? []).length
  if (!budget || !budget.maxToolCalls || !budget.maxMinutes) {
    issues.push({ severity: 'error', path: 'stopRules.budget', message: '预算缺失：无熔断依据' })
  } else {
    if (budget.maxToolCalls < irCount * MIN_TOOL_CALLS_PER_REQUIREMENT) {
      issues.push({
        severity: 'warning',
        path: 'stopRules.budget.maxToolCalls',
        message: `工具调用预算（${budget.maxToolCalls}）低于每 IR ${MIN_TOOL_CALLS_PER_REQUIREMENT} 次的下限（${irCount * MIN_TOOL_CALLS_PER_REQUIREMENT}）：大概率中途熔断`,
      })
    }
    if (budget.maxMinutes < 5) {
      issues.push({ severity: 'warning', path: 'stopRules.budget.maxMinutes', message: '时长预算 <5 分钟：常规任务跑不完' })
    }
  }

  // 覆盖率目标合法性
  const coverage = bp.stopRules?.coverageTarget
  if (coverage === undefined || coverage <= 0 || coverage > 1) {
    issues.push({ severity: 'error', path: 'stopRules.coverageTarget', message: '覆盖率目标必须在 (0,1] 内' })
  }

  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')
  return { ok: errors.length === 0, errors, warnings }
}
