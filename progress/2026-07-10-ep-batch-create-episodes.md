# 剧集制作 · 批量创建剧集（上传剧本 → 按章拆分 → 批量建集）

**日期**：2026-07-10
**分支**：feat/episode-production-redesign
**plan**：~/.claude/plans/zesty-jingling-moler.md

## 背景

剧集项目界面原只能逐集手动创建（`CreateEpisodeDialog` 一次一集，手填长文）。用户有按章节组织的剧本合集时，逐集建繁琐。本功能支持上传剧本文件（txt/md/docx/pdf/epub），系统按章节标记自动拆成多集，预览确认后批量创建。

## 方案（已与用户确认）

拆分用**按章节标记的规则切分**（复用 `StructureDetector`，识别「第X章/节/回」「Chapter N」「# 标题」），不走 AI——即时、零成本、可预测、可单测。

## 改动文件

### 新建
| 文件 | 作用 |
|---|---|
| `src/core/utils/extract-text.ts` | 文件→纯文本工具（从 knowledge-base 抽出 parseFile/decodeTextFile/hasGarbledChars，**补全 pdf/epub**）|
| `src/core/modules/episode-production/narrative/services/script-splitter.service.ts` | `analyzeScriptToEpisodes(text)`：`StructureDetector.detect` → 每章一集 |
| `src/renderer/.../dialogs/BatchCreateEpisodesDialog.vue` | wizard：选文件→预览可编辑→批量创建 |
| `tests/unit/core/extract-text.spec.ts` | inferFileType（含 pdf/epub）+ hasGarbledChars + decodeTextFile（8 用例）|
| `tests/unit/episode-production/narrative/script-splitter.service.spec.ts` | 中文/英文/Markdown/无结构拆分（6 用例）|

### 改动
| 文件 | 改动 |
|---|---|
| `src/shared/types/episode-production/ipc.types.ts` | `EpBatchCreateEpisodesRequest/Result` + `EpAnalyzeScriptResult` |
| `src/electron/ipc/handlers/episode-production/episode.handler.ts` | `ep:analyze-script-file`（dialog+extract+split）+ `ep:batch-create-episodes`（循环 create 续号）|
| `src/preload/index.ts` | `IPC_CHANNELS` + `analyzeScriptFile`/`batchCreateEpisodes` API |
| `src/web/client/channel-map.ts` | 双端契约同步 |
| `src/core/services/knowledge-base.service.ts` | `parseFile`/`getFileType` 委托 extract-text（去重 + 修复 pdf/epub）|
| `src/renderer/.../project-list/EpisodeListPanel.vue` | 加「批量创建」按钮 + emit |
| `src/renderer/.../views/EpisodeProjectListV2.vue` | 接入按钮 / dialog / `@created` 回调（复用 `onEpisodeCreated`）|

## 测试

- **extract-text**：8/8 PASS（inferFileType 含 pdf/epub、hasGarbledChars、decodeTextFile UTF-8/BOM）
- **script-splitter**：6/6 PASS（中文第X章/英文 Chapter/Markdown/无结构/节回量词/content 含标题）
- **typecheck**：零新增错误（唯一 `electron.vite.config.d.ts` 白名单）
- **知识库回归**：`parseFile`/`getFileType` 委托后，单测 fail 数 = baseline（2 file failed 为历史存量），**零新增回归**

## 设计要点

- 复用 `StructureDetector`（`chunk-splitter`），零 AI、零依赖、毫秒级；`detect().sections` 直接映射为一集（title=章节标题，content=章节正文）
- 批量创建走后端 handler 循环 `videoEpisodes.create`（uploaded 模式，episodeNumber 从项目当前最大值 +1 续号），不触发 AI，与现有 `createEpisode` 一致
- `extract-text` 工具从 knowledge-base 抽出，知识库 `parseFile`/`getFileType` 委托复用（DRY + 顺带修复知识库 `getFileType` 漏 pdf/epub 的历史 bug）
- 文件选择用原生 `dialog.showOpenDialog`（桌面端），filter: txt/md/docx/pdf/epub

## 待清理（技术债）

`knowledge-base.service` 的 `decodeTextFile` / `hasGarbledChars` 在 `parseFile` 委托 extract-text 后成为死代码（逻辑已迁入 `extract-text`），后续可安全删除。

## 验证步骤

1. `npm run pc:dev` 启动
2. 剧集制作 → 选项目 → 点「批量创建」→ 选含「第一章…第二章…第三章…」的 txt/docx
3. 预览 N 集（可改标题/删行）→ 确认 → 列表刷新出 N 集（episodeNumber 续号）
4. 进任一集 → ① 内容 stage 看到章节原文
5. 异常路径：无章节标记文件 → 提示「未识别到章节结构」；pdf/epub → 提取（本功能首次走通 pdf/epub 全链路，重点测）
