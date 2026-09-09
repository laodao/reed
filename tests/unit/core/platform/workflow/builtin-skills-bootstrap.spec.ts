/**
 * 起步研究技能契约测试（learning-space-bootstrap）
 * @module tests/unit/core/platform/workflow/builtin-skills-bootstrap.spec
 *
 * 钉死口径：空主题「生成首批知识」的编排从内联提示词收敛为平台内置技能
 * （可被 discover_capabilities 发现 / invoke_skill 调用），内容须包含：
 * - S1~S5 五阶段与每阶段回报；
 * - 产物契约（dl_save_concept/relation/card）+ 无证据不落卡/不编造 + 其余保持待研究。
 */

import { describe, it, expect } from 'vitest'
import { BUILTIN_SKILLS } from '@core/platform/workflow/skills/builtin-skills'

describe('learning-space-bootstrap（领域起步研究技能）', () => {
  const skill = BUILTIN_SKILLS.find((s) => s.id === 'learning-space-bootstrap')

  it('已在内置技能注册（可被 discover/invoke_skill 发现）', () => {
    expect(skill).toBeTruthy()
  })

  const md = skill?.markdown ?? ''

  it('frontmatter 含元信息：name/title/description/when_to_use/category=领域学习', () => {
    expect(md).toContain('name: learning-space-bootstrap')
    expect(md).toContain('title: 领域起步研究（首批知识生成）')
    expect(md).toContain('description:')
    expect(md).toContain('when_to_use:')
    expect(md).toContain('category: 领域学习')
  })

  it('含 S1~S5 五阶段与每阶段回报要求', () => {
    expect(md).toContain('S1 资料探查')
    expect(md).toContain('S2 知识骨架整理')
    expect(md).toContain('S3 学习阶段规划')
    expect(md).toContain('S4 讲义产出')
    expect(md).toContain('S5 自检与交接')
    expect(md).toContain('回报进度')
  })

  it('含产物契约（dl_save_concept/relation/card）', () => {
    expect(md).toContain('dl_save_concept')
    expect(md).toContain('dl_save_relation')
    expect(md).toContain('dl_save_card')
  })

  it('证据纪律：无证据不落卡、不编造；其余概念保持待研究', () => {
    expect(md).toContain('无证据不落卡')
    expect(md).toContain('编造')
    expect(md).toContain('保持「待研究」')
  })

  it('资料采集口径：绑定知识库优先 + 联网工具按需 + web_search 有则用', () => {
    expect(md).toContain('wf_kb_retrieve')
    expect(md).toContain('wf_web_extract')
    expect(md).toContain('http_get')
    expect(md).toContain('web_search')
  })
})
