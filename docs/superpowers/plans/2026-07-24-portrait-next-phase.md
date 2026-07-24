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

### A1. 实测清单与执行

| # | 实测项 | 操作 | 通过标准 | 失败时的处置 |
|---|--------|------|----------|--------------|
| A1-1 | 万相编辑模式 prompt_extend | 带参考图生成一张，查主进程日志 | 日志 `prompt_extend: false`，prompt 未被改写 | 改 adapter 传参位置 |
| A1-2 | 万相 半身→全身 面容一致性 | 生成半身 → 生成全身对话框生成 | 全身图面部与半身肉眼可辨一致 | 强化 prompt / 检查参考图是否到达 provider（日志 ref_images） |
| A1-3 | 火山 Seedream 4.5 水印 | 生成一张 | 图无"AI生成"水印 | 检查 watermark 字段是否到达（日志 body） |
| A1-4 | 可灵端点连通性 | 选 kling/kling-v3-image-generation 生成 | 返回 taskId 且轮询出图 | 按官方文档核对端点/地域/异步头，修路由 |
| A1-5 | 可灵出图比例 | 选 9:16 竖版尺寸生成 | 出图为竖版（非默认 16:9） | 修 mapPixelsToKlingSize |
| A1-6 | 未登记模型报错 | 临时把一个未登记模型 id 填入生成 | UI 弹出"模型 X 未登记生成能力" | — |

### A2. 实测记录

- 结果记录到 `progress/2026-07-2x-portrait-provider-verification.md`（每項：操作/结果/截图或日志摘录/结论）
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

- [ ] **Step 1:** 分类侧栏（全部/面部/全身/发型服装/背景 + 内置/我的），数据走 `portrait.promptTemplate.list(category)`
- [ ] **Step 2:** TemplateCard：名称/分类/来源 tag/正文预览（截断 3 行）/操作按钮；**内置模板只读**（编辑/删除按钮禁用并 tooltip"内置模板不可修改"）
- [ ] **Step 3:** 复制到剪贴板（navigator.clipboard）；套用 → 提示"请到生成/编辑面板使用"（本阶段不做跨页套用）
- [ ] **Step 4:** TemplateEditDialog：表单 + 校验（名称必填、分类必选、正文必填、applyTo 多选）；新建/更新走 `promptTemplate.save`；删除走 `promptTemplate.delete` + 确认框
- [ ] **Step 5:** 新建/编辑/删除后刷新列表；样式全 token（复用 workbench-card.scss mixin）
- [ ] **Step 6:** `npm run lint` 0 error；Commit `feat(portrait-ui): 模板库管理界面（分类/预览/新建/编辑/删除）`

### B3. 占位符提示

- [ ] 编辑对话框内固定展示占位符说明卡：`{name} {gender} {age}` 会在套用时替换为角色信息

---

## Phase C：皮肤机制 P1（≈1 天，按皮肤方案 P1 执行）

> 目标：`data-skin` 双皮肤（classic/modern）切换机制落地，人像模块为首个试点。
> 严格按 `docs/design/theme-skin-system-design.md` §4 P1-P2 执行。

### C1. 结构 token 双皮肤定义

**Files:**
- Modify: `src/renderer/src/styles/index.scss`
- Modify: `src/renderer/src/styles/element-plus.scss`

- [ ] **Step 1:** `:root`（=classic 现状值）与 `[data-skin="modern"]` 两套结构 token（侧栏系列/阴影尺度/动效开关），值取皮肤方案 D3
- [ ] **Step 2:** `element-plus.scss` 加 `[data-skin="modern"]` 覆盖块（EP 圆角变量 + 关闭经典 hover 动效）

### C2. useSkin + 设置入口

**Files:**
- Create: `src/renderer/src/composables/useSkin.ts`
- Modify: 设置页主题区（加"界面皮肤：经典/现代"选项）

- [ ] **Step 1:** `useSkin.ts`：`data-skin` 切换 + `settings.get/set('skin')` 持久化（复用 useTheme 模式）
- [ ] **Step 2:** 设置页加皮肤选择（与颜色主题正交）
- [ ] **Step 3:** 人像工作台在两种皮肤下目视验收；经典皮肤逐像素无变化
- [ ] **Step 4:** Commit `feat(theme): data-skin 双皮肤机制（P1，人像模块试点）`

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
| A | 真机实测与修补 | ≈1 天 |
| B | 模板库管理 UI | ≈1.5 天 |
| C | 皮肤机制 P1 | ≈1 天 |
| D | 旧组件清理 | ≈0.5 天 |
| **合计** | | **≈4 天** |
