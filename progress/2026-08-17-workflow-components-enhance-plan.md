# 工作流组件增强 实施计划

> ⚠️ 评审修正：inputs-list 编辑器改造随片 A1（P9）；每片验收步骤见 `2026-08-17-workflow-components-spec-review.md` 各问题的"验收步骤"（P12）。

> 日期：2026-08-17 ｜ Spec：`2026-08-17-workflow-components-enhance-spec.md`
> 节奏：6 片，每片 TDD（先测后实现）→ 全绿 → 独立提交；依赖链 A1 → {A2, A3} → A4 → {B5, B6}

## 片 A1：引擎/共享层基础（spec §1-§4 类型部分）

**内容**
1. `{{sys.now}}/{{sys.today}}/{{sys.ts}}`：VariableResolver sys 特判 + 注入；校验器节点 id 保留字（sys/start）
2. 条件运算符 regex/starts_with/ends_with：类型 + evalCondition + branches 编辑器下拉
3. maxNodeRuns 护栏：DEFAULTS/LIMITS/settings 字段 + RunExecution.runCounts + launchNode 检查
4. start select 类型：WorkflowStartInput 扩展（options/multi）+ 服务端合并兼容

**测试**：sys 三变量 / 运算符正反例+非法正则 / 重入护栏触达上限→failed+definition 覆盖 / select 必填与 multi 数组
**判据**：全绿；现有 91 用例零回归

## 片 A2：kb-qa + report 节点（spec §5 §7）

**内容**
1. kb-qa：extra-nodes.ts 新增 handler（search→context 拼接（resultMaxLength 截断）→callAIStream）+ catalog/forms/类型常量
2. report：handler（模板渲染→markdownToDocx→落盘 workflow-reports/）+ catalog/forms；确认 markdownToDocx 图片支持度并记录
3. 运行详情页 report 输出识别：markdown 预览 + 导出按钮（前端打印）

**测试**：kb-qa 拼接格式/截断/sources/失败传播（mock 服务）；report 落盘+output 无文件内容；两节点进一致性自检（自动）
**判据**：26 组件一致性全绿；手工验收 docx 产物可打开

## 片 A3：审核交互增强（spec §6）

**内容**
1. 引擎：ReviewDecisionInput.choice + applyReviewDecision choose 路由（branch 边复用）；interaction='input' 走 approve_with_changes
2. human-review 节点：config.interaction/options；choose 模式 payload 含选项
3. 校验器：choose 模式每个 option.key 必须有 branch 出边
4. 前端：RunDetail 三模式渲染（review 按钮/choose 选项组/input 编辑框）；编辑器智能连线适配；表单 Schema（interaction select + options 条件显示）

**测试**：choose 三选项各走对边（引擎级）/未声明选项校验报错/input 提交进 output_result/review 模式回归
**判据**：审核相关既有用例零回归 + 新增 ≥6 用例

## 片 A4：编辑器输入体验（spec §4 表单化 §8）

**内容**
1. RunInputForm.vue：按 start inputs 动态渲染（text/number/boolean/select/json）+ 必填 + defaultValue；替换列表页 JSON 对话框
2. 变量选择器：编辑器层变量数据源（sys/start/各节点 outputSchema）provide/inject → FormFieldRenderer (x) popover → 光标处插入
3. inputs-list 编辑器：select 类型 + options 子编辑 + multi 开关

**测试**：RunInputForm 组件挂载/校验；变量插入格式与分组
**判据**：手工走查"新建→配置→运行"全链路无 JSON 手写

## 片 B5：调试面板 + 视觉开关（spec §9 §10）

**内容**
1. 编辑器试运行抽屉：RunInputForm 复用 + 运行时间线 + 画布节点实时点亮（WfNode 接 store.nodeStatusMap）
2. llm-chat vision 开关 + imageInput；handler 走 VLM 变体（标注当前不可取消）

**测试**：状态点亮映射；vision 路径 mock
**判据**：编辑器内完成"编排→试运行→看结果"闭环（手工）

## 片 B6：内置模板库（spec §11）

**内容**：4 份模板 JSON（RAG 问答/批量翻译/内容审核/定时摘要）+ 列表页"从模板创建"对话框

**测试**：4 模板经 importDefinition 全部成功（结构合法性即测试）
**判据**：从模板 30 秒内得到可运行的完整工作流

## 里程碑与提交

| 片 | 提交主题 | 预计用例增量 |
|----|----------|------------|
| A1 | feat(workflow): sys变量+条件运算符+节点运行护栏+start下拉 | +8 |
| A2 | feat(workflow): kb-qa 与 report 组件 | +6 |
| A3 | feat(workflow): 审核交互三模式 | +6 |
| A4 | feat(workflow): 运行表单化+变量选择器 | +4 |
| B5 | feat(workflow): 编辑器调试面板+LLM视觉 | +3 |
| B6 | feat(workflow): 内置模板库 | +2 |

总计约 +29 用例（91 → ~120）。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| markdownToDocx 对图片/复杂表格支持不完整 | A2 首日验证；不足则模板建议纯文本+表格，限制记录进 spec 附录 |
| choose 复用 branch 边与条件分支语义混淆 | 边校验按"源节点类型"区分（condition 用 config.branches、review-choose 用 config.options），测试覆盖两共存场景 |
| 变量选择器全量列出致误引下游变量 | V1 帮助文案明示；收集反馈后 V2 加拓扑过滤 |
| vision 不可取消与 catalog.cancellable=true 不符 | A/B 项：vision 开启时表单提示"当前视觉模式暂不支持中断"；后续 chatSync 加 signal |

## 明确不做（本轮）

Agent/助手节点（归未来 harness）、成环、REST API、临时知识库、会话历史、PDF 节点内生成（前端导出替代）、MySQL 代理。
