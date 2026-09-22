/**
 * 写作侧大脑查询工具单测（纯注入，不起数据库）
 * @see src/core/platform/services/kb-brain/writing-brain-tool.ts
 */
import { describe, it, expect } from 'vitest'
import {
  buildWritingBrainTool,
  hasEnabledBrainKb,
  type WritingBrainToolDeps,
} from '@core/platform/services/kb-brain/writing-brain-tool'

type Execute = (input: unknown) => Promise<string>

function getExecute(deps?: WritingBrainToolDeps): Execute {
  const built = buildWritingBrainTool(deps) as { execute: Execute }
  return built.execute
}

describe('hasEnabledBrainKb', () => {
  it('无启用库 → false；有启用库 → true', async () => {
    expect(await hasEnabledBrainKb({ listEnabledKbs: async () => [] })).toBe(false)
    expect(await hasEnabledBrainKb({ listEnabledKbs: async () => [{ id: 'kb1' }] })).toBe(true)
  })
})

describe('buildWritingBrainTool.execute', () => {
  const search = (rows: Array<{ success: boolean; data?: Array<{ kind?: string; documentName?: string; content: string }> }>) =>
    async (_req: { knowledgeBaseId: string }) => rows.shift() ?? { success: true, data: [] }

  it('多库合并：统一编号 + 类型中文标签 + 来源文档', async () => {
    const execute = getExecute({
      listEnabledKbs: async () => [{ id: 'kb1' }, { id: 'kb2' }],
      search: search([
        { success: true, data: [{ kind: 'note', documentName: '诛仙', content: '吸引力设计方法：钩子体系…' }] },
        { success: true, data: [{ kind: 'atom', documentName: '长夜提灯人', content: '主角每次突破前必先失去' }] },
      ]),
    })
    const out = await execute({ query: '开篇钩子手法' })
    expect(out).toContain('[1] 经验卡｜来源：诛仙｜吸引力设计方法')
    expect(out).toContain('[2] 论断｜来源：长夜提灯人｜主角每次突破前必先失去')
  })

  it('无命中 → 可读提示（含检索词）', async () => {
    const execute = getExecute({
      listEnabledKbs: async () => [{ id: 'kb1' }],
      search: async () => ({ success: true, data: [] }),
    })
    const out = await execute({ query: '修真门派法宝' })
    expect(out).toContain('没有检索到')
    expect(out).toContain('修真门派法宝')
  })

  it('未启用任何大脑 → 直接说明并跳过', async () => {
    const execute = getExecute({ listEnabledKbs: async () => [] })
    const out = await execute({ query: '悬念节奏' })
    expect(out).toContain('没有启用的大脑')
  })

  it('全部知识库检索失败 → 返回失败而非误报「无知识」', async () => {
    const execute = getExecute({
      listEnabledKbs: async () => [{ id: 'kb1' }, { id: 'kb2' }],
      search: async () => ({ success: false, error: 'embedding 未配置' }),
    })
    const out = await execute({ query: '爽点节奏' })
    expect(out).toContain('检索失败')
    expect(out).not.toContain('没有检索到')
  })

  it('检索失败 → 返回错误文本而非 throw（模型可继续写作）', async () => {
    const execute = getExecute({
      listEnabledKbs: async () => [{ id: 'kb1' }],
      search: async () => {
        throw new Error('embedding 未配置')
      },
    })
    const out = await execute({ query: '爽点节奏' })
    expect(out).toContain('大脑检索失败')
    expect(out).toContain('embedding 未配置')
  })

  it('单条超长 content 截断到 240 字', async () => {
    const execute = getExecute({
      listEnabledKbs: async () => [{ id: 'kb1' }],
      search: async () => ({
        success: true,
        data: [{ kind: 'atom', documentName: '书A', content: 'x'.repeat(400) }],
      }),
    })
    const out = await execute({ query: 'q' })
    expect(out).toContain('x'.repeat(240))
    expect(out).not.toContain('x'.repeat(241))
  })

  it('总体积超上限 → 截断注记', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      kind: 'atom',
      documentName: `书${i}`,
      content: 'y'.repeat(240),
    }))
    const execute = getExecute({
      listEnabledKbs: async () => [{ id: 'kb1' }],
      search: async () => ({ success: true, data: rows }),
    })
    const out = await execute({ query: 'q' })
    expect(out).toContain('已达体积上限')
    expect(out.length).toBeLessThan(3200)
  })

  it('空检索词 → 不执行检索', async () => {
    let called = 0
    const execute = getExecute({
      listEnabledKbs: async () => [{ id: 'kb1' }],
      search: async () => {
        called++
        return { success: true, data: [] }
      },
    })
    const out = await execute({ query: '  ' })
    expect(out).toContain('检索词为空')
    expect(called).toBe(0)
  })
})
