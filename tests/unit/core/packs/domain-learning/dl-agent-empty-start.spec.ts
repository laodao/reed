/**
 * 空主题启动引导测试（dl-agent-deps 起步研究辅助，空空间补全）
 * @module tests/unit/core/packs/domain-learning/dl-agent-empty-start.spec
 *
 * 钉死口径：新主题只有「领域根」目录、零概念——「研究」入口此前要求先选中概念，
 * 造成空空间无从生成知识。本次为 research 会话补「空领域起步任务」：
 * - hasConceptLeaves：判定空间是否已有知识概念叶（group 目录不算）；
 * - dlEmptySpaceMission：空空间时注入的起步研究指令（先建概念骨架 + 关系 +
 *   为基础概念产讲义，证据纪律不变、不得编造）。
 */

import { describe, it, expect } from 'vitest'
import {
  DL_BOOTSTRAP_SKILL_ID,
  dlBootstrapSkillBody,
  dlEmptySpaceMission,
  hasConceptLeaves,
} from '@core/packs/domain-learning/services/dl-agent-deps'

describe('空主题启动引导', () => {
  describe('hasConceptLeaves', () => {
    it('空数组 → false（尚无任何概念）', () => {
      expect(hasConceptLeaves([])).toBe(false)
    })

    it('只有 group 目录（如“XX·领域根”）→ false', () => {
      expect(hasConceptLeaves([
        { nodeType: 'group', id: 'g1' },
        { nodeType: 'group', id: 'g2' },
      ])).toBe(false)
    })

    it('存在任一非 group 叶概念 → true', () => {
      expect(hasConceptLeaves([
        { nodeType: 'group', id: 'g1' },
        { nodeType: 'concept', id: 'c1' },
      ])).toBe(true)
    })
  })

  describe('dlEmptySpaceMission', () => {
    const mission = dlEmptySpaceMission({ spaceName: '量子计算入门' })

    it('含空间名与起步任务定位', () => {
      expect(mission).toContain('量子计算入门')
      expect(mission).toContain('还没有任何知识点')
      expect(mission).toContain('起步研究')
    })

    it('引导先建首批核心概念骨架并落库 dl_save_concept', () => {
      expect(mission).toContain('dl_save_concept')
      expect(mission).toContain('3-6')
    })

    it('引导建学习关系（dl_save_relation）与“首个基础概念出讲义（dl_save_card）”', () => {
      expect(mission).toContain('dl_save_relation')
      expect(mission).toContain('dl_save_card')
      expect(mission).toContain('讲义')
    })

    it('不必一次全部出卡：其余概念保持“待研究”即可', () => {
      expect(mission).toContain('待研究')
      expect(mission).toContain('不必一次')
    })

    it('证据纪律不变：讲义论断须来自实际读到的资料，不得编造', () => {
      expect(mission).toMatch(/证据/)
      expect(mission).toContain('编造')
    })
  })

  describe('dlEmptySpaceMission 指向平台技能（M7 固化为 learning-space-bootstrap；复盘后改宿主注入语义）', () => {
    const mission = dlEmptySpaceMission({ spaceName: '量子计算入门' })

    it('说明技能正文已由宿主注入、直接按 S1~S5 执行，不再引导 discover/invoke（防假完成）', () => {
      expect(mission).toContain('learning-space-bootstrap')
      expect(mission).toContain('S1~S5')
      expect(mission).toContain('回报进度')
      expect(mission).toContain('宿主已把 learning-space-bootstrap 技能正文注入本会话快照')
      expect(mission).not.toContain('invoke_skill')
    })

    it('保留兜底摘要：技能正文缺失时按同口径直接执行', () => {
      expect(mission).toContain('按此摘要执行')
      expect(mission).toContain('dl_save_concept')
      expect(mission).toContain('dl_save_card')
    })
  })

  describe('dlBootstrapSkillBody（复盘：宿主把 bootstrap 技能正文注入空空间研究会话）', () => {
    it('能取到 learning-space-bootstrap 技能正文（去 frontmatter）', () => {
      const body = dlBootstrapSkillBody()
      expect(body).not.toBeNull()
      expect(body).not.toContain('---') // 已去 frontmatter 围栏
      expect(body).toContain('S1 资料探查')
      expect(body).toContain('S5 自检')
    })

    it('正文五阶段产物契约：dl_save_concept/relation/card + 证据纪律', () => {
      const body = dlBootstrapSkillBody() ?? ''
      expect(body).toContain('dl_save_concept')
      expect(body).toContain('dl_save_relation')
      expect(body).toContain('dl_save_card')
      expect(body).toMatch(/evidence|证据/)
      expect(body).toContain('不编造')
    })

    it('技能 id 常量与注册一致', () => {
      expect(DL_BOOTSTRAP_SKILL_ID).toBe('learning-space-bootstrap')
      expect(dlBootstrapSkillBody()).toBeTruthy()
    })
  })
})
