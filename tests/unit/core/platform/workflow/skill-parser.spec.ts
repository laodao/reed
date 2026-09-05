/**
 * SKILL.md 解析器测试（纯函数）
 * @module tests/unit/core/platform/workflow/skill-parser
 * @description 校验 frontmatter 拆分、YAML 解析、必填/格式校验、inputs 参数 schema 规范化、
 *              调用控制（disable_model_invocation）与序列化往返。
 */
import { describe, it, expect } from 'vitest'
import { parseSkillMarkdown, serializeSkillMarkdown, splitSkillFrontmatter } from '@core/platform/workflow/skills/skill-parser'

const VALID_MD = `---
name: short-video-script
title: 短视频脚本
description: 生成短视频完整脚本
when_to_use: 需要短视频脚本时
category: 内容创作
inputs:
  - key: material
    label: 素材
    type: textarea
    required: true
  - key: duration
    type: number
    default: 60
  - key: style
    type: select
    default: 口播
    options:
      - { label: 口播, value: 口播 }
system_prompt: |-
  你是短视频编导。
output_desc: 输出口播稿+分镜表
---
正文指令，素材：{{param.material}}，时长：{{param.duration}} 秒。
`

describe('splitSkillFrontmatter', () => {
  it('拆分开头 --- 块：frontmatter 与正文分离', () => {
    const { frontmatter, body } = splitSkillFrontmatter(VALID_MD)
    expect(frontmatter).toContain('name: short-video-script')
    expect(body).toContain('正文指令')
    expect(body).not.toContain('name:')
  })

  it('无 frontmatter 块：整体作为正文', () => {
    const { frontmatter, body } = splitSkillFrontmatter('只有正文\n没有元数据')
    expect(frontmatter).toBe('')
    expect(body).toBe('只有正文\n没有元数据')
  })
})

describe('parseSkillMarkdown', () => {
  it('解析完整技能：元信息/参数/系统提示词/正文/调用控制', () => {
    const s = parseSkillMarkdown(VALID_MD, { source: 'user' })
    expect(s.id).toBe('short-video-script')
    expect(s.name).toBe('短视频脚本')
    expect(s.description).toBe('生成短视频完整脚本')
    expect(s.whenToUse).toBe('需要短视频脚本时')
    expect(s.category).toBe('内容创作')
    expect(s.source).toBe('user')
    expect(s.systemPrompt).toBe('你是短视频编导。')
    expect(s.body).toContain('正文指令')
    expect(s.outputDesc).toBe('输出口播稿+分镜表')
    expect(s.modelInvocable).toBe(true)
    // inputs 规范化
    expect(s.inputs).toHaveLength(3)
    expect(s.inputs[0]).toMatchObject({ key: 'material', label: '素材', type: 'textarea', required: true })
    expect(s.inputs[1]).toMatchObject({ key: 'duration', type: 'number', defaultValue: 60 })
    expect(s.inputs[2].options).toEqual([{ label: '口播', value: '口播' }])
  })

  it('name 非法（非 kebab-case）→ 报错', () => {
    expect(() => parseSkillMarkdown('---\nname: 短视频_脚本\n---\n正文')).toThrow(/kebab-case/)
    expect(() => parseSkillMarkdown('---\ndescription: 只有描述\n---\n正文')).toThrow(/kebab-case/)
  })

  it('缺 description → 报错；无 frontmatter → 报错', () => {
    expect(() => parseSkillMarkdown('---\nname: abc\n---\n正文')).toThrow(/description/)
    expect(() => parseSkillMarkdown('没有 frontmatter 的正文')).toThrow(/frontmatter/)
  })

  it('frontmatter YAML 语法错误 → 报错', () => {
    expect(() => parseSkillMarkdown('---\nname: [未闭合\n---\n正文')).toThrow(/YAML/)
  })

  it('disable_model_invocation: true → modelInvocable=false', () => {
    const ok = parseSkillMarkdown('---\nname: secret\ndescription: 禁用模型\ndisable_model_invocation: true\n---\n正文', { source: 'builtin' })
    expect(ok.modelInvocable).toBe(false)
    const dft = parseSkillMarkdown('---\nname: normal\ndescription: 默认\n---\n正文', { source: 'builtin' })
    expect(dft.modelInvocable).toBe(true)
  })

  it('inputs 非法项丢弃：缺 key / 非法 type / 非法 options', () => {
    const s = parseSkillMarkdown(`---
name: t1
description: 测试
inputs:
  - { label: 缺键 }
  - { key: bad, type: 'json' }
  - { key: ok, type: select, options: [ '非对象', { label: 'a', value: 'a' } ] }
---
正文`)
    expect(s.inputs).toHaveLength(1)
    expect(s.inputs[0].key).toBe('ok')
    expect(s.inputs[0].options).toEqual([{ label: 'a', value: 'a' }])
  })
})

describe('serializeSkillMarkdown', () => {
  it('序列化 → 再解析往返：核心字段一致', () => {
    const s = parseSkillMarkdown(VALID_MD, { source: 'user' })
    const text = serializeSkillMarkdown(s)
    const again = parseSkillMarkdown(text, { source: 'user' })
    expect(again.id).toBe(s.id)
    expect(again.name).toBe(s.name)
    expect(again.description).toBe(s.description)
    expect(again.category).toBe(s.category)
    expect(again.systemPrompt).toBe(s.systemPrompt)
    expect(again.body).toContain('正文指令')
    expect(again.inputs).toHaveLength(3)
    expect(again.inputs[1].defaultValue).toBe(60)
  })

  it('modelInvocable=false 序列化后带 disable_model_invocation', () => {
    const s = parseSkillMarkdown(VALID_MD)
    const text = serializeSkillMarkdown({ ...s, modelInvocable: false })
    expect(text).toContain('disable_model_invocation: true')
  })
})
