# 领域共学空间：v2 详细设计（2026-09-07）

## 背景与过程

- 前身：tasks/2026-09-07-domain-research-workflow/design.md（"自动研究"第一版：单轮研究流水线 + 领域研究 skill + 落知识库）。
- 用户三连反馈把方向从"系统自动研究"升级为"**人机共学**"：
  1. 学习新领域的方法论探讨（综述骨架 → 术语队列 → 逐概念搞懂 → 关系扩边 → 专著/论文 → 有关系的知识体系）；
  2. 参考 karpathy/autoresearch（自主闭环需可判定信号）；
  3. 用户补充关键需求：**过程用户全程参与；系统先循环研究但要"教会用户"；产出=用户能看懂的图文/表格/思维导图/文章；阅读后追问；答不上就开新研究方向；AI 先验正确也提炼入库**；"先详细设计，不着急动手"。

## 方法论调研（已验证方法依据）

- 概念图学习法（Novak）：骨架先行；auto-survey-agent research_rules.md：先综述对齐分类学再漏斗（广扫→筛选→精读）。
- 费曼/主动回忆：理解需可验证 → assessor 自测 + 复述判定。
- Zettelkasten：原子卡片 + 显式链接 → 概念图中央状态。
- STORM（Stanford，评测 +25% 组织性/+10% 覆盖）：多视角提问优于关键词 → question-generator / domain-map 提问建骨架。
- autoresearch（val_bpb 启示）：自主闭环需自动判定信号 → 研究侧 evidence 硬校验；教学侧掌握度=用户反馈/自测（真信号）。

## 已确认产品决策（ask_user 三轮）

| D1 | 独立「领域学习空间」页：领域=持久项目，三栏 概念图/讲义/追问对话，随时回来继续 |
| D2 | 概念图归学习空间自带（dl_concept/dl_relation SQLite 表），不依赖通用图谱 |
| D3 | M1 跑完整纵线"研究→讲义→教学→追问→沉淀"，采集半自动（KB+手动 URL），全自动采集 M2 |
| D4 | 工作方法=skill 家族：研究侧 5 + 教学侧 4 |
| D5 | skill 由学习服务直接调用；提示词渲染抽公共函数；无需 skill-call jsonMode |
| D6 | AI 先验入图须 source=ai-verified + 用户确认/交叉验证 |
| D7 | 追问答不上 → 未解问题队列（dl_question status=open）→ 第二研究方向引擎 |

## 设计文档内容

tasks/2026-09-07-domain-learning-space/design.md（取代 research-workflow 版）：

- §0 定位：人机共学；研究是手段、教到会是目的。
- §4 页面三栏（左概念图掌握度着色 / 中讲义 bytemd+mermaid 渲染 / 右追问对话）+ 时序。
- §5 数据模型：dl_project / dl_concept（research_state × mastery 双维）/ dl_relation（类型+证据+verified）/ dl_mastery_log / dl_card / dl_lesson / dl_question。
- §6 学习循环状态机：地图人审 → 计划选课 → 研究(半自动) → 讲义 → 教学反馈 → 追问(三路) → 收敛；人机分工表。
- §7 skill 家族（M1 六个：learning-domain-map / learning-concept-explainer / learning-lesson-planner / learning-lesson-writer / learning-tutor / learning-assessor；M2 三：relation-miner/question-generator/source-collector），含输入/输出契约（输出 JSON 形状 / markdown 讲义）。
- §8 包架构：packs/domain-learning 后端服务 + renderer 前端包；ai-call.ts 已具备 callAI+extractJsonFromResponse（episode-production 先例）→ 服务侧结构化无需 jsonMode；渲染公共化是唯一引擎面小重构。
- §9 改动面清单（TDD 先红）+ §10 阶段 M1/M2/M3 + §11 风险（先验幻觉/掌握度自评偏差/讲义质量=产品/范围控制）。

## 关键取舍（设计评审修正）

1. 第一版"研究工作流"被吸收为学习空间的研究引擎（§6），不再是独立产品。
2. **skill-call jsonMode 方案取消**：服务层直接调 AI + extractJsonFromResponse（平台能力已核实，episode-production 先例），无需给 skill-call 加 jsonMode——减少引擎面改动。
3. M1 聚焦"教得懂 + 问得到 + 沉淀得下"纵线；自动采集/论文源/工作流化/周期推进全部 M2。

## 状态

- design.md（v2 详设）已落盘待评审；**未编码、未提交**（用户明确先设计不着急动手；提交等明确指令）。
- 调研临时文件：progress/_autoresearch_*.md/py、_autoresearch_survey_readme.md、_autoresearch_rules.md（不入库）。
