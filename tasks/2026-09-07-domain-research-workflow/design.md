# 「领域知识自动研究」工作流设计（Domain Research Workflow）

日期：2026-09-07
分支：feat/workflow-engine
文档目录：tasks/2026-09-07-domain-research-workflow/
参考：karpathy/autoresearch（https://github.com/karpathy/autoresearch，已通读 README/program.md/train.py/prepare.py，笔记在 progress/_autoresearch_*）
前置（均为已落地能力，非假设）：
- 工作流引擎与节点体系（start/loop/human-review/code/skill-call/kb-ingest/kb-retrieve/web-search/web-extract/crawl-links/crawl-news/http-request）
- skill 体系（skill.service：内置只读 + 用户技能 <dataPath>/skills/<id>/SKILL.md，可复制为自定义；skill-call 节点支持 {{工作流变量}} 动态选技能）
- 知识库服务（kb-ingest 支持 sourceKey 幂等 upsert、waitForCompletion 轮询；kb-retrieve 向量+BM25）
- 采集链：crawl-news（预置主题/新闻来源库 sourceIds 多选/自定义 URL）、crawl-links（专栏页→链接两级采集）、web-extract（HTML→标题+正文，onError=skip）、web-search（多引擎含免 Key quick）
- 文件解析 extract-text（txt/md/pdf/epub/docx/xlsx/xls）；礼貌抓取 http-politeness + validateOutboundUrl

---

## 0. 背景与问题

用户定位：**面向个人的工作助手**（明确不做企业级 BPM）。待办方向：**自动研究某领域专业知识**——

1. 输入来源：既有知识库、文档资料、网络资料（预设若干专业网站，爬取内容保存）；
2. 方法：设计"领域研究专用 skill"，工作流调用 skill 执行知识提取；
3. 沉淀：保存到知识库 / 图谱数据库 / 记忆（用户原话："具体形式根据具体情况由模型来确定"）。

参考 [karpathy/autoresearch](https://github.com/karpathy/autoresearch) 得到的核心启示：

- 自主研究闭环成立的**前提是每轮迭代都产出一个可自动判定的信号**（它用 val_bpb）；没有客观标尺的任务，裸循环会自嗨、产出不可验证。
- `program.md` 是"人类维护的策略层"（README 原话：*a super lightweight skill*）——与本系统的 skill 机制同构，验证了"领域方法论沉淀为技能包"的方向。
- 确定性边界越硬，自主越可靠：哪里能改、什么指标、怎么记账全是代码写死，只有"想什么主意"留给模型。

### 关键裁决（与用户已讨论确定）

1. **否决"由模型决定保存位置"**：模型只负责产出"结构化知识条目"（schema 由 skill 严格规定），**落哪个库由确定性路由决定**。"在哪里"永远是代码定的，"是什么"才是模型定的——否则数据散落、检索无法统一。
2. **图谱数据库与长期记忆当前在本系统中均不存在**（图谱仅有长文写作专用 lw_* 表，非通用图谱；`core/agent/memory/memory-service.ts` 是 `M1: 待实现` 占位）。因此 **M1 只落知识库**；图谱/记忆列为 M3 演进候选，不阻塞主线。
3. **提取质量没有天然客观指标** → 用"**硬信号自动判定 + 人工抽查闸**"替代 autoresearch 的 val_bpb（见 §6）。

## 1. 方向与结论

采用**「单轮定向研究」工作流 + 领域研究 skill 资产化**：给定研究主题与来源（预置站点清单/URL 清单），工作流逐篇抓正文 → 调领域研究技能提取结构化条目 → 硬校验 → 幂等落知识库 → 汇总人工审核。

- 工作流本体收敛为**通用研究流水线**：换领域 = 换一个领域研究 skill + 换来源清单，不改代码不改图。
- 一期为**单轮研究**（手动触发为主）；周期增量研究（cron + 只处理新 URL）列为 M2。

可行性依据（全部为已核实能力，无新增平台依赖设想）：

| 环节 | 现成能力 | 结论 |
|---|---|---|
| 预置专业网站 | news_sources 库（用户可增删自有源，topic 用 free 前缀自定义）+ crawl-links 两级采集 + 自定义 URL | ✅ 直接可用 |
| 正文获取 | web-extract（onError=skip 单条失败不阻断） | ✅ |
| 补充检索 | web-search（多引擎） | ✅ 可选接入 |
| 领域提取 | skill-call（动态选技能；技能库可维护） | ✅ 机制在，需输出结构化增强（§4.3） |
| 落库 | kb-ingest（sourceKey 幂等，重复运行覆盖不堆积） | ✅ 语义契合"研究积累" |
| 已有积累反查 | kb-retrieve / kb-qa | ✅ 后续轮次可与既有知识对比 |
| 人工把关 | human-review 挂起/恢复 + 通知 + 审批页 | ✅ |

## 2. 目标与验收

| # | 能力 | 验收口径 |
|---|------|---------|
| G1 | 一条"主题+URL/来源清单 → 研究 → 条目落知识库"流水线 | 内置工作流从 start 跑到终态；每篇产出结构化条目文档入库 |
| G2 | 领域研究 skill 资产化，且输出可被确定性消费 | skill 输出为单个 JSON 对象（含每条结论的原文证据）；下游按字段引用，非自由文本 |
| G3 | 落库幂等不堆积 | 同一 URL 二次研究 → 覆盖更新而非新增堆积（kb-ingest sourceKey） |
| G4 | 提取质量有硬信号闸 | 无证据/结构不符的条目在入库前被拦截（自动重提或丢弃并记录）；人工抽查汇总仍可审 |
| G5 | 换领域成本 = 换 skill + 换来源 | 以 1 个示例领域真机跑通；技能"复制为自定义"即可换领域本体（M1 内置通用骨架） |
| G6 | 不破坏既有体系 | 引擎零改动（若 skill-call 加 jsonMode：缺省关闭、既有技能行为不变）；spec 全绿 |

## 3. 概念模型

### 3.1 知识条目（领域研究的产物契约）

skill 输出的 JSON 对象统一形状（**领域本体差异只体现在 entities/concepts 的 type 取值**，结构不变，保证下游确定性消费）：

```jsonc
{
  "source": { "url": "…", "title": "…", "site": "…" },
  "summary": "本文核心观点一句话",
  "entities": [ { "type": "…", "name": "…", "desc": "…", "evidence": "从原文摘录的一句话" } ],
  "concepts": [ { "term": "…", "definition": "…", "evidence": "…" } ],
  "findings": [
    { "statement": "…", "support": "正面/反面/中性", "evidence": "原文摘录（必填，可归因）",
      "confidence": "high/medium/low", "note": "不确定处说明" }
  ],
  "newQuestions": [ "研究中新产生、值得继续查的问题" ]
}
```

硬纪律（写进技能正文 + 输出契约，§4.2）：**每条 entities/concepts/findings 必须带 `evidence`（material 原文摘录）**，否则视为不可归因；`confidence=low` 或 `note` 允许，但绝不能无证据硬下结论。

### 3.2 确定性落库路由（M1）

- **全部条目 → 目标知识库的单篇文档**（按 URL 一篇一文档）；文档正文 = 原文信息 + 结构化条目（JSON 规整为可读 markdown + 保留机器字段）。
- 路由规则：**不做多目标分库**。图谱/记忆 M1 不参与；M3 演进时再把 entities 关系抽取独立成图存储，路由点仍在代码（按条目类型分表/分库），不由模型决定。
- 幂等键：`sourceKey = research:{domain}:{url}`（kb-ingest 已支持 sourceKey 幂等 upsert）。

### 3.3 领域研究 skill = 方法论 + 领域本体 + 输出契约 的资产包

同 video-writer 系列一致：SKILL.md（frontmatter：name/description/when_to_use/category/inputs schema/system_prompt/output_desc + markdown 正文 + {{param.*}}）。正文含：研究定位（这个领域研究什么、不研究什么）、拆解维度（子主题清单模板）、领域本体提示（entities/concepts 的 type 字典与示例）、可归因纪律、输出契约示例。

## 4. 工作流设计（M1 单轮定向研究）

### 4.1 图（流水线视角）

```
start
  inputs: topic(研究主题) / urls(目标 URL 清单，textarea 每行一个，支持栏目页)
          / kb(目标知识库 select-dynamic) / model(模型) / questions(待答问题,可空)
          / skillId(领域研究技能, select-dynamic source=skills, 默认内置骨架) / maxArticles(上限, 默认10)
  │
  ▼
collect(code: urls 拆行清洗 + 上限截断 + 幂等自检占位)   // 内容资产：纯 JS 沙箱可做
  │
  ▼
expand(crawl-links: 栏目页→文章链接; 输入已是文章页则直通) ──► union(code: 合并去重、取前 maxArticles)
  │
  ▼  loop per article (errorPolicy=skip：单篇失败/空正文跳过不阻断)
  ├─ fetch(web-extract url={{item.url}} onError=skip)
  ├─ 空正文过滤(code: text 长度<阈值 → {skip:true})
  ├─ extract(skill-call: skillId={{start.skillId}}
  │       inputs: material=正文 title={{item.title}} url={{item.url}} topic={{start.topic}} questions={{start.questions}})
  ├─ parse(code: jsonMode 已保证合法 JSON；此处做 schema 轻校验：
  │        必填字段存在 + 每条 evidence 非空 → {ok:true,entry} / {ok:false,errors:[…]})
  ├─ ok? condition ─┬─ yes ─► ingest(kb-ingest: kb={{start.kb}}
  │                 │          title={{item.title}} content=规整化条目
  │                 │          sourceKey=research:{topic}:{url} waitForCompletion=true passthrough={url})
  │                 └─ no ─► 记入 failed 汇总(loop 输出聚合，经 loop 输出复用)
  │
  ▼
aggregate(code: 汇总本轮 processed/ok/failed/各篇条目数 → {report md 草稿})
  │
  ▼
review(human-review: payload.md=研究报告(主题/来源数/成功数/失败清单/条目摘要/新问题清单),
        editableFields=[{output_result 报告全文}])
  │
  ├─ approve ──► save(save-asset: 研究报告文本资产) ──► end
  └─ reject ────► end（本次研究结果已入库的条目保留；报告不落资产，用户可改后重跑）
```

### 4.2 关键设计点

1. **逐篇 skill-call 提取**（循环体内）：领域方法论在技能里，正文全文进 material——单篇长文注意 maxTokens/截断（M1 用 web-extract maxLength 限制正文上限，超长走"取前 N 字符 + 提示技能只提取可见部分"）。
2. **空正文/抓取失败不阻断**：web-extract onError=skip + loop errorPolicy=skip + 正文长度过滤——个人助手跑批量采集时单链接不可达是常态。
3. **入库前硬校验在 code 沙箱完成**（parse 节点）：jsonMode 只保证"合法 JSON 对象"，字段级检查（findings[].evidence 非空等）是 skill 契约相关逻辑，放 code 节点内联做轻校验；不合格 → 记录进失败清单，不落库（**宁可漏一条，不落一条无证据**）。复杂 schema 校验留 M2（技能声明式 schema + 平台校验）。
4. **幂等**：sourceKey 带 topic+url → 同 URL 重复研究 = 覆盖更新；人工改后重跑不产生垃圾堆积。
5. **人在环上**：只有"研究汇总"一处挂 human-review（审策略/审结论，不审每条过程），且给 reject 出口——与"先审后落资产"既有习惯一致。

### 4.3 结构化输出的机制取舍（M1 需一处小改动）

现状事实（已核实）：`skill-call` 输出只有 `content`（模型回复全文文本），**无 jsonMode**；`llm-chat` 有 jsonMode（去围栏→JSON.parse→`parsed` 输出）。研究提取必须结构化 → 两条路：

- **方案 A（选定）**：给 `skill-call` 增加可选 `jsonMode` 配置（缺省关闭）。开启时：解析 content 中的 ```json 围栏 → JSON.parse → 成功则输出追加 `parsed` 字段（content 原样保留）；失败返回 failed（引擎自动重试）。复用 llm jsonMode 的既有提取实现思路。**既有技能零影响**（不开即行为不变）；领域研究技能 output_desc 要求"只输出单个 JSON 对象"。
- 方案 B：研究技能输出文本，工作流用 code 节点解析——code 沙箱内手写解析器不可单测、且每个研究工作流重复粘贴，违背"不复制粘贴/可复用"纪律，否决。

改动面（A）：skill-call handler + NODE_TYPE_CATALOG outputSchema（+`parsed` json 字段，键级一致性测试同步）+ skill-call 配置表单加 jsonMode 开关 + 单测（含围栏/无围栏/坏 JSON 三例）。**引擎零改动**。

## 5. 内容资产：内置技能与示例应用

M1 内容资产增量：

1. 内置技能 `domain-research`（领域研究·通用骨架，source=builtin 只读可复制为自定义）：
   - 角色：严谨的领域研究员（学术综述式：区分事实/观点/推论，标注置信度与不确定处）；
   - 正文：研究定位 → 拆解维度模板 → entities/concepts 常见 type 字典（人物/机构/事件/方法/数据/产品…）→ **可归因纪律**（每条必带原文证据；禁止无据结论；不编造引用）→ 输出契约示例（单个 JSON 对象，形状见 §3.1）；
   - inputs：material/title/url/topic/questions；
   - 用户复制为自定义后即可填入自己的领域本体（如"量子计算"：type=量子比特/门/纠错方案…），构成"领域研究专用 skill"。
2. 示例工作流 JSON（builtin-app `domain-research`）：§4.1 图落地（复用 start/loop/human-review/kb-ingest/skill-call/web-extract/crawl-links/code/save-asset/condition），含内置 1 组示例来源（placeholder 级别 topic 演示）。
3. 目标知识库：start 选已有库；无库时提示先在知识库页创建（不自动建库，尊重用户数据组织）。

## 6. 质量判定设计（替代 autoresearch 的 val_bpb）

autoresearch 靠 val_bpb 自动 keep/discard；领域知识提取没有天然标尺，故分两层：

| 层 | 信号 | 自动/人工 | 实现 |
|---|---|---|---|
| 硬信号（结构） | jsonMode 解析成功；必填字段齐全 | 自动（fail→引擎重试，二次失败进 failed 清单） | skill-call jsonMode + code 轻校验 |
| 硬信号（可归因） | 每条 findings/entities/concepts 带非空 evidence | 自动（缺失→整篇不入库，记 failed 清单） | code 校验 + 技能正文纪律双保险 |
| 软信号（内容） | 条目是否准确/是否值得保留/是否有立场偏差 | **人工抽查**（审汇总不审过程） | human-review 汇总闸 |
| 跨轮次信号（M2） | 与既有 KB 是否重复/冲突/被新证据推翻 | 自动辅助 + 人工确认 | kb-retrieve 召回比对（M2） |

原则：**宁可漏一条，不落一条无证据**；软质量永远留人工抽查点，不做"全自动采信"。

## 7. 改动面清单

### 代码
1. `src/core/platform/workflow/nodes/skill-nodes.ts`：skill-call 增加可选 `jsonMode`（缺省 false；开启时围栏剥离 + JSON.parse；输出加 `parsed`）。
2. `src/shared/types/workflow-node-catalog.ts`：skill-call outputSchema +`parsed`（json）字段（与一致性测试同步）；`workflow-node-forms.ts`：skill-call 表单 + jsonMode 开关。
3. 引擎/其余节点零改动。

### 内容资产（JSON/md，boot 同步覆盖）
4. `builtin-skills.ts`：+`domain-research` 技能（§5.1）。
5. `src/core/database/migrations/builtin-apps/domain-research.json`：示例工作流（§5.2）。

### 测试（TDD，先写红）
6. skill-call jsonMode 单测：围栏 JSON / 无围栏裸 JSON / 坏 JSON（failed+retryable）三例；缺省不开时行为不变。
7. node-registry-consistency.spec：skill-call outputSchema 键同步（parsed）。
8. skill.service 相关 spec：内置技能计数断言同步（若断言了精确清单）。
9. 新图 spec `domain-research-graph.spec.ts`：节点/边数、skillId={{start.skillId}} 接线、extract 的 inputs 注入、ingest sourceKey 模板、review 在 loop 之后、reject→end。
10. 真机验收：示例领域跑通 → 入库文档含结构化条目 → 同 URL 重跑验证覆盖不堆积 → 汇总审核页可批改/驳回。

## 8. 阶段拆分

- **M1（本轮）**：skill-call jsonMode（方案 A）+ 内置 domain-research 骨架技能 + 示例工作流 JSON + spec 全绿；真机用 1 个真实领域（如用户常读的技术专栏）跑单轮：给定 5~10 个 URL → 提取 → 校验 → 落库 → 审核，验收 G1~G6。
- **M2（后续）**：来源库管理接入（news_sources free 主题承载"专业站点清单"，管理页已有）+ web-search 补候选 + cron 周期增量研究（幂等自检只处理新 URL，用 kb 已有 sourceKey 反查或本地登记表）+ 技能声明式 schema 与平台级校验 + 与既有知识对比（冲突/更新提示）。
- **M3（可选，需独立立项）**：通用实体-关系图谱存储评估（lw_* 不通用，需新表/新服务）；长期记忆（memory-service 落地后）是否承接"研究结论的跨会话引用"；届时路由仍由代码按条目类型决定。

## 9. 风险与边界

- 无客观质量指标 → 已用"硬信号 + 人工抽查"覆盖；但软错误（看似有证据实则曲解）仍需人工抽查兜底——**研究自动化上限 = 抽查闸的认真程度**，与 autoresearch 的"全自动 keep/discard"边界不同，要在技能与 UI 上明示"AI 研究，人工复核"。
- LLM 幻觉/证据编造 → evidence 强制从 material 摘录 + 入库前校验；仍未根治时靠审核闸人工剔除。
- 批量采集合规与礼貌 → 沿用 http-politeness/validateOutboundUrl；URL 清单人工给定，不做全网爬取。
- skill-call jsonMode 只保证"合法 JSON"不保证"符合领域 schema" → M1 由 code 轻校验兜底，M2 上声明式 schema。
- 长文超 maxTokens → web-extract maxLength 截断 + 技能契约"仅基于可见文本，不脑补缺失部分"。
- 内置定义 boot 从 JSON 同步覆盖 → 改 JSON 需重启生效；内置技能只读，用户换领域用"复制为自定义"（既有 skill 语义）。
