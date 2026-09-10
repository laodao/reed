# 领域学习 M1-E：真机纵线验收（2026-09-09）

## 前置
分支 feat/domain-learning；承接 M1-D（a7055e06）。better-sqlite3 切回 Electron ABI + 重启 dev:debug（CDP 9222，页面正常）。

## 发现的平台缺口（本里程碑绕行）
- **agent-harness 平台缺口**：pack 域工具注册强制命名空间 `pack:<packId>:<name>`（含冒号），agent-loop 直接把它当 LLM function.name 透传 → DeepSeek/OpenAI 兼容 API 拒绝（`^[a-zA-Z0-9_-]+$`）。系统内置工具裸名不受影响；**EP/LW 的 pack 工具同样会踩**（agent-harness 待修）。
- dl 绕行：dl 工具以裸名注册（source='tool'，dl_ 前缀防冲突），宿主白名单用显式清单 dlAgentToolNames()。已提交 fdfdad00。

## 真机验收结果（真实 DeepSeek LLM + 真实 SQLite）
1. **建空间**：dl:create-space 真实落库；Home 列表/三栏 Space 渲染零页面错误。
2. **研究（research agent，真实 agent 循环）**：
   - domain-map 请求 → agent 产出「先验概率/贝叶斯定理/后验概率」3 概念（dl_save_concept，source=ai_verified）+ 2 条 prerequisite 关系（verified=false 待人审）落库；
   - 单概念研究 → 讲义卡片 dl_save_card：essence=K-stmt、5 区（本质/正式陈述/依据与推导/示例与注意/检验与自测）、works 3 项（Bayes 1763 论文/中文教材/BDA 专著，带 URL/作者/年份）、evidence_sources 3 条——evidence 硬校验通过。
3. **教学**：pickNext 门控正确（先验未学时不推贝叶斯；直接懂贝叶斯被拒「前置依赖未全部掌握」；先验懂了→解锁贝叶斯→懂了→推后验）；stats total=3 mastered=2；mastery_log 审计落库。
4. **追问（tutor agent）三路**：
   - 有据回答：source=lesson，引用讲义「依据与推导」区，含全概率展开公式；
   - 先验回答：source=ai_verified；
   - 答不上：agent 如实核查讲义无依据 → dl_answer_question unresolved → 入未解队列（status=open，message「已登记为未解问题（在队列中，可触发新研究）」）。
5. **重启状态完好**：杀 dev 重启后空间/概念/掌握度/讲义（5 区）/关系/问答队列（10 条：answered 4/open 6）全部从 SQLite 恢复。
6. 事件通道：stage/action:done/reply:start/error/reply:done/question:open 回流正常；busy 互斥正确（并发第二轮被拒）。

## 遗留问题（不在 M1 验收阻塞范围，建议后续）
- invoke_skill 调用 learning-* skill 返回空骨架（agent 报告「技能目录列表为空但总数 14」「参数模板未命中」）——skill 资产与 discover/invoke 的对接疑点，agent 最终退化用模型先验产出（验收仍达成）。M2/质量迭代排查：discover_capabilities 返回数组空的原因、skill inputs 与 renderSkillTemplate 参数匹配。
- 概念直接挂在树根（agent 未传 parentId 到领域根 group 下）——地图人审后应由用户整理层级或 agent 感知根 group。
- 临时验证脚本 progress/_m1e_*.js 已删除。

## 状态
M1-E 验收通过，未提交。待提交 push。
