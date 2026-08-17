# 组件增强 Spec/Plan 评审报告（含修正案）

> 日期：2026-08-17 ｜ 评审对象：`2026-08-17-workflow-components-enhance-spec.md` / `-plan.md`
> 结论：12 个问题（高 2 / 中 5 / 低 5）。本报告的修正案为**权威补充**，与 spec/plan 冲突处以本报告为准。

---

## P1（高）choose 模式与图校验器的既有规则冲突 —— 功能不可用

**原因**：`graph-validator.ts` 第 5 节现有规则硬性要求 `branch 出边只能来自 condition 节点`（`if (source.type !== 'condition')` 报错）。spec §6 设计 review-choose 节点出 branch 边，**会被校验器直接拒绝**，choose 图无法通过发布校验。spec 写"复用 branch 边机制"时只考虑了引擎路由，漏查了校验器侧的来源限制。

**解决方案**：
- 文件 `src/core/modules/workflow/engine/graph-validator.ts`，第 5 节两处修改：
  1. branch 来源校验改为：`source.type === 'condition'` **或**（`source.type === 'human-review' && source.config.interaction === 'choose'`）
  2. "声明的分支必须有出边"检查按来源分流：condition 读 `config.branches[].branchId`；review-choose 读 `config.options[].key`
- 文件 `src/core/modules/workflow/nodes/control-nodes.ts` 无需改（review 不在此文件）
- human-review 的 `validateConfig`（`nodes/ai-nodes.ts`）：interaction='choose' 时校验 options ≥1 且 key 非空不重复

**验收步骤**：
1. `npx vitest run tests/unit/core/modules/workflow/graph-validator.spec.ts` —— 新增用例：choose 模式 review + options 两条 branch 边 → `valid=true`；review（默认 review 模式）带 branch 边 → `valid=false`（来源限制仍生效）；choose 声明了 option 但无对应出边 → `valid=false`
2. 手工：编辑器搭 `开始→审核(choose, 两选项)→两分支→结束`，点"校验"应通过；把 interaction 改回 review 再校验应报错

## P2（高）input 模式与 editableFields 白名单冲突 —— 用户输入被静默丢弃

**原因**：`applyReviewDecision`（`workflow-engine.service.ts`）的 editableFields 白名单会过滤未声明字段。input 模式前端提交 `editedValues.output_result`，该字段未在 editableFields 声明 → **被过滤，用户输入丢失**，下游拿到的是原文。spec §6 设计 input 模式时漏查了白名单机制。

**解决方案**：
- 文件 `src/core/modules/workflow/engine/workflow-engine.service.ts`，`applyReviewDecision` 内白名单构建处：
  ```typescript
  const editableKeys = new Set(...)
  // input 交互模式：输出字段天然可编辑（用户提交的文本就是产物）
  if ((node.config as { interaction?: string }).interaction === 'input') {
    editableKeys.add('output_result')
  }
  ```

**验收步骤**：
1. 新增引擎测试：input 模式挂起后 `resumeReview(decision='approve_with_changes', editedValues={output_result:'用户改的'})` → 断言 `nodeRun.output.output_result === '用户改的'`，且下游引用 `{{rev1.output_result}}` 拿到该值
2. 回归：review 模式未声明字段仍被过滤（既有用例不回归）

## P3（高→中）report 节点 docx 产物在 Web 端用户拿不到

**原因**：docx 落盘在**运行端**磁盘。Electron 端即用户本机没问题；Web 端文件在服务器，前端无下载通道（assets 路由不覆盖任意路径）。spec §7 未处理双端差异——违反"双端兼容开发原则"。output 放 base64 也不行（节点输出截断保护会破坏文件字节）。

**解决方案**：
- 节点行为不变（docx 落盘 + output 只存元信息）
- 文件 `src/renderer/src/views/workflow/WorkflowRunDetail.vue`：report 节点输出渲染 markdown 预览（output.markdown）+ "打印/导出 PDF"按钮（浏览器打印，双端可用）；Electron 端额外显示 filePath 并提供"打开所在文件夹"（仅 `isElectronRenderer()` 时显示）
- 文件 `src/shared/types/workflow-node-forms.ts`：report 的 format 字段 help 注明"docx 文件保存在运行本机（桌面端）；Web 端请用 markdown + 打印导出"

**验收步骤**：
1. Electron：跑 report(docx) 节点 → 运行详情显示文件路径且文件存在可打开
2. Web（`npm run dev:web` 如有 / 启 web server）：同一工作流跑 report(markdown) → 详情页可预览、点打印出 PDF
3. 单测：report handler 的 output 不含文件内容字节（只有 markdown/format/filePath）

## P4（中）kb-qa resultMaxLength 默认值会成为写死字面量

**原因**：spec §5 写"默认 8000"但未指定进 `WORKFLOW_DEFAULTS`——按字面量纪律（本轮专项收敛过），handler 里直接写 8000 即违规。

**解决方案**：
- `src/shared/types/workflow.types.ts`：`WORKFLOW_DEFAULTS` 增加 `kbQaContextMaxChars: 8_000`
- `src/core/modules/workflow/nodes/`（kb-qa handler）：`const max = cfg.resultMaxLength ?? WORKFLOW_DEFAULTS.kbQaContextMaxChars`
- catalog defaultConfig 同步引用该常量（defaultConfig 在 catalog 文件，import 常量即可）

**验收步骤**：
1. `grep -rn "8_000\|8000" src/core/modules/workflow/` 无业务性命中（迁移文件等无关项除外）
2. 单测：不配 resultMaxLength 时按 DEFAULTS 截断；临时改小 DEFAULTS 值测试截断点随之变化

## P5（中）maxNodeRuns 的重试计数语义未定义 —— 实现者易踩坑

**原因**：spec §3 只说"launchNode 入口自增"，未说明重试/审核恢复路径的计数行为。若实现者把计数放进 `runNode`（每次执行），重试 3 次会被计 4 次——配合默认 50 上限，高重试工作流会被**误杀**。

**解决方案**（语义定死）：
- 计数点唯一：`launchNode` 入口（`workflow-engine.service.ts`）。重试（`handleNodeFailure` 内联重跑）、审核恢复（`applyReviewDecision`）、续驱均**不经过** launchNode，天然单实例单计数
- 循环体每迭代是独立 launchNode → 每次计 1（与"按执行实例计数"一致）
- 续跑（resumeRun）创建新 RunExecution → 计数归零（新运行，合理）
- spec §3 补充上述语义说明

**验收步骤**：
1. 引擎测试：节点 retryCount=3 的重试图，运行成功后断言内部 runCounts 对该节点 === 1（通过行为间接断言：重试 50 次上限内不触发 maxNodeRuns=2 的误杀——设 maxNodeRuns=2 + retryCount=3，运行应成功）
2. 循环 3 迭代 + maxNodeRuns=2 → body 第二次执行时失败

## P6（中）vision 的 imageInput 三种形态未归一化

**原因**：`callVLM` 要求 `imageDataUrl`（data:image/...;base64,...）。用户在 imageInput 里可能填：本地绝对路径、http(s) URL、裸 base64。spec §10 未定义转换，直接传会失败。

**解决方案**：
- kb-qa/vision handler（`nodes/task-nodes.ts` 的 llm-chat execute）内加归一化函数：
  - `^data:` → 原样
  - `^https?://` → `fetch`（超时 30s）→ arrayBuffer → base64（MIME 取 Content-Type）
  - 绝对路径（`^[a-zA-Z]:[\\/]` 或 `/`）→ `fs.readFile` → 按扩展名推 MIME（png/jpg/jpeg/bmp/webp）
  - 其余 → 视为裸 base64，按前缀嗅探或默认 png
- 归一化函数放 `nodes/` 内并导出供测试

**验收步骤**：
1. 单测：mock fetch/fs，三种输入各自产出正确 dataUrl 前缀
2. 手工（Electron）：配一张本地图片路径跑 vision 模式，模型能描述图片内容

## P7（中）sys 保留字：遮蔽优先级与存量图兼容

**原因**：① 若用户节点 id 恰为 `sys`（复制粘贴可产生），resolver 特判放变量表之后则 sys 变量被遮蔽、放之前则用户节点输出永远取不到——必须定死优先级；② 新增"id 禁止 sys/start"校验会让**存量草稿图**再发布时报错，spec 未提迁移成本。

**解决方案**：
- `src/core/modules/workflow/engine/variable-resolver.ts`：`root === 'sys'` 特判放在 **variables/local 查找之前**（sys 不可遮蔽，与 start 同级处理）
- `graph-validator.ts`：节点 id ∈ {`sys`, `start`}（保留字常量，进 `workflow.types.ts`）→ 校验错误
- 存量图：一次性人工改 id（本机工具、量小），spec 附录记录该破坏性变更

**验收步骤**：
1. 单测：存在 id='sys' 的节点时 `{{sys.now}}` 仍返回系统时间
2. 校验器用例：id='sys' 的图 `valid=false` 且错误信息含保留字提示

## P8（中）start 参数 required 校验对 json/数组类型失真（既有缺陷顺带修）

**原因**：`workflow-run.service.ts` 现校验 `String(v).trim() === ''`：json 类型传 `{}` → `'[object Object]'` 恒非空 → **必填形同虚设**；multi select 空数组 `[]` → `''` 判缺失 ✓（碰巧正确）；数字 0 ✓。

**解决方案**：
- `startRun` 的 required 判定改类型感知：
  ```typescript
  const isEmptyInput = (v: unknown) =>
    v === undefined || v === null ||
    (typeof v === 'string' && v.trim() === '') ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && Object.keys(v).length === 0)
  ```

**验收步骤**：
1. 服务层测试：json 必填传 `{}` → 报缺失；multi select 传 `[]` → 报缺失；传 `0`/`false` → 通过

## P9（低）plan 片归属与 spec 不一致 —— A1 完成后出现无入口的中间态

**原因**：spec §4 含 inputs-list 编辑器改造（select 的 options 子编辑）；plan 把类型放 A1、编辑器放 A4——A1 提交后 select 类型存在但编辑器无法配置它。

**解决方案**：plan 调整——inputs-list 的 select 类型 + options 子编辑**随 A1**；A4 仅保留运行表单化 + 变量选择器。

**验收步骤**：A1 提交后在编辑器给 start 加一个 select 参数并配两个选项，保存草稿后 DB 中 config.inputs 含 options。

## P10（低）变量选择器的光标插入实现风险

**原因**：Element Plus 的 `el-input` 需经 ref 链拿原生 `textarea`（`selectionStart`），spec 未提；拿不到时若无兜底会插入失败。

**解决方案**：`FormFieldRenderer.vue` 中 ref 拿 ElInput 实例 → `(ref as any).textarea?.selectionStart`；取不到时**追加到值末尾**兜底。

**验收步骤**：组件测试两种路径（有/无原生 ref）均成功插入且不抛错。

## P11（低）模板 JSON 合法性无持续保障

**原因**：手写模板易踩新增校验（P1 的 choose 边、P7 保留字等），模板坏了要到用户使用时才发现。

**解决方案**：4 份模板纳入单测（`importDefinition(content)` 成功即结构合法）；编写流程定为"编辑器搭好 → 导出 → 放入 `renderer/src/assets/workflow-templates/`"。

**验收步骤**：`npx vitest run tests/unit/renderer/`（模板用例所在文件）4 份全部导入成功。

## P12（低）plan 缺用户可执行的验收步骤

**原因**：plan 每片只有一句"判据"，无操作序列，无法按步骤检查。

**解决方案**：plan 每片补"验收步骤"小节，格式统一为：前置 → 操作（页面/按钮级）→ 期望结果。验收步骤以本报告 P1-P11 各项的验收步骤为源，按片归并。

---

## 修正案汇总（对 spec/plan 的增量）

| Spec 章节 | 修正 |
|---|---|
| §3 | 补 P5 计数语义（launchNode 唯一计数点；重试/审核恢复不计；续跑归零） |
| §4 | inputs-list 编辑器随 A1（P9）；required 判定类型感知（P8） |
| §5 | resultMaxLength 进 WORKFLOW_DEFAULTS.kbQaContextMaxChars（P4） |
| §6 | 校验器放行 review-choose 的 branch 边 + options 声明校验（P1）；input 模式自动放行 output_result（P2）；IPC/preload 的 decision 类型加 choice |
| §7 | Web 端 docx 边界与前端导出方案（P3） |
| §8 | 光标插入兜底（P10） |
| §10 | imageInput 三形态归一化（P6） |
| §1 | sys 不可遮蔽优先级 + 保留字存量图迁移说明（P7） |
| §11 | 模板纳入单测 + 编写流程（P11） |
| Plan | 每片补验收步骤小节（P12）；A1/A4 归属调整（P9） |
