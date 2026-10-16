# 41 · 工具线上名兼容：pack 冒号名 × OpenAI 兼容 API

> 外部报告（平台缺口，已绕行）：pack 工具名强制 `pack:<id>:<name>`，冒号被 OpenAI
> 兼容 API 拒绝——EP/LW 的包工具同样会踩；dl 包以裸名注册规避。
> 修法：**线上名映射**（provider 边界别名化，内部规范名不动）。本批落地。

## 1. 问题定性

- OpenAI / Anthropic 工具名共同规范：`^[a-zA-Z0-9_-]{1,64}$`，冒号非法——含冒号名的
  `tools` 参数整单 400。
- 冒号是注册表的命名空间分隔符（14 号 §3），承载：白名单 binding 引用、审计行、
  轨迹 `tool_call`/`tool_result` 配对、`discover_capabilities` 目录——**不可原地改字符**，
  改了就是数据/契约迁移。
- 冒号名到达 provider 的唯一出口：`LoopRunner.buildToolSet` 的 `ai.tool({ key })`
  （loop.ts:396→413）。registry 直调、工作流 config 驱动、目录文本展示都不经 provider。
- 修复前冒号名请求整单被拒 → 不可能存在含冒号的历史 tool-call；修复后历史写的就是
  线上名 → **无历史迁移需求**。

## 2. 方案：线上名（wire name）双向映射

`agent-runtime/tools/wire-name.ts`：

- `toWireName(canonical)`：`[^a-zA-Z0-9_-] → '_'` 折叠；>64 截断到 57 + `_` + 6 位
  sha1 前缀（确定性）；
- `buildWireNameMap(names)`：一轮工具装配的双向映射（`canonicalToWire`/`wireToCanonical`）；
  折叠碰撞按序加 `_2`/`_3` 后缀消解——同轮内映射稳定。

LoopRunner 接线（runtime/loop.ts）：

- `loop()` 入口构建映射（每轮一次；工具集本轮固定）；
- `buildToolSet`：`out[wireName] = ai.tool({...})`——provider 函数名恒合法；**execute
  闭包仍捕获规范名**，流事件（tool-start/end）与轨迹（tool_call/tool_result）全程规范名；
- 决策回呼还原：`normalizeDecision` 产物 `calls[].toolName` 经 `wireToCanonical` 还原——
  下游（无进展签名、POLLING_EXEMPT、轨迹、产物归档 toolName）零感知。

配套：`spawn_subagent` 的 `tool_names` 过滤兼容线上名（模型只见 provider 函数名）；
子代理 LoopRunner 在自己边界再做一次折叠（分层一致，子代理工具同样可以是包工具）。

## 3. 明确不做 / 后续

- 注册表规范名、binding 存量数据、审计/轨迹历史：**零迁移**（`: ` 分隔符语义保留）；
- dl 包（不在本分支）：可撤销裸名绕行、恢复 `{ packId }` 规范注册——冲突/审计/目录
  语义随之恢复；
- registry `toLLMTools`（协议层描述符）：当前无生产消费者，若后续接入需同样套线上名；
- 系统提示词文本中的工具名（如目录列出）：对模型是普通文本，不受规范约束，保持规范名
  （可读、可复制到 tool_names，两者都兼容）。

## 4. 测试

| spec | 覆盖 |
|---|---|
| wire-name.spec（新 6） | 折叠合法/裸名保留/超长确定性截断+摘要/双射可逆/碰撞消解/确定性 |
| loop.spec（+1） | 冒号名端到端：provider 函数名无冒号、线上名回呼可执行、轨迹与流事件全程规范名 |
| subagent.spec（+1） | tool_names 线上名过滤命中；子代理边界二次折叠（provider 见 `pack_demo_read`） |

全量 17 文件 262 用例通过；typecheck 515 全为存量基线（0 新增）。

## 5. 过程教训

修复引入的 `for (const c of decision.calls)` 忘了 final 分支 `calls` 为 undefined——
全 spec 瞬间 13 失败，靠既有契约测试当场拦住。两点重申：①契约测试对"每步改动后必跑"
的价值在被改坏的瞬间体现；②循环体的类型收窄不能靠自觉——`normalizeDecision` 联合
类型的窄化交给 if 判断，不写裸访问。
