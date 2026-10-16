# 「研究规格」分层设计（产出要求属于用户，不写死进模板内核）

日期：2026-09-09
分支：当前工作分支
文档目录：tasks/2026-09-09-topic-research-workflow/research-brief-design.md
背景：用户质疑——把「贡献利润/采购倒推公式」「D1–D90 逐日时间线」这类要求写进模板提示词，是否会让其它领域研究产生偏差？这类要求是否应由用户提供？
结论：**认同**。领域特定的产出要求不得写死在通用模板内核；改为分层承载，并让用户要求进入"验收标准"闭环（由独立评估模型逐轮校验），而不是只塞进成稿提示词。

---

## 1. 分层模型（L1–L4）

| 层 | 内容 | 承载位置 | 偏差风险 |
|---|---|---|---|
| L1 通用纪律 | 证据分级（官方一手/后台需复核/二手估算/未查到）、可溯源、禁编造、量级与区间、缺口显式、诚实标注、先验与结论分离 | 模板内核提示词（保持领域无关） | 无 |
| L2 类型化深度模板 | 做法/商业类：费用与单位经济（贡献利润/采购倒推公式）、逐日/分阶段时间线、分步 SOP、清单与模板；概念类：定义/机制/流派/证据/反例；决策类：选项矩阵+评分+适用边界；行业类：规模/竞争/政策/趋势 | `plan1` 的"主题类型骨架"按类型选用——只对命中的类型生效 | 低（按主题类型路由） |
| L3 用户产出要求 | 预置规格多选（量化公式与单位经济 / 分市场对比矩阵 / 逐日时间线 / 风险红线 / 清单模板 / 反方观点 / 可点击来源）+ 自由文本产出要求 | 新增 start 输入 `outputSpecs`（multi select）与 `outputRequirements`（textarea） | 无（用户显式声明） |
| L4 用户参照样本 | "对标这份的结构与密度"（文本或链接） | 新增 start 输入 `referenceSample`（textarea）→ 仅在 writer/plan 中作**结构与密度对标**，明确禁止作为事实来源、禁止照抄结论 | 无 |

## 2. 关键闭环（用户要求 → 验收 → 评估）

`outputSpecs / outputRequirements` 不直接"叮嘱 writer"，而是：
1. `plan1` 必须把二者**逐条转成可验收的 acceptance 条目**（可判定有/无、够/不够）；
2. `e1`（另一模型）评审时**逐条核对 acceptance（含用户规格）**：可检索/可执行而未满足 → 判 revise；属检索通道不可达 → 记为"需后台/官方核验"非阻塞项（避免该停不停）；
3. `writer` 按 acceptance 组织成稿，并对预置规格给出对应结构（公式/时间线/可点击链接/反方回应）。

这样"用户要公式和时间线"会变成**每轮被独立模型检查的硬指标**；而未勾选规格的其它领域主题完全不受影响（L2 也只在该主题类型命中时生效）。

## 3. 改动面

| 位置 | 改动 |
|---|---|
| `src/core/database/migrations/builtin-apps/topic-research.json` | start 新增 `outputSpecs`/`outputRequirements`/`referenceSample`；L2 "做法/商业类"骨架补 单位经济公式与逐日时间线；plan1/e1/writer 三处提示词接入并声明验收闭环；模板 description 同步 |
| `tests/unit/core/platform/workflow/topic-research-graph.spec.ts` | 断言新输入与选项、三处提示词引用；既有节点/边数量不变（12 节点 14 边） |
| 文档/进度 | 本设计文档 + 进度记录 |

**不改**：引擎、节点、技能、其它内置模板（未设这些输入时行为完全不变——L3/L4 缺省为空）。

## 4. 验收

- 图 spec：新输入存在且选项正确；plan1 prompt 含 `{{start.outputSpecs}}/{{start.outputRequirements}}/{{start.referenceSample}}`；plan1 systemPrompt 含"做法/商业类…单位经济…"；e1 prompt 含 outputSpecs/outputRequirements 且 systemPrompt 声明逐条核对；writer prompt 含三项且 systemPrompt 含 D1–D90/采购倒推/`[标题](URL)`/反方回应与"禁止照抄"。
- 回归：`builtin-app-templates` 全量校验绿（settings 与输入类型合法）。
- 行为（后续真机可选）：勾选"量化公式+逐日时间线+可点击来源"后，成稿应出现公式、D1–D90 时间线与 Markdown 链接来源，且评估器按这些条目判 pass/revise；不勾选时报告不出现这些领域特定结构。

## 5. 状态
- 已按此实现（本轮），随提交进入任务分支；真机验证可选（需重启 App 并消耗 API）。
