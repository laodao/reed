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
  buildMapInventoryLines,
  computeDlSpaceSnapshot,
  dlBootstrapSkillBody,
  dlEmptySpaceMission,
  dlResearchSystemPrompt,
  dlSkillBody,
  dlTaskSystemPrompt,
  dlVerifySystemPrompt,
  researchSourceHint,
  shouldInjectMapCompletionSkill,
  DL_MAP_COMPLETION_SKILL_ID,
  MAP_COMPLETION_MARKER,
  PLAN_SYLLABUS_CONFIRMED_MARKER,
  PLAN_UNDERSTANDING_CONFIRMED_MARKER,
  formatSyllabusLines,
  formatUnderstandingSummary,
  planSavePhaseInstruction,
  planSyllabusPhaseInstruction,
  planUnderstandingPhaseInstruction,
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
    // 2026-09-25 C4：第 13-15 条合并为口径引用（清单细节以快照动态块为准），语义钉子不变
    expect(p).toContain('主题门槛')
    expect(p).toContain('dl_save_space_prereqs')
    expect(p).toContain('prerequisites')
    expect(p).toContain('dl_save_relation')
    expect(p).toContain('相邻层级跨度不超过一步')
    expect(p).toContain('欠账')
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
    description?: string | null
    profile?: Record<string, unknown> | null
  }): ICoreDatabaseManager {
    return {
      dlProjects: {
        getById: async () => ({
          id: 'sp1',
          name: '深度学习',
          goal: '工作应用',
          kbId: null,
          prerequisites: over.prerequisites ?? [],
          description: over.description ?? null,
          profile: over.profile ?? null,
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

  /** 带用户诉求与空间档案的 stub（2026-09-13：诉求必须进快照头） */
  function briefDb(): ICoreDatabaseManager {
    return stubDb({
      description: '我希望能理解金融的各类概念、产品的原理，能听懂股票、债券、期货、做空做多、MBS、美元等等各中内容',
      profile: { kindLabel: '实践技能', nature: '方法步骤、操作流程与工具案例', emphasis: ['流程', '矩阵'] },
      concepts: [{ id: 'k1', name: '甲概念' }],
    })
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

  it('研究提示词含"顺手补缺口"纪律（每轮 1-3 个，有界；清单以快照【地图完整度】为准）', () => {
    const p = dlResearchSystemPrompt()
    expect(p).toContain('【地图完整度】')
    expect(p).toContain('1-3 个结构性缺口')
    expect(p).toContain('只补确属主干且读者必经的概念')
    expect(p).toContain('地图完整度前后变化')
  })

  // ===== 2026-09-13 用户反馈「金融理财主题生成的知识点与期望差别较大」复盘 =====

  it('研究提示词：诉求最高优先级（不得凭空间名猜主题）+ 被拒条目必须写进总结', () => {
    const p = dlResearchSystemPrompt()
    expect(p).toContain('诉求最高优先级')
    expect(p).toContain('不得凭空间名猜主题')
    expect(p).toContain('被额度或门禁拒绝的条目必须写进总结')
    expect(p).toContain('无声消失')
  })

  it('快照头注入学习主题诉求（用户原话）与空间档案', async () => {
    const db = stubDb({ concepts: [{ id: 'k1', name: '甲概念' }] })
    // stubDb 默认无 description/profile → 不该出现空的诉求行
    const bare = await computeDlSpaceSnapshot(db, 'sp1')
    expect(bare.text).not.toContain('【学习主题诉求')
    expect(bare.spaceDescription).toBeNull()

    const rich = await computeDlSpaceSnapshot(briefDb(), 'sp1')
    expect(rich.spaceDescription).toContain('股票')
    expect(rich.text).toContain('【学习主题诉求（用户原话，规划与讲义都以它为准）】')
    expect(rich.text).toContain('能听懂股票、债券、期货')
    expect(rich.text).toContain('空间档案：实践技能')
    expect(rich.text).toContain('侧重 流程/矩阵')
    // 诉求行必须在快照头（先于目录分组/前置简报）
    expect(rich.text.indexOf('【学习主题诉求')).toBeLessThan(rich.text.indexOf('【主题前置要求】'))
  })

  it('dlEmptySpaceMission：带上诉求原文与"覆盖诉求点名对象"的规划纪律', () => {
    const mission = dlEmptySpaceMission({
      spaceName: '金融理财',
      description: '我希望能理解金融的各类概念、产品的原理，能听懂网上讲股票、债券、期货、做空做多、MBS、美元',
    })
    expect(mission).toContain('【用户诉求（用户原话，最高优先级）】')
    expect(mission).toContain('股票、债券、期货、做空做多、MBS、美元')
    expect(mission).toContain('不得凭空间名猜主题')
    expect(mission).toContain('覆盖诉求里点名的对象与场景')
    expect(mission).toContain('诉求未涵盖、按领域主干补的')
    // 没写诉求时不留空块
    const bare = dlEmptySpaceMission({ spaceName: '量子计算入门' })
    expect(bare).not.toContain('【用户诉求')
    expect(bare).toContain('【空领域起步研究】')
  })

  // ===== 2026-09-13 固定流程：三个阶段的宿主注入指令 =====

  it('阶段标记是前端与宿主共用的契约常量', () => {
    expect(PLAN_UNDERSTANDING_CONFIRMED_MARKER).toBe('【已确认诉求理解】')
    expect(PLAN_SYLLABUS_CONFIRMED_MARKER).toBe('【已确认知识体系】')
  })

  it('阶段 1 指令：只提交诉求理解草案、明确不许落库、说明后续两步', () => {
    const p = planUnderstandingPhaseInstruction('金融理财')
    expect(p).toContain('第 1 步：对齐诉求')
    expect(p).toContain('dl_propose_understanding')
    expect(p).toContain('不要调用 dl_save_concept')
    expect(p).toContain('第 2 步')
    expect(p).toContain('金融理财')
  })

  it('阶段 2 指令：带上已确认诉求 + 空分支禁令', () => {
    const p = planSyllabusPhaseInstruction({
      spaceName: '金融理财',
      understandingSummary: '目标：搞懂金融产品\n要覆盖：股票、债券',
    })
    expect(p).toContain('第 2 步：规划知识体系')
    expect(p).toContain('用户已确认诉求理解')
    expect(p).toContain('股票、债券')
    expect(p).toContain('dl_propose_syllabus')
    expect(p).toContain('不许出现空分支')
    expect(p).toContain('不要调用 dl_save_concept')
  })

  it('阶段 3 指令：列出方案清单、给出落库顺序、要求方案内全部落库', () => {
    const lines = formatSyllabusLines({
      branches: [
        {
          name: '金融产品',
          definitionShort: '各类金融工具',
          concepts: [
            { name: '股票', layer: 0, prerequisites: [] },
            { name: '债券', layer: 0, prerequisites: ['股票'] },
          ],
        },
      ],
      rootConcepts: [{ name: '金融体系总览' }],
    })
    expect(lines).toContain('分支「金融产品」')
    expect(lines).toContain('股票（layer=0）')
    expect(lines).toContain('债券（layer=0 前置=股票）')
    expect(lines).toContain('根层知识点：金融体系总览')

    const p = planSavePhaseInstruction({ spaceName: '金融理财', syllabusLines: lines, conceptCount: 3 })
    expect(p).toContain('第 3 步：按已确认的知识体系落库')
    expect(p).toContain('落库门禁已放行')
    expect(p).toContain('3 个知识点')
    expect(p).toContain('nodeType=group')
    expect(p).toContain('dl_save_relation')
    expect(p).toContain('dl_save_card')
    expect(p).toContain('方案里的知识点要全部落库')
    expect(p).toContain('不要重新规划')
  })

  it('formatUnderstandingSummary：目标/覆盖/读者/不做/期望逐条呈现', () => {
    const s = formatUnderstandingSummary({
      goalSummary: '搞懂金融产品',
      coverage: ['股票', '债券'],
      audience: '零基础',
      notDoing: ['个人记账'],
      keyExpectations: ['能读财报'],
    })
    expect(s).toContain('目标：搞懂金融产品')
    expect(s).toContain('要覆盖：股票、债券')
    expect(s).toContain('读者：零基础')
    expect(s).toContain('不做：个人记账')
    expect(s).toContain('期望：能读财报')
  })
})

describe('dl-agent-deps（2026-09-14 整体知识点体系清单）', () => {
  const concepts = [
    { id: 'g1', name: '金融产品', nodeType: 'group', parentId: null },
    { id: 'g2', name: '市场与价格', nodeType: 'group', parentId: null },
    { id: 'c1', name: '股票', nodeType: 'concept', parentId: 'g1', cardId: 'card1' },
    { id: 'c2', name: '债券', nodeType: 'concept', parentId: 'g1', cardId: null },
    { id: 'c3', name: '汇率与美元', nodeType: 'concept', parentId: 'g2', cardId: null },
    { id: 'c4', name: '金融体系总览', nodeType: 'concept', parentId: null, cardId: null },
  ] as Array<{ id: string; name: string; nodeType: string; parentId: string | null; cardId?: string | null }>

  it('按分支列出概念（✓=已有讲义），根层知识概念单独列出', () => {
    const lines = buildMapInventoryLines(concepts)
    const joined = lines.join('\n')
    expect(lines[0]).toContain('当前知识点体系清单')
    expect(joined).toContain('分支「金融产品」')
    expect(joined).toContain('分支「市场与价格」')
    expect(joined).toContain('股票（concept ✓）') // 有讲义
    expect(joined).toContain('债券（concept）') // 无讲义不加 ✓
    expect(joined).toContain('汇率与美元（concept）')
    expect(joined).toContain('根层/未归类：· 金融体系总览')
  })

  it('孤点（父级不是本空间 group 的概念）归到未归类', () => {
    const lines = buildMapInventoryLines([{ id: 'g', name: '分支', nodeType: 'group', parentId: null }])
    expect(lines.join('\n')).toContain('分支「分支」')
    // 挂在不存在 group 下
    const orphaned = buildMapInventoryLines([
      { id: 'g', name: '分支', nodeType: 'group', parentId: null },
      { id: 'o', name: '孤点概念', nodeType: 'concept', parentId: 'ghost' },
    ])
    expect(orphaned.join('\n')).toContain('未归类：· 孤点概念')
  })

  it('空地图 → 空数组', () => {
    expect(buildMapInventoryLines([])).toEqual([])
  })

  it('limit 上限：行超限时截断并注明总数', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `c${i}`,
      name: `概念${i}`,
      nodeType: 'concept',
      parentId: null,
      cardId: null,
    }))
    const lines = buildMapInventoryLines(many, 10)
    // 标题行 + 最多 limit 行 + 截断提示；总数有上界
    expect(lines.length).toBeLessThanOrEqual(12)
    expect(lines.some((l) => l.includes('地图共 60 个节点'))).toBe(true)
  })
})
