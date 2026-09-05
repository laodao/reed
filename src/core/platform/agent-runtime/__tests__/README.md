# Agent 运行时单测计划

每个模块的验收契约（与调研文档 H 节 spike 对应，spike 脚本 /tmp/agent-spike/ 可作用例底稿）：

| 模块 | 必测契约 |
|---|---|
| provider/provider-adapter | fallback 链与 ai-call 一致；apiKey 解密后传入 createOpenAICompatible；SSRF 拒绝内网 URL |
| runtime/session-factory | Session 组装后 send/run/中断均可用；definition.tools 全部注册 |
| runtime/approval | requiresApproval 工具挂起→决定到达→执行/拒绝；超时视为拒绝；会话取消清理挂起卡 |
| runtime/event-bridge | Session 事件 → AgentEvent 映射完备（含 tool.error、compaction.*） |
| runtime/agent-service | 同 scope 互斥（旧 busyProjects 语义）；cancel 后资源清理 |
| context/context-manager | 四层装配顺序；token 超限折叠；中断哨兵注入 |
| memory/session-store | save/load/delete 往返；user_id 隔离（跨用户 load 返回 undefined） |
| memory/memory-service | 状态机全路径（proposed→active→superseded/conflicted）；canonicalKey 唯一性；幂等键 |
| tools/registry | zod 校验失败结构化返回；结果超长截断；异常不终止对话 |

测试环境：vitest + MockLanguageModelV3（`ai/test`），SKIP_PG_TESTS=1 走 SQLite 矩阵。
