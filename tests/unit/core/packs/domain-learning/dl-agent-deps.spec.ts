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
  dlResearchSystemPrompt,
  dlVerifySystemPrompt,
  researchSourceHint,
} from '@core/packs/domain-learning/services/dl-agent-deps'

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
})
