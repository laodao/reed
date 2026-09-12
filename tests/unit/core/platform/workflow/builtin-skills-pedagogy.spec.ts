/**
 * 内置技能全量守卫 + 领域学习教学法契约（2026-09-09 复盘新增）
 * @module tests/unit/core/platform/workflow/builtin-skills-pedagogy.spec
 *
 * 背景：此前只测 bootstrap 单技能文本契约；坏一条 YAML/frontmatter 会打挂
 * discover/invoke_skill 全链路且无测试兜底。本 spec 提供：
 * - 全量守卫：BUILTIN_SKILLS 每项 frontmatter 可解析、id 唯一且 kebab、name=id；
 * - 证据纪律：全部 learning-* 技能正文含"不编造/证据"纪律；
 * - 教学法契约（复盘修复）：learning-concept-explainer 含先例后律/记号热身/
 *   meta 元信息/自测带答案/双层隔离；learning-space-bootstrap S4 要求首卡遵守
 *   上述教学法并做数字回算。
 */

import { describe, it, expect } from 'vitest'
import * as YAML from 'js-yaml'
import { BUILTIN_SKILLS } from '@core/platform/workflow/skills/builtin-skills'
import { splitSkillFrontmatter } from '@core/platform/workflow/skills/skill-parser'

const learningSkillIds = [
  'learning-domain-map',
  'learning-concept-explainer',
  'learning-lesson-writer',
  'learning-lesson-planner',
  'learning-tutor',
  'learning-assessor',
  'learning-source-collector',
  'learning-question-generator',
  'learning-relation-miner',
  'learning-lesson-updater',
  'learning-practice-builder',
  'learning-space-bootstrap',
]

describe('BUILTIN_SKILLS 全量守卫（坏一条即打挂 discover/invoke 全链路，需机器兜底）', () => {
  it('全部技能 frontmatter 可解析且 id 唯一、name 与 id 一致', () => {
    const seen = new Set<string>()
    for (const s of BUILTIN_SKILLS) {
      expect(s.id, `id 非法: ${s.id}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(seen.has(s.id), `id 重复: ${s.id}`).toBe(false)
      seen.add(s.id)
      const parts = splitSkillFrontmatter(s.markdown)
      expect(parts.frontmatter.length, `${s.id} 缺 frontmatter`).toBeGreaterThan(0)
      const fm = YAML.load(parts.frontmatter) as { name?: string }
      expect(fm, `${s.id} frontmatter 解析失败`).toBeTruthy()
      expect(fm?.name, `${s.id} frontmatter.name 缺失`).toBe(s.id)
      expect(parts.body.trim().length, `${s.id} 正文为空`).toBeGreaterThan(20)
    }
    expect(BUILTIN_SKILLS.length).toBeGreaterThanOrEqual(18)
  })

  it('learning-* 十个技能全部注册且正文含各自的真实纪律（防幻觉/不越界）', () => {
    const byId = new Map(BUILTIN_SKILLS.map((s) => [s.id, s]))
    // 内容生成/采集类：必须防幻觉（不编造引用/无证据不落）
    const antiFabrication = [
      'learning-domain-map',
      'learning-concept-explainer',
      'learning-source-collector',
      'learning-question-generator',
      'learning-relation-miner',
      'learning-lesson-updater',
      'learning-space-bootstrap',
    ]
    // 规划/打磨/互动类：按职能各有"有据/不越界"纪律
    const advisoryRules: Record<string, RegExp> = {
      'learning-lesson-planner': /如实返回 null|不硬编|候选为空/,
      'learning-lesson-writer': /不新增|素材/,
      'learning-tutor': /有据|如实|引用/,
      'learning-assessor': /建议者不是裁定者|由用户决定|供参考/,
      'learning-practice-builder': /回算|答案|sectionKey/,
    }
    for (const id of learningSkillIds) {
      const skill = byId.get(id)
      expect(skill, `缺失技能 ${id}`).toBeTruthy()
      const body = splitSkillFrontmatter(skill!.markdown).body
      if (antiFabrication.includes(id)) {
        expect(body, `${id} 缺证据/防幻觉纪律`).toMatch(/不编造|evidence|证据|无证据/)
      } else {
        expect(body, `${id} 缺职能纪律`).toMatch(advisoryRules[id] ?? /./)
      }
    }
  })
})

describe('learning-concept-explainer 教学法契约（复盘：面向新人，非核查笔记）', () => {
  const skill = BUILTIN_SKILLS.find((s) => s.id === 'learning-concept-explainer')!
  const body = splitSkillFrontmatter(skill.markdown).body

  it('含"面向读者的教学纪律"块', () => {
    expect(body).toContain('面向读者的教学纪律')
  })

  it('先例后律：公式/定义前必须先有带数字的真实示例，禁止以定义句开头', () => {
    expect(body).toContain('先例后律')
    expect(body).toContain('带具体数字')
    expect(body).toContain('禁止以定义句开头')
  })

  it('记号热身：首次出现的记号先给读法再使用', () => {
    expect(body).toContain('记号热身')
    expect(body).toContain('读法')
    expect(body).toContain('最小数字例子')
  })

  it('meta 元信息首区：读者画像/数学前置/可测目标（禁用"了解/认识"）', () => {
    expect(body).toContain('key=meta')
    expect(body).toContain('读者画像')
    expect(body).toContain('数学前置')
    expect(body).toContain('可测学习目标')
    expect(body).toContain('了解/认识')
  })

  it('示例数字回算校验 + 跨卡复用示例参数一致', () => {
    expect(body).toContain('回算')
    expect(body).toContain('中间量')
    expect(body).toContain('参数必须全局一致')
  })

  it('自测规范：覆盖核心概念、同构应用题、附答案与解析', () => {
    expect(body).toContain('自测规范')
    expect(body).toContain('附答案')
    expect(body).toContain('先想再看')
  })

  it('自测答案必须单独成段（渲染层默认折叠，读者先做再对）', () => {
    expect(body).toContain('答案必须单独成段')
    expect(body).toContain('独占一行')
    expect(body).toContain('答案默认折叠')
    expect(body).toContain('key=answers')
  })

  it('双层隔离：编写注记不进学习者正文，禁系统黑话', () => {
    expect(body).toContain('双层隔离')
    expect(body).toContain('needs_verification')
    expect(body).toContain('系统黑话')
  })

  it('循序渐进（2026-09-12）：meta 前置声明 + 不跳步 + 每区承上启下 + 区结构规范', () => {
    expect(body).toContain('循序渐进')
    expect(body).toContain('首区必须是 meta')
    expect(body).toContain('前置')
    expect(body).toContain('不跳步')
    expect(body).toContain('每区承上启下')
    expect(body).toContain('每个区都要给 title')
    expect(body).toContain('key=notes')
  })
})

describe('learning-domain-map 分层与前置契约（2026-09-12 循序渐进复盘）', () => {
  const skill = BUILTIN_SKILLS.find((s) => s.id === 'learning-domain-map')!
  const body = splitSkillFrontmatter(skill.markdown).body

  it('输出契约含 spacePrerequisites/layer/prerequisites，并要求不跳级', () => {
    expect(body).toContain('spacePrerequisites')
    expect(body).toContain('prerequisites')
    expect(body).toContain('layer')
    expect(body).toContain('不跳级')
  })

  it('第一原则就是"顺序必须循序渐进"，并要求先给门槛再给路径', () => {
    expect(body).toContain('第一原则：顺序必须循序渐进')
    expect(body).toContain('先定主题前置要求')
    expect(body).toContain('顺序即路径')
    expect(body).toContain('跨度不要超过一步')
  })

  it('要求补基础层（进阶记号 → 基础概念进骨架并排前面）', () => {
    expect(body).toContain('补基础层')
    expect(body).toContain('线性代数基础')
    expect(body).toContain('导数与链式法则')
  })

  it('要求概念粒度细到"能做成一件具体小事"', () => {
    expect(body).toContain('粒度要求')
    expect(body).toContain('具体小事')
  })
})

describe('learning-space-bootstrap S4 教学法要求（复盘）', () => {
  const skill = BUILTIN_SKILLS.find((s) => s.id === 'learning-space-bootstrap')!
  const body = splitSkillFrontmatter(skill.markdown).body

  it('S4 要求首卡遵守 concept-explainer 教学法：meta 首区/先例后律/回算/自测带答案', () => {
    expect(body).toContain('S4 讲义产出')
    expect(body).toContain('learning-concept-explainer 技能的教学法纪律')
    expect(body).toContain('首区为 meta')
    expect(body).toContain('回算')
    expect(body).toContain('自测带答案')
  })

  it('S1~S5 五阶段仍在且要求每阶段回报', () => {
    for (const marker of ['S1 资料探查', 'S2 知识骨架整理', 'S3 学习阶段规划', 'S4 讲义产出', 'S5 自检与交接']) {
      expect(body).toContain(marker)
    }
    expect(body).toContain('回报进度')
  })

  it('S2/S3 要求把前置关系逐条落库（含不跳级与顺序自检）', () => {
    expect(body).toContain('逐条')
    expect(body).toContain('prerequisite')
    expect(body).toContain('不跳级')
    expect(body).toContain('自检顺序')
    expect(body).toContain('相邻层级跨度不得超过一步')
  })

  it('S2 要求先落"整个领域的前置要求"（dl_save_space_prereqs）并给每个概念填 prerequisites', () => {
    expect(body).toContain('先定整个领域的前置要求')
    expect(body).toContain('dl_save_space_prereqs')
    expect(body).toContain('每个概念都要填 prerequisites')
  })

  it('S4 要求 meta 写前置声明，并说明被门禁拒绝时的补法', () => {
    expect(body).toContain('前置声明')
    expect(body).toContain('循序渐进门禁')
  })

  it('S4 要求自测答案单独成段（答案默认折叠）', () => {
    expect(body).toContain('答案单独成段')
    expect(body).toContain('答案默认折叠')
  })
})
