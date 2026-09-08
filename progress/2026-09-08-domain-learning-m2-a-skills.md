# 领域共学空间 M2-A 进度记录:研究侧三 skill 资产

日期:2026-09-08 · 分支 feat/domain-learning · 依据 m2-implementation-plan.md §2 M2-A

## 完成内容

- `src/core/platform/workflow/skills/builtin-skills.ts` 追加三个研究侧内置 skill(均 category 领域学习,中文,frontmatter 五字段 + inputs + output_desc):
  - `learning-source-collector`:研究资料路由(采集计划)——输出 `{plan:[{action:'检索KB'|'抓网页'|'搜arxiv'|'读论文', target, reason}], risk}`;纪律=不编造 URL/资料,复用与 KB 优先,拿不准进 risk;
  - `learning-question-generator`:多视角提问(补盲与验证)——输出 `{questions:[{perspective, question, why}]}`;六视角建议(定义/机制/应用/历史/误区/辨析),不与已有未解问题重复;
  - `learning-relation-miner`:关系与建议提取——输出 `{relations:[{source,target,relation_type,evidence}], suggestions:[...]}`;默认 prerequisite(source→target),无证据不列 relations、只进 suggestions 待查证。
- 契约出处:design.md v2 §7(relation-miner/question-generator/source-collector 三输出契约);M2 采集闭环的技能面就绪。

## 回归与校验

- vitest:skill-parser 10 + skill.service 12 + skill-registry 5 = 27 passed(无 DB 依赖,无需 ABI 切换);
- 运行时全量校验(progress/_m2a_skill_check.ts):17 个内置 skill 逐条 parseSkillMarkdown 通过、id 无重复、三新 skill 就位且 output_desc 不以裸 `{` 开头。
- 技能内容资产不入单测(design §16.8 口径),以解析校验 + 后续真机验收兜底。

## 变更文件

- 修改:`src/core/platform/workflow/skills/builtin-skills.ts`
- 新增(诊断,不入库):`progress/_m2a_skill_check.ts`

## 下一步

- M2-B:研究宿主采集扩展(research 模式白名单加读工具 web_search(有默认源才 bind)/http_get/wf_web_extract/wf_kb_retrieve + arxiv 论文源 + 未解问题自动开子研究),TDD。
