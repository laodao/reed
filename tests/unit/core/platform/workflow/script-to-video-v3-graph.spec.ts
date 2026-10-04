/**
 * script-to-video-v3 内置图结构与语义校验（写作层技能化 + 配图相关性升级后）
 * @module tests/unit/core/platform/workflow/script-to-video-v3-graph
 * @description V3（通用视觉策略 + 写作层技能 + 真实素材配图）生成器产物 JSON 的本地校验：
 *              - validateGraph 0 errors（图结构/端口/循环边合法）
 *              - start 含 visualStrategy / 写作技能 / 真实素材库凭据 / 片段来源；出片规格默认 1080×1920
 *              - strategy(code) 插在 preset→writerPick 之间（auto 解析/素材门控/policyText）
 *              - 写作层 writerPick→writerCall→writerMd→outlineReview
 *              - shotsGen 注入场景词典并约定逐镜真实场景字段（subject/setting/英文 searchQuery）
 *              - 素材环 visualShot(shot-visual) → matItem；shotPack/imgShot 已移除
 *              - 片段规划 segPlan（真实视频直用 / 图片运镜 / H3 可选）→ loopVideo(仅 H3) → segments
 *              - 两级审核 reject→end 语义保留
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'

const doc = JSON.parse(
  readFileSync(join(process.cwd(), 'src/core/database/migrations/builtin-apps/script-to-video-v3.json'), 'utf-8')
) as {
  name: string
  graph: { nodes: Array<{ id: string; type: string; config: Record<string, unknown> }>; edges: Array<{ sourceNodeId: string; targetNodeId: string; kind: string }> }
}
const g = doc.graph
const node = (id: string) => {
  const n = g.nodes.find(x => x.id === id)
  if (!n) throw new Error('no node ' + id)
  return n
}
const edgesOf = (src: string, tgt: string, kind?: string) =>
  g.edges.filter(e => e.sourceNodeId === src && e.targetNodeId === tgt && (!kind || e.kind === kind))
const inputsOf = (id: string) =>
  node(id).config.inputs as Array<{
    key: string
    type: string
    required?: boolean
    defaultValue?: string | number
    source?: string
    options?: Array<{ value: string }>
  }>
const cfgInputs = (id: string) =>
  new Map((node(id).config.inputs as Array<{ key: string; value: string }>).map(i => [i.key, i.value]))

describe('script-to-video-v3 图结构与语义', () => {
  it('validateGraph 0 errors（36 节点 / 40 边，写作层与视觉层节点齐全）', () => {
    const r = validateGraph({ version: 1, nodes: g.nodes, edges: g.edges })
    expect(r.errors).toEqual([])
    expect(g.nodes.length).toBe(36)
    expect(g.edges.length).toBe(40)
    for (const gone of ['outlineGen', 'outlineMd', 'shotPack', 'imgShot']) {
      expect(g.nodes.some(n => n.id === gone), `应已移除 ${gone}`).toBe(false)
    }
    for (const id of ['writerPick', 'writerCall', 'writerMd', 'visualShot', 'segPlan']) {
      expect(g.nodes.some(n => n.id === id), `缺少 ${id}`).toBe(true)
    }
  })

  it('start 含 visualStrategy / 写作技能 / 真实素材库 / 片段来源，出片规格 1080×1920', () => {
    const inputs = inputsOf('start')
    const vs = inputs.find(i => i.key === 'visualStrategy')
    expect(vs).toBeTruthy()
    expect(vs!.type).toBe('select')
    expect(vs!.options!.map(o => o.value)).toEqual(['auto', 'imagery', 'asset'])

    const ws = inputs.find(i => i.key === 'writerSkill')
    expect(ws).toBeTruthy()
    expect(ws!.defaultValue).toBe('auto')
    expect(ws!.options!.map(o => o.value)).toContain('video-writer-investigative')
    expect(ws!.options!.map(o => o.value)).toContain('video-writer-standard')
    const wa = inputs.find(i => i.key === 'writerAttitude')
    expect(wa).toBeTruthy()
    expect(wa!.options!.map(o => o.value)).toEqual(['auto', '冷静调查', '犀利质疑', '共情叙事'])
    expect(inputs.some(i => i.key === 'writerAngle')).toBe(true)

    // 真实素材库（配图相关性）：凭据走 select-dynamic credentials（key 不落运行记录）
    const cred = inputs.find(i => i.key === 'stockCredentialId')
    expect(cred?.type).toBe('select-dynamic')
    expect(cred?.source).toBe('credentials')
    expect(inputs.find(i => i.key === 'stockProvider')!.options!.map(o => o.value)).toEqual(['pexels', 'pixabay'])
    expect(inputs.find(i => i.key === 'stockKind')!.defaultValue).toBe('auto')
    // 片段来源：默认 auto（真实素材/图片运镜），h3 为可选慢路径
    expect(inputs.find(i => i.key === 'clipSource')!.options!.map(o => o.value)).toEqual(['auto', 'h3'])
    // auto 模式不跑 H3 → 视频 Provider 不该是必填（改由 segPlan 在 h3 模式运行期把关）
    expect(inputs.find(i => i.key === 'videoProviderConfigId')!.required).toBe(false)
    // 视觉质检模型（可选）
    expect(inputs.find(i => i.key === 'visionModel')!.type).toBe('model')
    // 可投放规格
    expect(inputs.find(i => i.key === 'width')!.defaultValue).toBe(1080)
    expect(inputs.find(i => i.key === 'height')!.defaultValue).toBe(1920)
  })

  it('strategy(code) 插在 preset→writerPick 之间（原直连 outlineGen 已移除）', () => {
    expect(node('strategy').type).toBe('code')
    expect(edgesOf('preset', 'outlineGen')).toHaveLength(0)
    expect(edgesOf('preset', 'strategy')).toHaveLength(1)
    expect(edgesOf('strategy', 'writerPick')).toHaveLength(1)
    const code = String(node('strategy').config.code)
    expect(code).toContain('choice')
    expect(code).toContain('assetDependency')
    expect(code).toContain('throw new Error')
    expect(code).toContain('policyText')
    expect(cfgInputs('strategy').get('policy')).toBe('{{preset.policy}}')
    expect(cfgInputs('strategy').get('baseAssets')).toBe('{{readBase.assets}}')
  })

  it('写作层：writerPick 按 videoType 映射 → writerCall(skill-call 动态 skillId) → writerMd → outlineReview', () => {
    const pickCode = String(node('writerPick').config.code)
    expect(pickCode).toContain("'financial-deep': 'video-writer-investigative'")
    expect(pickCode).toContain("'video-writer-standard'")
    expect(cfgInputs('writerPick').get('videoType')).toBe('{{start.videoType}}')
    expect(cfgInputs('writerPick').get('writerSkill')).toBe('{{start.writerSkill}}')

    const wc = node('writerCall')
    expect(wc.type).toBe('skill-call')
    expect((wc.config as { skillId: string }).skillId).toBe('{{writerPick.result.skillId}}')
    expect((wc.config as { providerConfigId: string }).providerConfigId).toBe('{{start.model.providerConfigId}}')
    const wcInputs = cfgInputs('writerCall')
    expect(wcInputs.get('material')).toBe('{{scriptSrc.result.text}}')
    expect(wcInputs.get('context')).toBe('{{kbText.result.text}}')
    expect(wcInputs.get('topic')).toBe('{{start.topic}}')
    expect(wcInputs.get('keyPoints')).toBe('{{start.keyPoints}}')
    expect(wcInputs.get('attitude')).toBe('{{start.writerAttitude}}')
    expect(wcInputs.get('angle')).toBe('{{start.writerAngle}}')

    expect(String(node('writerMd').config.code)).toContain('md')
    expect(edgesOf('writerPick', 'writerCall')).toHaveLength(1)
    expect(edgesOf('writerCall', 'writerMd')).toHaveLength(1)
    expect(edgesOf('writerMd', 'outlineReview')).toHaveLength(1)
    expect((node('outlineReview').config.payload as { md: string }).md).toBe('{{writerMd.result.md}}')
    expect(edgesOf('outlineReview', 'baseList')).toHaveLength(1)
    expect(edgesOf('baseList', 'shotsGen')).toHaveLength(1)
  })

  it('shotsGen 注入场景词典 + 逐镜真实场景字段（subject/setting/英文 searchQuery）', () => {
    const sp = String(node('shotsGen').config.systemPrompt)
    expect(sp).toContain('{{preset.sceneText}}')
    expect(sp).toContain('{{strategy.result.policyText}}')
    expect(sp).toContain('{{strategy.result.mode}}')
    expect(sp).toContain('{{outlineReview.md}}')
    expect(sp).toContain('{{strategy.result.baseCount}}')
    for (const field of ['subject', 'setting', 'searchQuery', 'altQueries', 'shotSize', 'cameraMove', 'assetIdx']) {
      expect(sp, `拆镜契约缺少 ${field}`).toContain(field)
    }
    // 画面纪律：真实可拍场景 + 禁止文字/图表
    expect(sp).toContain('真实世界可拍摄的具体场景')
    expect(sp).toContain('禁止')
  })

  it('素材环：visualShot(shot-visual) 逐镜生产画面，matItem 组装卡片（含来源/相关性/出处）', () => {
    const vs = node('visualShot')
    expect(vs.type).toBe('shot-visual')
    expect(edgesOf('loopMat', 'visualShot', 'loop-body')).toHaveLength(1)
    expect(edgesOf('visualShot', 'matItem')).toHaveLength(1)
    expect(edgesOf('matItem', 'loopMat', 'loop-back')).toHaveLength(1)
    // 镜头语义逐字段注入（shot-visual 是任务节点，配置为直接字段而非 inputs 数组）
    const vsc = vs.config as Record<string, unknown>
    expect(vsc.subject).toBe('{{loopMat.item.subject}}')
    expect(vsc.setting).toBe('{{loopMat.item.setting}}')
    expect(vsc.searchQuery).toBe('{{loopMat.item.searchQuery}}')
    expect(vsc.altQueries).toBe('{{loopMat.item.altQueries}}')
    expect(vsc.styleText).toBe('{{preset.styleText}}')
    // 三层供给：素材库凭据/种类/阈值；生成兜底；视觉质检
    expect(vsc.stockCredentialId).toBe('{{start.stockCredentialId}}')
    expect(vsc.stockProvider).toBe('{{start.stockProvider}}')
    expect(vsc.stockKind).toBe('{{start.stockKind}}')
    expect(vsc.generateFallback).toBe(true)
    expect(vsc.imageModelId).toBe('{{start.imageModelId}}')
    expect(vsc.qaProviderConfigId).toBe('{{start.visionModel.providerConfigId}}')
    expect(Number(vsc.stockMinScore)).toBeGreaterThan(0)
    expect(Number(vsc.minScore)).toBeGreaterThan(0)
    expect(String(vsc.negativePrompt)).toContain('文字')

    const matCode = String(node('matItem').config.code)
    expect(matCode).toContain("mode: 'imagery'")
    expect(matCode).toContain("source: v.source || 'generated'")
    expect(matCode).toContain('clipPath')
    expect(matCode).toContain('relevance')
    expect(matCode).toContain('pageUrl')
    expect(cfgInputs('matItem').get('visual')).toBe('{{visualShot}}')

    // asset 模式卡片保持原语义
    expect(String(node('matBase').config.code)).toContain("mode: 'asset'")
    expect(String(node('matBase').config.code)).toContain("'asset:' + srcId")
  })

  it('boardMerge 摘要带来源/相关性/出处（授权留痕）；素材板审核 payload 带 visualStrategy', () => {
    const code = String(node('boardMerge').config.code)
    expect(code).toContain('stock-video')
    expect(code).toContain('stock-image')
    expect(code).toContain('相关性')
    expect(code).toContain('出处')
    const payload = node('boardReview').config.payload as Record<string, unknown>
    expect(payload.visualStrategy).toBe('{{strategy.result.mode}}')
  })

  it('片段规划：boardReview→segPlan→loopVideo(仅 H3)→segments→合成，二级审核 reject→end 保留', () => {
    expect(edgesOf('boardReview', 'segPlan', 'approve')).toHaveLength(1)
    expect(edgesOf('segPlan', 'loopVideo')).toHaveLength(1)
    const plan = String(node('segPlan').config.code)
    expect(plan).toContain('h3List')
    expect(plan).toContain('zoom-in')
    expect(plan).toContain("kind: 'video'")
    expect(plan).toContain("kind: 'image'")
    expect(plan).toContain('throw new Error')
    expect(cfgInputs('segPlan').get('clipSource')).toBe('{{start.clipSource}}')

    // H3 只跑需要它的镜头：列表来自 segPlan.h3List（auto 时为空 → emptyPolicy skip）
    expect(String(node('loopVideo').config.listExpression)).toBe('{{segPlan.result.h3List}}')
    expect(node('loopVideo').config.emptyPolicy).toBe('skip')

    const segCode = String(node('segments').config.code)
    expect(segCode).toContain('h3ByCard')
    expect(segCode).toContain('motion')
    expect(cfgInputs('segments').get('segments')).toBe('{{segPlan.result.segments}}')
    expect(cfgInputs('segments').get('h3List')).toBe('{{segPlan.result.h3List}}')

    // 合成带配音 + 出片规格（video-compose 同为任务节点，配置为直接字段）
    const comp = node('comp1').config as Record<string, unknown>
    expect(comp.audioPath).toBe('{{tts1.audioPath}}')
    expect(comp.width).toBe('{{start.width}}')
    expect(comp.height).toBe('{{start.height}}')

    // 两级审核 reject→end
    expect(edgesOf('outlineReview', 'end', 'reject')).toHaveLength(1)
    expect(edgesOf('boardReview', 'end', 'reject')).toHaveLength(1)
  })
})