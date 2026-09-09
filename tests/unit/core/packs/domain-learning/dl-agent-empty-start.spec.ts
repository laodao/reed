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

  describe('dlEmptySpaceMission 指向平台技能（M7：起步研究固化为 learning-space-bootstrap）', () => {
    const mission = dlEmptySpaceMission({ spaceName: '量子计算入门' })

    it('引导先 discover 可用技能再 invoke_skill 调用 learning-space-bootstrap', () => {
      expect(mission).toContain('discover_capabilities')
      expect(mission).toContain('invoke_skill')
      expect(mission).toContain('learning-space-bootstrap')
    })

    it('要求按技能 S1~S5 阶段执行并在每阶段向用户回报进度', () => {
      expect(mission).toContain('S1~S5')
      expect(mission).toContain('回报进度')
    })
  })
})
