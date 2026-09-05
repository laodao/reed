/**
 * Agent 公共运行时（harness 层）
 * @module core/agent
 *
 * 基于 Vercel AI SDK v6（`ai`）+ @openharness/core 的公共 agent 运行时，
 * 供长文写作 / EP / 故事研讨室等对话式功能复用（调研见 docs/design/2026-09-05-agent-harness-research.md）。
 *
 * ## 模块清单（13 个）
 *
 * | 模块 | 职责 | 来源 |
 * |---|---|---|
 * | types | 共享类型与事件协议 | 自研 |
 * | provider/provider-adapter | getProviderConfig → createOpenAICompatible → LanguageModel | 包装现有 ai-call.ts |
 * | runtime/agent-service | 对外门面：sendMessage/cancel/getHistory（对齐旧 AgentWorkflowService 形态） | 自研（迁移自 longwriting/agent 骨架） |
 * | runtime/session-factory | 组装 open-harness Session：store/compaction/approve/onBeforeSend | 包装 @openharness/core |
 * | runtime/approval | 审批协调：approve 回调 ↔ 前端提案卡（挂起/决定/超时） | 自研（open-harness `ApproveFn` 契约，spike 已验证） |
 * | runtime/event-bridge | Session 事件 → 统一 AgentEvent → 事件通道 | 自研 |
 * | context/context-manager | 四层上下文装配（system/快照/滚动摘要/近 N 轮），实现 onBeforeSend | 自研 |
 * | context/state-snapshot | 业务状态快照接口（业务方注入 buildSnapshot） | 自研接口 |
 * | memory/session-store | open-harness SessionStore 实现（多租户 ALS 隔离） | 自研实现 |
 * | memory/memory-service | 项目级长期记忆：fact/decision/lesson/open_loop + active/proposed/conflicted/superseded 状态机 | 设计借 happyclaw memory-service（MIT） |
 * | memory/migrations | agent_memories 建表 | 自研 |
 * | tools/registry | 工具注册：zod schema + execute + requiresApproval 标记 | 自研 |
 * | index | 公共出口 | — |
 *
 * ## 依赖方向（强约束）
 *
 * - 本目录**禁止 import 业务模块**（longwriting/episode-production/...）；
 *   业务以 `AgentDefinition`（见 types.ts）声明式接入，定义文件放在各自业务目录。
 * - 业务定义文件位置：
 *   - 长文写作：`src/core/services/longwriting/agent/definition.ts`（M1 迁移时创建）
 *   - EP：`src/core/modules/episode-production/agent/definition.ts`（M2）
 *   - 故事研讨室：`src/core/services/longwriting/story-room/`（M4）
 *
 * ## 依赖红线（spike 实测，见调研文档 H 节）
 *
 * - 必须钉 `ai@^6.x`（engines node>=18，兼容 Electron 28）；`ai@7` 需 Node≥22，禁升
 * - 全部为 ESM-only 包：Electron 主进程（CJS 产物）以动态 `import()` 引入；Web 端 tsx 直接可用
 */

export type { AgentDefinition, AgentToolDef, AgentToolContext, AgentSendResult } from './types'
