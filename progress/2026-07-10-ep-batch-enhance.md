# 批量创建增强：识别「第#集」+ 批量识别资产

**日期**：2026-07-10
**分支**：feat/episode-production-redesign
**plan**：~/.claude/plans/zesty-jingling-moler.md

## 背景

「批量创建剧集」上线后的两个增强：
1. **识别「第#集」**——剧本常用"第一集/第二集"分集，原 `StructureDetector` 只认「章节回」。
2. **批量创建后识别资产**——批量建 N 集后，根据剧本内容识别人物/物品/环境，创建项目资产。

## 改动

### 需求 1：识别「第#集」
- `src/core/services/chunk-splitter/structure-detector.ts:23` 章节正则 `[章节回]` → `[章节回集]`
- `script-splitter.service.spec.ts` 加「第X集」用例（7/7 PASS）

### 需求 2：批量识别资产
| 文件 | 改动 |
|---|---|
| `auto-binding/uploaded-entity.service.ts` | `createAndBindUploadedEntities` 加**跨集去重**：先取项目已有 binding 的 name Set，命中跳过、新建后加入 Set（修复逐集识别产生同名重复资产的根因） |
| `episode.handler.ts` | `handleBatchCreateEpisodes` 返回 `episodeIds`；新增 `handleBatchIdentifyEntities`（逐集 `identifyCharacters/Locations/Items` + `createAndBindUploadedEntities` 去重） |
| `ipc.types.ts` | `EpBatchCreateEpisodesResult` 加 `episodeIds`；新增 `EpBatchIdentifyEntitiesRequest/Result` |
| `preload` + `channel-map` | `batchIdentifyEntities` API（双端同步） |
| `BatchCreateEpisodesDialog.vue` | done 阶段加「✨ 识别资产」按钮（取 `config.scriptModel`，未配禁用并提示；调 `batchIdentifyEntities`；显示「N 角色 / M 地点 / K 物品」） |

## 测试
- script-splitter 7/7（含「第集」）+ extract-text 8/8 = **15/15 全绿**
- **typecheck**：零新增错误（唯一 `electron.vite.config.d.ts` 白名单）
- 跨集去重逻辑简单（Set.has + add），靠端到端验证，未单独写单测

## 设计要点
- 资产是 **project 级**（binding 无 episodeId），跨集去重是必须的——否则逐集识别产出 N 份同名资产。这是本次最重要的修复（顺带让单集重识别也不再重复）。
- **逐集识别**（非合并整体）：避开 `identifyCharacters` 只取前 5000 字的截断，保证每集内容完整分析。
- 识别**手动触发**（done 阶段按钮）：AI 慢（N 集×3 类）、需配 `scriptModel`，手动可控，不让批量创建流程过长。
- batch-create 返回 `episodeIds`，识别精准作用于刚创建的剧集。

## 验证步骤
1. `npm run pc:dev`
2. 批量创建：选含「第一集/第二集/第三集」的剧本 → 预览 3 集 → 创建
3. done 阶段点「✨ 识别资产」→ 等待 AI → 提示「N 角色 / M 地点 / K 物品」
4. 进项目资产页 → 角色/地点/物品已创建、**无同名重复**
5. 异常：未配 `scriptModel` → 按钮区显示警告；AI 报错 → ElMessage 提示
