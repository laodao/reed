# 工作流业务节点分层收口：pack 贡献扩展点 + internal 定义

日期：2026-09-18
状态：已完成（未提交，待随下批一并 commit）
起因：用户意见（2026-09-18）——「章节写作章法 / 卷设计章法是业务专用能力，不应作为工作流引擎的组件存在」。讨论中同时确认：单节点工作流的壳保留（互斥/审计/恢复/统一触发面四样机制价值，见 `room-agent-tools.ts` 与 `add-workflow-run-mutex-scope` 的实跑依据），但业务 handler 的**注册权**必须移出平台。

## 判据与决策

按架构统一原则的机制/策略判据（规则离开业务域是否仍有意义）拆分：

- **机制留引擎（通用）**：run 生命周期、mutexScope 互斥、boot 恢复、取消、运行历史——全部业务无关，留在 `workflow-run.service`。
- **策略出引擎（业务）**：chapter-writing / volume-design 的 handler 实现与注册归 longwriting pack；平台 `nodes/` 不再实现、不再硬编码任何业务 handler。这也正是 workflow pack 头注释里既定设计意图（"引擎业务无关，供各业务包复用"）的补全。

## 改动清单

### 扩展点（platform）
- `core/platform/workflow/nodes/index.ts`：`PLATFORM_NODE_HANDLERS`（通用）+ `registerPackNodeHandlers()`（pack 贡献注册，同 type 重复或与平台撞 type 即抛）；`createFullNodeRegistry()` = 平台 + pack 合并；新增 `createPlatformNodeRegistry()`（分层回归测试/诊断用）。**删除了对 `chapter-writing-node.ts` / `volume-design-node.ts` 的硬编码引用。**
- 原 `nodes/chapter-writing-node.ts`、`nodes/volume-design-node.ts` **删除**（实现原样搬迁，仅调整 import 路径）。

### 业务包（pack）
- 新增 `core/packs/longwriting/workflow-nodes.ts`：两个节点 handler + `LONGWRITING_WORKFLOW_NODE_HANDLERS`。
- `core/packs/longwriting/index.ts`：activate 时 `registerPackNodeHandlers(LONGWRITING_WORKFLOW_NODE_HANDLERS)`。boot 序保证（两端均 `initPackSubsystem` 先于 `initWorkflowSubsystem`）赶在注册表装配与 `assertNodeRegistryConsistent` 自检之前。

### 目录元数据（shared，保留不搬）
- `shared/types/workflow-node-catalog.ts`：`WorkflowCatalogEntry` 增 `internal?: boolean`；两个章法条目标 `internal: true`。**条目留在 shared 的原因**：渲染层静态导入目录，运行图回放（ReadonlyRunGraph）/变量提示（VariablePicker）/图校验（graph-validator）都需要这些条目。
- `shared/types/workflow-node-forms.ts`：顺手补上缺失的 `volume-design` 表单（存量红灯，见下）。

### internal 定义（列表隐藏）
- `workflow_definitions` 加 `internal` 列（integer, not null, default 0），迁移 `add-workflow-definition-internal.ts` 双端登记（electron `database/index.ts` + `web/server/index.ts`），幂等双语种。
- repo：create 支持 `internal`；`list({ includeInternal })` **默认过滤 internal**；update 支持 `internal`（存量自愈通道）。
- `room-agent-tools.ts` 两个 ensure：查找传 `includeInternal: true`；命中存量 `internal=0` 行就地升级为 1（**自愈**：老用户下次触发章法后列表即干净）；新建带 `internal: true`。
- 导入防劫持：`importDefinition` 的 overwrite 重名匹配排除 internal 行（否则同名导入副本会顶替章法定义、劫持幂等查找）。
- `run_workflow`（generic）按 definitionId 直启、不经 list()，不受影响；运行历史页展示 run 不受定义过滤影响（审计照旧可见）。

### 编辑器
- `WorkflowEditor.vue` 调色板过滤 `internal`——通用编辑器不再出现业务节点（此前电商用户也能看到/拖入"章节写作章法"，拖入必然后校验失败）。

## 验证

- 定向单测全绿：`node-registry-consistency`（5，含新增分层断言：平台注册表不含业务节点、pack 注册后目录全对齐、重复注册 fail-fast）、`workflow-definition-internal`（3，新增：internal 创建/透传、导入覆盖不命中 internal、普通覆盖语义不变）、`a2-components`（13）、definition/triggers/versions/types/run-service/engine/draft/daily-news 共 72+ 通过。
- vue-tsc：全量错误数 882 = HEAD 基线 worktree 对比 882，零漂移（项目存量基线；记忆中 883 基线基本吻合）。
- 顺手修复存量红灯：表单完整性测试因 `volume-design` 缺表单自 0916 起即红（HEAD 上可复现），本次补齐。

## 遗留与边界

- `core/platform/services/longwriting/`（volume-design-flow、design-document.service 等）与 `longwriting-ai.service` 仍在 platform/services——既有布局（longwriting pack index 注释中为刻意安排），本次不动；后续若做 services 层收口另行立项。
- 存量两行 internal=0 的章法定义在用户下次触发对应章法时自动升级；在那之前列表仍会显示（可接受过渡态，迁移不做数据回填以避免误标用户自建同名流程）。
- 下一个业务 pack（episode-production 流水线）挂长任务时：handler 放自己包内 + activate 注册 + 定义 `internal: true`，平台零改动。
