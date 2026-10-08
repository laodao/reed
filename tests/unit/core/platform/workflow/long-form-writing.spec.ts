/**
 * 长文写作 内置工作流专项测试（v2：通用长文引擎，虚构/非虚构双模式）
 * @module tests/unit/core/platform/workflow/long-form-writing
 * @description 校验编辑部级长文管线的结构语义：
 *              start → digest(素材消化) → modePick(双模式决策) → angle(开篇钩子比选) →
 *              storyline → outline(jsonMode) → loop 逐章(multiTurn 承接) → concat1 →
 *              factCheck(纪实模式事实逐条对照素材) → applyFix → editLoop(until 编辑评审循环：
 *              独立模型五维评分 → 按差距修订 → 打包) → titles(备选标题) → finalPack → 存库/存资产。
 *              钉死质量机制：material 素材通道、纪实模式事实纪律、评审 pass/revise 收敛口径、
 *              evalModel 独立评审模型；模板提示词保持领域无关。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'

const raw = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps/long-form-writing.json'),
  'utf-8'
)) as { name: string; description?: string; settings: Record<string, unknown>; graph: WorkflowGraph }

const graph = raw.graph
const byId = new Map(graph.nodes.map(n => [n.id, n]))
const configOf = (id: string): Record<string, unknown> => byId.get(id)?.config ?? {}

describe('长文写作 工作流（v2 编辑部级管线）', () => {
  it('通过结构校验（validateGraph）', () => {
    const result = validateGraph(graph)
    expect(result.valid, result.errors.join('；')).toBe(true)
  })

  it('settings.multiTurn=true（多轮对话承接前文）', () => {
    expect(raw.settings.multiTurn).toBe(true)
  })

  it('start 输入：主题必填 + material 素材通道 + 模式/读者/评审模型 + 原有输入', () => {
    const start = byId.get('start') as WorkflowNode
    const inputs = (start.config.inputs ?? []) as Array<{ key: string; type: string; required?: boolean; defaultValue?: unknown; options?: Array<{ value: string }> }>
    const byKey = new Map(inputs.map(i => [i.key, i]))
    expect(byKey.get('topic')?.required).toBe(true)
    // 素材通道：非虚构长文的事实唯一来源
    expect(byKey.get('material')?.type).toBe('textarea')
    // 双模式：auto（素材非空=纪实）/ nonfiction / fiction
    const mode = byKey.get('mode')!
    expect(mode.type).toBe('select')
    expect(mode.options?.map(o => o.value)).toEqual(['auto', 'nonfiction', 'fiction'])
    // 独立评审模型（可选）
    expect(byKey.get('evalModel')?.type).toBe('model')
    expect(byKey.get('evalModel')?.required).toBeFalsy()
    // 文风含深度纪实（默认）
    expect(byKey.get('style')?.options?.map(o => o.value)).toContain('深度纪实')
    expect(byKey.get('style')?.defaultValue).toBe('深度纪实')
    expect(byKey.get('chapterCount')?.type).toBe('number')
    expect(byKey.get('wordCountPerChapter')?.type).toBe('number')
    expect(byKey.get('traditional')?.defaultValue).toBe(false)
    expect(byKey.get('model')?.type).toBe('model')
    expect(byKey.get('kbId')?.type).toBe('select-dynamic')
  })

  it('主线节点链：digest → modePick → angle → storyline → outline → loop1 → concat1 → factCheck → applyFix → editLoop → titles → finalPack → 存档', () => {
    const e = graph.edges
    for (const [a, b] of [
      ['start', 'digest'], ['digest', 'modePick'], ['modePick', 'angle'], ['angle', 'storyline'],
      ['storyline', 'outline'], ['outline', 'loop1'],
      ['concat1', 'factCheck'], ['factCheck', 'applyFix'], ['applyFix', 'editLoop'],
      ['titles', 'finalPack'], ['finalPack', 'cond1'],
    ] as Array<[string, string]>) {
      expect(e.find(x => x.sourceNodeId === a && x.targetNodeId === b && x.kind === 'normal'), `${a}→${b}`).toBeTruthy()
    }
    expect(e.find(x => x.sourceNodeId === 'loop1' && x.targetNodeId === 'concat1' && x.kind === 'loop-done')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'editLoop' && x.targetNodeId === 'titles' && x.kind === 'loop-done')).toBeTruthy()
    // 知识库分支：hasKb→saveKb1，noKb→save1，saveKb1 也汇入 save1
    expect(e.find(x => x.sourceNodeId === 'cond1' && x.branchId === 'hasKb')?.targetNodeId).toBe('saveKb1')
    expect(e.find(x => x.sourceNodeId === 'cond1' && x.branchId === 'noKb')?.targetNodeId).toBe('save1')
    expect(e.find(x => x.sourceNodeId === 'saveKb1' && x.targetNodeId === 'save1')).toBeTruthy()
  })

  it('digest 素材消化：jsonMode + 素材注入 + 选材方案结构（叙事线/最强事实/引语库/口径冲突）', () => {
    const digest = configOf('digest')
    expect(digest.jsonMode).toBe(true)
    expect(String(digest.prompt)).toContain('{{start.material}}')
    expect(String(digest.prompt)).toContain('{{start.topic}}')
    const sp = String(digest.systemPrompt)
    for (const kw of ['叙事线', '最强事实', '引语', '口径冲突', '禁止编造']) expect(sp).toContain(kw)
  })

  it('modePick 双模式决策：auto 按素材自动、显式 fiction/nonfiction 可覆盖；纪实无素材回退小说', () => {
    const mp = configOf('modePick')
    expect(mp.language).toBe('js')
    const code = String(mp.code)
    expect(code).toContain("'nonfiction'")
    expect(code).toContain("'fiction'")
    expect(code).toContain("hasMaterial")
    const inputs = mp.inputs as Array<{ key: string; value: string }>
    const byKey = Object.fromEntries(inputs.map(i => [i.key, i.value]))
    expect(byKey.modeChoice).toBe('{{start.mode}}')
    expect(byKey.material).toBe('{{start.material}}')
    expect(byKey.digest).toBe('{{digest.parsed}}')
  })

  it('angle 开篇比选：钩子类型库 + 纪实模式钩子必须取自素材 + 择优输出', () => {
    const angle = configOf('angle')
    expect(angle.jsonMode).toBe(true)
    const sp = String(angle.systemPrompt)
    for (const kw of ['反差数字', '场景切入', '悬念设问', '纪实模式下钩子必须取自', '不得虚构']) expect(sp).toContain(kw)
    expect(String(angle.prompt)).toContain('{{digest.parsed}}')
    expect(String(angle.prompt)).toContain('{{modePick.result.mode}}')
  })

  it('storyline/outline 双模式：纪实主线只依据素材；outline 为纪实章节分配素材要点', () => {
    const slCfg = configOf('storyline')
    const sl = `${String(slCfg.systemPrompt)}
${String(slCfg.prompt)}`
    expect(sl).toContain('{{start.topic}}')
    expect(sl).toContain('{{start.premise}}')
    expect(sl).toContain('{{start.style}}')
    expect(sl).toContain('{{angle.parsed.chosen}}')
    expect(sl).toContain('{{digest.parsed}}')
    expect(sl).toContain('nonfiction')
    expect(sl).toContain('只依据素材')
    const outline = configOf('outline')
    expect(outline.jsonMode).toBe(true)
    const oAll = `${String(outline.systemPrompt)}
${String(outline.prompt)}`
    expect(oAll).toContain('{{storyline.content}}')
    expect(oAll).toContain('{{start.chapterCount}}')
    expect(oAll).toContain('facts')
  })

  it('loop 逐章：listExpression=大纲章节数组；chapter 注入选材方案与纪实事实纪律', () => {
    const loop = configOf('loop1')
    expect(loop.listExpression).toBe('{{outline.parsed}}')
    expect(loop.emptyPolicy).toBe('skip')
    const e = graph.edges
    expect(e.find(x => x.sourceNodeId === 'loop1' && x.targetNodeId === 'chapter' && x.kind === 'loop-body')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'chapter' && x.targetNodeId === 'loop1' && x.kind === 'loop-back')).toBeTruthy()
    const chapter = configOf('chapter')
    expect(byId.get('chapter')!.type).toBe('llm-chat')
    const p = String(chapter.prompt)
    expect(p).toContain('{{storyline.content}}')
    expect(p).toContain('{{outline.parsed}}')
    expect(p).toContain('{{loop1.item.title}}')
    expect(p).toContain('{{loop1.item.summary}}')
    expect(p).toContain('{{loop1.item.facts}}')
    expect(p).toContain('{{digest.parsed}}')
    expect(p).toContain('{{modePick.result.mode}}')
    expect(p).toContain('{{start.wordCountPerChapter}}')
    const sp = String(chapter.systemPrompt)
    expect(sp).toContain('承接前文')
    // 纪实事实纪律 + 写作手艺
    expect(sp).toContain('事实全部来自素材')
    expect(sp).toContain('口径标注')
    expect(sp).toContain('素材未覆盖')
    expect(sp).toContain('钩子')
  })

  it('factCheck 事实校验：jsonMode、fiction 直通、非虚构逐条对照素材并给修正全文', () => {
    const fc = configOf('factCheck')
    expect(fc.jsonMode).toBe(true)
    expect(Number(fc.maxTokens)).toBeGreaterThanOrEqual(32768)
    const sp = String(fc.systemPrompt)
    for (const kw of ['一致', '偏差', '素材未载', 'corrected', '引语必须逐字与素材一致']) expect(sp).toContain(kw)
    const p = String(fc.prompt)
    expect(p).toContain('{{start.material}}')
    expect(p).toContain('{{concat1.result}}')
    expect(p).toContain('{{modePick.result.mode}}')
    // applyFix：corrected 非空用修正版，否则原稿
    const af = configOf('applyFix')
    expect(af.language).toBe('js')
    expect(String(af.code)).toContain('corrected')
    const afIn = af.inputs as Array<{ key: string; value: string }>
    expect(afIn.find(i => i.key === 'corrected')?.value).toBe('{{factCheck.parsed.corrected}}')
    expect(afIn.find(i => i.key === 'draft')?.value).toBe('{{concat1.result}}')
  })

  it('editLoop 编辑评审循环：until+verdict=pass 收敛；五维评分；evalModel 独立评审；修订节点 pass 原样输出', () => {
    const loop = configOf('editLoop')
    expect(loop.mode).toBe('until')
    expect(loop.stopExpression).toBe('{{editPack.result.verdict}}')
    expect(loop.stopValue).toBe('pass')
    expect(Number(loop.maxIterations)).toBeGreaterThanOrEqual(2)
    const e = graph.edges
    expect(e.find(x => x.sourceNodeId === 'editLoop' && x.targetNodeId === 'editEval' && x.kind === 'loop-body')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'editPack' && x.targetNodeId === 'editLoop' && x.kind === 'loop-back')).toBeTruthy()
    const ev = configOf('editEval')
    expect(ev.jsonMode).toBe(true)
    // 独立评审模型：走可选 evalModel（未配置时由引擎回退默认链）
    expect(String(ev.providerConfigId)).toContain('{{start.evalModel.providerConfigId}}')
    const sp = String(ev.systemPrompt)
    for (const kw of ['hook', 'pacing', 'factDensity', 'language', 'ending', 'verdict', 'gaps']) expect(sp).toContain(kw)
    expect(String(ev.prompt)).toContain('{{applyFix.result.draft}}')
    // editFix：pass 原样输出；revise 按 gaps 定位修订；maxTokens 放宽防截断
    const fix = configOf('editFix')
    const fsp = String(fix.systemPrompt)
    expect(fsp).toContain('verdict=pass')
    expect(fsp).toContain('原样输出')
    expect(fsp).toContain('chapterHint')
    expect(Number(fix.maxTokens)).toBeGreaterThanOrEqual(32768)
    // editPack：打包 draft + verdict
    const pk = configOf('editPack')
    const pkIn = pk.inputs as Array<{ key: string; value: string }>
    expect(pkIn.find(i => i.key === 'draft')?.value).toBe('{{editFix.content}}')
    expect(pkIn.find(i => i.key === 'verdict')?.value).toBe('{{editEval.parsed.verdict}}')
  })

  it('titles 备选标题：jsonMode + 纪实模式标题数字必须来自正文；finalPack 组装终稿', () => {
    const t = configOf('titles')
    expect(t.jsonMode).toBe(true)
    expect(String(t.systemPrompt)).toContain('必须来自正文')
    expect(String(t.prompt)).toContain('{{editLoop.last.result.draft}}')
    const fp = configOf('finalPack')
    expect(fp.language).toBe('js')
    const fpIn = fp.inputs as Array<{ key: string; value: string }>
    expect(fpIn.find(i => i.key === 'draft')?.value).toBe('{{editLoop.last.result.draft}}')
    expect(fpIn.find(i => i.key === 'titles')?.value).toBe('{{titles.parsed}}')
  })

  it('保存：subCategory=长文写作；存档引用 finalPack 终稿（正文+标题方案）', () => {
    expect(configOf('save1').subCategory).toBe('长文写作')
    expect(String(configOf('save1').content)).toContain('{{finalPack.result.md}}')
    expect(configOf('saveKb1').content).toBe('{{finalPack.result.md}}')
  })

  it('领域无关：模板提示词不写死任何具体主题', () => {
    const prompts = graph.nodes
      .filter(n => ['llm-chat'].includes(n.type))
      .map(n => `${String(n.config.systemPrompt ?? '')}\n${String(n.config.prompt ?? '')}`)
      .join('\n')
    for (const kw of ['缅北', '电诈', '电商', '开店', '直播带货']) {
      expect(prompts, kw).not.toContain(kw)
    }
  })

  it('全部变量引用可解析：节点存在 + 字段在目录输出中；关键链路存在', () => {
    const varRef = /{{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)}}/g
    const seen = new Set<string>()
    const collect = (obj: unknown, nodeId: string) => {
      if (typeof obj === 'string') {
        for (const m of obj.matchAll(varRef)) {
          const [, srcNode, field] = m
          if (srcNode === 'sys') continue
          const key = `${nodeId}->${srcNode}.${field}`
          if (seen.has(key)) continue
          seen.add(key)
          if (srcNode === 'start') {
            const inputs = (byId.get('start')?.config.inputs ?? []) as Array<{ key: string }>
            expect(inputs.some(i => i.key === field), `start 缺输入 ${field}（引用自 ${nodeId}）`).toBe(true)
            continue
          }
          expect(byId.has(srcNode), `${nodeId} 引用不存在的节点 ${srcNode}`).toBe(true)
          if (!byId.has(srcNode)) continue
          const schema = NODE_TYPE_CATALOG_MAP[byId.get(srcNode)!.type]?.outputSchema ?? []
          expect(schema.some(f => f.key === field), `${nodeId} 引用 ${srcNode}.${field} 不在目录输出中`).toBe(true)
        }
      } else if (Array.isArray(obj)) obj.forEach(v => collect(v, nodeId))
      else if (obj && typeof obj === 'object') for (const v of Object.values(obj)) collect(v, nodeId)
    }
    for (const node of graph.nodes) collect(node.config, node.id)
    // 二级引用（x.y 两段）被正则捕获；≥三段引用由各专项断言覆盖
    expect(seen.has('digest->start.material')).toBe(true)
    expect(seen.has('concat1->loop1.results')).toBe(true)
    expect(seen.has('chapter->outline.parsed')).toBe(true)
    expect(seen.has('finalPack->titles.parsed')).toBe(true)
    expect(seen.has('editPack->editFix.content')).toBe(true)
    // 三级/四级引用专项断言（不被二级正则捕获）
    expect(String(configOf('storyline').prompt)).toContain('{{angle.parsed.chosen}}')
    expect(String(configOf('factCheck').prompt)).toContain('{{modePick.result.mode}}')
    expect((configOf('finalPack').inputs as Array<{ key: string; value: string }>).find(i => i.key === 'draft')?.value).toBe('{{editLoop.last.result.draft}}')
    expect((configOf('applyFix').inputs as Array<{ key: string; value: string }>).find(i => i.key === 'corrected')?.value).toBe('{{factCheck.parsed.corrected}}')
  })
})
