# 任务 T09 · 解说剧产品线

> Wave：W3（合并序第 2）｜估时：6–10 人日｜依赖：无硬依赖（建议在 T06 后，共享 `StageGapBanner`）
> 必读：`00-共享约定与工程规范.md`（口播稿 prompt 遵循 00 §8）

## 执行须知（subagent）

- **范围白名单**：仅下文 §4 所列文件。
- **回归红线**：精品剧（现有默认类型）链路必须零行为变化，回归用例必测。
- **既有缺陷上报条款（review 修正）**：本任务改动 `script-generator` 调用链，该链路存在深度评审 S7 已知缺陷（覆盖度校验 haystack 混入正文，`script-coverage.ts:53-57`）——实现中**不得顺手掩盖或绕过**既有双保险逻辑，发现相关行为差异即上报协调者。
- **DoD / 报告**：见 README §6。

## 1. 背景与目标

解说剧/小说推文是该赛道量最大的市场。新增"解说剧"项目类型：AI 改写口播稿（目标行数/每行字数约束）驱动剧本与画面节拍；项目默认解说声线贯通旁白合成（DramaClaw 1.1/5.1/6.4 的解说剧工作流）。

## 2. 功能设计

### 2.1 数据（`config` 新键，零迁移）

```json
"projectType": "premium" | "narration",   // 创建时选择，创建后锁定
"narration": {
  "targetLines": 30,
  "lineCharRange": [18, 28],
  "person": "first" | "third",
  "voiceId": "...",                        // 第三人称：项目默认解说声线
  "narratorCharacterBindingId": "..."      // 第一人称：解说主角，用其声线
}
```

创建弹窗（`home/NewProjectDialog.vue`，`EpisodeProjectListV3.vue` 与 `EpisodeHome.vue` 共用）加类型选择；创建后项目设置中类型控件置灰并提示"项目类型创建后锁定，如需切换请新建项目"。

### 2.2 口播稿改写

新服务 `platform/episode-production/narrative/ai/narration-rewrite.service.ts` + `prompts/narration-rewrite-prompt.ts`：
- 输入：本集原文 + `{ targetLines, lineCharRange, person }`
- 输出：`[{ line, gist }]`（gist = 每行画面要点，供 Beat 拆解引用）
- 提示词要点（00 §8）：量化约束写死在模板（"每行 18–28 字，共 30±3 行"）；输出模板"行号|解说词|画面要点"；3 个 few-shot（古风/都市/悬疑各一）
- 生成剧本时以口播稿替代原文作为 `script-generator` 输入源（说话人统一为解说者），Beat 画面描述优先参考每行 gist

### 2.3 UI

- 脚本 stage（`script/StageScriptView.vue`）：解说剧项目在"原文"区新增"✍️ 生成口播稿"按钮 + 参数弹层（行数/字数范围/人称）；生成后展示**逐行可编辑**口播稿列表；确认后作为分镜源文本（走既有"分镜源文本自动保存"通道）。
- 缺口提示：`workbench/StageGapBanner.vue` 对解说剧额外检查：第三人称缺 `voiceId`、第一人称缺 `narratorCharacterBindingId` 或该角色无声线 → 提示去配置。

### 2.4 声线贯通

`render/audio/narration-synthesis.service.ts` 声线解析顺序：Beat 级指定 → `config.narration.voiceId`（第三人称）或 narrator 角色声线（第一人称）→ 全局兜底。

## 3. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 新增 | `narrative/ai/narration-rewrite.service.ts` + `prompts/narration-rewrite-prompt.ts` | 口播稿改写 |
| 修改 | `narrative/ai/script-generator.ts`（或其调用方） | 输入源切换（口播稿/原文） |
| 修改 | `render/audio/narration-synthesis.service.ts` | 声线三级解析 |
| 修改 | narrative 域 handler（经 episode.handler 或 narrative/ 子目录定位） | `ep:narration:rewrite` + 口播稿保存 |
| 修改 | `renderer/src/components/episode-production/home/NewProjectDialog.vue` | 类型选择 |
| 修改 | 项目设置（类型锁定展示） | 置灰 + 提示 |
| 修改 | `script/StageScriptView.vue` | 口播稿区 |
| 修改 | `workbench/StageGapBanner.vue` | 解说声线缺失提示 |
| 修改 | `src/shared/types/` | config 类型 |

## 4. 测试与验收

**单测**：
- 口播稿输出解析容错（行号错乱/缺 gist/多余文本）
- 声线三级解析顺序（Beat > config > 兜底）
- 第一人称缺 narrator 的校验报错文案

**提示词评估**：3 个不同题材章节各跑 1 次真机，行数达标率与字数落区间率 ≥90%，评估记录写入 `docs/`。

**人工验收 AC**：
- AC1 创建解说剧 → 生成口播稿（达标）→ 逐行可编辑 → 以口播稿生成剧本与分镜
- AC2 旁白合成使用项目默认声线；第一人称用 narrator 角色声线
- AC3 projectType 创建后锁定，设置中置灰
- AC4 精品剧项目全链路零变化（回归）
- AC5 缺声线时 GapBanner 提示可跳转配置
- AC6 回归基线全绿
