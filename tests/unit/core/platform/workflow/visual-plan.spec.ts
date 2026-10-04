/**
 * 镜头画面规划与视觉质检（纯函数）测试
 * @module tests/unit/core/platform/workflow/visual-plan
 * @description 配图相关性的规则层，必须可穷举验证：
 *  - 检索词解析：拆镜给的 searchQuery 优先；缺失时用场景词典按语义兜底；都拿不到返回空
 *  - 生成提示词：包含主体/场所/运镜与"真实可拍 + 无文字"纪律；重试时带针对性纠偏语
 *  - 质检解析：容忍围栏与说明文字；十分制折算；解析失败返回 null（不阻断成片）
 *  - 采用判定：过阈值且没被画成文字才采用；无质检时不阻断（但调用方留痕）
 */
import { describe, it, expect } from 'vitest'
import {
  NO_TEXT_NEGATIVE,
  REAL_SCENE_DISCIPLINE,
  buildGenerationPrompt,
  buildQaPrompt,
  buildRetryExtra,
  isGeneratedAcceptable,
  parseVisualQa,
  resolveSceneQueries,
} from '@core/platform/workflow/visual/visual-plan'

describe('resolveSceneQueries', () => {
  it('拆镜给了英文检索词时优先使用，并带上备选词', () => {
    const r = resolveSceneQueries({
      concept: '进出口',
      searchQuery: 'container port terminal',
      altQueries: ['cargo ship harbor'],
    })
    expect(r.primary).toBe('container port terminal')
    expect(r.alts).toEqual(['cargo ship harbor'])
  })

  it('缺失检索词时用场景词典兜底（外贸→港口）', () => {
    const r = resolveSceneQueries({ concept: '外贸进出口数据超预期', subject: '码头', setting: '港口堆场' })
    expect(r.primary).toMatch(/port|container|shipping|cargo/i)
    expect(r.alts.length).toBeGreaterThan(0)
  })

  it('完全无法解析时返回空（调用方跳过真实素材层）', () => {
    const r = resolveSceneQueries({ concept: 'ZZZ', subject: '', setting: '' })
    expect(r.primary).toBe('')
  })
})

describe('buildGenerationPrompt', () => {
  it('包含主体/场所/景别/运镜与两条纪律', () => {
    const p = buildGenerationPrompt(
      { subject: '龙门吊与集装箱', setting: '集装箱码头堆场', shotSize: '全景', cameraMove: '缓慢推近', concept: '外贸' },
      { styleText: '深蓝鎏金纪实风' },
    )
    expect(p).toContain('龙门吊与集装箱')
    expect(p).toContain('集装箱码头堆场')
    expect(p).toContain('全景')
    expect(p).toContain('缓慢推近')
    expect(p).toContain(REAL_SCENE_DISCIPLINE)
    expect(p).toContain('深蓝鎏金纪实风')
  })

  it('无 visual 时回落语义主题，不产出空提示词', () => {
    const p = buildGenerationPrompt({ concept: '产业指数回升' })
    expect(p).toContain('产业指数回升')
  })

  it('重试时追加纠偏语', () => {
    const p = buildGenerationPrompt({ subject: '产线' }, { extra: '本版不得出现任何字符。' })
    expect(p).toContain('本版不得出现任何字符')
  })
})

describe('视觉质检', () => {
  it('解析标准 JSON', () => {
    const qa = parseVisualQa('{"score":82,"hasText":false,"reason":"码头场景贴题"}')
    expect(qa).toEqual({ score: 82, hasText: false, reason: '码头场景贴题' })
  })

  it('容忍代码围栏与前后说明文字', () => {
    const qa = parseVisualQa('好的，结果如下：\n```json\n{"score": 91, "hasText": false, "reason": "完全一致"}\n```')
    expect(qa?.score).toBe(91)
  })

  it('十分制自动折算为百分制', () => {
    expect(parseVisualQa('{"score":8,"hasText":false,"reason":"ok"}')?.score).toBe(80)
  })

  it('越界分数被夹到 0-100', () => {
    expect(parseVisualQa('{"score":180}')?.score).toBe(100)
    expect(parseVisualQa('{"score":-5}')?.score).toBe(0)
  })

  it('解析失败返回 null（不阻断成片）', () => {
    expect(parseVisualQa('完全不是 JSON')).toBeNull()
    expect(parseVisualQa('{"hasText":false}')).toBeNull()
    expect(parseVisualQa('')).toBeNull()
  })

  it('hasText 兼容 snake_case', () => {
    expect(parseVisualQa('{"score":70,"has_text":true,"reason":"有招牌字"}')?.hasText).toBe(true)
  })

  it('质检提示词带脚本语义与输出契约', () => {
    const p = buildQaPrompt({ concept: '外贸', subject: '集装箱', setting: '码头' })
    expect(p).toContain('外贸')
    expect(p).toContain('集装箱')
    expect(p).toContain('码头')
    expect(p).toContain('JSON')
  })
})

describe('采用判定与重试纠偏', () => {
  it('过阈值且无文字才采用', () => {
    expect(isGeneratedAcceptable({ score: 70, hasText: false, reason: '' }, 60)).toBe(true)
    expect(isGeneratedAcceptable({ score: 59, hasText: false, reason: '' }, 60)).toBe(false)
    expect(isGeneratedAcceptable({ score: 70, hasText: true, reason: '' }, 60)).toBe(false)
    expect(isGeneratedAcceptable({ score: 95, hasText: true, reason: '' }, 60)).toBe(true)
  })

  it('无质检结果时不阻断（调用方负责留痕）', () => {
    expect(isGeneratedAcceptable(null, 60)).toBe(true)
  })

  it('按失败原因给出针对性纠偏语', () => {
    const text = buildRetryExtra({ score: 20, hasText: true, reason: '跑题且有字' })
    expect(text).toContain('不得出现任何字符')
    expect(text).toContain('场所与实体')
  })

  it('负向词表收录文字/图形类禁用项', () => {
    for (const w of ['文字', '水印', '图表', '海报字', '字幕']) {
      expect(NO_TEXT_NEGATIVE).toContain(w)
    }
  })
})