/**
 * 「补全知识地图」任务指令测试（dlMapCompletionMission）
 * @module tests/unit/shared/domain-learning-mission.spec
 *
 * 用户需求（2026-09-12）：学习者多半不清楚完整知识体系——要能一键让 AI 补齐左侧地图。
 * 本 spec 钉死指令必须覆盖四类缺口判定与落库口径（建概念 → 建前置边 → 不产讲义），
 * 并与技能层的循序渐进纪律（相邻层级跨度不超过一步）保持一致。
 */

import { describe, it, expect } from 'vitest'
import { MAP_COMPLETION_MARKER, dlMapCompletionMission } from '@shared/utils/domain-learning-mission'

describe('dlMapCompletionMission', () => {
  const m = dlMapCompletionMission({ spaceName: '深度学习', conceptCount: 7, goal: '工作应用' })

  it('开头带「补全知识地图」标记（宿主据此注入 learning-map-completion 技能正文）', () => {
    expect(MAP_COMPLETION_MARKER).toBe('【补全知识地图】')
    expect(m.startsWith(MAP_COMPLETION_MARKER)).toBe(true)
  })

  it('指向技能 learning-map-completion，并给"未注入就按摘要执行"的兜底', () => {
    expect(m).toContain('learning-map-completion')
    expect(m).toContain('若未注入')
  })

  it('带出空间名/基线知识点数/学习目标', () => {
    expect(m).toContain('学习空间「深度学习」')
    expect(m).toContain('当前 7 个知识点')
    expect(m).toContain('工作应用')
  })

  it('只补结构：不改写已有、不产讲义、不重复建同名概念', () => {
    expect(m).toContain('只补结构')
    expect(m).toContain('不产出讲义')
    expect(m).toContain('不重复建同名概念')
  })

  it('四类缺口判定齐全（主干/前置/跨度/粒度）', () => {
    expect(m).toContain('主干缺失')
    expect(m).toContain('前置缺失')
    expect(m).toContain('跨度太大')
    expect(m).toContain('粒度太粗')
    // 用户实测例子进指令：张量 → 自动微分之间缺台阶
    expect(m).toContain('导数与链式法则')
    expect(m).toContain('相邻层级跨度不超过一步')
  })

  // 2026-09-12 用户口径：先采集资料 → 再规划体系（资料+先验并区分）→ 落库 → 自检
  it('四阶段顺序齐全，且明确"不许跳过采集"', () => {
    expect(m).toContain('先采集资料')
    expect(m).toContain('不许跳过 S1')
    expect(m).toContain('S1 采集')
    expect(m).toContain('S2 规划整体体系')
    expect(m).toContain('S3 落库')
    expect(m).toContain('S4 自检与交接')
  })

  it('S1：知识库优先 → 再联网，带检索词示例、读工具预算与"记出处"要求', () => {
    expect(m).toContain('知识库优先')
    expect(m).toContain('wf_kb_retrieve')
    expect(m).toContain('目录 / 知识体系 / 大纲 / 综述 / 学习路径')
    expect(m).toContain('再联网补充')
    expect(m).toContain('web_search')
    expect(m).toContain('wf_web_extract')
    expect(m).toContain('http_get')
    expect(m).toContain('3-6 次')
    expect(m).toContain('要点 + 出处')
    // 无资料时的兜底说明
    expect(m).toContain('本轮无外部资料')
  })

  it('S2：资料事实 + 模型先验，二者必须区分标注（有原文 / prior 先验待核验）', () => {
    expect(m).toContain('资料 + 模型知识结合')
    expect(m).toContain('evidenceLevel')
    expect(m).toContain('prior')
    expect(m).toContain('prior_needs_verification')
    expect(m).toContain('attrs.layer')
    // 不跳级 + 跨度自检 + 粒度
    expect(m).toContain('不跳级')
    expect(m).toContain('相邻层级跨度不超过一步')
    expect(m).toContain('具体小事')
  })

  it('S3/S4：不编造出处、只补边不重建、自检可达性与证据构成', () => {
    expect(m).toContain('不编造出处')
    expect(m).toContain('已有概念只补边不重建')
    expect(m).toContain('dl_save_space_prereqs')
    expect(m).toContain('可达性')
    expect(m).toContain('资料覆盖 vs 纯先验')
  })

  it('落库口径：dl_save_concept(+prerequisites) → dl_save_relation → 领域外前置走 dl_save_space_prereqs', () => {
    expect(m).toContain('dl_save_concept')
    expect(m).toContain('prerequisites')
    expect(m).toContain('dl_save_relation')
    expect(m).toContain('prerequisite 边')
    expect(m).toContain('dl_save_space_prereqs')
    expect(m).toContain('主题前置要求')
  })

  it('纪律：不编造、术语须公认、拿不准不建、收尾说明', () => {
    expect(m).toContain('不编造出处')
    expect(m).toContain('收尾')
  })

  it('缺省入参也能生成（不出现 undefined）', () => {
    const bare = dlMapCompletionMission()
    expect(bare).toContain('当前学习空间')
    expect(bare).not.toContain('undefined')
    expect(bare).not.toContain('null')
  })

  it('用户补充要求被带入（有则附，无则不出现该段）', () => {
    const withExtra = dlMapCompletionMission({ spaceName: '量子物理', extra: '重点补数学前置' })
    expect(withExtra).toContain('用户补充要求：重点补数学前置')
    expect(dlMapCompletionMission({ spaceName: '量子物理' })).not.toContain('用户补充要求')
  })

  // 2026-09-12：把确定性结构诊断带进指令，让模型从已知缺口起步
  it('带覆盖率诊断时：写进"逐条落实已知缺口"与逐条缺口', () => {
    const m2 = dlMapCompletionMission({
      spaceName: '深度学习',
      conceptCount: 8,
      coverageSummary: '地图完整度 60/100（知识点 8 · 前置边 9 · 学习路径 5 层 · 已建讲义 1/8）；缺口 4 类',
      coverageGaps: ['[high] 有 1 个知识点由多个起点概念直接汇入——中间往往缺过渡台阶', '[medium] 7/8 个知识点还没有讲义'],
    })
    expect(m2).toContain('逐条落实这些已知缺口')
    expect(m2).toContain('地图完整度 60/100')
    expect(m2).toContain('缺过渡台阶')
    expect(m2).toContain('7/8 个知识点还没有讲义')
  })

  it('无覆盖率诊断时不出现该段（保持原口径）', () => {
    const m3 = dlMapCompletionMission({ spaceName: '量子物理' })
    expect(m3).not.toContain('逐条落实这些已知缺口')
  })
})
