/**
 * 长文设计契约——校验器（2026-09-16 结构化设定方案 §6 L0，M0 骨架）
 *
 * 两级校验：
 * 1. 结构层：ajv + JSON Schema（类型/必填/ID pattern/kind-前缀对齐）
 * 2. 语义层（本文件 semantic walk，M0 基础项）：ID 唯一性、跨实体引用完整性、
 *    暗线 plant<develop<payoff 时序、grid 章号唯一、与 spine 对照的章界
 *
 * 错误统一 {path, code, message}（path 为 JSON Pointer），回喂设计 agent 修复回路。
 * M1 扩展点：落库后引用解析（BibleQueryService）、与谓词词表的联动校验。
 */

import Ajv, { type ValidateFunction } from 'ajv'
import {
  CHAPTER_CARD_FACTS_SCHEMA,
  DESIGN_SCHEMAS,
  SPINE_SCHEMA,
  VOLUME_DESIGN_SCHEMA,
  type SpineDoc,
  type VolumeDesignDoc,
} from './schemas'

export interface DesignIssue {
  /** JSON Pointer 风格路径，如 /grid/3/present/1；顶层为 '/' */
  path: string
  code: string
  message: string
}

export interface DesignValidationResult {
  ok: boolean
  errors: DesignIssue[]
}

let ajvInstance: Ajv | null = null

function getAjv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv({ allErrors: true, allowUnionTypes: true })
    for (const schema of DESIGN_SCHEMAS) ajvInstance.addSchema(schema as unknown as Record<string, unknown>)
  }
  return ajvInstance
}

function toIssues(validate: ValidateFunction | undefined): DesignIssue[] {
  const errors = validate?.errors
  if (validate === undefined || errors == null) return []
  return errors.map(e => ({
    path: e.instancePath || '/',
    code: e.keyword,
    message: e.message ? `${e.instancePath || '/'} ${e.message}` : '校验失败',
  }))
}

function combine(structural: DesignIssue[], semantic: DesignIssue[]): DesignValidationResult {
  const errors = [...structural, ...semantic]
  return { ok: errors.length === 0, errors }
}

// ---------- 结构校验 ----------

export function validateSpineStructure(doc: unknown): DesignIssue[] {
  const validate = getAjv().getSchema(SPINE_SCHEMA.$id)
  const valid = validate?.(doc)
  return valid ? [] : toIssues(validate)
}

export function validateVolumeDesignStructure(doc: unknown): DesignIssue[] {
  const validate = getAjv().getSchema(VOLUME_DESIGN_SCHEMA.$id)
  const valid = validate?.(doc)
  return valid ? [] : toIssues(validate)
}

export function validateChapterCardFactsStructure(facts: unknown): DesignIssue[] {
  const validate = getAjv().getSchema(CHAPTER_CARD_FACTS_SCHEMA.$id)
  const valid = validate?.(facts)
  return valid ? [] : toIssues(validate)
}

// ---------- 语义 walk（M0 基础项） ----------

function duplicated<T>(values: T[]): T[] {
  const seen = new Set<T>()
  const dups = new Set<T>()
  for (const v of values) {
    if (seen.has(v)) dups.add(v)
    seen.add(v)
  }
  return [...dups]
}

export function semanticCheckSpine(doc: SpineDoc): DesignIssue[] {
  const issues: DesignIssue[] = []
  for (const id of duplicated(doc.main_lines.map(l => l.id))) {
    issues.push({ path: `/main_lines`, code: 'duplicate_id', message: `故事线 id 重复：${id}` })
  }
  for (const id of duplicated(doc.core_cast)) {
    issues.push({ path: '/core_cast', code: 'duplicate_ref', message: `核心人物重复引用：${id}` })
  }
  const volumes = doc.volumes
  for (const id of duplicated(volumes.map(v => v.id))) {
    issues.push({ path: '/volumes', code: 'duplicate_id', message: `卷 id 重复：${id}` })
  }
  for (let i = 0; i < volumes.length; i++) {
    for (let j = i + 1; j < volumes.length; j++) {
      const a = volumes[i]
      const b = volumes[j]
      if (a.chapter_range.from <= b.chapter_range.to && b.chapter_range.from <= a.chapter_range.to) {
        issues.push({
          path: `/volumes/${j}/chapter_range`,
          code: 'chapter_range_overlap',
          message: `卷 ${a.id} 与 ${b.id} 章节区间重叠（${a.chapter_range.from}-${a.chapter_range.to} vs ${b.chapter_range.from}-${b.chapter_range.to}）`,
        })
      }
    }
  }
  return issues
}

export function semanticCheckVolume(doc: VolumeDesignDoc, spine?: SpineDoc): DesignIssue[] {
  const issues: DesignIssue[] = []

  for (const id of duplicated(doc.cast.map(c => c.id))) {
    issues.push({ path: '/cast', code: 'duplicate_id', message: `cast id 重复：${id}` })
  }
  for (const id of duplicated(doc.threads.map(t => t.id))) {
    issues.push({ path: '/threads', code: 'duplicate_id', message: `暗线 id 重复：${id}` })
  }
  for (const id of duplicated(doc.events.map(e => e.id))) {
    issues.push({ path: '/events', code: 'duplicate_id', message: `事件 id 重复：${id}` })
  }
  for (const ch of duplicated(doc.grid.map(g => g.ch))) {
    issues.push({ path: '/grid', code: 'duplicate_chapter', message: `章节网格重复：第 ${ch} 章` })
  }

  const castIds = new Set(doc.cast.map(c => c.id))
  const threadIds = new Set(doc.threads.map(t => t.id))
  const spineCast = new Set(spine?.core_cast ?? [])
  const knownEntity = (id: string) => castIds.has(id) || spineCast.has(id)

  doc.grid.forEach((entry, gi) => {
    for (const id of entry.present ?? []) {
      if (!knownEntity(id)) {
        issues.push({ path: `/grid/${gi}/present`, code: 'unresolved_ref', message: `第 ${entry.ch} 章出场 ${id} 不在 cast${spine ? ' 与 spine.core_cast' : ''} 中` })
      }
    }
    if (entry.location && !knownEntity(entry.location) && !castIds.has(entry.location)) {
      issues.push({ path: `/grid/${gi}/location`, code: 'unresolved_ref', message: `第 ${entry.ch} 章地点 ${entry.location} 不在 cast 中` })
    }
    for (const [ai, action] of (entry.line_actions ?? []).entries()) {
      if (!threadIds.has(action.line)) {
        issues.push({ path: `/grid/${gi}/line_actions/${ai}/line`, code: 'unresolved_ref', message: `第 ${entry.ch} 章引用的暗线 ${action.line} 未定义` })
      }
    }
  })

  for (const [ti, thread] of doc.threads.entries()) {
    for (const id of thread.involves) {
      if (!knownEntity(id)) {
        issues.push({ path: `/threads/${ti}/involves`, code: 'unresolved_ref', message: `暗线 ${thread.id} 牵涉的 ${id} 不在 cast${spine ? ' 与 spine.core_cast' : ''} 中` })
      }
    }
    if (thread.payoff !== undefined && thread.payoff <= thread.plant) {
      issues.push({ path: `/threads/${ti}/payoff`, code: 'thread_order', message: `暗线 ${thread.id} payoff（${thread.payoff}）必须晚于 plant（${thread.plant}）` })
    }
    for (const ch of thread.develop ?? []) {
      if (ch <= thread.plant || (thread.payoff !== undefined && ch >= thread.payoff)) {
        issues.push({ path: `/threads/${ti}/develop`, code: 'thread_order', message: `暗线 ${thread.id} develop 章 ${ch} 必须落在 plant（${thread.plant}）与 payoff（${thread.payoff ?? '∞'}）之间` })
      }
    }
  }

  for (const [ei, event] of doc.events.entries()) {
    for (const id of event.participants) {
      if (!knownEntity(id)) {
        issues.push({ path: `/events/${ei}/participants`, code: 'unresolved_ref', message: `事件 ${event.id} 参与者 ${id} 不在 cast${spine ? ' 与 spine.core_cast' : ''} 中` })
      }
    }
  }

  if (spine) {
    const volume = spine.volumes.find(v => v.id === doc.volume)
    if (!volume) {
      issues.push({ path: '/volume', code: 'unresolved_ref', message: `卷 ${doc.volume} 未在 spine.volumes 中声明` })
    } else {
      for (const [gi, entry] of doc.grid.entries()) {
        if (entry.ch < volume.chapter_range.from || entry.ch > volume.chapter_range.to) {
          issues.push({ path: `/grid/${gi}/ch`, code: 'chapter_out_of_range', message: `第 ${entry.ch} 章超出卷 ${doc.volume} 区间（${volume.chapter_range.from}-${volume.chapter_range.to}）` })
        }
      }
    }
  }

  return issues
}

// ---------- 组合入口 ----------

export function validateSpine(doc: unknown): DesignValidationResult {
  const structural = validateSpineStructure(doc)
  if (structural.length > 0) return combine(structural, [])
  return combine(structural, semanticCheckSpine(doc as SpineDoc))
}

export function validateVolumeDesign(doc: unknown, spine?: SpineDoc): DesignValidationResult {
  const structural = validateVolumeDesignStructure(doc)
  if (structural.length > 0) return combine(structural, [])
  return combine(structural, semanticCheckVolume(doc as VolumeDesignDoc, spine))
}

export function validateChapterCardFacts(facts: unknown): DesignValidationResult {
  return combine(validateChapterCardFactsStructure(facts), [])
}

/** 规范化错误报告（回喂 agent 时的紧凑文本形态） */
export function formatIssues(issues: DesignIssue[]): string {
  return issues.map(i => `- [${i.code}] ${i.path}: ${i.message}`).join('\n')
}
