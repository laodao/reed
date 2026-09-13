/**
 * 内置技能 research-method（调研方法：报告内容 · 分析维度 · 数据来源）守卫测试
 * @module tests/unit/core/platform/workflow/builtin-skills-research-method.spec
 *
 * 背景：调研经验此前内联在主题研究工作流模板的节点提示词里——写少了报告单薄，写多了
 * 就变成领域硬编码（公式/逐日时间线），换个主题就跑偏。本 spec 钉死经验已收敛为
 * 平台内置技能（可被 discover_capabilities 发现 / invoke_skill 调用 / skill-call 节点执行）：
 * - 报告应包含哪些内容（报告骨架）；
 * - 应从哪些方面分析（分析维度矩阵）；
 * - 应从哪些地方获取数据（数据来源路由，含取不到时的降级路径）；
 * - 什么算做完（取证与呈现纪律 + 执行计划与验收标准）；
 * - 领域无关：技能只给类别与示例，不写任何单一领域的结论。
 */

import { describe, it, expect } from 'vitest'
import * as YAML from 'js-yaml'
import { BUILTIN_SKILLS } from '@core/platform/workflow/skills/builtin-skills'
import { parseSkillMarkdown, splitSkillFrontmatter } from '@core/platform/workflow/skills/skill-parser'

const SKILL_ID = 'research-method'

function findSkill(): { id: string; markdown: string } | undefined {
  return BUILTIN_SKILLS.find((s) => s.id === SKILL_ID)
}

const md = findSkill()?.markdown ?? ''
const fm = splitSkillFrontmatter(md).frontmatter
const body = splitSkillFrontmatter(md).body
const yaml = (() => {
  try {
    return (YAML.load(fm) ?? {}) as Record<string, unknown>
  } catch {
    return {} as Record<string, unknown>
  }
})()

describe('research-method（调研方法技能）', () => {
  it('已注册为内置技能（可被 discover_capabilities / invoke_skill 发现）', () => {
    expect(findSkill()).toBeTruthy()
  })

  it('frontmatter 元信息齐全且可解析（name/title/description/when_to_use/category）', () => {
    expect(yaml.name).toBe(SKILL_ID)
    expect(String(yaml.title ?? '')).toContain('调研')
    expect(String(yaml.description ?? '').length).toBeGreaterThan(20)
    expect(String(yaml.when_to_use ?? '').length).toBeGreaterThan(8)
    expect(yaml.category).toBe('调研')
    // 应允许模型自主调用（聊天 Agent 才能发现并使用）
    expect(yaml.disable_model_invocation).toBeUndefined()
  })

  it('参数 schema 覆盖调研所需上下文（主题/目标/类型/深度/约束/必达产出/已有材料）', () => {
    const inputs = Array.isArray(yaml.inputs) ? (yaml.inputs as Array<Record<string, unknown>>) : []
    const keys = inputs.map((i) => i.key)
    for (const key of ['topic', 'goal', 'domainType', 'depth', 'constraints', 'requiredOutputs', 'knownContext']) {
      expect(keys).toContain(key)
    }
    const topic = inputs.find((i) => i.key === 'topic')
    expect(topic?.required).toBe(true)
  })

  it('正文含固定六节骨架：范围与目标 / 报告骨架 / 分析维度 / 数据来源 / 取证纪律 / 验收标准', () => {
    for (const section of [
      '范围与决策目标',
      '报告骨架',
      '分析维度',
      '数据来源',
      '取证与呈现纪律',
      '执行计划与验收标准',
    ]) {
      expect(body).toContain(section)
    }
  })

  it('报告内容经验：结论先行 + 口径范围 + 证据呈现 + 路径方案 + 风险红线 + 行动门槛 + 局限待核验 + 分层来源', () => {
    for (const item of [
      '执行摘要',
      '口径',
      '决策树',
      '风险',
      '红线',
      '门槛',
      '局限',
      '参考来源',
      '附录',
    ]) {
      expect(body).toContain(item)
    }
  })

  it('分析维度经验：含维度矩阵与常见误区，且维度库足够通用', () => {
    for (const dim of ['单位经济', '准入', '合规', '竞争', '替代', '供给', '渠道', '时效', '分歧', '失败模式']) {
      expect(body).toContain(dim)
    }
    expect(body).toContain('误区')
  })

  it('数据来源经验：覆盖 8 类来源，且每类给出取不到时的降级路径', () => {
    for (const source of [
      '官方一手',
      '平台后台',
      '行业',
      '财报',
      '学术',
      '专利',
      '社区',
      '竞品',
      '工具',
      '降级',
    ]) {
      expect(body).toContain(source)
    }
  })

  it('取证纪律：三态标注 / 禁止编造 / 矛盾并列 / 采集时间 / 反方观点 / 可点击来源', () => {
    for (const rule of ['未查到', '禁止编造', '矛盾', '采集时间', '反方', '可点击']) {
      expect(body).toContain(rule)
    }
  })

  it('验收经验：must-answer 颗粒度 + 证据层级 + 非阻塞项口径（避免该停不停）', () => {
    for (const item of ['must-answer', '证据层级', '非阻塞']) {
      expect(body).toContain(item)
    }
  })

  it('领域无关：不写死任何单一领域的专有名词与结论', () => {
    for (const domainWord of ['TikTok', '抖音', '亚马逊', 'Amazon', '淘宝']) {
      expect(body).not.toContain(domainWord)
    }
  })

  it('可被解析器解析为 WorkflowSkill（模型可调用）', () => {
    const parsed = parseSkillMarkdown(md, { source: 'builtin' })
    expect(parsed.id).toBe(SKILL_ID)
    expect(parsed.modelInvocable).toBe(true)
    expect(parsed.inputs.length).toBeGreaterThanOrEqual(7)
    expect(parsed.body.length).toBeGreaterThan(2000)
    expect(parsed.outputDesc.length).toBeGreaterThan(10)
  })
})
