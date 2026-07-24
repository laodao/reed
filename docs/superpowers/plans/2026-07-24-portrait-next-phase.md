# 人像模块下一阶段增量开发计划

> 状态：待评审
> 日期：2026-07-24
> 前置：新版人像设计 M1-M4 已交付（`docs/superpowers/plans/2026-07-24-portrait-redesign.md`）、
> Provider 能力治理已交付（`docs/design/image-provider-capability-model-design.md`）

## 0. 现状基线

**已交付**：
- 人像工作台全链路（framing 半身/全身、修改面部 editFace、生成全身 generateFullBody、
  模板系统后端、IPC、token 驱动 UI）
- Provider 能力模型（注册表/未登记报错/可灵端点+参数集修正/火山水印/万相 promptExtend）

**遗留主线**（本计划覆盖）：

| 主线 | 出处 | 价值 |
|------|------|------|
| A. 真机实测与链路验证 | 能力治理 Task 6 未做的人工环节 | 堵住"按文档实现但未经真机验证"的最大风险 |
| B. 模板库管理 UI | spec §6.1 组件表中的 TemplateLibrary，后端已通 | 用户可自建/编辑模板，模板系统闭环 |
| C. 皮肤机制 P1 | `docs/design/theme-skin-system-design.md` | 人像模块已 token 就绪，做首个双皮肤试点 |
| D. 旧组件清理 | spec §6.1「新版稳定后清理」 | 删除旧 CharacterEditor 系列，消除双套并存 |

**执行顺序理由**：A 先行（最便宜，且实测暴露的问题会影响后续排期）→ B（用户价值最高）→ C（独立基建，不与 A/B 冲突）→ D（最后，确保新版稳定再删）。

---

## Phase A：真机实测与链路验证（≈1 天，人工 + 修补）

> 目标：用真实 key 把三条核心链路各跑通一次，发现问题当场修。
> 分工：用户配好真实 key（可灵需华北2北京地域）并执行生成/目检；agent 负责日志断言、定位、修复、补测。

### A0. 先行修复（review 发现的实锤缺陷，实测前必须做）

| # | 缺陷 | 说明 | 修复 |
|---|------|------|------|
| A0-1 | **native 路径未传 prompt_extend** | Task 3 只在 multimodal 路径（qwen-image）传了 prompt_extend；wan2.5/2.6-image-edit 走 native（image-synthesis）路径，`buildNativeRequestBody` 未传 → 官方默认 true → **带参考图生成时一致性 prompt 仍会被 LLM 改写** | `buildNativeRequestBody` 加 `body.parameters.prompt_extend = request.promptExtend ?? true` + 单测（同 multimodal 两例） |
| A0-2 | **可灵参考图可能只接受 URL** | 官方文档：可灵参考图为 URL（JPEG/PNG，≤10MB）；当前链路全用 base64 data URL。火山 image 字段官方明确支持 Base64；万相 ref_images 待实测 | A1-4 实测含此验证；若可灵拒绝 data URL，预案：参考图先落盘为本地文件再经 asset URL/OSS 提供 http URL（不动本次架构，先记录结论） |

- [ ] **A0-1 修复 + 单测**：native 路径 prompt_extend 缺省 true / 显式 false 各一例
- [ ] Commit `fix(image): native 路径补传 prompt_extend（review A0-1）`

### A1. 实测清单与执行

| # | 实测项 | 操作 | 通过标准 | 失败时的处置 |
|---|--------|------|----------|--------------|
| A1-1 | 万相编辑模式 prompt_extend | qwen-image 与 wan2.5/2.6-image-edit 各带参考图生成一张，查主进程日志 | 两条路径日志都显示 `prompt_extend: false`，prompt 未被改写 | 依 A0-1 修复情况复查 |
| A1-2 | 万相 半身→全身 面容一致性 | 生成半身 → 生成全身对话框生成 | 全身图面部与半身肉眼可辨一致（机器初筛 + 人工拍板） | 强化 prompt / 检查参考图是否到达 provider（日志 ref_images） |
| A1-3 | 火山 Seedream 4.5 水印 | 生成一张 | 图无"AI生成"水印 | 检查 watermark 字段是否到达（日志 body） |
| A1-4 | 可灵端点连通性 + 参考图形态 | 选 kling/kling-v3-image-generation，无参考图生成一张 + 带 base64 参考图生成一张 | 无参考图：返回 taskId 且轮询出图；带参考图：记录上游是否接受 data URL | 按官方文档核对端点/地域/异步头修路由；data URL 被拒则走 A0-2 预案 |
| A1-5 | 可灵出图比例 | 选 9:16 竖版尺寸生成 | 出图为竖版（非默认 16:9） | 修 mapPixelsToKlingSize |
| A1-6 | 未登记模型报错 | 在 provider 配置里加一个未登记模型 id 并选其生成 | UI 弹出"模型 X 未登记生成能力"（含登记指引） | — |

### A2. 实测记录

- 结果记录到 `progress/2026-07-2x-portrait-provider-verification.md`，模板：每项 = 操作 / 期望 / 实际（日志或截图摘录）/ 结论（通过|修复后通过|遗留）
- 每个失败项 → 当场定位修复 + 补/改单测，修复单独成 commit

---

## Phase B：模板库管理 UI（≈1.5 天，TDD）

> 目标：模板系统用户闭环。后端已就绪（list/apply/save/delete + seeder + IPC），只做前端与入口。
> 视觉以原型 `docs/ui-prototypes/portrait-design/templates.html` 为准。

### B1. 路由与入口

**Files:**
- Create: `src/renderer/src/views/PortraitTemplates.vue`
- Modify: `src/renderer/src/router/index.ts`（加 `/portrait-templates` 路由）
- Modify: `src/renderer/src/views/Portrait.vue`（头部加"模板库"入口按钮）
- Modify: `src/renderer/src/components/portrait/workbench/PortraitWorkbench.vue`（头部加模板库入口）

- [ ] **Step 1:** 路由 `/portrait-templates` 懒加载 `PortraitTemplates.vue`
- [ ] **Step 2:** Portrait.vue 项目列表头部 + 工作台头部各加入口（`el-button` → `router.push`）
- [ ] **Step 3:** Commit `feat(portrait-ui): 模板库路由与入口`

### B2. TemplateLibrary 视图

**Files:**
- Create: `src/renderer/src/components/portrait/templates/TemplateLibrary.vue`（分类侧栏 + 卡片网格）
- Create: `src/renderer/src/components/portrait/templates/TemplateCard.vue`（预览/复制/套用/编辑/删除）
- Create: `src/renderer/src/components/portrait/templates/TemplateEditDialog.vue`（新建/编辑：名称/分类/适用场景/正文/占位符说明）

- [ ] **Step 1:** 分类侧栏（全部/面部/全身/发型服装/背景 + 内置/我的）；**先一次性 `list()` 拉全量，客户端分组计数**（避免逐分类多次 IPC）
- [ ] **Step 2:** TemplateCard：名称/分类/来源 tag/正文预览（截断 3 行）/操作按钮；**内置模板只读**（编辑/删除按钮禁用并 tooltip"内置模板不可修改"）
- [ ] **Step 3:** 复制提示词——**剪贴板 fallback 链**：`navigator.clipboard?.writeText` → `document.execCommand('copy')`（textarea 临时节点）。**review 注：Electron 生产环境 file:// 下 navigator.clipboard 可能为 undefined，必须有兜底**
- [ ] **Step 4:** TemplateEditDialog：表单 + 校验（名称必填、分类必选、正文必填、applyTo 多选）；新建/更新走 `promptTemplate.save`；删除走 `promptTemplate.delete` + 确认框
- [ ] **Step 5:** 新建/编辑/删除后刷新列表；样式全 token（复用 workbench-card.scss mixin）；**页头含返回按钮**（router.back）
- [ ] **Step 6:** `npm run lint` 0 error；Commit `feat(portrait-ui): 模板库管理界面（分类/预览/新建/编辑/删除）`

### B3. 占位符提示

- [ ] 编辑对话框内固定展示占位符说明卡：`{name} {gender} {age}` 会在套用时替换为角色信息

---

## Phase C：皮肤机制（≈1.5 天，按皮肤方案 P1+P2 执行）

> 目标：`data-skin` 双皮肤（classic/modern）切换机制落地，人像模块为首个试点。
> 严格按 `docs/design/theme-skin-system-design.md` §4 P1-P2 执行。
> **review 修正：原计划只做 P1（token+EP），但 MainLayout 侧栏未 token 化，
> 深色侧栏恰是现代皮肤最大视觉差异点——必须含 P2，否则 modern 皮肤几乎无感。**

### C1. 结构 token 双皮肤定义

**Files:**
- Modify: `src/renderer/src/styles/index.scss`
- Modify: `src/renderer/src/styles/element-plus.scss`

- [ ] **Step 1:** `:root`（=classic 现状值）与 `[data-skin="modern"]` 两套结构 token（侧栏系列/阴影尺度/动效开关），值取皮肤方案 D3
- [ ] **Step 2:** `element-plus.scss` 加 `[data-skin="modern"]` 覆盖块（EP 圆角变量 + 关闭经典 hover 动效）

### C2. MainLayout 侧栏 token 化（皮肤方案 P2）

**Files:**
- Modify: `src/renderer/src/layouts/MainLayout.vue`

- [ ] **Step 1:** 侧栏背景/文字/菜单项 hover/active/logo 区样式全部改走 `--sidebar-*` token（classic = 现有主题渐变表现，modern = 深色纯色 + 左侧指示条）
- [ ] **Step 2:** classic 皮肤下逐像素对比（见 C4 验证手段）

### C3. useSkin + 设置入口

**Files:**
- Create: `src/renderer/src/composables/useSkin.ts`
- Modify: 设置页主题区所在文件（实施时先定位 Settings 视图中主题选择的位置）

- [ ] **Step 1:** `useSkin.ts`：`data-skin` 切换 + `settings.get/set('skin')` 持久化（复用 useTheme 模式）
- [ ] **Step 2:** 设置页加"界面皮肤：经典/现代"选择（与颜色主题正交）
- [ ] **Step 3:** Commit `feat(theme): data-skin 双皮肤机制（P1+P2，人像模块试点）`

### C4. 回归验证手段（review 补充，机械化）

- [ ] 改造前对关键页面（人像工作台/对话页/设置页）在 classic 皮肤下截图存档；改造后同页面同皮肤截图，人工比对零差异（或写像素对比脚本）
- [ ] modern 皮肤下人像工作台目视验收（token 驱动组件应整体符合原型观感）

---

## Phase D：旧组件清理（≈0.5 天）

> 前置：Phase A 实测通过 + 新版工作台稳定使用。

- [ ] **Step 1:** 全局搜索确认无引用后删除：
  - `src/renderer/src/components/portrait/CharacterEditor.vue`
  - `src/renderer/src/components/portrait/ChangeClothesDialog.vue`
  - `src/renderer/src/components/portrait/ChangeBackgroundDialog.vue`
  - `src/renderer/src/components/portrait/GenerateAnglesDialog.vue`
  - `src/renderer/src/components/portrait/PortraitGenerator.vue`
  - 保留：`ExportDialog.vue`（新版复用）、`CreateCharacterDialog.vue` / `EditCharacterDialog.vue`（列表页在用）、`SizeSelector.vue`（先 grep 确认无引用再删）
- [ ] **Step 2:** `npm run lint` + `npm run dev` 启动验证 + 人像模块全流程手测一遍
- [ ] **Step 3:** Commit `chore(portrait): 移除旧版人像编辑器组件（已被 workbench 取代）`

---

## 验收标准

| # | 标准 |
|---|------|
| 1 | Phase A 六项实测全部有结论记录；失败项均已修复并补单测 |
| 2 | 模板库可新建/编辑/删除自定义模板，内置模板只读；工作台 TemplatePicker 能套用到新模板 |
| 3 | 设置页可切换经典/现代皮肤，重启保持；经典皮肤视觉零回归 |
| 4 | 旧组件删除后 lint 0 error、人像全流程正常 |
| 5 | 全程测试保持全绿（当前基线 64 例） |

## 工作量汇总

| Phase | 内容 | 工作量 |
|-------|------|--------|
| A | 先行修复 A0（native prompt_extend）+ 真机实测与修补 | ≈1 天 |
| B | 模板库管理 UI | ≈1.5 天 |
| C | 皮肤机制 P1+P2（含 MainLayout 侧栏 token 化） | ≈1.5 天 |
| D | 旧组件清理 | ≈0.5 天 |
| **合计** | | **≈4.5 天** |

---

## Review 修订记录（2026-07-24 深度 review）

1. **A0-1（真缺陷）**：Task 3 只在 multimodal 路径传 prompt_extend；wan2.5/2.6-image-edit 走的 native（image-synthesis）路径未传 → 官方默认 true，参考图一致性 prompt 仍会被改写。列为实测前先行修复。
2. **A0-2（风险预案）**：可灵官方参考图为 URL，当前链路全用 base64 data URL，上游可能拒绝；A1-4 实测显式验证，被拒则走"落盘+http URL"预案。
3. **Phase C 范围修正**：只做 P1 则 modern 皮肤几乎无感（MainLayout 侧栏未 token 化，而深色侧栏是最大差异点）→ 扩为 P1+P2，工时 1d→1.5d，并补 C4 机械化回归验证（改造前后截图比对）。
4. **B2 剪贴板**：Electron file:// 下 navigator.clipboard 可能为 undefined → 强制 fallback 链。
5. **B 细节**：分类计数改为全量拉取客户端分组（避免多次 IPC）；补页头返回按钮；C3 设置页文件需实施时先定位。
6. **A1-1 验证口径**：从单模型改为 qwen-image + wan2.5/2.6-image-edit 双路径各验一次。
