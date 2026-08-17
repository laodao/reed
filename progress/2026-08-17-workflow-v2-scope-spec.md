# 工作流扩围（C/D 批 + 对话集成）详细设计 Spec

> 日期：2026-08-17 ｜ 依据用戶指令：A+B 之外，除助手节点与代码节点外全量实现；会话式运行改为"与现有 AI 对话集成"
> 前置：`2026-08-17-workflow-components-enhance-spec.md`（A+B 11 项）先行实施

## 1. 成环（工作流内部循环自由成环）

**目标**：支持任意环（如 人工审核(input)→LLM→审核→… 多轮迭代），对齐 Bisheng DFA 理念。

**核心引擎改动**（`workflow-engine.service.ts`）：
- `computeReady` 当前"`state.status !== 'pending'` 即跳过"阻止环中节点二次执行 → 改为：节点处于终态（succeeded/failed_recovered）**且其某条入边在节点完成后被再次激活** → 重置该节点 state 并重新入队（输出覆盖更新 variables）
- 边激活需要**时间语义**：activatedEdges 从 Set 改为 `Map<edgeId, activationSeq>`（单调递增序号），节点完成记录 `completedSeq`；入边激活序号 > completedSeq 才触发重执行——防止完成瞬间的旧激活把节点拉回
- 终止：静默（无 ready/无 running）即收敛，现有逻辑不变；`maxNodeRuns`（A1 已建）兜底防死循环
- 校验器：环检测从**错误降为警告**（"成环运行需确保环内有条件分支或人工交互节点可跳出"）；loop-back 边机制保持不变（与自由环并存）

**测试**：审核(input)→LLM→回连审核 的两轮迭代图；环内条件分支跳出；无出口环触达 maxNodeRuns→failed；非环图零回归

## 2. 工作流 × AI 对话集成

**目标**：在聊天中调用工作流，进度/结果/审核回到对话流（替代独立会话式运行）。

**设计**：
- 入口：聊天输入框工具栏"+"菜单新增"工作流"→ 弹选择器（已发布工作流列表）→ RunInputForm（A4 组件复用）填参 → `startRun`
- 结果呈现：以 **assistant 消息**落库（`metadata.workflowRun = { runId, definitionName }`），消息卡片渲染：运行状态条（节点进度时间线）→ 完成后正文（取 report/llm-chat 类节点的 markdown 输出，或结束节点聚合输出）
- 实时：`stores/workflow.onRunEvent` 已有——chat 组件订阅 `runId` 维度事件更新卡片
- 审核挂起：卡片内嵌审核 UI（review 三按钮 / choose 选项 / input 编辑框——复用 A3 的 RunDetail 渲染逻辑抽成 `ReviewActions.vue` 共享组件）
- 上下文关联：run 触发时记录 `dialogId`（存 `workflow_runs.trigger_info.dialogId`）——供 §3 会话历史与 §4 临时知识库使用
- 涉及文件：`MessageItem.vue`（新增 workflow 卡片分支）、`ChatInput`（+菜单）、`stores/workflow.ts`（按 runId 取摘要）、`workflow-run.service.ts`（startRun 入参加 `dialogId?`）

**测试**：服务层 dialogId 透传；卡片组件挂载/状态流转；审核操作经卡片生效（引擎级已有测试，前端手工验收）

## 3. 会话历史开关（节点带对话上下文）

- `llm-chat` / `kb-qa` config 增加 `historyTurns?: number`（0=关，默认；n=取该运行关联对话最近 n 轮）
- handler：`trigger_info.dialogId` 存在 → `dbManager.messages.getByDialogId` 取最近 n 轮拼接为上下文消息（无 dialogId 则忽略，向后兼容）
- 表单：数字字段"携带对话历史轮数"，help 注明"仅从对话中触发时生效"
- 测试：mock messages 仓库验证拼接与无 dialogId 降级

## 4. 临时知识库（聊天文件即检索范围）

- 概念：对话中上传过的文件自动解析为**运行级临时文档集**；kb-retrieve/kb-qa 的检索范围增加 `source: 'kb' | 'dialog-files'`（多选：既选知识库又选会话文件）
- 实现：
  - 对话上传文件已有落盘与解析能力（KB 模块 extract）——新增轻量 `DialogFileStore`（core）：`dialogId → [{fileName, text}]`（存 DB 新表 `dialog_files` 或消息 metadata——**选 metadata**：`message.metadata.attachments` 已存文件，补解析后的 text 字段，零新表）
  - 节点 handler：`source 含 dialog-files && trigger_info.dialogId` → 从该对话附件 metadata 收集 text，与 KB 检索结果合并入 context
- 表单：检索范围改为多选（知识库动态多选 + "包含本对话上传的文件"开关）
- 测试：mock 对话附件验证合并；无 dialogId 时开关无效告警（校验期提示）

## 5. OAS 自定义工具节点

- type `'oas-tool'`：粘贴/导入 OpenAPI JSON → 解析出 operations 列表（method+path+summary）→ 选择一个 operation → 参数按 OAS parameters 自动生成声明式表单（key/type/required，值支持模板）→ 本质是**参数化封装的 http-request**（复用其 fetch/超时/取消）
- config：`oasSpec`（JSON 文本）、`operationId`、`params: [{key, value}]`、`baseUrlOverride?`
- handler：按 OAS 组装 URL（path/query）与 body → fetch
- 限制（记录）：V1 不支持 $ref 引用与复杂 schema（Bisheng 同款限制）
- 测试：OAS 解析（合法/非法/无 operation）；参数组装 GET/POST 两形态

## 6. 工作流 REST API + override（Web 端）

- `POST /api/workflow/:definitionId/invoke`：JWT 鉴权 → `startRun(triggerType:'manual', inputs, override?)` → 返回 `{ runId }` + **SSE 流**（`/api/workflow/run/:runId/events`，复用 `wf:run-event` 载荷，按 userId 路由已有）
- `POST /api/workflow/run/:runId/stop`：取消
- **override**：`{ [nodeId]: { [configKey]: value } }`——引擎 `ExecuteRunInput` 增加 `configOverrides?`，`launchNode` 深解析后按 override 合并（不改定义，一次性实验；对齐 Bisheng）
- 文件：`src/web/server/api/workflow-api-router.ts`（新）、`workflow-run.service.ts`（透传）、引擎（合并点）
- 测试：override 覆盖生效且不入库；SSE 事件推流（集成测试）；鉴权拒绝未登录

## 7. 工作流免登录独立页（Web 端，随 §6）

- `/workflow-run/:definitionId` 公开页（guest 白名单路由）：RunInputForm + 提交 invoke + SSE 状态展示——供嵌入/分享场景
- 复用 §6 API；iframe 嵌入即此页

## 8. QA 知识库（知识库模块）

- KB 类型新增 `'qa'`：QA 对存储（question/answer/相似问题[]），手动添加 + xlsx 批量导入导出 + 从历史会话标注添加
- 检索：question+相似问题 向量化，命中即直出 answer（不过 LLM）
- 工作流侧：`kb-qa` 节点增加"先查 QA 直出"逻辑（命中→answer 直出并标 `source:'qa'`；未命中→RAG，Bisheng 双路径）
- 涉及：KB Entity/Repository/Service 扩展 + 前端 KB 页 QA tab
- 测试：QA 检索命中直出/未命中走 RAG；批量导入

## 9. rerank 重排序（知识库模块）

- KB 检索配置增加可选 rerank 模型（provider-template 已有 rerank 类型支持）→ 检索后重排
- `kb-retrieve/kb-qa` 表单透传开关
- 测试：mock rerank provider 验证顺序变化

## 10. 混合检索权重暴露

- `KnowledgeBaseService.search` 已有 `vectorWeight` 参数（存量能力）→ 只需在 kb-retrieve/kb-qa 表单暴露滑杆（0=纯关键词~1=纯向量）+ service 透传确认
- 测试：权重两端行为

---

## 实施顺序与依赖

```
A1→A2→A3→A4→B5→B6（已排期，不变）
  → C1 成环（A3 审核交互 + A1 护栏是前置）
  → C2 对话集成（A4 表单 + A3 审核组件是前置；含 §3 会话历史）
  → C3 REST API + override（§6§7）
  → C4 临时知识库（依赖 C2 的 dialogId 关联）
  → C5 OAS 工具节点（独立）
  → D1 QA 知识库 → D2 rerank → D3 权重暴露（KB 模块序列）
```

## 明确不做（本轮维持）

助手/Agent 节点（归 harness）、代码执行节点（沙箱安全，功能定稿边界）、视频合成节点。
