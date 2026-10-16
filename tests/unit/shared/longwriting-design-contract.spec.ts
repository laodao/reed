import { describe, it, expect } from 'vitest'
import {
  SPINE_SCHEMA_ID,
  VOLUME_DESIGN_SCHEMA_ID,
  validateSpine,
  validateVolumeDesign,
  validateChapterCardFacts,
  formatIssues,
  normalizePredicate,
  PREDICATE_VOCABULARY,
  type SpineDoc,
  type VolumeDesignDoc,
} from '@shared/contracts/longwriting-design'

const spine: SpineDoc = {
  core: { premise: '小捕快查身世', theme: '公道与血仇', ending: '真相大白，仇了缘清' },
  main_lines: [{ id: 'p_main_1', title: '身世主线', stages: ['发现遗书', '追查', '对决'] }],
  core_cast: ['c_chengye', 'c_suwantang'],
  volumes: [
    { id: 'v1', title: '初入汴京', chapter_range: { from: 1, to: 20 }, focus: '查案' },
    { id: 'v2', title: '江湖风波', chapter_range: { from: 21, to: 45 }, focus: '逃亡' },
  ],
}

const volume: VolumeDesignDoc = {
  volume: 'v1',
  cast: [
    { id: 'c_chengye', kind: 'character', name: '程野', importance: 'core' },
    { id: 'c_suwantang', kind: 'character', name: '苏晚棠', aliases: ['苏掌柜'] },
    { id: 'l_dujiang', kind: 'location', name: '渡江城' },
  ],
  threads: [
    { id: 'hl_01', name: '苏晚棠的真实身份', involves: ['c_suwantang', 'c_chengye'], plant: 3, develop: [6, 9], payoff: 15 },
  ],
  grid: [
    { ch: 3, beats: ['程野初见苏晚棠'], present: ['c_chengye', 'c_suwantang'], location: 'l_dujiang', line_actions: [{ line: 'hl_01', act: 'plant' }] },
    { ch: 6, beats: ['苏晚棠欲言又止'], line_actions: [{ line: 'hl_01', act: 'develop', note: '伏一笔' }] },
  ],
  events: [{ id: 'ev_reveal_15', chapter: 15, story_time: '永昌三十一年冬', desc: '身份揭穿', participants: ['c_chengye', 'c_suwantang'] }],
}

describe('contract: spine', () => {
  it('合法文档通过（结构 + 语义零错误）', () => {
    const r = validateSpine(spine)
    expect(r).toEqual({ ok: true, errors: [] })
  })

  it('结构错误：卷 id 不合 pattern，报 JSON Pointer 路径', () => {
    const bad = { ...spine, volumes: [{ ...spine.volumes[0], id: 'vol_1' }] }
    const r = validateSpine(bad)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.path === '/volumes/0/id' && e.code === 'pattern')).toBe(true)
  })

  it('结构错误：缺 ending 必填字段', () => {
    const bad = { ...spine, core: { premise: 'a', theme: 'b' } }
    const r = validateSpine(bad)
    expect(r.errors.some(e => e.code === 'required')).toBe(true)
  })

  it('语义错误：卷章节区间重叠 / 卷 id 重复', () => {
    const bad: SpineDoc = {
      ...spine,
      volumes: [
        { id: 'v1', title: 'A', chapter_range: { from: 1, to: 20 }, focus: 'x' },
        { id: 'v1', title: 'B', chapter_range: { from: 18, to: 30 }, focus: 'y' },
      ],
    }
    const r = validateSpine(bad)
    const codes = r.errors.map(e => e.code)
    expect(codes).toContain('duplicate_id')
    expect(codes).toContain('chapter_range_overlap')
  })
})

describe('contract: volume design', () => {
  it('合法文档通过（含 spine 对照）', () => {
    const r = validateVolumeDesign(volume, spine)
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('结构错误：kind 与 id 前缀不对齐（character 却用 l_ 前缀）', () => {
    const bad: VolumeDesignDoc = {
      ...volume,
      cast: [{ ...volume.cast[0], id: 'l_chengye' }],
    }
    const r = validateVolumeDesign(bad)
    expect(r.errors.some(e => e.path === '/cast/0/id')).toBe(true)
  })

  it('结构错误：未知字段被 additionalProperties 拦截', () => {
    const bad = { ...volume, extra: 1 }
    const r = validateVolumeDesign(bad)
    expect(r.ok).toBe(false)
  })

  it('语义错误：grid 引用未定义实体 / 未定义暗线', () => {
    const bad: VolumeDesignDoc = {
      ...volume,
      grid: [
        {
          ch: 3,
          beats: ['x'],
          present: ['c_ghost'],
          line_actions: [{ line: 'hl_missing', act: 'plant' }],
        },
      ],
    }
    const r = validateVolumeDesign(bad, spine)
    const codes = r.errors.map(e => e.code)
    expect(codes.filter(c => c === 'unresolved_ref').length).toBe(2)
  })

  it('语义错误：暗线时序（payoff 早于 plant / develop 越界）与章号越界', () => {
    const bad: VolumeDesignDoc = {
      ...volume,
      threads: [{ id: 'hl_01', name: 'x', involves: ['c_suwantang'], plant: 10, develop: [4], payoff: 8 }],
      grid: [{ ch: 99, beats: ['y'] }],
    }
    const r = validateVolumeDesign(bad, spine)
    const codes = r.errors.map(e => e.code)
    expect(codes).toContain('thread_order')
    expect(codes).toContain('chapter_out_of_range')
  })

  it('语义错误：grid 章号重复 + spine 中不存在的卷', () => {
    const bad: VolumeDesignDoc = {
      ...volume,
      volume: 'v9',
      grid: [
        { ch: 3, beats: ['a'] },
        { ch: 3, beats: ['b'] },
      ],
    }
    const r = validateVolumeDesign(bad, spine)
    const codes = r.errors.map(e => e.code)
    expect(codes).toContain('duplicate_chapter')
    expect(codes).toContain('unresolved_ref')
  })
})

describe('contract: chapter card facts', () => {
  it('合法 facts 通过', () => {
    const r = validateChapterCardFacts({
      musts: ['程野发现遗书'],
      must_nots: ['苏晚棠不得明言身份'],
      explicit_facts: ['程野之死必须由第三方明写确认'],
    })
    expect(r.ok).toBe(true)
  })

  it('空对象合法（本章无特殊约束）', () => {
    expect(validateChapterCardFacts({}).ok).toBe(true)
  })

  it('未知字段与空串条目被拦', () => {
    expect(validateChapterCardFacts({ secrets: ['x'] }).ok).toBe(false)
    expect(validateChapterCardFacts({ musts: [''] }).ok).toBe(false)
  })
})

describe('vocabulary: normalizePredicate', () => {
  const entries = PREDICATE_VOCABULARY
  it('synonym → 规范 key', () => {
    expect(normalizePredicate('师父', entries, 'relation')).toBe('师徒')
    expect(normalizePredicate('死敌', entries, 'relation')).toBe('仇敌')
    expect(normalizePredicate('道侣', entries, 'relation')).toBe('恋人')
    expect(normalizePredicate('佩戴', entries, 'attribute')).toBe('持有')
  })
  it('规范词与未知值', () => {
    expect(normalizePredicate('师徒', entries, 'relation')).toBe('师徒')
    expect(normalizePredicate('量子纠缠', entries, 'relation')).toBeNull()
    expect(normalizePredicate('  师傅  ', entries, 'relation')).toBe('师徒') // trim
  })
})

// schema id 导出自检（ajv 注册一致性）
describe('contract: schema registry', () => {
  it('schema $id 稳定', () => {
    expect(SPINE_SCHEMA_ID).toBe('lw:design/spine')
    expect(VOLUME_DESIGN_SCHEMA_ID).toBe('lw:design/volume')
  })
  it('formatIssues 输出可回喂 agent 的紧凑文本', () => {
    const text = formatIssues([{ path: '/cast/0/id', code: 'pattern', message: 'must match pattern' }])
    expect(text).toContain('[pattern]')
    expect(text).toContain('/cast/0/id')
  })
})
