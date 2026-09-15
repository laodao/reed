/**
 * 内置技能 × 讲义流水线/版式纪律（2026-09-14 用户反馈落地）
 * @module tests/unit/core/platform/workflow/builtin-skills-lesson-layout.spec
 *
 * 用户原话：「生成讲义功能太简陋……纯粹的堆砌文字，没有对文字做精炼归纳，没有配图，布局单调简陋」。
 * 提示词是这次改造的一半（另一半是落库门禁与渲染），所以这里钉死技能正文必须写到的事：
 * 先规划再写、逐区按版式写、要归纳、要配图——与 `lesson-layout`/`lesson-spec` 契约同源。
 */
import { describe, it, expect } from 'vitest'
import { BUILTIN_SKILLS } from '@core/platform/workflow/skills/builtin-skills'
import { LESSON_LAYOUT_CATALOG } from '@shared/utils/lesson-layout'

function bodyOf(id: string): string {
  const skill = BUILTIN_SKILLS.find((s) => s.id === id)
  expect(skill, `内置技能 ${id} 应存在`).toBeTruthy()
  return skill!.markdown
}

describe('learning-lesson-designer（讲义方案设计）', () => {
  it('存在且标题/描述点明"先规划规格与区级计划"', () => {
    const md = bodyOf('learning-lesson-designer')
    expect(md).toContain('title: 讲义方案设计')
    expect(md).toContain('区级计划')
    expect(md).toContain('dl_propose_lesson_plan')
  })

  it('带上完整设备菜单（与 lesson-layout 目录同源，不另起一份口径）', () => {
    const md = bodyOf('learning-lesson-designer')
    for (const d of LESSON_LAYOUT_CATALOG) expect(md).toContain(d.key)
    expect(md).toContain('要点卡')
    expect(md).toContain('图解')
  })

  it('写清规格必填项与"至少一个看得见的载体"', () => {
    const md = bodyOf('learning-lesson-designer')
    for (const field of ['audience', 'outcomes', 'budget', 'glossary', 'notation', 'exampleParams', 'roster', 'visualPlan']) {
      expect(md).toContain(field)
    }
    expect(md).toContain('至少一个')
  })
})

describe('learning-concept-explainer（逐区精写）', () => {
  it('流程是 Plan → Do → Check（先提交讲义方案、确认后逐区精写）', () => {
    const md = bodyOf('learning-concept-explainer')
    expect(md).toContain('dl_propose_lesson_plan')
    expect(md).toContain('【已确认讲义方案】')
    expect(md).toContain('dl_task_progress')
    expect(md).toContain('回读')
  })

  it('呈现纪律：一区一版式、精炼归纳、要配图（与门禁同源）', () => {
    const md = bodyOf('learning-concept-explainer')
    expect(md).toContain('呈现纪律')
    expect(md).toContain('一区一版式')
    expect(md).toContain('精炼归纳')
    expect(md).toContain('文字墙')
    expect(md).toContain('配图')
  })

  it('输出 JSON 形状带上 layout 与 takeaway（模型才知道要写这两个字段）', () => {
    const md = bodyOf('learning-concept-explainer')
    const jsonLine = md.split('\n').find((l) => l.includes('"concept_name"')) ?? ''
    expect(jsonLine).toContain('"layout"')
    expect(jsonLine).toContain('"takeaway"')
  })
})

describe('其它讲义技能同步了呈现纪律', () => {
  it('learning-lesson-updater：改动区要保住版式与结论条', () => {
    const md = bodyOf('learning-lesson-updater')
    expect(md).toContain('layout')
    expect(md).toContain('takeaway')
  })

  it('learning-space-bootstrap S4：起步轮快速模式也要按版式写、至少一个载体', () => {
    const md = bodyOf('learning-space-bootstrap')
    expect(md).toContain('S4 讲义产出')
    expect(md).toContain('layout')
    expect(md).toContain('至少一个')
  })
})
