/**
 * 分层选层与类型化提示词测试（§分层知识消费 / §类型化提取）
 *
 * 覆盖：查询信号→目标分层、层权重（命中加权/非命中轻降/无信号等权）、
 * 三体裁提示词变体路由、layer 契约（合法值保留/非法值剥离/缺省不致命）。
 */
import { describe, it, expect } from 'vitest'
import { detectLayerBoost, layerWeightOf, LAYER_BOOST_MATCHED, LAYER_BOOST_UNMATCHED } from '@core/platform/services/kb-brain/layer-intent'
import { buildAtomizeSystem, ATOMIZE_SYSTEM, ATOMIZE_SYSTEM_KNOWLEDGE, ATOMIZE_SYSTEM_HISTORY, CLEANUP_SYSTEM } from '@core/platform/services/kb-brain/prompts'
import { validateAtomizeOutput } from '@core/platform/services/kb-brain/schemas'

describe('detectLayerBoost 查询意图选层', () => {
  it('写作思路类问题命中概要层', () => {
    const b = detectLayerBoost('这本书的写作思路是什么')
    expect(b).not.toBeNull()
    expect(b!.matched).toContain('outline')
    expect(b!.matched).not.toContain('detail')
  })

  it('设定类问题命中设定层', () => {
    const b = detectLayerBoost('世界观设定和力量体系')
    expect(b!.matched).toContain('setting')
  })

  it('人物线问题命中描写层+细节层（伏笔）', () => {
    const b = detectLayerBoost('主角的故事线和伏笔安排')
    expect(b!.matched).toContain('describe')
    expect(b!.matched).toContain('detail')
  })

  it('无信号查询返回 null（各层等权）', () => {
    expect(detectLayerBoost('金丹期突破')).toBeNull()
    expect(detectLayerBoost('')).toBeNull()
  })

  it('层权重：命中 ×1.4 / 非命中 ×0.85 / 无信号恒 1', () => {
    const b = detectLayerBoost('世界观设定')
    expect(layerWeightOf(b, 'setting')).toBe(LAYER_BOOST_MATCHED)
    expect(layerWeightOf(b, 'outline')).toBe(LAYER_BOOST_UNMATCHED)
    expect(layerWeightOf(null, 'detail')).toBe(1)
  })
})

describe('buildAtomizeSystem 类型化提示词', () => {
  it('novel/未识别 → 小说变体；knowledge/history 各走变体', () => {
    expect(buildAtomizeSystem('novel')).toBe(ATOMIZE_SYSTEM)
    expect(buildAtomizeSystem('')).toBe(ATOMIZE_SYSTEM)
    expect(buildAtomizeSystem(undefined)).toBe(ATOMIZE_SYSTEM)
    expect(buildAtomizeSystem('knowledge')).toBe(ATOMIZE_SYSTEM_KNOWLEDGE)
    expect(buildAtomizeSystem('history')).toBe(ATOMIZE_SYSTEM_HISTORY)
  })

  it('三变体都带分层标注段与 layer 字段约定', () => {
    for (const s of [ATOMIZE_SYSTEM, ATOMIZE_SYSTEM_KNOWLEDGE, ATOMIZE_SYSTEM_HISTORY]) {
      expect(s).toContain('【知识分层')
      expect(s).toContain('outline')
      expect(s).toContain('"layer"')
    }
  })

  it('知识/文史变体不含小说专属的创作物判例', () => {
    expect(ATOMIZE_SYSTEM_KNOWLEDGE).not.toContain('文学资料研究员')
    expect(ATOMIZE_SYSTEM_HISTORY).not.toContain('书中创作物')
  })
})

describe('layer 契约（schemas）', () => {
  it('合法 layer 保留', () => {
    const out = validateAtomizeOutput({
      atoms: [{ statement: 's', type: 'fact', layer: 'setting', quote: 'q' }],
    })
    expect(out.atoms[0].layer).toBe('setting')
  })

  it('非法 layer 剥离（不毁论断，落库归 detail）', () => {
    const out = validateAtomizeOutput({
      atoms: [{ statement: 's', type: 'fact', layer: 'important', quote: 'q' }],
    })
    expect(out.atoms[0].layer).toBeUndefined()
  })

  it('缺 layer 合法（可选字段）', () => {
    const out = validateAtomizeOutput({ atoms: [{ statement: 's', type: 'fact', quote: 'q' }] })
    expect(out.atoms).toHaveLength(1)
  })
})

describe('type 非法值归一（真机实证回归）', () => {
  it('枚举外 type 归 fact，不炸整章', () => {
    const out = validateAtomizeOutput({
      atoms: [
        { statement: 's1', type: '设定', quote: 'q1' },
        { statement: 's2', type: 'fact', quote: 'q2' },
      ],
    })
    expect(out.atoms[0].type).toBe('fact')
    expect(out.atoms[1].type).toBe('fact')
    expect(out.atoms).toHaveLength(2)
  })
})

describe('layer null 穿透回归（review P2）', () => {
  it('layer:null 剥离而非炸整章', () => {
    const out = validateAtomizeOutput({
      atoms: [{ statement: 's', type: 'fact', layer: null as unknown as string, quote: 'q' }],
    })
    expect(out.atoms[0].layer).toBeUndefined()
    expect(out.atoms).toHaveLength(1)
  })
})

describe('剧情复述禁令（用户反馈回归）', () => {
  it('小说变体含剧情梗概最高禁令与产出前自检', () => {
    expect(ATOMIZE_SYSTEM).toContain('剧情梗概/事件链复述')
    expect(ATOMIZE_SYSTEM).toContain('【产出前自检')
    expect(ATOMIZE_SYSTEM).toContain('剧情是章节摘要的职责')
    // 旧"故事结构"放行条已删——它正是事件链复述的口子
    expect(ATOMIZE_SYSTEM).not.toContain('✓ 故事结构：伏笔埋设与回收')
  })

  it('存量清理提示词把剧情梗概列为第 4 类垃圾', () => {
    expect(CLEANUP_SYSTEM).toContain('4. 剧情梗概/事件链复述')
  })

  it('知识/文史变体不受影响（无剧情判例需求，仍保留各自禁令）', () => {
    expect(ATOMIZE_SYSTEM_KNOWLEDGE).not.toContain('剧情复述判例')
    expect(ATOMIZE_SYSTEM_HISTORY).toContain('不要：逐段复述')
  })
})
