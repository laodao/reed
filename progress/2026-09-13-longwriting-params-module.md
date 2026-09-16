# 2026-09-13 参数设置第十批：长文写作 Tab

「参数设置」平台能力的第 10 个模块 Tab：**长文写作**。把长文写作（章节生成主链 + 故事研讨室）
里写死的 16 个可调参数接进「内置默认 → settings 覆盖 → 代码级硬上限夹取 → 使用点现读」配置链。

## 存储键（新增 2 个，已登记进 `SETTINGS_KEYS`）

| 键 | 覆盖范围 |
|---|---|
| `longwriting:writing` | 章节生成主链（窗口/输出上限/篇幅/记忆注入） |
| `longwriting:storyRoom` | 故事研讨室（历史/摘要/步数/账本/卡片/大纲叶子） |

## 新增文件

- `src/shared/types/longwriting-params.types.ts`：`LongwritingRuntimeParams`（`writing` / `storyRoom` 分组）
  + `LONGWRITING_DEFAULTS` + `LONGWRITING_LIMITS`
- `src/shared/utils/longwriting-params.ts`：进程级持有者（`createParamHolder` + `pickNumericFields`）
- `src/shared/constants/module-params/longwriting.params.ts`：Tab 登记表（`key: 'longwriting'`，Tab 名「长文写作」）
- `tests/unit/shared/longwriting-params.spec.ts`：登记表 + 持有者 + 解析 + 护栏 + 3 个真实行为证明

## 参数与读取点（默认 = 改造前写死的常量）

### 组 `writing`（`longwriting:writing`）

| 路径 | 默认/上限 | 读取点 |
|---|---|---|
| `windowTokens` | 32768 / 200000 | `longwriting-ai.service.ts:1648`（`assembleChapterGeneration`，参数注入在 `:1437`） |
| `maxOutputTokens` | 8192 / 32768 | `longwriting-ai.service.ts:1654`（`Math.min(targetWords*2, …)`） |
| `chapterTargetWords` | 3000 / 30000 | `longwriting-ai.service.ts:1645` |
| `sectionTargetWords` | 500 / 20000 | `longwriting-ai.service.ts:2000,2035,2047`（`generateSection`） |
| `previousChapterEndingChars` | 550 / 5000 | `longwriting-ai.service.ts:1475`（调用点）+ `:1799`（缺省参数） |
| `normalMemoryLimit` | 10 / 50 | `longwriting-ai.service.ts:2717,2720,2721`（`getMemoryContext`，参数注入在 `:2691`） |
| `minorMemoryLimit` | 5 / 30 | `longwriting-ai.service.ts:2728` |

### 组 `storyRoom`（`longwriting:storyRoom`）

| 路径 | 默认/上限 | 读取点 |
|---|---|---|
| `historyLimit` | 40 / 120 | `room-session.ts:230`（参数注入在 `:220`） |
| `maxHistoryContentChars` | 1200 / 8000 | `room-session.ts:233` |
| `summaryThresholdTurns` | 20 / 200 | `room-session.ts:385`（参数注入在 `:384`） |
| `summaryBatchTurns` | 10 / 100 | `room-session.ts:387` |
| `maxSummaryChars` | 6000 / 50000 | `room-session.ts:414,416` |
| `editorMaxSteps` | 2 / 20 | `room-session.ts:271`（kit `maxSteps`） |
| `ledgerCap` | 60 / 400 | `room-ledger.ts:182`（`compactLedger` 缺省参数；调用点 `:164`） |
| `maxCardsPerDistill` | 6 / 30 | `room-distiller.ts:276`（参数注入在 `:246`） |
| `outlineLeafLimit` | 30 / 300 | `room-distiller.ts:216`（参数注入在 `:211`） |

`outlineLeafLimit` 在改造前**不是常量**，是 `scopeContext` 里的裸字面量 `.slice(0, 30)`——
grep 不到 `outlineLeafLimit` 这个名字，按"登记的参数必须代码真的会读"的纪律确认它确实被读取后才登记。

## 一致性护栏

`summaryBatchTurns ≤ summaryThresholdTurns`（`longwriting.params.ts` 的 `crossFieldGuard`
+ 持有者的 `normalize`）。配错时把 batch 收到 threshold 并在设置页给出 note。
原因：`maybeRollingSummary` 会把水位推进到 `summarizedTurn + batch`，batch 大于 threshold 时
水位可能越过当前轮号，导致中间轮次再也不被摘要。两处实现同一口径（设置页显示 = 实际生效）。

## 接线与生效时机

- `workflow-boot.ts`：新增 `applyLongwritingParams()`（启动注入）+ `registerSettingsReloadHook('longwriting-params', …)`
  （仅当键是这两个之一时重注入）；同时在 `applyKnowledgeParams()` 里补上知识库布尔开关
  `setKnowledgeSummaryFlags(knowledgeFlagsFromSettings(raw))`（同一文件的协同改动）。
- 全部读取点都是**方法内现读**（模块顶层读不会跟随重注入）。生效时机 `immediate`：
  保存后下一次章节生成/下一轮研讨即生效。

## 验证

- `node scripts/vitest-electron.cjs run tests/unit/shared/longwriting-params.spec.ts` → 14 passed
- `node scripts/vitest-electron.cjs run tests/unit/core/packs/longwriting tests/unit/shared tests/unit/settings-keys.spec.ts`
  → 24 files / 250 tests passed（exit 0）
- `npm run typecheck`：新增文件 0 报错；改动文件的报错与改造前逐条一致（仅行号位移），
  其中 `room-ledger.ts(167,5) TS2740` 是**既有**错误（`silentExtractLedger` 声明返回
  `ConsensusEntry[]` 却返回 `mutateRoomState` 的 `RoomWorkspaceState`），与本批无关。
