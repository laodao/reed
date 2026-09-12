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
  dlBootstrapSkillBody,
  dlResearchSystemPrompt,
  dlSkillBody,
  dlTaskSystemPrompt,
  dlVerifySystemPrompt,
  researchSourceHint,
  shouldInjectMapCompletionSkill,
  DL_MAP_COMPLETION_SKILL_ID,
  MAP_COMPLETION_MARKER,
} from '@core/packs/domain-learning/services/dl-agent-deps'
import { dlMapCompletionMission } from '@shared/utils/domain-learning-mission'
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

  it('任务提示词含「补全知识地图」作业口径（2026-09-12：用户建点 + AI 完善）', () => {
    const p = dlTaskSystemPrompt()
    expect(p).toContain('补全知识地图')
    expect(p).toContain('判缺口')
    expect(p).toContain('主干缺失')
    expect(p).toContain('跨度太大')
    expect(p).toContain('粒度太粗')
    expect(p).toContain('dl_save_concept')
    expect(p).toContain('dl_save_relation')
    expect(p).toContain('只补结构')
    // 手工建的点（source=manual / 无讲义）要优先接进主干，不另建同义概念
    expect(p).toContain('source=manual')
    expect(p).toContain('不要另建同义概念')
  })

  it('任务提示词要求「先采集 → 再规划 → 落库 → 自检」，并区分资料与先验（2026-09-12 用户口径）', () => {
    const p = dlTaskSystemPrompt()
    expect(p).toContain('先采集 → 再规划 → 再落库 → 最后自检')
    expect(p).toContain('不许跳过采集')
    // 采集：知识库优先 + 联网 + 预算 + 记出处
    expect(p).toContain('知识库优先')
    expect(p).toContain('wf_kb_retrieve')
    expect(p).toContain('web_search')
    expect(p).toContain('3-6 次')
    expect(p).toContain('要点与出处')
    // 规划：资料/先验分开标注 + 顺序自检
    expect(p).toContain('evidenceLevel')
    expect(p).toContain('prior=true')
    expect(p).toContain('prior_needs_verification')
    expect(p).toContain('不跳级')
    expect(p).toContain('相邻层级跨度不超过一步')
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

  // 2026-09-12 用户反馈「知识体系不够完善」：快照要带地图完整度与缺口清单
  it('快照注入【地图完整度】+ 缺口清单（含 high 优先与涉及概念）', async () => {
    const db = stubDb({
      concepts: [
        { id: 'k-tensor', name: '张量', cardId: 'card-1' },
        { id: 'k-ad', name: '自动微分', attrs: { prerequisites: ['张量', '导数与链式法则'] } },
      ],
      relations: [{ sourceId: 'k-tensor', targetId: 'k-ad', relationType: 'prerequisite' }],
    })
    const snap = await computeDlSpaceSnapshot(db, 'sp1')
    expect(snap.coverage.metrics.leaves).toBe(2)
    expect(snap.text).toContain('【地图完整度】')
    expect(snap.text).toContain('缺口清单')
    expect(snap.text).toContain('地图完整度')
    // 全空间只有 1 个目录 + 8 个以下知识点 → 不一定报 flat-branches，但"声明未落边"必报
    expect(snap.text).toMatch(/声明|落成前置边|还没有讲义/)
  })

  it('技能正文注入契约（2026-09-12）：dlSkillBody 可取到补全技能正文，标记谓词与按钮指令一致', () => {
    // 技能正文可取（去 frontmatter）
    const body = dlSkillBody(DL_MAP_COMPLETION_SKILL_ID)
    expect(body).toBeTruthy()
    expect(body).not.toContain('---')
    expect(body).toContain('S1 采集')
    expect(body).toContain('S4 自检')
    // bootstrap 走同一实现（回归）
    expect(dlBootstrapSkillBody()).toBeTruthy()
    expect(dlSkillBody('learning-not-exist')).toBeNull()
    // 标记谓词：按钮指令必须命中，否则宿主不注入（契约由本用例钉死）
    expect(MAP_COMPLETION_MARKER).toBe('【补全知识地图】')
    expect(shouldInjectMapCompletionSkill(dlMapCompletionMission({ spaceName: '深度学习' }))).toBe(true)
    expect(shouldInjectMapCompletionSkill('随便聊聊矩阵')).toBe(false)
    expect(shouldInjectMapCompletionSkill('')).toBe(false)
    // 用户在任务框直接说同类意图也注入（不必依赖按钮）
    for (const q of ['帮我补全知识体系', '把缺的知识点补上', '完善一下知识地图', '追加几个概念', '补充前置知识点']) {
      expect(shouldInjectMapCompletionSkill(q), q).toBe(true)
    }
    // 答疑类说法不注入
    for (const q of ['这个前置关系我还是没懂', '补充一下这个前置的推导过程', '矩阵乘法的顺序是什么']) {
      expect(shouldInjectMapCompletionSkill(q), q).toBe(false)
    }
  })

  it('研究提示词含"补齐知识体系"纪律（每轮顺手补 1-3 个缺口，有界）', () => {
    const p = dlResearchSystemPrompt()
    expect(p).toContain('补齐知识体系')
    expect(p).toContain('地图完整度')
    expect(p).toContain('1-3 个结构性缺口')
    expect(p).toContain('为了拉高分数而堆无意义概念')
  })
})
