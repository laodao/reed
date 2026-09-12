/**
 * 领域学习 Agent 依赖纯函数测试（dl-agent-deps，M2-B 采集纪律与未解问题聚焦）
 * @module tests/unit/core/packs/domain-learning/dl-agent-deps.spec
 *
 * 钉死：研究提示词含采集纪律（读工具/arXiv/三研究 skill/无据不落卡）；采集可用性
 * 提示按 web_search 有无默认源分支；未解问题聚焦块携带问题 id 引导 dl_answer_question。
 */

import { describe, it, expect } from 'vitest'
import {
  buildFocusQuestionLines,
  computeDlSpaceSnapshot,
  dlResearchSystemPrompt,
  dlVerifySystemPrompt,
  researchSourceHint,
} from '@core/packs/domain-learning/services/dl-agent-deps'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

describe('dl-agent-deps（M2-B）', () => {
  it('研究提示词含采集纪律：读工具 / arXiv / 三研究 skill / 无据不落卡 / web_search 条件', () => {
    const p = dlResearchSystemPrompt()
    for (const token of [
      'wf_kb_retrieve',
      'wf_web_extract',
      'http_get',
      'export.arxiv.org',
      'learning-source-collector',
      'learning-question-generator',
      'learning-relation-miner',
      'dl_answer_question',
      'needs_verification',
      'web_search',
      'evidenceSources',
    ]) {
      expect(p).toContain(token)
    }
    // 采集纪律是有条件启用（会话提供读工具时），仍是研究模式的默认口径
    expect(p).toContain('采集纪律')
    // M3-A：归属纪律引导 agent 使用快照目录分组
    expect(p).toContain('目录分组')
    expect(p).toContain('parentId')
  })

  it('研究提示词含循序渐进门禁纪律（2026-09-12：对所有目标生效，不再只拦入门）', () => {
    const p = dlResearchSystemPrompt()
    expect(p).toContain('循序渐进与前置门禁')
    expect(p).toContain('所有目标')
    expect(p).toContain('prerequisite')
    expect(p).toContain('前置') // 讲义 meta 必须写前置声明
    expect(p).toContain('记号热身')
    expect(p).toContain('被门禁拒绝时不要原样重发')
    // 旧的"只有入门被拦"口径已下线
    expect(p).not.toContain('入门目标必读')
  })

  it('研究提示词含前置要求纪律：主题级（dl_save_space_prereqs）+ 知识点级（prerequisites）', () => {
    const p = dlResearchSystemPrompt()
    expect(p).toContain('前置要求')
    expect(p).toContain('整个主题的前置')
    expect(p).toContain('dl_save_space_prereqs')
    expect(p).toContain('每个知识点的前置')
    expect(p).toContain('顺序即路径')
    expect(p).toContain('相邻层级跨度不得超过一步')
  })

  it('researchSourceHint：无默认搜索源提示不可用且不得假装搜索；有则提示已启用', () => {
    const off = researchSourceHint(false)
    expect(off).toContain('web_search 不可用')
    expect(off).toContain('wf_kb_retrieve')
    const on = researchSourceHint(true)
    expect(on).toContain('已启用 web_search')
  })

  it('buildFocusQuestionLines：携带问题原文/id 并引导用问题 id 回填答案', () => {
    const line = buildFocusQuestionLines({
      question: '为什么 A 与 B 结论矛盾？',
      questionId: 'q_1',
      conceptName: '贝叶斯定理',
    })
    expect(line).toContain('【待研究问题】')
    expect(line).toContain('为什么 A 与 B 结论矛盾？')
    expect(line).toContain('q_1')
    expect(line).toContain('所属概念：贝叶斯定理')
    expect(line).toContain('dl_answer_question')

    const spaceLevel = buildFocusQuestionLines({ question: '泛问', questionId: 'q_2', conceptName: null })
    expect(spaceLevel).toContain('空间级未解问题')
  })

  it('核验提示词：只读交叉核验、verdict 词与严格 JSON 契约（M4-UX2）', () => {
    const p = dlVerifySystemPrompt()
    for (const token of ['supported', 'unsupported', 'needs_review', 'wf_kb_retrieve', 'issues', 'sourceRef', '不编造']) {
      expect(p).toContain(token)
    }
  })

  // ===== 2026-09-12 用户需求：前置要求（主题级 + 知识点级）进快照 =====

  /** 最小 db stub（快照只读 dlProjects/dlConcepts/dlRelations/dlCards 四个仓储） */
  function stubDb(over: {
    prerequisites?: Array<{ name: string; inSpace?: boolean }>
    concepts?: Array<Record<string, unknown>>
    relations?: Array<Record<string, unknown>>
  }): ICoreDatabaseManager {
    return {
      dlProjects: {
        getById: async () => ({
          id: 'sp1',
          name: '深度学习',
          goal: '工作应用',
          kbId: null,
          prerequisites: over.prerequisites ?? [],
        }),
      },
      dlConcepts: {
        listByProject: async () =>
          (over.concepts ?? []).map((c, i) => ({
            id: `k${i}`,
            name: 'C',
            nodeType: 'concept',
            mastery: 'untouched',
            researchState: 'extracted',
            cardId: null,
            definitionShort: null,
            attrs: null,
            parentId: null,
            ...c,
          })),
      },
      dlRelations: {
        listByProject: async () =>
          (over.relations ?? []).map((r, i) => ({
            id: `r${i}`,
            relationType: 'prerequisite',
            verified: false,
            ...r,
          })),
      },
      dlCards: { getById: async () => null, getCurrentByConcept: async () => null },
    } as unknown as ICoreDatabaseManager
  }

  it('快照注入主题前置要求与各知识点前置（含需自备标记与未建关系提醒）', async () => {
    const db = stubDb({
      prerequisites: [
        { name: '线性代数基础', inSpace: true },
        { name: 'Python 基础', inSpace: false },
      ],
      concepts: [
        { id: 'k-tensor', name: '张量' },
        { id: 'k-ad', name: '自动微分与反向传播', attrs: { prerequisites: ['张量', '导数与链式法则'] } },
      ],
      relations: [{ sourceId: 'k-tensor', targetId: 'k-ad', relationType: 'prerequisite' }],
    })
    const snap = await computeDlSpaceSnapshot(db, 'sp1')
    expect(snap.spacePrereqs.map((p) => p.name)).toEqual(['线性代数基础', 'Python 基础'])
    expect(snap.text).toContain('【主题前置要求】')
    expect(snap.text).toContain('Python 基础')
    expect(snap.text).toContain('需自备/另行补课')
    expect(snap.text).toContain('【各知识点前置】')
    expect(snap.text).toContain('自动微分与反向传播 ← 已建关系：张量')
    expect(snap.text).toContain('仅声明未建关系：导数与链式法则')
    // 缺口提醒：前置没有落点 + 只有声明没建关系
    expect(snap.text).toContain('dl_save_relation')
    expect(snap.text).toContain('dl_save_concept')
  })

  it('主题前置为空时，快照要求模型用 dl_save_space_prereqs 落库（生成知识点阶段就要定门槛）', async () => {
    const db = stubDb({ concepts: [{ id: 'k1', name: '甲概念' }] })
    const snap = await computeDlSpaceSnapshot(db, 'sp1')
    expect(snap.spacePrereqs).toEqual([])
    expect(snap.text).toContain('dl_save_space_prereqs')
    expect(snap.text).toContain('各知识点前置')
  })
})
