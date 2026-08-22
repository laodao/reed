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

## 补充：第 6 点续 —— 配置面板去噪（提交后附）

用户反馈"环节配置界面太丑"并配截图，逐项修复：

1. **去掉每行"支持{{}}"角标**（上一轮统一模板时误加，视觉噪音）
2. **变量选择器**：文字按钮"✕变量"（悬空脱节）→ 内嵌 `{ }` 图标按钮——
   单行文本放输入框 suffix，多行文本右上角贴边（textarea 用 `:deep(padding-right)` 防遮挡）
3. **help 小字换行**：`el-form-item__content` 是 flex 布局导致 help 挤到控件右侧；
   给 help `flex:1 1 100%` 强制换行占整行
4. **参数卡片"默认值"**：标签与输入框被 flex 换行分开 → 默认值独立一行，
   标签+输入框始终同行
5. **节点图标真实渲染**：catalog.icon 存的是 Element Plus 图标名字符串，之前直接渲染成
   英文单词（"VideoPlay"/"Film"）→ 用 `<el-icon><component :is="icon"/></el-icon>`
   （图标已全局注册）

验证：vue-tsc 通过；e2e-workflow-ux 全绿（断言随去噪同步更新）。

## 补充：第 7 点 —— 配置界面可用性与排版（提交后附）

用户反馈 5 点，逐项处理：

1. **变量选择器"不能用"**：功能其实正常（popover 可展开、18 个变量可插），根因是
   `{ }` 按钮太小颜色太淡看不见 → 改为带边框浅底的醒目按钮
2. **语义对比**：面板 340→400px，textarea 随之全宽变宽
3. **参数卡片淡色背景**：卡背景改 `--el-fill-color-lighter`，输入框保持白底
4. **校验简化**：删除 `patternMessage`/`message` 手动文案字段，错误提示由系统按规则
   自动生成（长度不足/超出长度/格式不匹配/JSON 无效/数字类型不对）；前端 RunInputForm
   与后端 workflow-run.service 同规则；新增数字类型与 JSON 合法性校验
5. **下拉选项表格化**：start 参数 select 的选项改为表格（# / 选项 / 值 / 默认值单选），
   最后一列 radio 单选即默认；select 参数的默认值不再用文本输入框

验证：vue-tsc 通过；e2e-workflow-ux 全绿（预设错误文案与断言一致）。

## 补充：第 8 点 —— 能力节点模型选择 + 本地命令行工具接入

用户需求：① 翻译/文本转语音/语音转文本走默认模型不可见 → 加模型选择；② 支持用户自写
程序/脚本/CLI 接入工具系统（现有仅 API 工具）。

### A. 能力节点模型选择（提交 3a7dce26）
- translate/tts/stt 节点表单补 model-pair（Provider+模型联动），不选走系统默认
- model-pair 联动下拉按节点类型过滤模型：文本节点看 text/multimodal，语音节点看 audio/multimodal

### B. 本地命令行工具（kind=cli）
- 类型：custom_tools 加 kind（api/cli）+ command/args_template/cwd/timeout_ms/stdout_type 列
  （create-tool-tables 迁移对新库建列、旧库幂等 ALTER 补列；已存表自动补齐）
- 执行器：tool.service.executeTool 按 kind 分发；cli 走 spawn(command, args, {cwd,timeout})，
  argsTemplate 的 {{param}} 占位映射工作流 tool-call 传入参数，捕获 stdout/stderr；
  stdoutType=json 时解析 JSON 输出
- 已装程序扫描：scanInstalledCommands 枚举 PATH 下可执行文件（Windows .exe/.cmd/.bat/.ps1/.com）
- 工具界面：ToolSettings 新建/编辑工具增加「类型」切换（API 接口 / 本地命令）；本地命令表单含
  命令（可手动填或从已装程序下拉选）、参数模板、工作目录、超时、输出解析
- tool-call 节点：toolType 仍为 custom，params 经引擎深解析后传入 → 映射 argsTemplate 占位

验证：e2e-cli-tool.cjs 通过（node -e 输出 JSON，sum=7 参数映射成功）；e2e-tool-call（API 工具）
与 e2e-workflow-ux 回归全绿；前后端 tsc 通过。

## 9. 能力应用运行时选择模型（模型即变量）

> 用户痛点：翻译 / 文本转语音 / 语音转文本 / 语音复刻这类**独立应用**运行时没有选择模型的能力
>（只能读取节点配置里写死的默认 Provider）。用户明确方向：**模型就是变量**——启动时选模型存成
> start 变量，环节里用模板引用，无需 configOverrides。

### 设计（对齐"变量"思路，复用引擎现有模板解析）
- `WorkflowStartInput.type` 新增 `model`：值为 `{ providerConfigId, modelId }`，
  附带 `modelTypes`（可选，过滤该字段可选的模型类型：text/audio/image/multimodal）。
- 节点配置用 `{{start.键.providerConfigId}}` / `{{start.键.modelId}}` 引用，`VariableResolver.lookup`
  天然支持点路径逐级下钻（`start` 根映射 `startInputs`），零新增解析逻辑。
- 因此开始节点输入列表（编辑器 inputs-list）增加「模型」类型 + 模型类型过滤 + 引用提示；
  变量选择器对 model 字段列出 `.providerConfigId` / `.modelId` 两个子路径。

### 运行时表单（RunInputForm）
- 检测到 `type='model'` 字段即拉取启用 Provider 列表，渲染 Provider + 模型联动下拉。
- **默认值**：优先字段内置 defaultValue；否则用默认 Provider（isDefault）的默认模型
  （或该 Provider 首个可用模型）——用户打开即已选好，无需每次操作。
- **无可用模型**：Provider 列表为空时提示「没有可用模型，请先配置并启用提供方」。
- 校验：必填时两者需有值；`getValues()` 输出 `{ providerConfigId, modelId }`。
- 后端 `workflow-run.service` 同步兜底：model 必填但缺 provider/model 时报错。

### 应用与模板
- 官方能力应用模板（translate-app / tts-app / stt-app / voice-clone-app）start 节点加 `model` 字段，
  模型类节点（translate/tts/stt）配置改为引用 `{{start.model.providerConfigId}}` / `{{start.model.modelId}}`。
- 已导入并发布的 4 个应用定义（文档翻译/文本转语音/语音转文本/语音复刻）经脚本
  `scripts/patch-app-models.cjs` 直接改写 draft+published 图（start 输入 + 节点引用），
  立即可用；后续新建时走模板同样生效。

### 验证
- 应用页『文档翻译』会话表单出现「模型」字段，默认选中 DeepSeek / deepseek-v4-flash；
  填写文本运行 → 翻译成功输出（`start_inputs.model = {providerConfigId, modelId}` 正确沉淀，
  translate 节点经模板解析取到具体模型）。
- 文本转语音/语音转文本/语音复刻 会话表单均出现模型字段（默认值已预选）。
- 编辑器 start 节点输入列表支持「模型」类型；translate 节点模型字段显示已填充的模板引用。
- 前后端 tsc 通过（仅存量的 TS6305）。注：run-service.spec 的「必填缺失抛错」用例断言
  中文标签，早于本批次已存在的不一致，与本次改动无关。

### 应用会话记录分页 + 序号
- 应用详情页「会话记录」表格加 `#` 序号列（`type="index"`，`sessionIndex` 跨页连续）；
  底部加 `el-pagination`（前端切片，默认 10 条/页）。
- 删除/刷新后 `clampSessionPage` 修正页码越界。
- 验证：文档翻译（14 会话）第一页序号 1-10，第二页 11-14（跨页连续），
  分页器显示「共 14 条 / 10条/页」，切换正常；前后端 tsc 通过。

## 备注

- 移除 lw 节点前已确认存量工作流（11 个 workflow_definitions）均未引用
- 长文写作模块本身不受影响（lw 节点只是工作流对长文服务的封装，模块有独立入口）
- E2E 中曾因 catalog/handler 移除不同步触发启动一致性检查拦截，属预期保护机制
