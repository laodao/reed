# 人像模块下一阶段增量开发计划（v2 · 深度完善版）

> 状态：待评审
> 日期：2026-07-24（v2 深度完善：覆盖 / 粒度 / 验收量化）
> 前置：新版人像设计 M1-M4 已交付（`docs/superpowers/plans/2026-07-24-portrait-redesign.md`）、
> Provider 能力治理已交付（`docs/design/image-provider-capability-model-design.md`）、
> 本计划 v1 及深度 review 修订已合并

## 0. 现状基线

**已交付**：
- 人像工作台全链路（framing 半身/全身、editFace、generateFullBody、模板系统后端、IPC、token 驱动 UI）
- Provider 能力模型（注册表/未登记报错/可灵端点+参数集修正/火山水印/万相 promptExtend）
- 测试基线：**64 例全绿**（image-providers 22 + services 42），全程不得破

## 1. 范围与边界

### 本期做（4 条主线）

| 主线 | 内容 |
|------|------|
| A | 先行修复 A0 + 真机实测与链路验证（9 项） |
| B | 模板库管理 UI |
| C | 皮肤机制 P1+P2（含 MainLayout 侧栏 token 化） |
| D | 旧组件清理 |

### 本期明确不做（边界，防误读为遗漏）

| 项 | 原因 | 何时做 |
|----|------|--------|
| 皮肤方案 P3（全应用 184 组件 QA sweep） | 皮肤方案排期在本期试点验收之后 | C 验收通过后另行排期 |
| Web 端人像模块（Controller/前端） | spec 2026-07-24 §2 明确非目标；web-server 本无人像模块 | 产品决定后立项 |
| 组图能力（sequentialGeneration） | 人像场景不需要 | 有场景再议 |
| 模板库跨页直接套用（库内一键套用到当前角色） | 涉及跨页状态，B 阶段改为回到面板使用 | 后续迭代 |
| strength 落地 | 三家官方 API 均无此参数（研究报告实证） | 官方支持后再议 |

## 2. 执行约定（全程适用）

1. **TDD**：后端改动先写失败测试；前端以 lint 0 error + 手动走查验收
2. **进度记录（CLAUDE.md 铁律）**：每个 Phase 完成即更新 `progress/2026-07-24-portrait-redesign-dev.md`（追加小节：改动点 / 验证结果 / 遗留）
3. **commit 规范**：每个任务一个 commit，中文 message，格式 `type(scope): 主题`
4. **测试基线**：64 例全程保持全绿；新增功能必须带新测试（后端）
5. **不隐瞒原则**：任何"按文档实现但未真机验证"的项，必须在验收矩阵中标注验证状态

---

## Phase A：先行修复 + 真机实测（≈1 天）

> 分工：agent 负责 A0 修复、日志断言、定位修复、补测；用户负责配真实 key（可灵需华北2北京地域）并执行生成与目检拍板。

### A0. 先行修复（review 发现的实锤缺陷，实测前必做）

**缺陷**：Task 3 只在 multimodal 路径传了 `prompt_extend`；wan2.5/2.6-image-edit 走的 native（image-synthesis）路径未传 → 官方默认 true → 参考图一致性 prompt 仍被改写。

**Files:** Modify `src/core/image-providers/dashscope-image.provider.ts`（`buildNativeRequestBody`）；Test `tests/unit/image-providers/volcengine-dashscope-params.spec.ts`

- [ ] **Step 1: 写失败测试**（追加到 volcengine-dashscope-params.spec.ts）

```ts
it('native 路径：promptExtend=false 时写入 prompt_extend: false', async () => {
  const calls = mockFetchCapture({ output: { task_id: 't1', task_status: 'PENDING' } })
  const provider = makeProvider()
  await provider.generateImage({
    model: 'wan2.6-image', prompt: 'same person', width: 768, height: 1024,
    promptExtend: false,
  } as ImageGenerationRequest)
  const body = JSON.parse(calls[0].init.body as string)
  expect(body.parameters.prompt_extend).toBe(false)
})

it('native 路径：缺省写入 prompt_extend: true（保现状）', async () => {
  const calls = mockFetchCapture({ output: { task_id: 't1', task_status: 'PENDING' } })
  const provider = makeProvider()
  await provider.generateImage({
    model: 'wan2.6-image', prompt: 'a cat', width: 768, height: 1024,
  } as ImageGenerationRequest)
  const body = JSON.parse(calls[0].init.body as string)
  expect(body.parameters.prompt_extend).toBe(true)
})
```

- [ ] **Step 2: 运行确认失败**
Run: `npx vitest run tests/unit/image-providers/volcengine-dashscope-params.spec.ts`
Expected: 新增 2 例 FAIL（prompt_extend undefined）

- [ ] **Step 3: 实现**（`buildNativeRequestBody` 的 parameters 块追加）

```ts
// design §5.3 + plan A0-1：native 路径同 multimodal 透传 prompt_extend
// 缺省 = 官方默认 true（保现状）；人像一致性场景由 service 显式传 false
body.parameters.prompt_extend = request.promptExtend ?? true
```

- [ ] **Step 4: 运行确认通过 + 全量回归**
Run: `npx vitest run tests/unit/image-providers/ tests/unit/services/`
Expected: image-providers 24 例全绿；services 42 例全绿（knowledge-base / voice-clone 两个预存环境问题文件除外）

- [ ] **Step 5: Commit**
```bash
git add src/core/image-providers/dashscope-image.provider.ts tests/unit/image-providers/volcengine-dashscope-params.spec.ts
git commit -m "fix(image): native(image-synthesis) 路径补传 prompt_extend（plan A0-1）"
```

### A1. 真机实测清单（9 项）

> 每项注明：操作 / 通过线（量化）/ 失败处置。
> 执行入口：应用内人像工作台 + 主进程日志（dev 控制台输出）。

| # | 实测项 | 操作 | 通过线 | 失败处置 |
|---|--------|------|--------|----------|
| A1-1 | 双路径 prompt_extend | qwen-image（multimodal 路径）带参考图生成 1 张；wan2.6-image（native 路径）带参考图生成 1 张 | 主进程日志两个请求体均含 `"prompt_extend":false` | 按 A0-1 复查传参位置 |
| A1-2 | 半身→全身面容一致性 | 生成半身 → 全身对话框生成 | **清单式目检：发型发色 / 脸型轮廓 / 眼型 / 眉形 / 显著特征（痣疤等）5 项中 ≥4 项一致**；不满足记失败 | 查日志确认参考图到达 provider（`ref_images`/`image` 字段非空）；到达但仍不像 → 加强 prompt 一致性措辞 |
| A1-3 | 火山水印 | Seedream 4.5 生成 1 张 | 目检图无"AI生成"水印 且 日志 body 含 `"watermark":false` | 查 adapter body 组装 |
| A1-4 | 可灵端点连通 | kling/kling-v3-image-generation 无参考图生成 | 返回 taskId 且轮询 ≤60s 出图 | 核对端点/地域/异步头；修路由 |
| A1-5 | 可灵 base64 参考图 | 带 1 张 base64 参考图生成 | 记录上游接受与否：接受=通过；拒绝=记录错误原文并启用 A0-2 预案（落盘 http URL） | 预案另立任务 |
| A1-6 | 可灵出图比例 | 选 1080×1920（9:16）生成 | 出图实际为竖版（非默认 16:9） | 修 mapPixelsToKlingSize |
| A1-7 | 可灵负面词并入效果 | prompt 含明显元素 + 负面词写该元素（如"不要红色"）生成 | 目检图中该元素被抑制（记录 是/部分/否） | 调整 KLING_NEGATIVE_JOINER 措辞 |
| A1-8 | wan2.6-image 端点归属 | 用 wan2.6-image 走 native 路径生成 1 张 | 成功出图 = 当前路由正确；报错（如 model not supported on endpoint）→ 改入 multimodal 路由 | 改 isMultimodalImageModel 覆盖 wan2.6-image + 单测 |
| A1-9 | 未登记模型报错 | provider 配置加未登记模型 id 并选其生成 | UI 弹出"模型 X 未登记生成能力…model-capabilities.ts" | — |

### A2. 实测记录模板

写入 `progress/2026-07-2x-portrait-provider-verification.md`，每项按此格式：

```
### A1-x 项目名
- 操作：（模型 / 参数 / 步骤）
- 期望：（通过线）
- 实际：（日志摘录 / 截图路径 / 出图描述）
- 结论：通过 | 修复后通过（commit hash）| 遗留（原因+后续任务）
```

---

## Phase B：模板库管理 UI（≈1.5 天）

> 视觉以原型 `docs/ui-prototypes/portrait-design/templates.html` 为准；样式复用 `workbench-card.scss` mixin，零硬编码。

### B1. 路由与入口

**Files:**
- Create `src/renderer/src/views/PortraitTemplates.vue`
- Modify `src/renderer/src/router/index.ts`
- Modify `src/renderer/src/views/Portrait.vue`（项目列表头部）
- Modify `src/renderer/src/components/portrait/workbench/PortraitWorkbench.vue`（工作台头部）

- [ ] **Step 1:** 路由（懒加载）：

```ts
{
  path: '/portrait-templates',
  name: 'PortraitTemplates',
  component: () => import('@/views/PortraitTemplates.vue'),
  meta: { title: '提示词模板库' }
}
```

- [ ] **Step 2:** PortraitTemplates.vue 骨架：页头（返回按钮 `router.back()` + 标题 + 搜索框 + 新建按钮）+ `<TemplateLibrary />`
- [ ] **Step 3:** Portrait.vue 头部"模板库"按钮（在"新建"左侧，`router.push('/portrait-templates')`）；PortraitWorkbench 头部 wb-actions 加同款
- [ ] **Step 4:** Commit `feat(portrait-ui): 模板库路由与入口`

### B2. TemplateLibrary（分类侧栏 + 卡片网格）

**Files:**
- Create `src/renderer/src/components/portrait/templates/TemplateLibrary.vue`
- Create `src/renderer/src/components/portrait/templates/TemplateCard.vue`

**组件接口：**

```ts
// TemplateLibrary.vue
state: {
  templates: PortraitPromptTemplate[]      // 一次性全量拉取，客户端分组（避免多次 IPC）
  activeCategory: 'all' | PromptTemplateCategory
  activeSource: 'all' | 'builtin' | 'custom'
  keyword: string
  loading: boolean
  editing: PortraitPromptTemplate | null   // null=新建 / 对象=编辑
  showEditDialog: boolean
}
computed: {
  filtered(): 按 category + source + keyword 过滤
  counts(): { all, face, body, clothing, background, builtin, custom }
}
methods: {
  loadAll(): portrait.promptTemplate.list()（无参全量）
  onEdit(tpl) / onDelete(tpl) / onSaved(): 刷新
}

// TemplateCard.vue
props: { template: PortraitPromptTemplate }
emits: {
  preview: [template]     // 展开完整内容（el-dialog 只读展示）
  copy: [template]        // 复制提示词（见 B4 剪贴板 fallback 链）
  edit: [template]        // 内置时禁用 + tooltip '内置模板不可修改'
  delete: [template]      // 内置时禁用 + tooltip
}
```

- [ ] **Step 1:** TemplateCard：名称/分类标签/来源标签（内置=紫，自定义=灰）/正文截断 3 行/操作按钮组
- [ ] **Step 2:** TemplateLibrary：分类侧栏（计数徽标）+ 卡片网格 + 空状态；加载走 loadAll
- [ ] **Step 3:** 预览 dialog（只读完整内容）+ 删除确认（ElMessageBox）
- [ ] **Step 4:** Commit `feat(portrait-ui): 模板库分类浏览与卡片操作`

### B3. TemplateEditDialog（新建/编辑）

**Files:** Create `src/renderer/src/components/portrait/templates/TemplateEditDialog.vue`

**组件接口：**

```ts
props: {
  modelValue: boolean
  template?: PortraitPromptTemplate   // 不传=新建；传=编辑
}
emits: {
  'update:modelValue': [boolean]
  saved: []                            // 父级刷新
}
form: {
  name: string          // 必填
  category: PromptTemplateCategory  // 必选
  applyTo: PortraitGenerationScene[] // 至少选 1
  content: string       // 必填；占位符说明卡固定展示：{name} {gender} {age}
}
submit: 新建 → promptTemplate.save({...form}); 编辑 → save({id, ...form})
```

- [ ] **Step 1:** 表单 + 校验（名称必填/分类必选/正文必填/applyTo ≥1）
- [ ] **Step 2:** 提交后 emit saved，父级刷新列表并关闭
- [ ] **Step 3:** Commit `feat(portrait-ui): 模板新建/编辑对话框`

### B4. 剪贴板 fallback 链（review 修正）

Electron 生产 file:// 下 `navigator.clipboard` 可能为 undefined：

```ts
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fallthrough */ }
  // fallback：临时 textarea + execCommand
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(ta)
  return ok
}
```

### B5. 模板库 → TemplatePicker 联动时序（review 修正）

**问题**：模板库新建模板后，工作台各面板的 TemplatePicker 已加载的列表是旧的。

**约定**（简单可靠，不做跨页状态）：TemplatePicker 在**每次所在面板/对话框打开时重新加载**——
- 生成面板 / 编辑面板：所在视图 onMounted 已加载；新增：`watch(() => props.character?.id, reload)`
- 各对话框（Regenerate/Clothes/Background/GenerateFullBody）：`watch(() => props.modelValue, open => open && reload())`
- 模板库页返回工作台后，由路由切回触发面板重挂载或上述 watch 生效

- [ ] TemplatePicker 已有 `defineExpose({ reload })`；各宿主按上表接线
- [ ] Commit `feat(portrait-ui): TemplatePicker 打开时重载模板列表`

---

## Phase C：皮肤机制 P1+P2（≈1.5 天）

> 按 `docs/design/theme-skin-system-design.md` §4 P1-P2 与 §5 D1-D6 执行；token 值直接取该文档 D3 表，不另造。

### C1. 结构 token 双皮肤定义

**Files:** Modify `src/renderer/src/styles/index.scss`、`src/renderer/src/styles/element-plus.scss`

- [ ] **Step 1:** index.scss：`:root`（=classic 现状值）+ `[data-skin="modern"]` 两套结构 token（--sidebar-bg/--sidebar-text/--sidebar-item-active-bg/--shadow-*/--card-hover-transform），值取皮肤方案 D3
- [ ] **Step 2:** element-plus.scss：`[data-skin="modern"]` 覆盖块（--el-border-radius-base 等 + 关闭经典 hover 动效选择器 gate）

### C2. MainLayout 侧栏 token 化（P2）

**Files:** Modify `src/renderer/src/layouts/MainLayout.vue`

- [ ] **Step 1:** 侧栏背景 / 文字色 / 菜单项 hover/active / logo 区样式全部改走 `--sidebar-*` token；classic 下视觉与现状一致（token 值=现值）
- [ ] **Step 2:** modern 下为深色纯色 + 左侧激活指示条（皮肤方案 D3）

### C3. useSkin + 设置入口

**Files:** Create `src/renderer/src/composables/useSkin.ts`；Modify 设置页主题区（实施第一步先 grep 定位主题选择 UI 所在文件）

**useSkin 接口（复刻 useTheme 模式）：**

```ts
export type SkinId = 'classic' | 'modern'

export function useSkin() {
  const currentSkin = ref<SkinId>('classic')

  function applySkin(skin: SkinId) {
    document.documentElement.setAttribute('data-skin', skin)
  }
  async function setSkin(skin: SkinId) {
    currentSkin.value = skin
    applySkin(skin)
    await window.electronAPI.settings.set('skin', skin)
  }
  async function loadSkin() {
    const r = await window.electronAPI.settings.get('skin')
    const skin: SkinId = (r.success && r.data === 'modern') ? 'modern' : 'classic'
    currentSkin.value = skin
    applySkin(skin)
  }
  onMounted(loadSkin)
  return { currentSkin, setSkin }
}
```

- [ ] **Step 1:** useSkin.ts 实现 + App 级生效（MainLayout 内调用）
- [ ] **Step 2:** 设置页加"界面皮肤：经典 / 现代"（与颜色主题正交，不联动）
- [ ] **Step 3:** Commit `feat(theme): data-skin 双皮肤机制（P1+P2，人像模块试点）`

### C4. 回归验证（机械化流程）

- [ ] **改造前**：在 main 分支或改造前 commit 启动应用，对 人像工作台 / 项目列表 / 对话页 各截 1 张 classic 截图，存 `progress/screenshots/before-skin/`
- [ ] **改造后**：classic 皮肤下同页面截图存 `progress/screenshots/after-skin/`，人工比对零差异（差异处必须能解释原因，否则视为回归修复）
- [ ] modern 皮肤下人像工作台目视验收（对照原型观感）；颜色主题 × 皮肤 4 组合抽查不破坏布局

---

## Phase D：旧组件清理（≈0.5 天）

> 前置：Phase A 实测通过（A1-1 ~ A1-9 全部有结论）。

### D1. 引用清查（先查后删，候选清单）

- [ ] **Step 1:** 逐个 grep 确认引用方（命令 + 预期）：

```bash
grep -rn "CharacterEditor" src/renderer/src --include="*.vue" --include="*.ts"      # 预期：无（Portrait.vue 已换 PortraitWorkbench）
grep -rn "ChangeClothesDialog\|ChangeBackgroundDialog\|GenerateAnglesDialog" src/renderer/src # 预期：仅文件自身
grep -rn "PortraitGenerator" src/renderer/src                                       # 预期：仅文件自身
grep -rn "SizeSelector" src/renderer/src                                            # 预期：旧 CharacterEditor + 待确认的 EditCharacterDialog
```

### D2. 删除与验证

- [ ] **Step 1:** 删除（在 Step 1 全部"仅自身/无引用"后）：
  `CharacterEditor.vue` / `ChangeClothesDialog.vue` / `ChangeBackgroundDialog.vue` / `GenerateAnglesDialog.vue` / `PortraitGenerator.vue`；
  `SizeSelector.vue` 仅在确认 EditCharacterDialog 等无引用后删除，有引用则保留并记录
- [ ] **Step 2:** 保留清单（不动）：`ExportDialog.vue`（新版复用）、`CreateCharacterDialog.vue` / `EditCharacterDialog.vue`（列表页在用）
- [ ] **Step 3:** `npm run lint` 0 error + `npm run dev` 启动 + 人像全流程手测（列表→角色→生成→编辑→弹窗→套图→导出）
- [ ] **Step 4:** Commit `chore(portrait): 移除旧版人像编辑器组件（已被 workbench 取代）`

---

## 3. 验收矩阵（每项：验证方法 / 通过线 / 执行者 / 记录位置）

| # | 验收项 | 验证方法 | 通过线 | 执行者 | 记录 |
|---|--------|----------|--------|--------|------|
| V1 | A0-1 修复 | 单测 2 例 | 全绿 | agent | commit message |
| V2 | A1-1 双路径 prompt_extend | 主进程日志 grep | 两请求体均含 `prompt_extend:false` | agent 查日志 | verification.md |
| V3 | A1-2 面容一致性 | 清单式目检（5 特征项） | ≥4/5 项一致 | **用户拍板** | verification.md |
| V4 | A1-3 水印 | 目检 + 日志 | 无水印 且 body.watermark=false | agent+用户 | verification.md |
| V5 | A1-4 可灵连通 | taskId + 轮询出图 | ≤60s 出图 | 用户执行 agent 看日志 | verification.md |
| V6 | A1-5 可灵 base64 参考图 | 上游响应 | 明确 接受/拒绝 + 证据 | agent | verification.md |
| V7 | A1-6 可灵比例 | 出图目检 | 竖版 | 用户 | verification.md |
| V8 | A1-7 可灵负面词 | 目检元素抑制 | 是/部分/否 有结论 | 用户 | verification.md |
| V9 | A1-8 wan2.6 端点 | 生成成败 | 成功 或 改路由后成功 | agent | verification.md |
| V10 | A1-9 未登记报错 | UI 弹错 | 含模型 id + 登记指引 | agent | verification.md |
| V11 | B 模板库功能 | 走查：新建/编辑/删除/内置只读/复制 | 全通过 + lint 0 error | agent | progress |
| V12 | B 联动时序 | 库内新建 → 回工作台打开对话框 | 新模板出现在下拉 | agent | progress |
| V13 | C classic 零回归 | 改造前后截图比对 | 零差异或可解释 | agent+用户抽看 | progress/screenshots |
| V14 | C modern 观感 | 对照原型 | 用户认可 | **用户拍板** | progress |
| V15 | D 清理 | lint 0 error + 全流程手测 | 通过 | agent | progress |
| V16 | 全程测试基线 | vitest run | 64+N 例全绿 | agent | 每个 commit 前 |

## 4. 工作量汇总

| Phase | 内容 | 工作量 |
|-------|------|--------|
| A | A0 修复 + 9 项实测 + 记录 | ≈1 天 |
| B | 模板库 UI（B1-B5） | ≈1.5 天 |
| C | 皮肤 P1+P2 + C4 回归 | ≈1.5 天 |
| D | 清查 + 删除 + 验证 | ≈0.5 天 |
| **合计** | | **≈4.5 天** |

## 5. Review 修订记录

**v1 → v1.1（深度 review）**：A0-1 native prompt_extend 缺陷、A0-2 可灵 URL 风险、Phase C 扩 P2、剪贴板 fallback、分类计数改全量、补返回按钮。

**v1.1 → v2（覆盖/粒度/验收量化完善）**：
1. 新增 §1 范围与边界：P3 / web 端 / 组图 / 跨页套用 / strength 五项明确不做及原因，防误读为遗漏
2. 新增 §2 执行约定：TDD / progress 记录铁律 / commit 规范 / 64 例基线 / 不隐瞒原则
3. A1 实测 6 项 → 9 项：补 wan2.6 端点归属（A1-8）、可灵负面词真机效果（A1-7）、可灵 base64 参考图独立成项（A1-5）；A1-1 改双路径
4. 面容一致性验收量化：清单式 5 特征项 ≥4 判定标准（V3）
5. Phase B 粒度升至接口级：TemplateLibrary/TemplateCard/TemplateEditDialog 的 props/emits/state/关键逻辑骨架；补 B5 联动时序方案；B4 剪贴板 fallback 代码
6. Phase C 补 useSkin 完整接口代码 + C4 截图比对流程（目录、页面、比对口径）
7. Phase D 补引用清查命令与预期 + SizeSelector 条件删除规则 + 保留清单
8. 新增 §3 验收矩阵：16 项，每项 验证方法/通过线/执行者/记录位置 四要素齐全，用户拍板项明确标出
