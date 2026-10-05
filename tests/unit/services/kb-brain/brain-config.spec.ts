/**
 * 知识大脑配置（brain-config）测试
 *
 * 契约：null/空 = 关闭（返回 null）；非法 = 响亮失败（抛错带原因）；
 * partial 输入补全缺省值；stringify 写前校验。
 */
import { describe, it, expect } from 'vitest'
import {
  parseBrainConfig,
  stringifyBrainConfig,
  parseBrainState,
  defaultBrainConfig,
  mergeBrainConfig,
} from '@core/platform/services/kb-brain/brain-config'

describe('parseBrainConfig', () => {
  it('null/空串/"null" → 大脑关闭', () => {
    expect(parseBrainConfig(null)).toBeNull()
    expect(parseBrainConfig(undefined)).toBeNull()
    expect(parseBrainConfig('')).toBeNull()
    expect(parseBrainConfig('  ')).toBeNull()
    expect(parseBrainConfig('null')).toBeNull()
  })

  it('partial 输入补全缺省值', () => {
    const cfg = parseBrainConfig('{"enabled":true}')
    expect(cfg).not.toBeNull()
    expect(cfg!.enabled).toBe(true)
    expect(cfg!.digestion.enabled).toBe(true)
    expect(cfg!.patterns.plotEnabled).toBe(false) // 情节卡缺省关（高风险）
    expect(cfg!.patterns.settingEnabled).toBe(true)
    expect(cfg!.patterns.characterEnabled).toBe(false) // 人物原型卡缺省关（G4）
    expect(cfg!.lenses.enabledLensNoteIds).toEqual([]) // 视角遍缺省无启用视角
    expect(cfg!.autoApproveThreshold).toBe(0.8)
    expect(cfg!.learning.enabled).toBe(false)
  })

  it('partial 嵌套覆盖：只改 patterns.plotEnabled 不丢其余', () => {
    const cfg = parseBrainConfig(
      '{"enabled":true,"patterns":{"settingEnabled":true,"plotEnabled":true}}',
    )
    expect(cfg!.patterns.plotEnabled).toBe(true)
    expect(cfg!.patterns.settingEnabled).toBe(true)
    expect(cfg!.distillation.importanceThreshold).toBe(50)
  })

  it('enabled=false 时其余字段仍解析（配置保留，入口早退）', () => {
    const cfg = parseBrainConfig(
      '{"enabled":false,"digestion":{"enabled":false}}',
    )
    expect(cfg!.enabled).toBe(false)
    expect(cfg!.digestion.enabled).toBe(false)
  })

  it('非法 JSON → 响亮失败', () => {
    expect(() => parseBrainConfig('{broken')).toThrow(/brainConfig 不是合法 JSON/)
  })

  it('schema 违例 → 响亮失败且带原因', () => {
    expect(() => parseBrainConfig('{"enabled":"yes"}')).toThrow(/brainConfig 校验失败/)
    expect(() => parseBrainConfig('{"enabled":true,"nope":1}')).toThrow(/校验失败/) // additionalProperties
    expect(() => parseBrainConfig('{"enabled":true,"autoApproveThreshold":2}')).toThrow(/校验失败/) // 超范围
    expect(() => parseBrainConfig('{"digestion":{"enabled":true}}')).toThrow(/校验失败/) // 缺 enabled
  })

  it('roundtrip：stringify(parse(x)) 可再次 parse', () => {
    const cfg = defaultBrainConfig(true)
    const raw = stringifyBrainConfig(cfg)
    const again = parseBrainConfig(raw)
    expect(again).toEqual(cfg)
  })

  it('stringify 拒绝非法对象', () => {
    expect(() => stringifyBrainConfig({ enabled: false } as never)).not.toThrow()
    expect(() => stringifyBrainConfig({ foo: 1 } as never)).toThrow(/校验失败/)
  })
})

describe('models 段（每库模型设置）', () => {
  it('缺省空串=跟随宿主模型', () => {
    const cfg = parseBrainConfig('{"enabled":true}')
    expect(cfg!.models).toEqual({ atomize: '', adjudicate: '' })
  })
  it('partial 保存 models 段（深合并）', () => {
    const cfg = parseBrainConfig(
      '{"enabled":true,"models":{"atomize":"prov-1:qwen-max","adjudicate":""}}',
    )
    expect(cfg!.models.atomize).toBe('prov-1:qwen-max')
    expect(cfg!.models.adjudicate).toBe('')
  })
  it('roundtrip 保留 models', () => {
    const raw = stringifyBrainConfig({ ...defaultBrainConfig(true), models: { atomize: 'm1', adjudicate: 'p2:m2' } })
    expect(parseBrainConfig(raw)!.models).toEqual({ atomize: 'm1', adjudicate: 'p2:m2' })
  })
})

describe('parseBrainState', () => {
  it('空 → 初始态', () => {
    expect(parseBrainState(null)).toEqual({ importance: 0, lastDistillAt: null })
  })
  it('损坏 JSON → 初始态（运行态容错）', () => {
    expect(parseBrainState('{bad')).toEqual({ importance: 0, lastDistillAt: null })
  })
  it('正常解析', () => {
    const s = parseBrainState('{"importance":12,"lastDistillAt":"2026-09-16T00:00:00Z"}')
    expect(s.importance).toBe(12)
    expect(s.lastDistillAt).toBe('2026-09-16T00:00:00Z')
  })
  it('automation 记账段保留（判别回归：旧实现丢弃导致自动化每轮重跑）', () => {
    const raw = JSON.stringify({
      importance: 3,
      lastDistillAt: null,
      automation: { lastLayerRelabelAt: '2026-10-05T00:00:00Z', relabelAtoms: 800, goalRuns: { g1: { at: '2026-10-05T01:00:00Z', atoms: 800 } } },
    })
    const s = parseBrainState(raw)
    expect(s.automation?.lastLayerRelabelAt).toBe('2026-10-05T00:00:00Z')
    expect(s.automation?.relabelAtoms).toBe(800)
    expect(s.automation?.goalRuns?.g1?.atoms).toBe(800)
  })
})

describe('automation 段（后台自动化）', () => {
  it('缺省全开（老配置无该段 → normalize 补齐）', () => {
    const cfg = parseBrainConfig('{"enabled":true}')!
    expect(cfg.automation.enabled).toBe(true)
    expect(cfg.automation.digest).toBe(true)
    expect(cfg.automation.goalDistill).toBe(true)
    expect(cfg.automation.foreshadow).toBe(true)
  })
  it('半段配置：只关 goalDistill，其余保持缺省', () => {
    const cfg = parseBrainConfig(JSON.stringify({ enabled: true, automation: { enabled: true, goalDistill: false } }))!
    expect(cfg.automation.goalDistill).toBe(false)
    expect(cfg.automation.bookPasses).toBe(true)
  })
  it('merge 半段 patch → base 子键保留', () => {
    const base = parseBrainConfig('{"enabled":true}')!
    const merged = mergeBrainConfig(base, { automation: { enabled: true, cleanup: false } })
    expect(merged.automation.enabled).toBe(true)
    expect(merged.automation.cleanup).toBe(false)
    expect(merged.automation.foreshadow).toBe(true)
    expect(() => stringifyBrainConfig(merged)).not.toThrow()
  })
  it('roundtrip 保留 automation', () => {
    const raw = JSON.stringify({ enabled: true, automation: { enabled: true, digest: false } })
    const parsed = parseBrainConfig(raw)!
    const again = parseBrainConfig(stringifyBrainConfig(parsed))!
    expect(again.automation).toEqual(parsed.automation)
  })
})

describe('mergeBrainConfig（updateConfig 段级深合并）', () => {
  it('patch 带 models 全段 → 其余段沿用 base', () => {
    const base = parseBrainConfig('{"enabled":true,"autoApproveThreshold":0.6}')!
    const merged = mergeBrainConfig(base, { models: { atomize: 'prov-1:qwen-max', adjudicate: '' } })
    expect(merged.models).toEqual({ atomize: 'prov-1:qwen-max', adjudicate: '' })
    expect(merged.autoApproveThreshold).toBe(0.6)
    expect(merged.digestion).toEqual(base.digestion)
    expect(() => stringifyBrainConfig(merged)).not.toThrow()
  })

  it('判别回归：models 半段 patch → base 子键保留，不回退默认（旧实现丢 adjudicate）', () => {
    const base = { ...defaultBrainConfig(true), models: { atomize: 'old-m', adjudicate: 'old-adj' } }
    const merged = mergeBrainConfig(base, { models: { atomize: 'new-m' } })
    expect(merged.models).toEqual({ atomize: 'new-m', adjudicate: 'old-adj' })
  })

  it('判别回归：digestion 半段 patch → scopeDocumentIds 保留（旧实现静默抹掉）', () => {
    const base = { ...defaultBrainConfig(true), digestion: { enabled: true, scopeDocumentIds: ['doc-1'] } }
    const merged = mergeBrainConfig(base, { digestion: { enabled: false } })
    // bookPasses 是书级汇总遍开关（缺省 true）——半段 patch 不得抹掉 base 子键，也不得丢缺省键
    expect(merged.digestion).toEqual({ enabled: false, scopeDocumentIds: ['doc-1'], bookPasses: true })
  })

  it('crag 半段 patch（单键即满足 schema required）→ stringify 不炸', () => {
    const base = defaultBrainConfig(true)
    const merged = mergeBrainConfig(base, { crag: { enabled: true } } as never)
    expect(merged.crag).toEqual({ enabled: true })
    expect(() => stringifyBrainConfig(merged)).not.toThrow()
  })

  it('patch 显式 enabled: undefined → 剥离，不翻 base.enabled', () => {
    const base = { ...defaultBrainConfig(false), enabled: false }
    const merged = mergeBrainConfig(base, { enabled: undefined } as never)
    expect(merged.enabled).toBe(false)
  })

  it('空 patch → base 原样', () => {
    const base = defaultBrainConfig(true)
    expect(mergeBrainConfig(base, {})).toEqual(base)
  })
})

describe('goals 段（提取目标）', () => {
  const goalJson = JSON.stringify({
    id: 'g_1',
    name: '修炼体系',
    hint: '梳理境界划分与突破条件',
    enabled: true,
  })

  it('缺省 goals=[]', () => {
    expect(parseBrainConfig('{"enabled":true}')!.goals).toEqual([])
  })
  it('带 goals 解析与 roundtrip', () => {
    const cfg = parseBrainConfig(`{"enabled":true,"goals":[${goalJson}]}`)!
    expect(cfg.goals).toHaveLength(1)
    expect(cfg.goals[0].name).toBe('修炼体系')
    const raw = stringifyBrainConfig(cfg)
    expect(parseBrainConfig(raw)!.goals).toEqual(cfg.goals)
  })
  it('merge：patch 带 goals → 整组替换；不带 → 沿用 base', () => {
    const base = parseBrainConfig(`{"enabled":true,"goals":[${goalJson}]}`)!
    const replaced = mergeBrainConfig(base, { goals: [{ id: 'g_2', name: '写作套路', hint: 'h', enabled: false }] })
    expect(replaced.goals).toEqual([{ id: 'g_2', name: '写作套路', hint: 'h', enabled: false }])
    const kept = mergeBrainConfig(base, {})
    expect(kept.goals).toEqual(base.goals)
  })
  it('goals 条目缺字段 → 响亮失败', () => {
    expect(() => parseBrainConfig('{"enabled":true,"goals":[{"id":"x","name":"n","hint":"h"}]}')).toThrow(/校验失败/)
  })
})
