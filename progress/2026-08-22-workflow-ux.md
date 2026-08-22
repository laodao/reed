# 工作流使用体验改进（四要点）

> 日期：2026-08-22 · 分支：feat/workflow-engine
> 背景：用户反馈工作流体验不佳，提出 4 个问题：
> 1. 开始节点控件类型不够（无多行文本，提示词/翻译长文本单行难用）
> 2. 开始节点表单校验太少（只有必填）
> 3. 长文生成不应是组件（应是流程）；需明确组件定义与边界
> 4. 变量选择器时有时无（有的环节能选变量，有的不能）

## 诊断结论

| 问题 | 根因 | 处置 |
|---|---|---|
| 1. 无多行文本 | `WorkflowStartInput.type` 缺 textarea；编辑器类型下拉与运行表单都只渲染单行 | 新增 `textarea` 类型（编辑器可选 + 运行表单渲染多行 + 两列布局跨列） |
| 2. 校验只有必填 | 类型只有 `required`；前端 `RunInputForm.isValid` 与后端 `workflow-run.service` 都只查必填 | 新增 `WorkflowStartInput.validation`：minLength/maxLength/pattern（文本）、min/max（数字）、自定义 message；前端触碰后显示错误 + 提交时全量显示，后端启动兜底同规则 |
| 3. 长文生成是流程不是组件 | `lw-generate-chapter`/`lw-polish` 把长文模块整条业务（读设定→组 prompt→调模型→落库）封装成黑盒，直接调 `LongWritingAIService`，配置项是长文模块内部实体 ID | 移除两个节点（组件面板不再出现；存量数据无引用，已查 11 个工作流定义）；组件边界定义见下 |
| 4. 变量选择器不一致 | UI 仅由表单 Schema 手动 `templateHint` 标记；但引擎 `resolveConfigDeep` 对所有字符串配置统一深解析 `{{}}` | 规则统一：**text/textarea 文本字段默认全部支持模板**（自动显示选择器 + 支持{{}}角标），`noTemplate` 仅显式排除纯配置字段 |

## 组件边界定义（第 3 点沉淀）

**一个工作流组件 = 一个原子步骤**：一次外部 IO（LLM 调用 / HTTP / 检索 / 读写资产 / 文件转换）或一次确定性变换（代码 / 模板渲染 / 拼接 / 分支路由）。判断标准：

- 能用「输入 → 做一件事 → 输出」一句话讲清；
- 不依赖某个业务模块的内部状态（不拿业务实体 ID 当配置）；
- 与前后环节的耦合只通过变量上下文（上游输出 → 下游引用）。

**流程型能力（读设定 → 组 prompt → 调 API → 落库）应建模为子工作流**（sub-workflow 节点），由原子件组合：
读取设定（read-asset / data-table / kb-retrieve）→ llm-chat → 保存（save-asset）。
长文生成即属此类，故移除黑盒节点；后续如需支持长文写作域，应新增「读取长文设定」这类**原子**读取组件而非封装整条生成业务。

## 改动清单

**类型层（shared）**
- `workflow.types.ts`：`WorkflowStartInput` 加 `textarea` 类型 + `validation?: WorkflowStartInputValidation`；移除 lw 两节点类型/config/常量
- `workflow-node-catalog.ts`：移除「长文·生成章节 / 长文·润色」目录条目
- `workflow-node-forms.ts`：移除 lw 表单；`CatalogFormField` 加 `noTemplate`；新增 `fieldSupportsTemplate(field)`（text/textarea 且非 noTemplate）

**渲染层**
- `FormFieldRenderer.vue`：inputs-list 编辑器类型下拉加「多行文本」，每行加「校验」展开面板（长度/正则/数字范围/自定义提示）；text/textarea 变量选择器改用 `fieldSupportsTemplate`
- `NodeConfigPanel.vue`：支持{{}}角标改用 `fieldSupportsTemplate`
- `RunInputForm.vue`：textarea 渲染（两列跨列）；完整校验 `validateItem`（必填+长度+正则+范围）；`touched` 触碰后显示错误，`getValues()` 提交时全量触发显示；长度角标（如「1-5000 字」）
- `WorkflowEditor.vue`：移除 lw 节点摘要映射

**服务端**
- `workflow-run.service.ts`：启动校验扩展（必填 + minLength/maxLength/pattern/min/max，错误带字段名与规则，如「『待翻译内容』超出长度：最多 5000 个字符」）

**模板**
- translate-app / tts-app / image-gen-app / voice-clone-app：长文本输入改 `textarea` 并带长度校验示例

**E2E**
- `scripts/e2e-workflow-ux.cjs`：6 步全绿 —— 组件面板无长文节点 / start 类型下拉含多行文本+校验按钮 / LLM 文本字段有变量选择器 / 新模板导入结构断言（textarea+maxLength）/ 试运行表单 textarea+角标+超长拦截 / 服务端超长被拒+合法启动

## 验证

- `npx tsc --noEmit -p tsconfig.node.json` 通过
- `npx vue-tsc --noEmit` 通过（仅预存在 electron.vite.config.d.ts TS6305）
- `node scripts/e2e-workflow-ux.cjs` 全部通过（node exit 0）
- 启动自检：节点目录与 handler 一致性检查通过（lw 已双向移除）

## 补充：第 5 点 —— 环节设置界面多余描述性文字（提交 fef6d4d9）

- **主因是分组标题重复显示 bug**：`groupTitleOf` 被 `void` 禁用、`currentGroup` 逻辑失效，
  导致「对话/参数/视觉/语言」等组名在每个字段前重复出现 → 改为组切换时仅显示一次
- **精简 help 文案**：删除被输入框提示覆盖的废话（请求体「GET 以外的方法可用」、
  参数「值支持 {{模板}}」等），压缩超长说明为短句，保留关键约束（必填/留空行为/格式限制）
- 验证：LLM 面板分组标题由每字段重复 → 每组一次；help 全部为短句

## 补充：第 6 点 —— 主动优化编辑器界面（提交后附）

用户反馈"环节配置界面太丑"，要求主动截图自查优化。通过 Playwright 采集几何数据
定位问题并优化：

1. **开始节点输入参数改为卡片式**（FormFieldRenderer）：原每行控件垂直堆叠
   （el-input 默认 width:100% 各占满一行，行高 84px）；重构为参数卡片——
   头行（参数键+显示名+删除并排）+ 次行（类型+必填+校验+默认值并排），
   默认值从底部独立行并入卡片（归属清晰）
2. **kv-list 键值对并排**：同样的 el-input 全宽问题，加 flex 规则收窄为
   键/值各半行 + 删除按钮（132+132+32）
3. **配置面板样式**（NodeConfigPanel）：面板 320→340px；图标 10px→34px 圆角
   底色块；节点类型 600；分组标题加粗+右侧分隔线；字段 label 12px/600；
   字段间距 18→16px；删除按钮通栏
4. **组件面板**（palette）：条目 hover 阴影+白底、名称加粗、描述两行截断、
   分组标题加粗、浅灰底色区分画布
5. **画布节点**：hover 阴影
6. **运行表单**（RunInputForm 共用）：label 12px/600 统一

验证：vue-tsc 通过；e2e-workflow-ux 全绿（选择器随卡片化更新）；几何断言
确认头行/次行并排、分组标题每组一次、kv 并排。

## 备注

- 移除 lw 节点前已确认存量工作流（11 个 workflow_definitions）均未引用
- 长文写作模块本身不受影响（lw 节点只是工作流对长文服务的封装，模块有独立入口）
- E2E 中曾因 catalog/handler 移除不同步触发启动一致性检查拦截，属预期保护机制
