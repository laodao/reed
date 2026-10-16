# 任务 T11 · 平台级生成任务中心

> Wave：W5（基建专项收尾）｜估时：18–22 人日｜依赖：**T00**（契约已冻结，本任务 = 持久化实现替换内存实现 + 全局 UI）；最好在 T07/T08 埋点合入后执行（四类 EP 任务接入验收）
> 必读：`00-共享约定与工程规范.md`、`task-00-任务中心接口与内存实现.md`（契约全文，不得变更）
> 设计依据：评估文档附录 B4（既有系统复查：agent_tasks 语义不匹配 / 通知中心可复用 / task-queue 无消费者）

## 执行须知（subagent）

- **范围白名单**：仅下文 §5 所列文件；EP 四类生成入口的接线若 T07/T08 已按契约埋点，则**只切换实现不改调用方**。
- **契约红线**：`GenTaskRegistry` 接口签名与 T00 冻结版逐字段一致；新发现的契约缺陷上报协调者，不得自行改。
- **DoD / 报告**：见 README §6。

## 1. 背景与目标

全应用统一的生成任务登记/进度/终态/跳转/重试。T00 已交付契约与内存实现并被 T07/T08 埋点；本任务交付：持久化（`gen_tasks` 表）、IPC 事件推送、取消/重试语义、全局任务抽屉 UI、终态接通知中心。

## 2. 功能设计

### 2.1 持久化

- 新表 `gen_tasks`（迁移 `add-gen-tasks`，平台级、**非 ep_ 前缀**；索引：user_id+status、entity_type+entity_id）：
  `id PK / user_id / task_type / entity_type / entity_id / project_id? / episode_id? / status / progress? / message? / error? / payload_json? / result_ref? / created_at / updated_at`
- `PersistentGenTaskRegistry` 实现 T00 接口（仓储注入）；启动时把遗留 `running` 记录对账：**挂接 `startup-recovery.ts` 既有对账模式（`resetRowToError`/`completeRowFromGateway`，`:162-216`），扩展其可恢复行类型，禁止平行新建对账流程**（review 修正）。按 `payload_json` 中的 provider_task_id 查供应商状态：done→succeed，404→fail，仍运行→保持 running。容量：`clearCompleted` 支持手动清理；自动清理保留最近 7 天终态。

### 2.2 IPC 与事件

- `gen-task:updated`（事件推送，registry 事件 → IPC push）、`gen-task:list { query }`、`gen-task:cancel { id }`、`gen-task:retry { id }`、`gen-task:clear-completed`。
- 前缀 `gen-task:` 为**平台级新前缀**：同步 `src/web/server/api/register-channels.ts` 激活。

### 2.3 取消语义（按 provider 能力降级）

`taskType → CancelHandler` 注册表（T00 已留分派器）：
- ComfyUI：走网关中断接口
- 云视频 API：有 cancel 则调；无则标记 canceled 并附 message"供应商侧任务将继续，请知悉"
- EP 内同步短任务：标记后由生成循环协作式退出

### 2.4 重试

`retry(id)`：仅 failed；按 `payload_json` 重新提交到对应域 handler（分派器 `taskType → RetrySubmitter` 注册，EP 四类在接入时注册）；生成新 record（新 id）。

### 2.5 前端

- 新全局 store `src/renderer/src/stores/gen-tasks.ts`：订阅 `gen-task:updated`，拉取分页，运行中计数。
- 新全局组件 `components/shared/TaskDrawer.vue`：顶栏图标入口（与通知铃铛并列，运行中数徽标）。列表项：类型/目标实体/状态/进度条/当前步骤；运行中可取消；failed 可展开错误 + 重试；每条"跳转"按 entityType 路由（`/:projectId/studio/:episodeId` 对应 tab）；底部"清除已完成"。
- 终态推送通知中心（`stores/notification.ts` 既有通道）：失败高优先、成功低打扰。

## 3. EP 四类任务接入清单

| taskType | 接入点 | 备注 |
|---|---|---|
| `ep.keyframe` | 关键帧生成入口 + T07 精修批量生成（已埋点则切实现） | 进度按候选/张数 |
| `ep.video` | `handlers/render/video.handler.ts:317` 后台任务（已有 provider_task_id 落库） | 取消走 2.3 降级 |
| `ep.tts` | 对白/旁白合成入口 | 批量合成按集聚合为一条 |
| `ep.compose` | 合成导出入口（MP4/ZIP） | ffmpeg 时长即进度估算 |

## 4. 验收前扩展性验证

注册一个**演示用 taskType**（如 `demo.fake-gen`：mock 一个 5 秒的假任务，仅验证注册协议），走完 create→progress→succeed 全程——证明扩展只需注册 taskType，无协议改动。**不依赖**对话生图等未核实存在的外部模块（review 修正）。

## 5. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 新增 | `database/migrations/add-gen-tasks.ts` + `entities/gen-task.entity.ts` + `repositories/gen-task.repository.ts` | 表/实体/仓储 |
| 新增 | `src/core/platform/services/gen-task-persistent.service.ts` | Persistent 实现（对账/清理/重试分派） |
| 新增 | 全局 handler 注册处 `gen-task.handler.ts` | `gen-task:list/cancel/retry/clear-completed` + `gen-task:updated` 推送 |
| 修改 | EP 四类生成入口（见 §3） | 注册 cancel/retry 分派器；T07/T08 已埋点则仅切实现 |
| 修改 | `src/web/server/api/register-channels.ts` | `gen-task:` 前缀激活 |
| 新增 | `renderer/src/stores/gen-tasks.ts`、`renderer/src/components/shared/TaskDrawer.vue` | 全局 store 与抽屉 |
| 修改 | 顶栏组件（通知铃铛所在处） | 任务入口图标 + 徽标 |
| 修改 | `src/shared/types/gen-task.types.ts` | 如需扩展查询类型（契约主体不动） |

## 6. 测试与验收

**单测**：
- Persistent 实现：状态机迁移（同 T00 用例矩阵，换存储层）
- 遗留 running 对账（mock provider：done/404/运行中三态）
- retry 分派与 payload 透传；cancel 未注册类型 unsupported
- user 隔离与分页

**集成**：
- 慢任务（mock）全生命周期：create → progress 事件 → succeed → 通知中心出现低打扰通知
- 失败 → 抽屉可见错误 → retry → 成功落库
- 进程 kill 重启 → 对账把已完成任务标 succeeded

**E2E**：新增 `tests/e2e/web/` 用例——触发视频生成（mock）→ 抽屉出现运行中 → 注入失败 → 抽屉显示并可重试。

**人工验收 AC**：
- AC1 四类 EP 任务均入抽屉并实时更新
- AC2 失败任务错误可读，可跳转对应分镜/集
- AC3 取消在支持的 provider 真实生效；不支持时明确提示
- AC4 终态进通知中心，未读数正确
- AC5 清除已完成 / 分页 / 过滤正常
- AC6 非 EP 任务类型接入仅需注册（扩展性验证通过）
- AC7 双端一致
- AC8 回归基线全绿
