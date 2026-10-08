/**
 * 多平台文案生成 内置工作流专项测试（v2：素材驱动分发器）
 * @module tests/unit/core/platform/workflow/multi-platform-copy
 * @description 校验：material 素材通道注入策略提炼与逐平台生成；平台覆盖含今日头条；
 *              事实纪律（素材非空时事实与引语锁定素材并保留出处口径）；逐平台自检清单；
 *              策略提炼 jsonMode 与平台调性描述完整。模板提示词保持领域无关。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
import type { WorkflowGraph } from '@shared/types/workflow.types'

const raw = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps/multi-platform-copy.json'),
  'utf-8'
)) as { name: string; settings: Record<string, unknown>; graph: WorkflowGraph }

const graph = raw.graph
const byId = new Map(graph.nodes.map(n => [n.id, n]))
const configOf = (id: string): Record<string, unknown> => byId.get(id)?.config ?? {}

describe('多平台文案生成 工作流（v2 素材驱动分发器）', () => {
  it('通过结构校验（validateGraph）', () => {
    const result = validateGraph(graph)
    expect(result.valid, result.errors.join('；')).toBe(true)
  })

  it('start 输入：material 素材通道 + 平台多选含今日头条', () => {
    const inputs = (byId.get('start')?.config.inputs ?? []) as Array<{ key: string; type: string; multi?: boolean; required?: boolean; options?: Array<{ label: string; value: string }> }>
    const byKey = new Map(inputs.map(i => [i.key, i]))
    expect(byKey.get('topic')?.required).toBe(true)
    expect(byKey.get('material')?.type).toBe('textarea')
    const plats = byKey.get('platforms')!
    expect(plats.multi).toBe(true)
    expect(plats.required).toBe(true)
    const values = plats.options?.map(o => o.value) ?? []
    for (const v of ['wechat', 'toutiao', 'zhihu', 'weibo', 'xiaohongshu', 'douyin']) {
      expect(values, v).toContain(v)
    }
  })

  it('strategy1 策略提炼：jsonMode + 素材注入 + 主张/论点必须有素材依据', () => {
    const s1 = configOf('strategy1')
    expect(s1.jsonMode).toBe(true)
    const sp = String(s1.systemPrompt)
    expect(sp).toContain('素材')
    expect(sp).toContain('依据')
    const p = String(s1.prompt)
    expect(p).toContain('{{start.material}}')
    expect(p).toContain('{{start.keyPoints}}')
  })

  it('gen1 逐平台生成：六大平台调性（含头条）+ 事实纪律 + 逐平台自检', () => {
    const g1 = configOf('gen1')
    const sp = String(g1.systemPrompt)
    // 平台调性覆盖
    for (const kw of ['wechat 公众号', 'toutiao 今日头条', 'xiaohongshu 小红书', 'weibo 微博', 'zhihu 知乎', 'douyin 抖音']) {
      expect(sp, kw).toContain(kw)
    }
    // 头条调性要点
    expect(sp).toContain('段落短')
    expect(sp).toContain('标题信息量')
    // 事实纪律
    expect(sp).toContain('必须来自素材')
    expect(sp).toContain('出处')
    // 逐平台自检清单
    for (const kw of ['自检', '前三行', '敏感表述']) expect(sp).toContain(kw)
    const p = String(g1.prompt)
    expect(p).toContain('{{loop1.item}}')
    expect(p).toContain('{{start.material}}')
    expect(p).toContain('{{strategy1.parsed.claim}}')
  })

  it('审核与产出链路：逐平台 loop → 审核载荷组装 → 人工审核 → 报告 → 存资产', () => {
    const e = graph.edges
    expect(e.find(x => x.sourceNodeId === 'strategy1' && x.targetNodeId === 'loop1')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'loop1' && x.targetNodeId === 'gen1' && x.kind === 'loop-body')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'gen1' && x.targetNodeId === 'loop1' && x.kind === 'loop-back')).toBeTruthy()
    // reviewPrep：把各平台文案预组装成含 output_result 的 payload——
    // 「直接批准」原样直通（修复无编辑批准丢文案），「修改后批准」被 editedValues 覆盖
    expect(e.find(x => x.sourceNodeId === 'loop1' && x.targetNodeId === 'reviewPrep' && x.kind === 'loop-done')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'reviewPrep' && x.targetNodeId === 'review1')).toBeTruthy()
    expect(String(configOf('review1').payload)).toBe('{{reviewPrep.result}}')
    expect(String(configOf('review1').payload)).not.toContain('{{loop1.results}}')
    const prep = configOf('reviewPrep')
    expect(prep.language).toBe('js')
    expect(String(prep.code)).toContain('output_result')
    expect(e.find(x => x.sourceNodeId === 'review1' && x.targetNodeId === 'report1')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'report1' && x.targetNodeId === 'save1')).toBeTruthy()
    expect(String(configOf('report1').template)).toContain('{{review1.output_result}}')
  })

  it('领域无关：模板提示词不写死任何具体主题', () => {
    const prompts = graph.nodes
      .filter(n => n.type === 'llm-chat')
      .map(n => `${String(n.config.systemPrompt ?? '')}\n${String(n.config.prompt ?? '')}`)
      .join('\n')
    for (const kw of ['缅北', '电诈', '电商选品', '开店']) {
      expect(prompts, kw).not.toContain(kw)
    }
  })
})
