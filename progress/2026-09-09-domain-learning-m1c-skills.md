# 领域学习 M1-C：六个内置学习 skill 资产（2026-09-09）

## 上下文
承接 2026-09-09-domain-learning-m1b-pack.md（M1-B 已提交 258dfa95）。分支 feat/domain-learning。

## 本轮完成
`src/core/platform/workflow/skills/builtin-skills.ts` 追加六个 learning-* SKILL.md（代码内联，frontmatter 含 name/description/when_to_use/category/inputs/system_prompt/output_desc）：
1. learning-domain-map：领域地图草稿（topic/goal/material → branches/concepts/openQuestions JSON）——人审环节上游
2. learning-concept-explainer：块化讲义卡片（concept/material/essenceHint → essence_type/sections/works/evidence_sources/priors_used/needs_verification JSON）——模板区集按 content-template-design v4；深水区 folded；证据纪律
3. learning-lesson-writer：卡片 → 可顺读讲义正文（markdown；mermaid/表格/KaTeX + 2~3 自测）
4. learning-lesson-planner：图谱掌握度+依赖 → 下一概念建议 JSON（依赖门控纪律重申；宿主以纯规则 pickNextToLearn 为主，此 skill 为可选 AI 顺序建议）
5. learning-tutor：追问答疑（先结论后理由、引用上下文、答不上建议登记研究）
6. learning-assessor：自测/费曼判定 JSON（建议者不裁定，掌握度用户确认）

## 验证
- 六个 skill 逐一 parseSkillMarkdown 成功（临时 spec 验证后删除）；
- skill.service.spec 12 项 + skill-parser/skill-call-node 全绿（28 passed）——修复了我第一次追加时 output_desc 含裸 `{}` 花括号被 YAML 当 flow mapping 的解析错误（改为无花括号中文描述）。

## 过程教训
- 含中文文件一律用 edit/write 工具；PowerShell `-replace + Set-Content/WriteAllText` 会双重编码破坏 UTF-8（本次 builtin-skills.ts 曾写坏，git checkout 恢复后重做）。output_desc 等 YAML frontmatter 值避免以裸 `{` 开头（flow mapping 语法）。

## 状态
M1-C 完成未提交。M1-D 剩余：前端 mock → 真实数据（preload + web channel-map + dl store + S0 回归 + 原型文案去「原型」）。M1-E：真机纵线验收（需用户 provider key）。
