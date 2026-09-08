# 领域知识自动研究：autoresearch 调研 + 设计文档（2026-09-07）

## 背景

用户定位系统为**面向个人的工作助手**（不做企业级 BPM）。待办方向：自动研究某领域专业知识——基于知识库/文档/网络（预设专业网站爬取），领域研究专用 skill，工作流调用 skill 提取知识，沉淀到知识库/图谱/记忆。先讨论可行性 → 研究 karpathy/autoresearch → 用户确认"先做设计"。

## autoresearch 调研结论（已通读 README/program.md/train.py/prepare.py）

- 本质：让编码 agent 自主做"LLM 预训练调参研究"最小闭环——改 train.py → 固定 5 分钟训练 → 读 val_bpb → 好则 git commit 保留、坏则 reset、崩了修或弃 → results.tsv 记账（不提交）→ NEVER STOP 整夜循环。
- 三文件分工：prepare.py（只读大地+真值评估器）、train.py（唯一可改）、program.md（人类维护的策略层 ≈ skill）。
- 四支柱：① 单一可自动判定指标 val_bpb；② 固定时间预算（可比性）；③ git 当状态机 + 账本与代码解耦；④ 自主契约（NEVER STOP）+ 护栏（超 10 分钟杀、崩溃分类、评估器只读防作弊）。
- 边界：不是资料型研究；无编排框架（agent 手写循环）；自主成立依赖"可自动判定的信号"这一苛刻前提。

## 与用户方案的关键裁决（设计文档 §0.1）

1. **否决"由模型决定保存位置"** → 模型只产结构化知识条目（schema 由 skill 规定），落库由确定性路由决定。
2. **图谱/记忆当前系统不存在**（lw_* 是长文专用；memory-service 为 M1 占位待实现）→ M1 只落知识库，图谱/记忆列 M3。
3. **提取质量无天然指标** → 硬信号自动判定（jsonMode 解析 + evidence 可归因校验）+ 人工抽查闸（审汇总不审过程），替代 val_bpb。

## 设计要点（tasks/2026-09-07-domain-research-workflow/design.md）

- 单轮定向研究工作流：start(topic/urls/kb/model/questions/skillId) → collect(code) → crawl-links 栏目展开 → loop 逐篇 [web-extract → skill-call 提取 → parse(code 校验) → 合格 kb-ingest 幂等落库 / 不合格记 failed] → aggregate(code) → human-review 汇总闸 → approve 落资产 / reject 结束。
- 知识条目契约统一形状（source/summary/entities/concepts/findings[含 evidence 必填]/newQuestions），领域差异只在 type 取值。
- 幂等：sourceKey = research:{topic}:{url}（kb-ingest 覆盖更新不堆积）。
- 硬纪律：宁可漏一条，不落一条无证据。
- 技能资产：内置 domain-research 通用骨架（复制为自定义即填领域本体）。

## M1 代码改动决策（唯一动代码点，已核实事实驱动）

skill-call 现状**无 jsonMode**、输出仅 content 文本（已核实 skill-nodes.ts）；llm-chat 有 jsonMode。
→ 方案 A（选定）：skill-call 增加可选 jsonMode（缺省关闭，既有技能零影响；开启时去围栏→JSON.parse→输出加 parsed；坏 JSON failed 触发引擎重试）。改动面：skill-nodes.ts + catalog outputSchema + 表单 + 单测三例。引擎零改动。
→ 否决方案 B（code 沙箱内手写解析）：沙箱无 require/不可单测、跨工作流复制粘贴，违背纪律（已核实 code-nodes.ts vm 沙箱白名单）。

## 阶段

- M1：skill-call jsonMode + domain-research 技能 + 示例工作流 JSON + spec 全绿 + 真实领域单轮真机（G1~G6）。
- M2：来源库管理接入 + web-search 补候选 + cron 增量 + 声明式 schema + 与既有知识对比。
- M3（独立立项）：通用实体-关系图谱、长期记忆打通。

## 状态

- design.md 已产出待用户评审；**未开始编码、未提交**（遵守"提交/推送等用户明确指令"）。
- 临时调研文件：progress/_autoresearch_*.md/py（不入库）。
