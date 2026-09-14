/**
 * 空主题启动引导测试（dl-agent-deps 起步研究辅助，空空间补全）
 * @module tests/unit/core/packs/domain-learning/dl-agent-empty-start.spec
 *
 * 钉死口径：
 * - hasConceptLeaves：判定空间是否已有知识概念叶（group 目录不算）；
 * - dlEmptySpaceMission：空空间时注入的**固定流程第 1 步：对齐诉求**指令——提交诉求理解草案、
 *   本轮不落库（门禁会拒绝）、等用户确认后由宿主驱动第 2/3 步。
 *
 * 2026-09-13 复盘变更：起步研究从"一轮建完骨架+讲义"改成三轮固定流程
 * （诉求理解 → 知识体系 → 按方案落库），故原先钉"3-8 个知识点一次落库"的断言改为钉新口径。
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

  describe('dlEmptySpaceMission（固定流程第 1 步：对齐诉求）', () => {
    const mission = dlEmptySpaceMission({ spaceName: '量子计算入门' })

    it('含空间名与起步任务定位', () => {
      expect(mission).toContain('量子计算入门')
      expect(mission).toContain('还没有任何知识点')
      expect(mission).toContain('起步研究')
    })

    it('本轮只提交诉求理解草案（dl_propose_understanding），不落库知识点', () => {
      expect(mission).toContain('dl_propose_understanding')
      expect(mission).toContain('第 1 步')
      expect(mission).toContain('不要调用 dl_save_concept')
      expect(mission).toContain('门禁')
      expect(mission).toContain('停下')
    })

    it('说明后续两步由用户确认后驱动（dl_propose_syllabus → 落库）', () => {
      expect(mission).toContain('dl_propose_syllabus')
      expect(mission).toContain('第 2 步')
      expect(mission).toContain('第 3 步')
      expect(mission).toContain('用户确认')
    })

    it('采集纪律：先做少量资料探查、记录出处、够用即停', () => {
      expect(mission).toContain('资料探查')
      expect(mission).toContain('wf_kb_retrieve')
      expect(mission).toContain('出处')
      expect(mission).toContain('3-6 次')
    })
  })

  describe('dlEmptySpaceMission 与 bootstrap 技能正文的关系（2026-09-13）', () => {
    const mission = dlEmptySpaceMission({ spaceName: '量子计算入门' })

    it('起步轮不再直接注入五阶段正文（改在落库轮注入，避免这一轮被推着直接建点）', () => {
      expect(mission).not.toContain('宿主已把 learning-space-bootstrap 技能正文注入本会话快照')
      expect(mission).not.toContain('invoke_skill')
    })

    it('带用户诉求时：诉求原文 + 覆盖纪律都在（防按空间名猜主题）', () => {
      const withNeed = dlEmptySpaceMission({
        spaceName: '金融理财',
        description: '想听懂股票、债券、期货、美元，能读财报与行情',
      })
      expect(withNeed).toContain('【用户诉求（用户原话，最高优先级）】')
      expect(withNeed).toContain('股票、债券、期货、美元')
      expect(withNeed).toContain('不得凭空间名猜主题')
    })
  })

  describe('dlBootstrapSkillBody（落库轮注入：S1~S5 与产品契约）', () => {
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
