/**
 * 飞轮 L1 相关度门槛（六扇门复盘）单测
 *
 * 钉死：L1（用户级/系统级）条目纯关键词命中数 < L1_MIN_KEYWORD_HITS 时不得
 * 入选装配（2-gram 单词碰撞曾把「多智能体框架调研」SOP 带进故事研讨室）；
 * 达到门槛正常入选；L2/L3 条目单词命中即可入选；向量召回命中豁免门槛。
 */

import { describe, it, expect } from 'vitest'
import { MemoryFlywheelService, L1_MIN_KEYWORD_HITS, countMatchedWords } from '@core/platform/agent-runtime/memory/memory-flywheel'
import type { AgentMemoryEntryRow } from '@core/database/repositories/agent-memory-entry.repository'

function row(partial: Partial<AgentMemoryEntryRow> & { id: string; bizModule: string | null; projectId: string | null }): AgentMemoryEntryRow {
  return {
    userId: 'u1',
    kind: 'sop',
    status: 'active',
    content: { title: 't', content: 'c' },
    useCount: 0,
    successCount: 0,
    ...partial,
  } as AgentMemoryEntryRow
}

function mkFlywheel(active: AgentMemoryEntryRow[], vector?: { embedTexts: (t: string[]) => Promise<{ vectors: number[][]; model: string } | null>; search: (kbId: string, v: number[], k: number) => Promise<Array<{ id: string; score: number }>>; upsert: never; remove: never }): MemoryFlywheelService {
  return new MemoryFlywheelService({
    repo: {
      listActiveByScope: async () => active,
      listActive: async () => active,
    } as never,
    vector: vector as never,
    clock: () => 1_000,
  })
}

describe('飞轮 L1 相关度门槛', () => {
  const sopText = '先识别场景属于生产级复杂工作流还是快速原型，生产复杂工作流优先选状态图类框架以支持分支循环重试和人工审核'

  it('L1 单词命中被过滤（「审计」撞「审计和事件驱动」场景）', async () => {
    const l1 = row({ id: 'm1', bizModule: null, projectId: null, content: { title: '框架选型', content: `${sopText} 审计` } })
    const svc = mkFlywheel([l1])
    const picked = await svc.assemble('女主是审计师，设计她的破案手段', 3, { bizModule: 'longwriting', projectId: 'p1' })
    expect(picked).toHaveLength(0)
  })

  it('相邻 bigram 合并计数：共用一个 ≥3 字词（审计师）不达门槛（对抗 review P2-2）', async () => {
    const l1 = row({ id: 'm1', bizModule: null, projectId: null, content: { title: '职业资料', content: '审计师考证流程与继续教育要求' } })
    const svc = mkFlywheel([l1])
    // 若按裸 bigram 计数，「审计师」产生 审计+计师 两次命中即过门槛；按词计数只有 1 次
    const picked = await svc.assemble('女主是个审计师，帮她设计助手角色', 3, { bizModule: 'longwriting', projectId: 'p1' })
    expect(picked).toHaveLength(0)
    expect(countMatchedWords('女主是个审计师', new Set(['审计', '计师']))).toBe(1)
  })

  it('向量召回命中豁免 L1 门槛（语义相关度已由向量分把关）', async () => {
    const l1 = row({ id: 'mv', bizModule: null, projectId: null, content: { title: '冷门经验', content: '完全不相干的领域知识甲乙丙丁' } })
    const vector = {
      embedTexts: async (texts: string[]) => ({ vectors: texts.map(() => [0.1, 0.2]), model: 'mock' }),
      search: async (_kbId: string, _v: number[], topK: number) => Array.from({ length: Math.min(topK, 1) }, () => ({ id: 'memvec_mv', score: 0.9 })),
      upsert: undefined,
      remove: undefined,
    }
    const svc = mkFlywheel([l1], vector as never)
    const picked = await svc.assemble('完全不相干的查询文字', 3, { bizModule: 'longwriting', projectId: 'p1' })
    expect(picked.map((p) => p.id)).toContain('mv')
  })

  it('L1 命中数达门槛正常入选', async () => {
    const l1 = row({ id: 'm1', bizModule: null, projectId: null, content: { title: '民国背景资料', content: '民国上海 捕快 会计师事务所 破案 背景' } })
    const svc = mkFlywheel([l1])
    const picked = await svc.assemble('女主在民国上海做会计，背景与破案的关系', 3, { bizModule: 'longwriting', projectId: 'p1' })
    expect(picked.map((p) => p.id)).toContain('m1')
  })

  it('L2/L3 单词命中即可入选（不受 L1 门槛约束）', async () => {
    const l2 = row({ id: 'm2', bizModule: 'longwriting', projectId: null, content: { title: '本模块经验', content: '审计师破案的爽点设计' } })
    const svc = mkFlywheel([l2])
    const picked = await svc.assemble('设计一个审计师主角', 3, { bizModule: 'longwriting', projectId: 'p1' })
    expect(picked.map((p) => p.id)).toContain('m2')
  })

  it('门槛常量为 2（语义：2-gram 单词碰撞至少要两次才算相关）', () => {
    expect(L1_MIN_KEYWORD_HITS).toBe(2)
  })
})
