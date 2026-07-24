# 新版人像设计 · 产品与技术 Spec

> 状态：待评审
> 日期：2026-07-24
> 关联原型：`docs/ui-prototypes/portrait-design/`（已评审确认）
> 关联皮肤方案：`docs/design/theme-skin-system-design.md`（D5：新增代码强制 token 驱动）

## 1. 背景

现有版人像设计（`CharacterEditor.vue` + `portrait.service.ts`）存在四组问题：

1. **生成参数单薄**：UI 只暴露 prompt / negativePrompt / 尺寸 / 参考图；quality / style / seed / guidanceScale / steps / strength 未透传
2. **无半身/全身概念**：所有生成硬编码 `FULL_BODY_SUFFIX`，一律出全身图；面部细节差、且无法"先定脸再扩身体"
3. **无提示词资产**：`docs/prompt.txt` 里的专业面部/全身描述（三庭五眼、头身比例、骨相皮肉）完全没利用；prompt 拼装常量写死在 service（违反"严禁写死配置"）
4. **无面部专用编辑**：`editImage` 是整体重绘，无法"只改脸、不动身体/服装/背景"

## 2. 目标

按已确认原型实现新版人像设计，覆盖完整闭环：

```
项目列表 → 角色列表 → 生成形象（默认半身）
  → 工作台（framing 切换 / 修改面部 / 更多编辑 / 套图管理）
  → 基于半身生成全身（对话框）
  → 导出
```

**非目标**：
- 不做蒙版涂抹式局部重绘（以 strength + focusRegion 引导先行；provider 蒙版支持验证后另行迭代）
- 不做 Web 端人像前端页面（Web 端本无人像模块；迁移双端注册、Service 在 core 共享，Web 端后续接入零成本）
- 不做皮肤切换本体（但新增样式必须 token 驱动，见 §8）
- 不重写项目/角色管理页（沿用现有 `Portrait.vue` 列表逻辑，仅角色编辑区替换为新工作台）

## 3. 已确认的设计决策（原型评审结论）

| # | 决策 | 结论 |
|---|------|------|
| D1 | 取景范围 framing | 一等公民维度：`half`（半身）/ `full`（全身），贯穿生成、编辑、套图分组 |
| D2 | 推荐流程 | 引导式两阶段：生成半身 → 微调（编辑/修改面部）→ 满意后基于半身扩展全身（当前半身作为参考图，保面部一致） |
| D3 | 生成全身入口 | 就地操作：套图区「全身像 · 基础形象」卡片——无全身像时显示「生成全身像」按钮，有则「重新生成」；点击弹对话框（提示词/尺寸/模板/参考图/强度） |
| D4 | 预览区 framing tab | 半身/全身可点击切换；无全身像时全身 tab 显示空状态 + 生成按钮 |
| D5 | 修改面部 | 模板（目标脸型蓝图）+ 指令（微调描述）+ 面部参考图（可选）+ 重绘强度 + 重绘范围（focusRegion）；模板下拉与预览联动；结果存为新 variant（`type='face'`），不改原图 |
| D6 | 提示词模板 | 独立模板库：内置（来自 `docs/prompt.txt`）+ 用户自定义；分类（face/body/clothing/background）；支持 `{name}/{gender}/{age}` 占位符；生成/重新生成/修改面部/换衣 各入口可「套用（覆盖）/追加（拼接）」 |
| D7 | 参考图语义 | 多参考图，每张标注用途：`character` / `face` / `pose` / `clothing` / `background` |
| D8 | 工作台信息架构 | 右操作区按频率分层：修改面部（主）→ 更多编辑（折叠：重新生成/换衣/换背景/多角度）；套图区分半身组/全身组 |
| D9 | 样式规范 | 前端全部样式使用 CSS token（`var(--*)`），零硬编码色值/圆角/阴影（皮肤方案 D5） |
| D10 | 架构 | 数据结构复用现有三层（Project→Character→Variant）；Service 只在 `src/core`；字段名=DB 字段名，禁止映射函数；后端只新增不破坏；迁移双端注册；TDD |

## 4. 数据模型变更

### 4.1 `portrait_variants` 加列（迁移，幂等，SQLite+PG 双端）

| 列 | 类型 | 说明 |
|----|------|------|
| `framing` | varchar / text，nullable | `half` / `full`；存量行回填 `full`（现有全部硬编码全身） |

迁移文件：`src/core/database/migrations/add-portrait-variant-framing.ts`，注册到 `src/electron/database/index.ts` 与 `src/web/server/index.ts`（遵循现有迁移模式）。

`PortraitVariantEntity` 与 `src/shared/types/portrait.types.ts` 的 `PortraitVariant` 同步加 `framing` 字段。

### 4.2 variant type 扩展

`PortraitVariantType` 增加 `'face'`（面部变体）。`PortraitVariantInfo` 增加 `faceDescription?: string`、`faceTemplateId?: string`。

### 4.3 新表 `portrait_prompt_templates`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | varchar PK | |
| `user_id` | varchar nullable | 多租户（遵循 BaseRepository 惯例） |
| `name` | varchar | 模板名 |
| `category` | varchar | `face` / `body` / `clothing` / `background` |
| `content` | text | 模板正文，支持 `{name}/{gender}/{age}` 占位符 |
| `apply_to` | simple-json | 适用场景数组：`generate` / `regenerate` / `face` / `clothes` |
| `builtin` | boolean/int | 内置 vs 用户自定义 |
| `sort_order` | int | |
| `created_at` / `updated_at` | datetime | |

Entity：`src/core/database/entities/portrait-prompt-template.entity.ts`
Repository：`src/core/database/repositories/portrait-prompt-template.repository.ts`
建表迁移：`src/core/database/migrations/create-portrait-prompt-templates.ts`（双端注册）

### 4.4 内置模板 seeder

参照 `src/core/modules/episode-production/assets/services/preset-image-seeder.service.ts` 模式：从 `docs/prompt.txt` 抽取首批内置模板（少年清爽风·面部 / 成熟硬朗风·面部 / 温婉柔美风·面部 / 少年清爽风·8头身全身 / 韩式清爽碎盖+日系少年 等），幂等注入（按 builtin+name 查重）。

## 5. 后端能力（`src/core`，TDD）

### 5.1 `ImageGenerationRequest` 扩展（只新增，不破坏）

`src/shared/types/image-provider.types.ts` 增加可选字段：

```ts
strength?: number            // 重绘强度 0-1
focusRegion?: 'face' | 'face_and_hair' | 'upper' | 'full'  // 不支持蒙版的 provider 用 prompt 引导
```

provider adapter 现状：dashscope/volcengine 参考图链路已支持；strength/focusRegion 本阶段只在 portrait service 层用于 prompt 拼装与参数透传，provider 侧原生支持的（如 dashscope image-edit 的 strength）后续单独适配。**不在本阶段改 provider。**

### 5.2 PortraitService 改造与新增

| 方法 | 类型 | 说明 |
|------|------|------|
| `buildPortraitPrompt(params)` | 重构（private） | 统一 prompt 拼装：角度词、framing 后缀、一致性前后缀从**默认配置对象**读取且可被调用方覆盖，消除 `FULL_BODY_SUFFIX` 等写死常量的硬拼接；`framing='half'` 用 `upper body shot, bust portrait` 类后缀 |
| `generatePortrait` | 修改 | 请求类型加 `framing`（默认 `half`，**行为变化：新默认半身**，在 changelog 与 UI 引导中明确）；透传扩展参数 |
| `generateFullBody(request)` | **新增** | 基于指定半身 variant 扩展全身：参考图=该半身图，framing=full，strength 默认 0.55，prompt 默认带 `same person as reference, full body shot, ... consistent face and hairstyle`；产出 `type='base', framing='full'` variant，parentId 指向源半身 variant |
| `editFace(request)` | **新增** | `EditFaceRequest{ characterId, variantId, facePrompt?, faceTemplateId?, referenceImages?, strength?, focusRegion?, width?, height? }`；模板内容经 `applyTemplate` 解析占位符后与 facePrompt 叠加；产出 `type='face'` variant |
| `listPromptTemplates(category?)` | **新增** | 按分类/场景过滤 |
| `applyTemplate(templateId, vars)` | **新增** | 占位符替换 |
| `savePromptTemplate / deletePromptTemplate` | **新增** | 用户自定义模板 CRUD（builtin 不可删改） |

尺寸取值维持现有三级优先级惯例（request > variant.config > DEFAULT），与现有测试对齐。

### 5.3 IPC / preload（只新增通道）

| 通道 | 说明 |
|------|------|
| `portrait:generate-full-body` | → `generateFullBody` |
| `portrait:edit-face` | → `editFace` |
| `portrait:prompt-template:list` | → `listPromptTemplates` |
| `portrait:prompt-template:apply` | → `applyTemplate` |
| `portrait:prompt-template:save` / `:delete` | 自定义模板管理 |

`src/preload/index.ts` 的 `portrait` API 对象同步暴露；所有调用保持 `{ success, data?, error? }` 格式；IPC 传参只传可序列化纯对象（遵循现有 `toRaw` 惯例）。

## 6. 前端（`src/renderer`，token 驱动样式）

### 6.1 组件结构

新增 `src/renderer/src/components/portrait/workbench/`：

| 组件 | 职责 |
|------|------|
| `PortraitWorkbench.vue` | 工作台容器：无形象→生成态；有形象→编辑态；framing tab 切换 |
| `GeneratePanel.vue` | 生成态面板：取景范围（默认半身）、模型、尺寸、模板选择、prompt、negativePrompt、多参考图（语义标注）、高级参数折叠 |
| `FaceEditPanel.vue` | 修改面部：指令、模板下拉（联动预览）、面部参考图、强度、focusRegion |
| `MoreEditPanel.vue` | 更多编辑折叠区：重新生成/换衣/换背景/多角度（复用现有逻辑迁移） |
| `VariantGallery.vue` | 套图画廊：按 framing 分组（半身组/全身组），全身组空状态+生成按钮 |
| `GenerateFullBodyDialog.vue` | 生成全身对话框（提示词/尺寸/模板/参考图含当前半身/强度） |
| `TemplatePicker.vue` | 模板选择器（下拉+套用/追加+联动预览） |
| `TemplateLibrary.vue`（视图或对话框） | 模板库管理：分类筛选、预览、复制、新建/编辑/删除自定义 |
| `ReferenceImagePicker.vue` | 参考图上传网格（语义标注角色） |

`Portrait.vue` 仅把 `<CharacterEditor>` 替换为 `<PortraitWorkbench>`；`CharacterEditor.vue` 及其子组件在本阶段保留不删（回退余地），新版稳定后再清理。

### 6.2 样式规范（强制）

- 新增样式一律 `var(--c-*)` / `var(--radius-*)` / `var(--shadow-*)` 等 token；需要的 token 若 `index.scss` 未定义，**在 `:root` 补充定义**（classic 值=现状，modern 值=原型），组件不直接写字面量
- CR 检查项：新增文件出现硬编码 `border-radius: Npx` / `box-shadow: 0…` / `#hex`（token 定义文件除外）一律打回

## 7. 测试策略（TDD）

沿用现有 vitest + 模块级 mock 模式（`tests/unit/services/portrait.service.spec.ts` 已示范）：

| 测试文件 | 覆盖 |
|----------|------|
| `tests/unit/services/portrait-framing.spec.ts` | buildPortraitPrompt 的 framing 后缀/可覆盖默认值；generateFullBody 的参考图/parentId/产出字段 |
| `tests/unit/services/portrait-edit-face.spec.ts` | editFace：模板+指令叠加、占位符解析、type='face' 产出、尺寸三级优先级 |
| `tests/unit/services/portrait-prompt-template.spec.ts` | list 过滤、applyTemplate 占位符、builtin 删除保护 |
| 现有 `portrait.service.spec.ts` | 保持全绿（回归） |

前端组件本阶段不写单测（与现状一致），以 `npm run lint` + 手动验证 + e2e 冒烟（如有既有 e2e 模式可后续补）。

## 8. 与皮肤方案的关系

本 feature 是皮肤方案 D5 的首个执行者：所有新样式 token 驱动。所需新 token 在本 feature 内补充到 `index.scss :root`（classic 值=接近现状，modern 值=原型），但 **`data-skin` 切换机制本身不在本 feature 范围**（属皮肤方案 P1）。

## 9. 验收标准

1. 新建角色默认生成**半身像**；工作台可在半身/全身 tab 间切换
2. 无全身像时套图区全身组显示「生成全身像」入口，弹窗可改提示词/尺寸/模板/参考图/强度；生成后面部与半身一致（视觉验收）
3. 修改面部：选模板左侧预览联动；生成结果为独立 `type='face'` variant，原图不变，服装/背景不变
4. 模板库：内置模板可用，可新建/编辑/删除自定义模板；各生成入口可套用/追加
5. 重新生成/换衣/换背景/多角度收纳于「更多编辑」折叠区，功能不缺失
6. `npm test` 全绿；`npm run lint` 通过；新增样式零硬编码直接量
7. 双端迁移幂等（Electron 启动自动执行；web-server 启动自动执行）

## 10. 分阶段交付

- **M1**：数据层（framing 迁移 + 模板表 + seeder）+ 模板 service + 测试
- **M2**：buildPrompt 重构 + generateFullBody + editFace + 测试
- **M3**：IPC + preload
- **M4**：工作台前端（token 驱动）+ 联调验收

每个 M 都是可独立交付、可测试的增量。
