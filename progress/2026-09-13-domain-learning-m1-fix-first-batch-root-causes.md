# 领域共学里程碑 1：修掉首批知识点跑偏的两个根因

日期：2026-09-13
起因：用户新建「金融理财」主题后反馈「生成的知识点（理财地基/时间与风险/家底与防线，投资与配置还没有子知识点）与我期望差别比较大」，要求查原因。
取证：
- 空间与图：`progress/_dl_space_dump.cjs`
- 那一轮的上下文与落库参数：`progress/_dl_round_trace.cjs`、`progress/_dl_dump_rows.cjs`、`progress/_dl_call_pairs.cjs`

## 根因（都有实证）

### 根因 1：用户诉求（`dl_project.description`）从未进入 agent 上下文

扒出那一轮 `turn_start` 的 systemPrompt 原文，快照头只有：

```
学习空间：金融理财（目标：工作应用）
掌握度：0/0 个知识概念已理解
目录分组：金融理财·领域根(b93b27d8-…)
【主题前置要求】尚未声明…
【地图完整度】地图完整度 0/100…
【空领域起步研究】学习空间「金融理财」当前还没有任何知识点…
```

用户写的「想听懂股票、债券、期货、做空做多、MBS、美元…能自行阅读财报、股市/债券交易数据、行情」**一个字都没进去**。代码在两处丢的：`computeDlSpaceSnapshot` 拼快照头只取 `name + goal`；`dlEmptySpaceMission()` 只吃 `spaceName`。
模型只拿到「金融理财」四个字，于是做了一份**个人理财规划**（记账→复利→风险→防线→配置）——答案本身自洽，但回答的不是用户问的问题。

### 根因 2：落库额度用尽，知识点被静默拒建

按 toolCallId 配对那一轮全部落库调用：iter5 = 1×主题前置 + 4×分支目录（12 次额度先吃掉 4 次）、iter6 = 2×知识点、iter7 = 9×知识点 → **6 成功 / 3 被拒**，被拒的原因是同一句：

```
{"ok":false,"error":"LIMIT_EXCEEDED","hint":"本工具单次运行上限 12 次已用尽，请改用其他方式完成任务。"}
  ✗ 保险与风险转移        （家底与防线的第 4 个孩子）
  ✗ 资产配置与分散化      （投资与配置的孩子）
  ✗ 指数基金与定期定额投资（投资与配置的孩子）
```

**「投资与配置」没有子知识点，就是这两个知识点写入被额度拒绝。** 额度按 2026-09-10「3-6 个核心知识点」的口径定的（`dl-agent.types.ts` `dl_save_concept: 12`），而 09-12 引入**分支目录**后目录与知识点共用同一份额度，一次起步研究实际要 10-20 个节点。
更糟的是：模型收到 `ok:false` 后**没有在总结里提这 3 个**，S5 只写"落了 8 个知识点"，用户完全看不到缺口。

（次要因素：空间档案 `practice`（实践技能/侧重流程）+ 目标「工作应用」会把模型往"操作流程"框架上推；本轮采集也很浪费——40 次读工具调用只真正读到 2 份资料。这些不改代码，记录备查。）

## 本次改动（里程碑 1）

| 文件 | 改动 |
| --- | --- |
| `dl-agent-deps.ts` | ① `dlEmptySpaceMission` 增加 `description` 入参，把用户诉求原文与"不得凭空间名猜主题 / 骨架必须覆盖诉求点名的对象与场景"的规划纪律写进指令；② 快照头新增【学习主题诉求（用户原话，规划与讲义都以它为准）】与【空间档案】（kindLabel/nature/emphasis），新增 `spaceDescription` 字段；③ 研究提示词新增第 15、16 条：以用户诉求为准（并举「金融理财」反例）、**被额度或门禁拒绝的条目必须写进总结**、额度用尽不要反复重试 |
| `dl-agent.types.ts` | 新增 `DL_PLANNING_SAVE_BUDGET`（concepts 30 / relations 40）与硬上限 `DL_SAVE_BUDGET_MAX`(60)，并写明复盘依据 |
| `dl-agent-bindings.ts` | `buildDlBindings` 新增 `saveBudget` 选项（只覆盖 `dl_save_concept`/`dl_save_relation`，夹到硬上限）；新增纯函数 `isPlanningSaveRound()`——**起步研究（空空间 research）与补全知识地图（task）都算规划落库轮** |
| `dl-agent-harness.service.ts` | 起步指令带上诉求原文；规划落库轮注入 `DL_PLANNING_SAVE_BUDGET` |
| `platform/agent-runtime/tools/registry.ts` | 额度用尽的 hint 改成可执行：不得重试、把未完成条目写进总结并告诉用户从哪个入口补（原句"请改用其他方式完成任务"等于没说） |

## 验证

| 项 | 结果 |
| --- | --- |
| 新增/更新用例：`dl-agent-bindings.spec`（13 例：saveBudget 覆盖与夹取、`isPlanningSaveRound` 六种情形）、`dl-agent-deps.spec`（16 例：诉求进快照头且先于前置简报、无诉求不留空行、起步指令带诉求与纪律） | ✅ |
| `tests/unit/core/packs/domain-learning` + `tests/unit/core/platform/agent-runtime` 全部 34 个文件 | ✅ **443 例通过** |
| `npm run typecheck` | 改动文件无报错（`src/agents/skills/registry.ts`、`src/core/packs/registry.ts` 的报错属其他分支既有问题） |

## 还没做（后续里程碑）

- **里程碑 2**：长任务 1-3 行滚动进度显示（把 `tool-start`（含入参）/`step` 翻成人话推给前端；失败与被拒必须显示）。
- **里程碑 3**：把「首次生成首批知识」与「补全知识地图」改造成固定门禁流程：对齐诉求（弹窗确认/指令调整）→ 展示知识体系（可勾选增删与调序 + 指令调整）→ 确认后才允许落库，额度按方案条目数放宽。
- 「金融理财」这个空间本身还没重建：结构仍是旧的（4 分支 + 8 知识点，投资与配置空）。等里程碑 3 落地后按新流程重做更合适；也可以先用修好的「补全知识地图」把缺的知识点补上。
