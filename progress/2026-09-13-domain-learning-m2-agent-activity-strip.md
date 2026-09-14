# 领域共学里程碑 2：长任务滚动进度显示（1-3 行）

日期：2026-09-13
目标（用户原话）：「生成首批知识，和后面知识点的研究此概念，这些操作时间很长，应该要适当显示系统（agent）当前正在执行的操作或思考过程，让用户感知到系统在工作。至于展示方式，可以只在 1-3 行的空间内容滚动显示 agent 正在做的事即可。」
另：里程碑 1 复盘出的"被额度拒掉的知识点无声消失"必须一并解决——**失败与被拒条目要可见**。

## 现状（改造前）

- 底层其实每步都有事件：`AgentStreamEvent` = `step`（步数）/ `tool-start`（工具名 + 完整入参）/ `tool-end`（成败）/ `delta`（正文增量）；
- 但宿主只把它翻成 `stage: 'deciding' | 'acting'` 一个笼统状态，起步研究卡片上只有一句静态的「正在起步研究…」，两三分钟内界面毫无变化；
- 被 `LIMIT_EXCEEDED` 拒掉的落库调用只回给模型一个 `ok:false`，界面上完全不可见。

## 本次改动

| 层 | 文件 | 内容 |
| --- | --- | --- |
| 文案（纯函数） | `shared/utils/domain-learning-activity.ts`（新） | `describeDlActivity({toolName,args,step,ok})` 把一次工具调用翻成一行人话；`pushActivityLine(lines,line,cap=3)` 滚动缓冲（与上一行相同不重复堆叠）。涵盖采集类（`正在联网检索：股票 期货`、`正在读取网页：investor.gov`）、落库类（`正在落库知识点：资产配置与分散化`、`正在建立前置关系：A → B`、`正在编写讲义：张量`）、失败类（`⚠️ 落库知识点「指数基金与定投」未成功——原因见本轮总结`）；未知工具退化为 `正在执行 <tool>`，超长主语截断到 48 字 |
| 翻译（有状态） | `packs/domain-learning/services/dl-agent-activity.ts`（新） | `DlActivityTracker.onStream(event)`：`step` 维护步号、`tool-start` 出 info 行、**`tool-end` 失败时复用 tool-start 的主语**（否则失败行只剩"落库知识点未成功"，用户不知道是哪个条目）、成功的 tool-end 不产出行（避免刷屏）、delta 不产出行 |
| 事件契约 | `dl-agent.types.ts` | `DlAgentEvent` 新增 `type:'progress'` + `activity:{line,kind,conceptId,step,tool}`。通道约定：**一律发空间级通道** `dl:agent:<spaceId>`（不带 conceptId），空间页一条订阅即可覆盖任意概念轮；前端 `DlAgentUiEvent` 同步 |
| 宿主 | `dl-agent-harness.service.ts` | `onStream` 里一行调用 tracker → `emitDlAgentEvent(spaceId, null, {type:'progress',…})`；verify 内部会话照旧静默 |
| 展示 | `views/domain-learning/AgentActivityStrip.vue`（新） | 订阅空间级通道，渲染最近 3 行（旧行淡、最新行亮），失败行高亮并把整条置为警示色；一轮结束（`reply:done`/`error`）保留 4 秒再清空；`modes` 缺省 = `research + task`（起步研究、研究此概念、补全知识地图都在内；答疑走对话面板） |
| 接入点 | `DomainLearningSpace.vue`、`DomainAtlas.vue` | 空间页顶部（进度条下方）与知识全景页的起步卡片内各挂一处（同一组件，无重复实现） |

## 验证

| 项 | 结果 |
| --- | --- |
| `tests/unit/shared/domain-learning-activity.spec.ts`（新，9 例）：采集/落库/失败/步号/兜底/截断/滚动缓冲 | ✅ |
| `tests/unit/core/packs/domain-learning/dl-agent-activity.spec.ts`（新，7 例）：步号跟随、失败复用主语、成功不出行、事件丢失退化、toolCallId 清理 | ✅ |
| `tests/unit/renderer/domain-learning/agent-activity-strip.spec.ts`（新，7 例）：只订阅空间级通道、最多 3 行、失败高亮、research+task 收/tutor 不收、`modes` 可定制、`reply:done` 后 4 秒清空、spaceId 变化重订阅、卸载取消订阅 | ✅ |
| `domain-learning` + `renderer/domain-learning` + `shared` 全量 | ✅ **33 文件 / 361 例通过** |
| `npm run typecheck` | 改动文件无报错 |
| 上线核验 | 重启 dev：构建 954 模块（+2 个新模块）；产物内含 `联网检索`/`落库知识点`/`建立前置关系`/`本轮总结` 与 `tool-start` 处理；窗口已起 |

## 真机旁证（本次会话日志）

重启前，运行中的 app（旧包）在**金融理财空间**又跑了一轮，日志里再次出现：

```
[AgentToolRegistry] dl_save_concept 调用被上限拦截（maxCalls=12）   （同一轮出现 3 次）
```

——与里程碑 1 复盘出的根因完全一致（默认 12 次额度装不下"分支目录 + 知识点"）。里程碑 1 的规划额度（30/40）与本次的 `progress` 事件都已经在这个新包里生效。

## 还没做

- **里程碑 3**：把「首次生成首批知识」与「补全知识地图」改造成固定门禁流程——先对齐诉求（弹窗确认/指令调整）→ 再展示知识体系（可勾选增删与调序 + 指令调整）→ 用户确认后才允许落库，落库额度按方案条目数放宽。
- 「金融理财」空间尚未重建（结构仍是旧的 4 分支 + 8 知识点，"投资与配置"空）；等里程碑 3 落地后按新流程重做，或先用修好的「补全知识地图」补缺。
