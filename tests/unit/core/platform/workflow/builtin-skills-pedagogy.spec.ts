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
  'learning-map-completion',
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
      'learning-map-completion',
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
    // 2026-09-13：答案区统一叫 answers（区集契约），并明确"行内答案会被门禁拒绝"
    expect(body).toContain('answers（参考答案')
    expect(body).toContain('直接拒绝')
  })

  it('区集契约（2026-09-13）：在册区名 + 固定区序 + 正文小标题 ###（与落库门禁同源）', () => {
    expect(body).toContain('区集契约')
    expect(body).toContain('meta（学习前必读）')
    expect(body).toContain('selfcheck（自测）')
    expect(body).toContain('answers（参考答案）')
    expect(body).toContain('不能自造区名')
    expect(body).toContain('区标题由契约派生')
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

  it('图文并茂（2026-09-12）：约定 figure 声明式图形与可运行 js 代码块', () => {
    expect(body).toContain('图文并茂')
    expect(body).toContain('用代码画图')
    // 五类图形规格都要在技能里交代清楚
    for (const t of ['"type":"matrix"', '"type":"plot"', '"type":"bar"', '"type":"shape"', '"type":"network"']) {
      expect(body, `缺图形规格 ${t}`).toContain(t)
    }
    expect(body).toContain('合法 JSON')
    expect(body).toContain('24×24')
    // 可运行代码块的口径：js 可运行、python 不运行、沙箱无 DOM/网络
    expect(body).toContain('▶ 运行')
    expect(body).toContain('沙箱里没有 DOM、没有网络')
    expect(body).toContain('不会运行')
    expect(body).toContain('200 行')
  })

  // ============ 2026-09-15 用户口径：核心骨架＝定义/详解/案例/自测，章节再合并，有操作才写实操 ============

  it('重点分配：定义/详解/案例这三节写详细（[重点] 标记 + 参考字数下限；实操/辨析不打 [重点]）', () => {
    expect(body).toContain('重点分配与区序')
    expect(body).toContain('核心骨架')
    expect(body).toContain('重点永远是**定义、详解、案例**')
    // 写作要求总表（与 lesson-template 同源渲染）必须进正文：重点标记 + 参考下限 + 各区要求
    expect(body).toContain('definition（定义）[重点]')
    expect(body).toContain('detail（详解）[重点]')
    expect(body).toContain('examples（案例）[重点]')
    expect(body).toContain('至少 320 字')
    // v7/v8：非重点区不再被贴上"导学/从简"标签
    expect(body).not.toContain('meta（学习前必读）[')
    expect(body).not.toContain('selfcheck（自测）[')
    expect(body).not.toContain('operation（实操）[')
    expect(body).not.toContain('confusions（辨析与易错）[')
  })

  it('合并：机制/结构/规则等并进「详解」，为什么学它并进「学习前必读」，步骤/代码并进「实操」，辨析/常见坑并进「辨析与易错」', () => {
    expect(body).toContain('并进「详解」')
    expect(body).toContain('并进「定义」')
    expect(body).toContain('并进「案例」')
    expect(body).toContain('并进「学习前必读」')
    expect(body).toContain('并进「实操」')
    expect(body).toContain('并进「辨析与易错」')
    expect(body).toContain('不再单列成章')
    // 旧区名不再出现在新模板区序里
    expect(body).not.toContain('structure（')
    expect(body).not.toContain('rules（')
    expect(body).not.toContain('pitfalls（')
  })

  it('实操只在本领域确实有可照做的操作时才写（不硬凑），并落到提示词里', () => {
    expect(body).toContain('operation（实操）：')
    expect(body).toContain('照着做')
  })

  it('详解是篇幅最大的重点区：主线 + 逐类同维度展开 + 对比表 + 判定与计算规则', () => {
    expect(body).toContain('贯穿主线')
    expect(body).toContain('同一组维度')
    expect(body).toContain('横向对比表')
    expect(body).toContain('判定与计算规则')
  })

  it('案例紧跟详解之后，用来呼应定义与详解（不做反事实推演、不堆概念）', () => {
    expect(body).toContain('定义 → 详解 → 案例')
    expect(body).toContain('案例紧跟详解之后')
    expect(body).toContain('不要拿案例当正文主体')
    expect(body).toContain('反事实推演')
  })

  it('不要卡片样式：按文档写（段落 + 小标题 + 表格），不做要点卡堆砌', () => {
    expect(body).toContain('不要卡片样式')
    expect(body).toContain('按文档写')
    expect(body).toContain('要点卡')
  })

  it('bootstrap S4 与 lesson-updater 同步 v8 口径（再合并 + 主干区序 + 不要卡片 + 答案折叠）', () => {
    const bootstrap = splitSkillFrontmatter(BUILTIN_SKILLS.find((s) => s.id === 'learning-space-bootstrap')!.markdown).body
    expect(bootstrap).toContain('重点分配')
    expect(bootstrap).toContain('区序「定义 → 详解 → 案例 →（实操）→ 辨析与易错 → 自测」')
    expect(bootstrap).toContain('不要卡片样式')
    expect(bootstrap).toContain('答案默认折叠')
    const updater = splitSkillFrontmatter(BUILTIN_SKILLS.find((s) => s.id === 'learning-lesson-updater')!.markdown).body
    expect(updater).toContain('区序「定义 → 详解 → 案例 →（实操）→ 辨析与易错 → 自测」')
    expect(updater).toContain('并进「详解」')
    expect(updater).toContain('并进「实操」')
    expect(updater).toContain('案例紧跟详解之后')
  })
})

describe('learning-map-completion 取材与四阶段契约（2026-09-12 用户口径）', () => {
  const skill = BUILTIN_SKILLS.find((s) => s.id === 'learning-map-completion')!
  const body = splitSkillFrontmatter(skill.markdown).body

  it('固定四阶段顺序，并声明"不许跳过 S1"与"无工具时只出草案不落库"', () => {
    expect(body).toContain('先采集资料')
    expect(body).toContain('不许跳过 S1')
    expect(body).toContain('S1 采集')
    expect(body).toContain('S2 规划整体体系')
    expect(body).toContain('S3 落库')
    expect(body).toContain('S4 自检与交接')
    expect(body).toContain('无工具的单次生成')
    expect(body).toContain('未落库')
  })

  it('采集：知识库优先 → 联网，带检索词示例、3-6 次预算与出处要求', () => {
    expect(body).toContain('知识库优先')
    expect(body).toContain('wf_kb_retrieve')
    expect(body).toContain('目录 / 知识体系 / 大纲 / 综述 / 学习路径')
    expect(body).toContain('web_search')
    expect(body).toContain('wf_web_extract')
    expect(body).toContain('http_get')
    expect(body).toContain('3-6 次')
    expect(body).toContain('要点 + 出处')
    expect(body).toContain('本轮无外部资料')
  })

  it('规划：资料与先验分开标注 + 不跳级 + 跨度 ≤1 + 不编造', () => {
    expect(body).toContain('evidenceLevel')
    expect(body).toContain('prior')
    expect(body).toContain('prior_needs_verification')
    expect(body).toContain('不跳级')
    expect(body).toContain('相邻层级跨度不超过一步')
    expect(body).toContain('不编造文献标题与链接')
    expect(body).toContain('具体小事')
  })

  it('落库与自检：dl_save_concept/relation/space_prereqs + 可达性/顺序/证据复核', () => {
    expect(body).toContain('dl_save_concept')
    expect(body).toContain('dl_save_relation')
    expect(body).toContain('dl_save_space_prereqs')
    expect(body).toContain('已有概念只补边不重建')
    expect(body).toContain('可达性')
    expect(body).toContain('纯先验各多少')
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

  it('取材顺序（2026-09-12 用户口径）：先采集再规划，知识库优先 → 联网 → 先验须标注', () => {
    expect(body).toContain('取材顺序')
    expect(body).toContain('先采集，再规划，资料与模型知识必须区分')
    expect(body).toContain('知识库优先')
    expect(body).toContain('wf_kb_retrieve')
    expect(body).toContain('web_search')
    expect(body).toContain('3-6 次')
    expect(body).toContain('先验待查证')
    expect(body).toContain('不编造文献标题与链接')
    expect(body).toContain('本轮无外部资料')
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
