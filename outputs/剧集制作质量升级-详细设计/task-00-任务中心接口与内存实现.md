# 任务 T00 · GenTaskRegistry 接口契约冻结 + 内存实现

> Wave：W2（最先合并）｜估时：1 人日｜依赖：无
> 被依赖：T07（精修埋点）、T08（导演台埋点）、T11（持久化实现替换内存实现）
> 必读：`00-共享约定与工程规范.md`

## 执行须知（subagent）

- **范围白名单**：仅下文"代码改动清单"所列文件。
- **契约冻结**：本文 §2 的接口签名一经合入即为冻结契约，T07/T08 将直接编码依赖；如实现中发现契约缺陷，**停止并上报协调者**，不得自行变更签名。
- **DoD**：白名单完成 + 单测绿 + typecheck/lint 过 + 两个 EP E2E 不回归。
- **报告**：按通用格式（README §6.4）。

## 1. 背景与目标

复查结论（见评估文档附录 B4）：本项目缺的是**平台层生成任务登记协议**，不是又一个任务视图。本任务只交付协议与内存实现；持久化（`gen_tasks` 表）与全局 UI 属 T11。T07/T08 在本任务合入后即可按契约埋点，T11 上线时**接口不变、实现替换**，这是"任务中心后置但不返工"的保证。

明确边界：**不扩展** `agent_tasks` 表（agent 执行计划树，语义不匹配）；**不使用** `task-queue.service.ts`（全库无消费者，仅参考接口形状）。

## 2. 接口契约（冻结）

`src/core/platform/services/gen-task-registry.service.ts`：

```ts
export type GenTaskType = 'ep.keyframe' | 'ep.video' | 'ep.tts' | 'ep.compose' | string
export type GenTaskStatus = 'running' | 'succeeded' | 'failed' | 'canceled'

export interface GenTaskRecord {
  id: string
  userId: string | null
  taskType: GenTaskType
  entityType: string            // 'storyboard' | 'episode' | 'project' | ...
  entityId: string
  projectId?: string
  episodeId?: string
  status: GenTaskStatus
  progress?: number             // 0-1
  message?: string              // 可读的当前步骤/结果
  error?: string                // 失败时的可读错误
  payloadJson?: string          // 重试所需参数快照（JSON 字符串）
  resultRef?: string            // 产物定位（imageId / videoPath / 导出目录）
  createdAt: Date
  updatedAt: Date
}

export interface GenTaskRegistry {
  create(input: Omit<GenTaskRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { id?: string }): GenTaskRecord
  update(id: string, patch: Partial<Pick<GenTaskRecord, 'progress' | 'message'>>): void
  succeed(id: string, resultRef?: string): void
  fail(id: string, error: string): void
  cancel(id: string): { ok: boolean; reason?: 'unsupported' }   // 尽力取消，按 taskType 分派
  list(query: { userId?: string | null; status?: GenTaskStatus; entityType?: string }): GenTaskRecord[]
  retry(id: string): { ok: boolean; reason?: 'not_failed' | 'no_payload' }
  clearCompleted(userId?: string | null): number
  // 事件：每次状态变化 emit('gen-task-updated', record)，T11 据此接 IPC 推送
  on(event: 'gen-task-updated', listener: (record: GenTaskRecord) => void): void
}
```

**状态机**：`create → running → succeeded | failed | canceled`；`retry` 仅对 failed 合法，生成新 record（新 id）并保留 `payloadJson`。

## 3. 功能设计

- `InMemoryGenTaskRegistry` 实现上述接口：`Map<string, GenTaskRecord>` 存储，`userId` 隔离查询；单例（与平台其他 service 同样的注入方式，参照 `platform/services/` 现有服务的注册模式）。
- `cancel` 的分派器：`taskType → CancelHandler` 注册表（`registerCancelHandler(type, fn)`）；本任务不注册任何 handler，T07/T08/T11 按需注册；未注册类型返回 `{ ok: false, reason: 'unsupported' }`。
- 事件：最小 EventEmitter（Node `EventEmitter`），本任务不接 IPC；T11 加 `gen-task:updated` 推送与前端订阅。
- 内存实现的容量上限（如 500 条，FIFO 淘汰 succeeded）防止长期运行内存膨胀——写入 JSDoc 说明 T11 替换后此限制消失。

## 4. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 新增 | `src/core/platform/services/gen-task-registry.service.ts` | 契约类型 + InMemory 实现 + 事件 |
| 新增 | `src/shared/types/gen-task.types.ts` | 前端共享类型（renderer 经 shared 引用） |

## 5. 测试与验收

**单测** `tests/unit/services/gen-task-registry.spec.ts`：
- 状态机合法迁移（create→running→succeed/fail/cancel）与非法迁移拒绝（succeed 后 update 抛错或忽略，按实现断言）。
- retry 仅对 failed 且有 payload 生效，生成新 id。
- cancel 未注册 handler 返回 unsupported。
- list 按 userId 隔离、按 status/entityType 过滤。
- 事件 `gen-task-updated` 在每个终态触发一次。

**验收 AC**：
- AC1 契约类型导出与本文 §2 完全一致（逐字段 diff）
- AC2 InMemory 实现单测全绿
- AC3 不产生任何 DB 迁移、不改任何既有 channel
