# 剧集制作 · 创建剧集对话框增加「AI 写剧本」

**日期**：2026-07-08
**分支**：feat/episode-production-redesign
**plan**：~/.claude/plans/zesty-jingling-moler.md

## 背景

创建剧集对话框（`CreateEpisodeDialog.vue`）原需手动粘贴 500–15000 字长文内容，门槛高。
用户希望凭一句提示词让 AI 写出故事原文，回填到「长文内容」，再走原有剧本拆分流程。

## 方案（已与用户确认）

生成**小说体裁故事原文**（非编剧格式 / 非结构化场景），回填 `uploadedContent`；
后续剧本 stage 由现有 `EpisodeScriptGenerator` 拆分。理由：创建时机项目通常还没有角色/地点资产，
结构化方案不可用；`uploadedContent` 字段语义本就是「原著/长文」。

新增轻量 IPC `ep:ai-generate-text`，复用现有 `callAI`（`narrative/ai/_helpers`）。

## 改动文件

| 文件 | 改动 |
|---|---|
| `src/shared/types/episode-production/ipc.types.ts` | 新增 `EpAiGenerateTextRequest` / `EpAiGenerateTextResult` |
| `src/core/modules/episode-production/narrative/ai/story-text-generator.ts` | **新建**：`STORY_TEXT_SYSTEM_PROMPT` + `buildStoryTextUserPrompt`（纯函数）+ `generateStoryText`（调 `callAI`） |
| `src/electron/ipc/handlers/episode-production/episode.handler.ts` | 注册 `ep:ai-generate-text` + `handleAIGenerateText` |
| `src/preload/index.ts` | `IPC_CHANNELS.EP_AI_GENERATE_TEXT` + `episodeProduction.aiGenerateText` |
| `src/web/client/channel-map.ts` | `episodeProduction.aiGenerateText`（双端契约同步） |
| `src/renderer/.../dialogs/AiWriteScriptPromptDialog.vue` | **新建**：提示词子对话框，loading 态，provider/model 取 `config.scriptModel` |
| `src/renderer/.../dialogs/CreateEpisodeDialog.vue` | uploaded 模式加「✨ AI 写剧本」按钮，`@generated` 回填 `uploadedContent` |

## 测试

- `tests/unit/episode-production/narrative/story-text-generator.spec.ts`（新建，8 用例）：覆盖提示词拼接（背景全/部分/空、trim、段落分隔）+ 系统提示词形态。**8/8 PASS**。
- typecheck：零新增错误（唯一 `electron.vite.config.d.ts` 白名单）。
- narrative baseline 对比（`git stash`）：47 failed → 47 failed，**零新增失败**（47 个历史存量与本次改动无关）。

## 设计要点

- 独立于 `createEpisode`（其 JSDoc 明确"创建即返回，不在创建阶段调 AI"）；本 IPC 是纯文本生成工具，前端按需调用、自行回填。
- 不做场景拆分 / binding 引用（那是 `EpisodeScriptGenerator` 职责，需资产 roster）。
- 提示词拼接抽成纯函数 `buildStoryTextUserPrompt`，便于单测、不打 AI 接口（对齐 `script-generator` 的 `__test` 模式）。
- provider/model 取 `projectStore.currentProject.config.scriptModel`，与 `AIQuickModeWizard` 一致；未配置时 UI 禁用并提示。

## 端到端验证步骤

1. `npm run pc:dev` 启动
2. 剧集制作 → 选项目 → 新建剧集 → 切「上传长文」→ 点「✨ AI 写剧本」
3. 填提示词（如「民国江南，女主复仇，茶馆开场」）→ 生成 → 回填长文内容 → 创建
4. 进剧集 → 剧本 stage 验证原文能被 `EpisodeScriptGenerator` 拆分
5. 异常路径：未配 `scriptModel` 时按钮区有警告；AI 报错时 `ElMessage` 提示
