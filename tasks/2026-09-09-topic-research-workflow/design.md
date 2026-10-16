# 「主题实操研究」内置工作流模板设计（Topic Research Workflow）

> ⚠️ **已被 design-v2.md 取代**（同日用户评审通过后升级替换为「主题深度研究」，见同目录 design-v2.md 与 `src/core/database/migrations/builtin-apps/topic-research.json`）。本文件保留为 v1 历史记录。

日期：2026-09-09
分支：feat/domain-learning（当前工作分支）
文档目录：tasks/2026-09-09-topic-research-workflow/
需求来源：用户原话——"帮我开发一个工作流，用来研究某一个主题，比如我想了解跨境电商的做法，要有详细的步骤、注意事项、运营方法等。还比如具体我要在 tiktok 上开店，要怎么做，就这类具体的一个事项的主题研究。"
用户已确认形态：**the-bot 产品内置工作流模板**；示例验收主题：**「在 TikTok 上开店怎么做」**。

---

## 0. 背景与问题

- 系统定位为面向个人的工作助手，产品内已有**工作流引擎 + 内置工作流模板体系**：模板以 JSON 随包存放
  （`src/core/database/migrations/builtin-apps/*.json`），经
  `src/core/database/migrations/create-builtin-apps.ts` 的 `BUILTIN_APPS` 注册表幂等写入
  `workflow_definitions`（draft/published 双图）与 `apps`（source_kind=workflow），可被
  「应用/工作流」列表运行、可被对话 agent 经 `run_workflow` 触发（tools/system-agent-tools.ts）。
- 现有 19 份内置模板中与"研究"相关者：`industry-research`（行业深度调研：主题→多轮搜索→研报）、
  `competitor-analysis`（竞品分析）、`gossip-event-report`（吃瓜报告）。**没有一份面向
  "某件事具体怎么做"的实操/做法类主题研究模板**（要求产出详细步骤、注意事项、运营方法、避坑等）。
- 存在一份更重的「领域知识自动研究」设计（tasks/2026-09-07-domain-research-workflow/design.md）：
  逐 URL 抓正文→skill 结构化提取→校验→知识库幂等落库。其状态为**设计完成、未编码、与用户评审中**，
  且依赖未落地的 skill-call jsonMode 平台小改动。该设计面向"知识沉淀到知识库"的长线学习；
  **本模板与之互补不冲突**：本模板一次运行产出可直接阅读的实操指南文本资产（§2 裁决）。

### 关键裁决（先决后做）

1. **形态=新增 1 份内置工作流模板（JSON + 注册表条目），不改引擎、不改节点、不加技能、不动前端**。
   理由：llm-chat 已支持 jsonMode、loop/web-search/report/human-review/save-asset 等节点均现成可用
   （industry-research.json 已证明同一节点组合可运行）；零平台代码可把风险与改动面压到最小。
2. **产出=Markdown 实操指南文本资产（assets，kind=text）**，经 human-review 人工确认后才保存；
   本模板不做知识库落库（落库属于 09-07 设计的范畴，避免两线抢跑）。
3. **通用模板、主题驱动**：内容章节不由代码写死，由"规划节点"按主题与用户勾选的关注维度拆解；
   但提示词层**强制覆盖"步骤/注意/运营方法"类的做法型骨架**（存在才写，不硬凑），确保"跨境电商做法、
   TikTok 开店"这类主题必出用户要的三类内容。
4. **防幻觉纪律**：摘要与成稿只基于当轮搜索结果；来源仅在搜索结果中选取，不编造 URL；
   明确"平台规则/政策有时效与地区差异，以官方最新为准"；人工确认闸在保存前（waiting_review）。

## 1. 目标与验收

| # | 能力 | 验收口径 |
|---|------|---------|
| G1 | 一条"主题 → 研究 → 实操指南"内置模板 | 模板经 importDefinition 同等校验全绿（validateGraph + 节点目录存在性）；注册表幂等写入 workflow_definitions+apps |
| G2 | 产出含做法型内容 | 以「在 TikTok 上开店怎么做」真机跑通：指南含（尽量齐全）总体认识/详细步骤/注意事项/运营方法/常见问题/工具资源/参考来源，每节有据可依 |
| G3 | 内容可归因、不编造来源 | 成稿含参考来源清单且来源出自当轮搜索结果；提示词层纪律 + 人工确认闸双保险 |
| G4 | 人工把关 | report 后挂 human-review，approve→存资产，reject→结束不落资产 |
| G5 | 可被 agent 触发 | discover_capabilities 可发现该模板（含 start 输入 schema）；run_workflow 可带 topic 运行（真机复验，顺带补上 dl 收口遗留的"run_workflow 真实触发场景待模板复验"，progress/2026-09-09-domain-learning-task-exec.md 遗留③） |
| G6 | 不破坏既有体系 | 引擎/节点/技能/前端零改动；既有 19 模板 spec 不受影响（仅数量断言 19→20 同步）；eslint 0 errors |

## 2. 形态与位置

- 新增模板文件：`src/core/database/migrations/builtin-apps/topic-research.json`
  - 定义 id（迁移内自动生成）：`builtin_def_topic-research`；应用 id：`builtin_app_topic_research`
  - 顶层：`kind=the-bot-workflow`、`formatVersion=1`、`category` 沿用调研类、`triggers=[]`、`settings=null`
- 注册表 `BUILTIN_APPS`（create-builtin-apps.ts）：静态 import + 1 条登记（icon/name/description/category/tags）。
- 与现有研究类模板的差异（一句话定位，防重复）：

| 模板 | 输出侧重 | 结构 |
|---|---|---|
| industry-research 行业深度调研 | 行业宏观（市场/竞争/技术/政策/趋势/风险）研报 | 子问题平面循环 → 综合研报 JSON |
| competitor-analysis 竞品分析 | 竞品对比矩阵 + 策略建议 | 逐竞品循环 |
| **topic-research 主题实操研究（本模板）** | **某件事"具体怎么做"：分步做法/注意事项/运营方法/避坑** | 规划节点按主题与关注维度拆子问题 → 逐问搜索摘要 → 综合为实操指南 |

## 3. 工作流图设计

沿用 industry-research 已被验证的骨架（start → 规划 → 循环{搜索→摘要} → 综合 → 报告 → 人工确认 → 存资产），差异在输入与提示词契约。

```
start
  inputs:
    topic         textarea  必填  研究主题（例：在 TikTok 上开店怎么做）
    focus         select multi 可选关注维度（不选=全维度）：
                  background 总体认识 / steps 详细步骤(分步做法) / cautions 注意事项与常见坑
                  / operations 运营与执行方法 / tools 工具与资源 / faq 常见问题与避坑
    depth         select  quick/standard/deep，默认 standard（决定每维子问题条数：约 1/2/4）
    model         model(types text|multimodal) 必填
  │
  ▼
plan1(llm-chat jsonMode)
  输入：topic/focus/depth/示例主题占位提示
  输出 parsed：{ subQuestions: string[] }
  契约：每个子问题自含主题上下文、扁平可检索、互不重叠；按关注维度组织并带
        【维度前缀】（如【详细步骤】【注意事项】），供下游归组；条数随 depth 缩放；
        必须包含步骤/注意/运营类问题（当用户勾选或该主题确有此类内容时）
  │
  ▼
loop1(loop: listExpression={{plan1.parsed.subQuestions}} emptyPolicy=skip) ──► loop-body
  ├─ search1(web-search: query={{loop1.item}} maxResults=5)
  ├─ summ1(llm-chat jsonMode)
  │     输入：topic + 子问题 + 搜索结果
  │     输出 parsed：{ summary: 要点摘要, keyPoints: 要点列表(md), sources: 来源列表(md) }
  │     契约：只基于当轮搜索结果；来源从结果中选，禁止编造 URL；冲突/缺信息写入 summary 备注
  └─ loop-back
  │
  loop-done ▼
compose1(llm-chat jsonMode)
  输入：topic/focus/depth + loop1.results（全部子问题摘要）
  输出 parsed：{
    title, overview,
    body: 正文(Markdown，按【维度前缀】归组章节；做法类章节用编号步骤/清单，
          运营方法给可执行建议；标注不确定/时效/地区适用),
    sourcesMd: 参考来源(Markdown 列表，来自各轮 sources 去重),
    disclaimer: 时效与官方核验提示
  }
  │
  ▼
report1(report: title={{start.topic}}实操研究，template 拼 parsed 各字符串字段 → markdown)
  │
  ▼
review1(human-review: payload={{report1.markdown}}，可编辑 output_result=指南全文)
  ├─ approve ─► save1(save-asset: kind=text category=text subCategory=实操指南
  │                name={{start.topic}}实操研究 tags=实操研究,{{start.topic}} content={{report1.markdown}})
  │                ─► end
  └─ reject ────► end（不落资产，用户可改后重跑）
```

边类型与 industry-research 一致：normal / loop-body / loop-back / loop-done / approve / reject。
节点集合（10）：start、plan1、loop1、search1、summ1、compose1、report1、review1、save1、end；
边 11 条（e1~e11，含 review1 的 approve/reject 双出口）。

实现提示：综合阶段为了规避"报告模板对 JSON 数组/对象插值语义的依赖"，把 compose 输出收敛为
**纯字符串字段**（body/sourcesMd/disclaimer 都是 Markdown 字符串），report 模板只做简单拼装——
该做法与现有 report 节点渲染能力对齐（industry-research 对数组的插值用法不作本模板依赖）。

## 4. 内容契约与防幻觉纪律（写进节点提示词，双重校验）

1. **可执行性**：做法类章节给"分步编号 + 每步做什么/需要什么/注意什么"；运营方法给条件化建议（何时适用、预期、替代）。
2. **可归因**：摘要只谈当轮搜索结果内容；参考来源只来自搜索结果，标题+URL 原样保留；**绝不补造 URL**。
3. **诚实边界**：搜索结果互相冲突 → 并列说明并标注；搜索没覆盖到 → 明说"未查到/待核"而不是脑补；low 置信内容用"可能/需核实"措辞。
4. **时效与地区**：成稿含 disclaimer（默认文案模板内）：平台规则/政策/流程可能随时变化且因卖家所在国与目标市场而异，
   关键决策（注册资质/类目/费率/税务/物流/支付）以官方最新文档与客服为准。
5. **内容不过滤过头**：涉及风险/成本/违规红线（如平台封店、税务、资质）如实提示，不写"零风险"类表述。
6. **人工闸**：只在 report 后一处 human-review（审结论不审过程），approve 才落资产——与既有"先审后落"习惯一致。

## 5. 与既有能力的衔接

- 「应用/工作流」列表与编辑器：注册后随迁移幂等出现（app source_kind=workflow、enabled、会话渠道开）。
- agent 会话触发：`discover_capabilities` 自动带上该模板与 start 输入 schema；`run_workflow`(definitionId + inputs)
  运行；到 review1 转 `waiting_review`，agent 引导用户在运行详情页确认。
- dl（领域共学）task 会话已透出 run_workflow/get_workflow_run：本模板落地后可复验该触发链路（对应 dl 收口遗留③），
  属顺带收益，本任务不另做 dl 专属适配。

## 6. 改动面清单

### 内容资产（1 文件 + 注册 1 处）
1. 新建 `src/core/database/migrations/builtin-apps/topic-research.json`（§3 图落地，全中文 UI 文案）。
2. `src/core/database/migrations/create-builtin-apps.ts`：顶部 import + `BUILTIN_APPS` 新增 1 条
   （appId=`builtin_app_topic_research`，icon 待定（🧭），name=主题实操研究，category=调研，tags）。

### 测试（TDD，先写红）
3. `tests/unit/core/platform/workflow/builtin-app-templates.spec.ts`：全量校验（validateGraph/节点目录/start 输入类型）随目录自动覆盖新模板。**改造前该 spec 已是红**（断言 19 份、实际 23 份；select-dynamic 白名单缺 `assets:*` 前缀，运行时 RunInputForm 实为前缀通配）→ 先对齐基线 23 并修白名单（绿），再加模板后数量断言 →24。
4. 新增 `tests/unit/core/platform/workflow/topic-research-graph.spec.ts`：对新模板做针对性图断言
   （参照 gossip-event-report/long-form-writing 等既有模板专项 spec 的写法）：
   start 输入键（topic 必填/focus 选项/depth 默认 standard/model 必填）、节点/边集合与数量（10 节点 11 边）、
   loop 接线（listExpression={{plan1.parsed.subQuestions}}、loop-body/back/done 边）、
   summ1 输入注入（{{loop1.item}}/{{search1.results}}）、compose1 在 loop-done 之后、
   report1→review1→(approve)save1/(reject)end、防幻觉相关提示词关键句存在性抽样断言
   （来源只从搜索结果/禁止编造 URL/以官方最新为准/需核实）。
5. `tests/unit/migrations/create-builtin-apps.spec.ts`：基线同样陈旧（断言 21 行、实际 23 行）→ 先对齐 23
   （绿），加模板后定义/应用行数断言 →24（幂等重跑不重复由既有用例覆盖）。

## 7. 真机验收清单（应用内手动，供用户执行/复核）

1. 重启应用（内置模板迁移幂等重跑）→ 「应用/工作流」列表可见「主题实操研究」。
2. 打开模板：start 输入齐全；运行"在 TikTok 上开店怎么做"（standard 深度、关注维度全选）→ 观察
   逐问搜索与摘要推进 → 进入 waiting_review。
3. 审核页：指南含总体认识/详细步骤/注意事项/运营方法/常见问题/工具资源/参考来源；来源真实来自搜索结果；
   disclaimer 提示官方核验 → approve → 资产库出现该指南文本。
4. reject 路径：再跑一次并驳回 → 不产生资产。
5. 对话触发复验：任务型会话（dl task）中让 agent 经 discover_capabilities 发现模板并用 run_workflow
   带 topic 运行 → waiting_review 引导语正常 → 审核后 get_workflow_run 可查终态。
6. 换主题复用验证：用「跨境电商怎么做」再跑一遍，确认章节随主题自适应、无硬编码行业内容泄漏。

## 8. 风险与边界

- 实操类主题时效性强（平台政策/费率/流程频繁变动）→ 靠 §4 纪律 4 + 人工闸；模板与提示词均明示"以官方最新为准"。
- 搜索质量决定上限：搜索不到权威页面时内容深度受限 → 摘要节点如实标注"未查到"，可引导用户补充 URL 后重跑（本模板暂不做 URL 输入，列为后续可选增强）。
- LLM 编造来源/内容 → 提示词双保险 + 人工抽查闸；仍不能根治时靠审核剔除（与既有研究模板同边界）。
- 综合成稿长度可能超过单次生成上限 → 提示词要求按深度控制篇幅；deep 档超长风险提示用户分批或选 standard。
- jsonMode 解析失败 → 引擎既有重试语义兜底；坏 JSON 两次失败会记 failed（模板内不另做 code 校验节点，保持与 industry-research 同级复杂度）。
- 内置定义随包同步（template_version=1）覆盖非接管定义 → 修改 JSON 需重启生效；用户接管后不再被重置（既有语义）。

## 9. 状态

- **已实现（2026-09-09）**：topic-research.json + create-builtin-apps.ts 注册 + 测试；改动面严格限于内容资产与测试维护
  （引擎/节点/技能/前端零改动，见 §2 裁决）。
- 定向 spec 全绿：topic-research-graph（11 例）+ builtin-app-templates + create-builtin-apps 共 29 passed。
- **待用户**：① 评审 design.md 与本模板 JSON；② 应用内真机验收（§7 清单，含 TikTok 开店示例与 dl run_workflow 触发复验）。
- 本地提交，push 待用户明确指令（遵守仓库纪律）。
