# 任务 T05 · 风格模板库

> Wave：W2（合并序第 2）｜估时：6–9 人日（较总档下修：`style-resolver.ts` 已是风格单一来源，无需改造注入点）｜依赖：无硬依赖
> 被依赖：T08 导演台的"控制图与风格参考分槽"依赖本任务的风格通道概念
> 冲突注意：与 T03 同碰项目设置组件（本任务加"风格"分区），T03 后合并
> 必读：`00-共享约定与工程规范.md`（新 prompt 遵循 00 §8）

## 执行须知（subagent）

- **范围白名单**：仅下文 §5 所列文件。
- **禁止破坏既有规则**：`style-resolver.ts` 的优先级（有角色参考图时 prefix 用 `REFERENCE_MATCH_STYLE_PREFIX`，见其头注释）不可改变——本任务只是扩展 preset 来源。
- **DoD / 报告**：见 README §6。

## 1. 背景与目标

用户可创建/保存/应用自定义风格模板（风格指令 + 质量后缀 + **避免指令** + 风格 Tag），支持上传参考图 VLM 反推风格参数；应用后全链路风格统一（作用于质量链路的"风格一致性"环节，避免指令直接压制文字残留/水印类 artifact）。

## 2. 现状（实现前必读）

`prompts/style-resolver.ts`（提示词优化 §4.4，2026-10-06）已收口 5 个历史注入点：
- `StylePreset` 形状：`{ stylePrefix, qualitySuffix, negativePrompt }`
- `resolveStyle(ctx)` 产出：`prefix`（有角色参考图→REFERENCE_MATCH，否则风格预设前缀）/ `suffix`（质量后缀）/ `projectStyle`（`config.stylePrompt`，末尾追加一次）/ `negative`（风格预设 negative + 时代档案 negativeExtra）
- 内置 `PRESET_STYLES` 在 `render/keyframe/keyframe-prompt-builder.ts:64`；`STYLE_PRESETS` 20 锚点在 `assets/constants/style-presets.ts`

**本任务 = 在这个单一来源上增加"用户模板"这一 preset 来源 + 项目应用层 + 反推录入**，不动已收口的消费点。

## 3. 功能设计

### 3.1 数据模型

新表 `ep_style_template`（迁移 `add-ep-style-template`）：

```
id PK / user_id / name / description
style_prefix text / quality_suffix text / negative_prompt text
style_tags json / ref_image_path text?   -- 创建时的参考图，仅溯源展示
created_at / updated_at
```

内置 20 锚点与 `PRESET_STYLES` 保持代码态不动；用户模板入库。

### 3.2 接入 style-resolver

- `resolveStyle` 的 preset 查找扩展为「内置 PRESET_STYLES + 用户模板」：`PromptContext` 增加可选 `styleTemplateId`；resolver 经注入的仓储查模板，查不到回退内置（健壮性）。
- negative 合并优先级保持：风格预设 negative + 时代档案 negativeExtra + **`config.styleNegative`（新键）**。

### 3.3 应用到项目（快照式）

"应用到项目"把模板三字段**快照**写入：`config.stylePrompt`（projectStyle 通道，已有）+ `config.styleNegative`（新键）+ `config.styleTemplateId`（溯源）。选快照而非仅存 ID：**模板删除不影响已应用项目**。

### 3.4 参考图反推

新 prompt `prompts/style-inference-prompt.ts`：输入参考图 → VLM 输出 `{stylePrefix, qualitySuffix, negativePrompt, styleTags}` 纯 JSON（3 个 few-shot，正向表述）。复用现有 VLM 通道（质量自检/镜头推断同款）。解析容错：剥代码围栏、容忍前后噪声。

### 3.5 UI

项目设置组件新增"风格"分区：
- 左侧模板列表：内置只读组 + 我的模板组
- 右侧编辑器：名称/描述、三个文本域（风格指令/质量后缀/避免指令）、标签、参考图缩略
- 操作：新建（手动 或 上传参考图→反推预填→人工确认保存）、编辑、删除（确认文案说明"已应用项目不受影响"）、**应用到项目**
- 应用后分区顶部显示当前项目风格快照（三字段摘要 + 来源模板名）

## 4. 交互流

```
创建：填写/上传参考图 → [反推] → 预填三字段 → 人工确认 → 保存模板
应用：选择模板 → 应用到项目 → 写 config 快照 → 之后所有新生成（资产图/关键帧/缩略图）
      经 resolveStyle 自动携带模板风格与避免指令
```

## 5. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 新增 | `database/migrations/add-ep-style-template.ts` | 建表（双方言） |
| 新增 | `database/entities/episode-production/style-template.entity.ts` + `database/repositories/style-template.repository.ts` | 实体/仓储 |
| 新增 | `platform/episode-production/prompts/style-inference-prompt.ts` | 反推提示词 |
| 新增 | `platform/episode-production/services/style-template.service.ts` | CRUD + 反推 + 应用快照 |
| 新增 | `packs/episode-production/handlers/style-template.handler.ts` | `ep:style-template:list/create/update/delete/apply/infer-from-image` |
| 修改 | `platform/episode-production/prompts/style-resolver.ts` | preset 来源扩展 + negative 追加 config.styleNegative |
| 修改 | `platform/episode-production/prompts/prompt-context.ts` | ctx 增加可选 styleTemplate 字段 |
| 修改 | `packs/episode-production/handlers/index.ts` | 注册 |
| 修改 | 项目设置组件（同 T03 定位） | "风格"分区全套 |
| 修改 | `src/shared/types/` | 模板与 config 类型 |

## 6. 测试与验收

**单测**：
- resolver 合并查找：内置命中 / 模板命中 / id 查不到回退内置
- negative 三段合并顺序（预设 + 时代档案 + config.styleNegative）
- 快照应用后删除模板 → 项目生成行为不变（悬空安全）
- 反推 JSON 解析容错（代码围栏/噪声）

**集成**：应用含强风格词模板 → 生成角色主图与关键帧 → 日志断言 prompt 含模板内容；四家 provider 的 negativePrompt 传参断言（mock provider）。

**人工验收 AC**：
- AC1 手动/反推两条路径创建模板并应用，新生成资产与关键帧风格对齐模板
- AC2 有角色参考图时 prefix 仍为 REFERENCE_MATCH（优先级不破坏）
- AC3 避免指令出现在 provider negative 通道
- AC4 删除模板后已应用项目行为不变
- AC5 内置 20 锚点行为与迁移前一致（回归）
- AC6 **styleAnchors 优先级（review 修正）**：`config.stylePrompt` 存在"兼容读 styleAnchors 首项"回退（`prompt-context.ts:57,105-107`）——应用模板快照后，styleAnchors 残留值**不再影响**生成（快照优先级高于 styleAnchors 回退），用夹具断言
- AC7 回归基线全绿
