# 工作流组件增强 详细设计 Spec

> ⚠️ 本 spec 经评审发现 12 项问题并修正：**以 `2026-08-17-workflow-components-spec-review.md` 的修正案为权威补充**，冲突处以修正案为准（关键：P1 校验器放行 review-choose 的 branch 边；P2 input 模式自动放行 output_result；P3 report Web 端边界）。

> 日期：2026-08-17 ｜ 依据：Bisheng 手册对标分析（A+B 共 11 项）+ 用戶架构决策（Agent 能力归未来 harness，工作流保持通用编排）
> 前置：工作流引擎片 1-8 已交付（24 组件 / 91 测试全绿）

## 0. 功能清单自审（Review 结论）

评审过程中发现并修正的 3 个设计问题：

| # | 原设想 | 修正 | 理由 |
|---|--------|------|------|
| R1 | 报告节点内生成 PDF（Electron printToPDF） | **PDF 改为前端查看器导出**（运行详情预览 markdown → 前端打印）；节点只产出 markdown + docx | core 层不能依赖 Electron BrowserWindow（双端铁律）；节点内平台分叉违背通用性；且节点 output 有截断保护，大文件必须落盘而非走 output |
| R2 | choose 交互新增一种边类型 | **复用 branch 边机制**（选项 key = branchId） | 零新增边类型：校验器/引擎路由/编辑器连线全部复用条件分支的既有机制 |
| R3 | start 下拉参数仅加类型 | 顺带把**运行输入 JSON 对话框升级为表单化输入**（按 start.config.inputs 动态渲染） | 这是 Bisheng"表单输入"的真正对应物；只加类型不加表单渲染是无意义半成品 |

其余确认：maxNodeRuns 与 maxLoopIterations **独立生效**（前者按执行实例计数、管环/重入；后者管单次 loop 的迭代数）；`{{sys.now}}` 采用**每次解析时求值**语义（同一运行内不同节点取值可能差几秒，与 BishENG 一致，可接受）。

---

## 1. 内置系统变量 `{{sys.*}}`

**目标**：模板中可直接引用系统值。

- 变量：`{{sys.now}}`（ISO 时间）、`{{sys.today}}`（yyyy-MM-dd 本地）、`{{sys.ts}}`（epoch 毫秒）
- 实现：`VariableResolver.lookup` 对 `root === 'sys'` 特判，调用注入的 `sysVars` provider（引擎构造 resolver 时注入，纯函数、可测试）
- 只读：sys 命名空间不可被节点输出覆盖（nodeId 不可能为 'sys'——校验器新增：节点 id 禁止 `sys`/`start` 保留字）
- 测试：三变量解析；start/上游输出不受影响

## 2. 条件运算符补齐

- `WorkflowConditionItem.operator` 增加：`'regex' | 'starts_with' | 'ends_with'`
- `evalCondition` 新增三 case：regex 用 `new RegExp(String(right)).test(String(left))`（正则异常捕获→false）；starts_with/ends_with 字符串前/后缀
- 前端 branches 编辑器运算符下拉同步三项
- 测试：三运算符正反例 + 非法正则容错

## 3. 单节点最大运行次数护栏 maxNodeRuns

**目标**：防环/防重入失控（为 V2 成环铺路的通用护栏，对齐 Bisheng max_steps=50）。

- `WORKFLOW_DEFAULTS.maxNodeRuns = 50`；`WORKFLOW_LIMITS.maxNodeRuns = 1000`
- 配置链：definition.settings.maxNodeRuns → 全局层 → 默认值（既有链路）
- 引擎：RunExecution 增加 `runCounts: Map<nodeId, number>`；`launchNode` 入口自增并检查——超限时节点直接 `failed`（error="节点超出最大运行次数 N"，retryable=false），走正常失败语义（有 fail 边可恢复）
- 语义：按**执行实例**计数（loop body 每迭代各计 1），与 maxLoopIterations 正交
- 测试：线性图不受影响；构造重入场景（fail 边回环）触达上限→run failed；definition 级覆盖生效

## 4. start 输入参数增强（select 类型 + 表单化运行输入）

- `WorkflowStartInput.type` 增加 `'select'`；新增 `options?: Array<{label, value: string|number}>`、`multi?: boolean`
- `inputs-list` 表单编辑器：类型下拉加"下拉选择"；选中 select 时展示 options 子编辑（label/value 行）+ 多选开关
- **运行输入表单化**：新建 `RunInputForm.vue` 组件——按 start.config.inputs 渲染（text/number/boolean→开关/select→下拉(多选)/json→文本域），必填校验，defaultValue 预填；替换 WorkflowList 的 JSON 对话框；编辑器调试面板（§9）复用
- 服务端：startRun 的 required/defaultValue/合并逻辑不变（select 天然兼容）；multi 时值合并为数组
- 测试：select 必填缺失报错；multi 提交为数组；defaultValue 预填

## 5. kb-qa 知识库问答节点（RAG 一体）

**目标**：检索+生成一个节点完成（当前需手动拼 kb-retrieve→llm-chat）。

- type `'kb-qa'`，category ai，cancellable true（检索检查点+LLM signal）
- config：knowledgeBaseId（select-dynamic）、question（textarea 模板）、systemPrompt（默认 RAG 提示词，可改）、topK/threshold、**resultMaxLength**（检索上下文最大字符，默认 8000——对标 Bisheng 检索结果长度限制）、providerConfigId/modelId（model-pair）、temperature
- handler 执行序：KnowledgeBaseService.search（透传 signal）→ 拼接 context（每条 `[文档名] 内容`，按 resultMaxLength 截断）→ callAIStream（signal + 进度）
- output：`{ answer, sources: [{documentName, score}] }`（sources 供前端引用展示）
- 表单：上述字段分组（检索/生成/参数）
- 测试：mock KB+AI 验证拼接格式、截断、sources 输出、失败传播；一致性自检自动覆盖

## 6. 审核节点交互增强（choose / input 模式）

**目标**：对齐 Bisheng 输出节点的"选择型/输入型"交互。

- `human-review` config 增加 `interaction?: 'review' | 'choose' | 'input'`（默认 review=现有三路）：
  - **choose**：`options: [{key, label}]`；送审 payload 含选项列表；**每个选项对应一条 branch 出边**（key=branchId，复用条件分支边机制——R2）；用户点选某选项 → route=`branch:{key}`
  - **input**：展示可编辑文本（payload 为预置内容，可引用变量）；用户编辑提交后继续，输出 `output_result`
- 引擎改动（最小）：
  - `ReviewDecisionInput` 增加 `choice?: string`（choose 模式用户所选 key）
  - `applyReviewDecision`：interaction='choose' 时校验 choice ∈ options，route=`branch:{choice}`；input 模式复用 approve_with_changes（前端把提交文本作为 editedValues.output_result）
  - 校验器：interaction='choose' 时每个 option.key 必须有对应 branch 出边（复用"声明分支必须有出边"规则）
- 前端：
  - RunDetail 按模式渲染：review=现有三按钮；choose=选项按钮组；input=编辑框+提交
  - 编辑器智能连线：源为 review 节点且 interaction='choose' 时，连线改为选 options 的 key（branch 边）
- 测试：choose 三选项各走对边；未声明选项连线校验报错；input 提交值进入 output_result；review 模式回归不受影响

## 7. 报告节点 report

**目标**：模板渲染 → markdown/docx 文档产物（长文/报告场景交付物）。

- type `'report'`，category general，cancellable false
- config：title（文件名模板）、template（markdown 大文本，模板变量）、format：`'markdown' | 'docx'`（默认 docx）
- handler：引擎深解析后的 template → markdown 文本；format=docx 时 `markdownToDocx(md, {title})`（复用 `@core/utils/markdown-to-docx`）→ **写文件**（`getPathProvider().getDataPath()/workflow-reports/{runId}_{nodeId}.docx`）→ output 仅含元信息
- output：`{ markdown, format, filePath?, title }`（**文件内容不进 output**——截断保护与 DB 膨胀，R1）
- PDF：**不在节点内做**。运行详情页为 report 输出提供 markdown 预览 + "导出 PDF"按钮（前端打印方案，双端浏览器打印/Electron printToPDF 由前端调用）——R1
- 表单：title/template/format + 说明（支持 markdown 图片/表格语法）
- 测试：markdown 直出；docx 落盘路径存在且 output 无文件内容；模板渲染正确
- 验证项（实现时确认）：markdownToDocx 对本地图片路径的表格/图片支持度，不支持则在 spec 附录记录限制

## 8. 变量选择器（x 按钮）

**目标**：配置字段一键插入变量，杜绝手写错 path。

- 数据源（编辑器层计算，provide/inject 注入 NodeConfigPanel→FormFieldRenderer）：
  - 系统变量：sys.now / sys.today / sys.ts
  - 输入参数：start 节点 config.inputs 的各 key
  - 节点输出：其余每个节点的 outputSchema（显示"节点名 · 字段 desc"，插入 `{{nodeId.field}`；循环体内可加 loop 的 item/index）
- 交互：textarea/text 字段标签区 (x) 图标 → popover 变量树（三分组）→ 点击在**光标处**插入（selectionStart 定位）
- V1 取舍（记录）：不做拓扑上游过滤（全量列出 + 帮助文案提示"仅上游可用"）——避免循环检测复杂度；后续可按需收紧
- 测试：组件级——插入格式正确、光标定位、数据源分组

## 9. 编辑器调试面板（B 批）

- 编辑器工具栏"试运行"→ 右侧抽屉：RunInputForm（§4 复用）填参 → startRun → 抽屉内显示运行状态时间线 + **画布节点实时点亮**（WfNode 读 store.nodeStatusMap，五色状态边框）+ 终态提示
- 复用：stores/workflow 的 nodeStatusMap（已有）；跳转运行详情的链接
- 测试：手工验收为主（组件挂载/状态映射单测）

## 10. LLM 视觉开关（B 批）

- llm-chat config 增加 `vision?: boolean`、`imageInput?: string`（模板：base64/本地路径/URL，多张用逗号分隔 V1 单张）
- handler：vision=true → 走 `ai-call` 的 VLM 变体（chatSync 底层暂无 signal——**标注：vision 模式当前不可取消**，catalog cancellable 保持 true 但文档注明降级；后续给 chatSync 加 signal 为独立小改进）
- 表单：vision 开关（开启显示 imageInput 字段）
- 测试：vision 路径调用 VLM 封装（mock）；关闭时不影响现有

## 11. 内置模板库（B 批）

- 资产：`renderer/src/assets/workflow-templates/*.json` × 4：RAG 知识库问答 / 批量翻译 / 内容审核流 / 定时摘要（均为合法图，可用 validateGraph 保证）
- 模板 JSON 即 importDefinition 的 content 格式（kind: the-bot-workflow）
- UI：列表页"新建"拆分为"空白创建"/"从模板创建"（模板卡片：名称/描述/包含组件数）→ importDefinition(content, 'copy')
- 合规说明：模板是产品数据资产（同预置助手 prompt 性质），非业务逻辑写死
- 测试：4 份模板经 importDefinition 全部成功（导入即结构校验）

---

## 统一约束

- 全部新组件走组件化三步（catalog + handler + forms），引擎零改动（§6 是唯一例外：applyReviewDecision 最小扩展）
- 字面量纪律：新类型/状态进常量唯一源（WORKFLOW_NODE_TYPES 等 satisfies 校验强制）
- 每项 TDD：片内先测试后实现，91 → 预计 ~110 用例
