/**
 * SKILL.md 解析器（纯函数）
 * @module core/platform/workflow/skills/skill-parser
 * @description 解析技能文件为 WorkflowSkill：
 *  - SKILL.md 形态：开头 --- 块（YAML frontmatter）+ markdown 正文；
 *  - frontmatter 字段：name（kebab-case 必填）/ description（必填）/ title（中文展示名）/
 *    when_to_use / category / inputs（参数 schema，the-bot 扩展）/ system_prompt /
 *    output_desc / disable_model_invocation（调用控制，参考 DSH）；
 *  - 正文 = 任务指令，可含 {{param.xxx}} 占位（节点执行时替换）。
 */

import * as YAML from 'js-yaml'
import { SKILL_NAME_PATTERN } from '@shared/types/workflow-skill.types'
import type { WorkflowSkill, WorkflowSkillInput } from '@shared/types/workflow-skill.types'

export interface SkillFileParts {
  /** frontmatter 原始文本（--- 之间，不含分隔线） */
  frontmatter: string
  /** 正文（frontmatter 之后的全部内容） */
  body: string
}

/** 从技能文件文本拆分 frontmatter 与正文（开头 --- 块；无块则 frontmatter 为空） */
export function splitSkillFrontmatter(text: string): SkillFileParts {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!m) return { frontmatter: '', body: text }
  return { frontmatter: m[1], body: text.slice(m[0].length) }
}

/** 把 YAML 值规范为字符串（非字符串返回 ''） */
function asText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** 规范化 inputs 参数 schema：每项必须 key；type 限定；非法项丢弃 */
function normalizeInputs(raw: unknown): WorkflowSkillInput[] {
  if (!Array.isArray(raw)) return []
  const out: WorkflowSkillInput[] = []
  const allowed = new Set(['string', 'textarea', 'number', 'boolean', 'select'])
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const it = item as Record<string, unknown>
    const key = asText(it.key)
    if (!key) continue
    const type = asText(it.type) || 'string'
    if (!allowed.has(type)) continue
    const options = Array.isArray(it.options)
      ? it.options
          .filter(o => o && typeof o === 'object' && !Array.isArray(o))
          .map(o => {
            const v = (o as Record<string, unknown>).value
            return { label: String((o as Record<string, unknown>).label ?? v), value: typeof v === 'number' ? v : String(v) }
          })
      : undefined
    out.push({
      key,
      label: it.label !== undefined ? String(it.label) : undefined,
      type: type as WorkflowSkillInput['type'],
      required: it.required === true,
      defaultValue: it.default !== undefined ? it.default : undefined,
      options: options && options.length > 0 ? options : undefined,
      help: it.help !== undefined ? String(it.help) : undefined,
    })
  }
  return out
}

/** 解析技能文件文本为 WorkflowSkill（纯函数；source 默认 user，由调用方按来源覆盖） */
export function parseSkillMarkdown(content: string, opts: { dirPath?: string | null; source?: 'builtin' | 'user' } = {}): WorkflowSkill {
  const { frontmatter: fmText, body } = splitSkillFrontmatter(content)
  if (!fmText.trim()) throw new Error('技能文件缺少 frontmatter（--- YAML 块）')
  let fm: unknown
  try {
    fm = YAML.load(fmText)
  } catch (e) {
    throw new Error(`frontmatter YAML 解析失败: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) throw new Error('frontmatter 必须是 YAML 对象')
  const f = fm as Record<string, unknown>

  const id = asText(f.name)
  if (!SKILL_NAME_PATTERN.test(id)) {
    throw new Error(`技能 name 必须是 kebab-case（当前: ${id || '（空）'}）`)
  }
  const description = asText(f.description)
  if (!description) throw new Error(`技能 ${id} 的 description 不能为空`)
  const title = asText(f.title)
  const disableModel = f.disable_model_invocation === true

  return {
    id,
    name: title || id,
    description,
    whenToUse: asText(f.when_to_use) || undefined,
    category: asText(f.category) || '未分类',
    source: opts.source ?? 'user',
    dirPath: opts.dirPath ?? null,
    inputs: normalizeInputs(f.inputs),
    outputDesc: asText(f.output_desc) || undefined,
    systemPrompt: asText(f.system_prompt),
    body: body.trim(),
    modelInvocable: !disableModel,
  }
}

/** 把 WorkflowSkill 序列化为 SKILL.md 文本（导出/保存用） */
export function serializeSkillMarkdown(skill: WorkflowSkill): string {
  const fm: Record<string, unknown> = {
    name: skill.id,
    description: skill.description,
  }
  if (skill.name && skill.name !== skill.id) fm.title = skill.name
  if (skill.whenToUse) fm.when_to_use = skill.whenToUse
  if (skill.category && skill.category !== '未分类') fm.category = skill.category
  if (skill.inputs.length > 0) fm.inputs = skill.inputs.map(i => ({
    key: i.key,
    ...(i.label ? { label: i.label } : {}),
    ...(i.type && i.type !== 'string' ? { type: i.type } : {}),
    ...(i.required ? { required: true } : {}),
    ...(i.defaultValue !== undefined ? { default: i.defaultValue } : {}),
    ...(i.options && i.options.length > 0 ? { options: i.options } : {}),
    ...(i.help ? { help: i.help } : {}),
  }))
  if (skill.systemPrompt) fm.system_prompt = skill.systemPrompt
  if (skill.outputDesc) fm.output_desc = skill.outputDesc
  if (!skill.modelInvocable) fm.disable_model_invocation = true
  const body = skill.body.trim()
  const yaml = YAML.dump(fm, { lineWidth: 120 })
  return `---\n${yaml}---\n${body ? `\n${body}\n` : ''}`
}
