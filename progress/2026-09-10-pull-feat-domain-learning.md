# feat/domain-learning 拉取与最近提交检查（2026-09-10）

## 结论速览

| 项目 | 结果 |
| --- | --- |
| 拉取 | ✅ 已合并 `origin/feat/domain-learning`（本地 2 前 / 35 后 → merge 提交 `2a3f3845`） |
| 提交检查 | ✅ 35 个入站提交逐条过目，无异常 |
| 合并冲突 | ✅ 无冲突（3 文件自动合并） |
| 合并产物缺陷 | ⚠️ 发现 1 处：`electron.vite.config.ts` preload 段 `resolve` 键重复 → ✅ 已提交修复 `96ddc6fa` |
| 依赖 | ✅ 补齐合并带入的未安装依赖 `@lingo-reader/mobi-parser` |
| 构建 | ✅ `npm run build` 通过（exit 0） |
| 单测回归 | ✅ **零回归**（逐文件比对，详见下） |
| 是否推送 | ⏸ 未推送，`feat/domain-learning` 领先 origin 4 个提交（按决定等并发工作收敛） |

## 一、拉取

- 分支：`feat/domain-learning`；合并前 `HEAD = 25a2395e`，`origin/feat/domain-learning = 6969fc11`。
- 本地 2 前 / 35 后 → `git merge origin/feat/domain-learning`，产出合并提交 `2a3f3845`，**无冲突**。
- 合并规模：177 文件、+12909/−5410（`src/core` 72、`src/renderer` 30、`tests/unit` 23）。
- 拉取同时发现远端其他分支更新：`feat/agent-harness`、`feat/workflow-engine`（各推进到 `1c45efe8`），新增 `feat/story-room`。

## 二、最近提交检查（35 个入站提交，主线）

- **42 号 故事研讨室 / 设定集**（约 20 个提交，09-08 20:00 → 09-09 17:35）：M1 落库段抽取 → M2 会话引擎 → M3 接线 → M4 提炼闭环 → M5 衔接 → M6 旧对话链路退役 → M7/M7c 评审修复 → M8 原型还原 → P0 设定集动态分组 → P1 演进时间线/伏笔追踪。含 `lw_bible_kinds`/`lw_custom_entities`/`lw_foreshadows` 三张新表。
- **40/41 号 agent-runtime**：上下文成本与产出治理（缓存分层/原始流水/工具产物归档/子代理/模型分级）、工具线上名兼容（pack 冒号名不再被 OpenAI 兼容 API 拒绝）。
- **37 号 knowledge**：分层可视化 + L2/L3 记忆产生渠道 + 知识飞轮列表改造。
- **43/44 号 domain-learning**：原型评审修复批（门禁清零 + 六处断链）、合并补植批、首页项目卡布局修复。
- **构建修复**：`c68c3b45` preload 补 `@shared` 别名——与本地的 `3917cbcc`（同一天、同一处、同一原因）**撞车**，是本次唯一自动合并风险点（见下）。
- 依赖新增：`@lingo-reader/mobi-parser`、`dompurify`；`dev:debug` 加 `NO_AT_BRIDGE=1`。

### 迁移注册一致性抽查（通过）

合并带入的三个新迁移在 Electron 与 Web 两端均已注册，无单边遗漏：

| 迁移 | `src/electron/database/index.ts` | `src/web/server/index.ts` |
| --- | --- | --- |
| `createBibleTables` | ✅ | ✅ |
| `createAgentSessionEvents` | ✅ | ✅ |
| `createAgentToolArtifacts` | ✅ | ✅ |

（`lw_bible_kinds`/`lw_custom_entities`/`lw_foreshadows` 三表均定义在 `create-bible-tables.ts` 内。）

## 三、合并产物缺陷：preload 段 `resolve` 键重复

- **成因**：本地 `3917cbcc` 与远端 `c68c3b45` 修的是同一个问题（preload 缺 `@shared` 别名），只是插入位置不同——本地插在 `build` 之后，远端插在 `build` 之前。`ort` 判定为两处独立改动，**两段都保留**，于是 `preload` 对象出现两个 `resolve` 键。
- **影响**：低危，**非功能性故障**。两处别名取值完全相同（后者胜出，值一样），`electron-vite build` 不做类型检查。
  实测：重复键版本（`2a3f3845`）与去重版本各跑一次 `npm run build`，**均 exit 0**。
- **处置**：合并两段注释、删除重复块，`preload` 段只保留 1 个 `resolve`。
  经**独立 worktree**（不触碰共享工作区、不切分支）提交到 `feat/domain-learning`：`96ddc6fa`（对 `2a3f3845` 快进）。

## 四、单测回归比对：零回归（逐文件）

方法：用独立 git worktree 把仓库检出到**拉取前**状态（`25a2395e` + 当时两处未提交改动），与拉取后各跑一次同一套 `tests/unit`，同一 JSON reporter、同一份 `node_modules`，再做逐文件集合比对。

| | 失败文件数 | 失败用例数 |
| --- | --- | --- |
| 拉取前 | 28 | 87 |
| 拉取后 | 30 | 102 |
| **差异** | **+2** | **+15** |

- **失败数完全一致的文件：28 个（全部）**——拉取前失败的每一个文件，拉取后失败用例数一模一样，**无一处回归**。
- 唯二新增的失败文件是**另一位并发开发者**新建的两个 spec（非本次拉取引入）：
  - `tests/unit/core/platform/services/provider-template-token-plan.spec.ts` 0 → 11
  - `tests/unit/electron/ipc/provider-config-base-url.spec.ts` 0 → 4
- 即：**拉取本身零回归**；仓库存量 87 个失败用例是既有基线，与本次拉取无关（多为 repository/DB 类）。

证据：`progress/_pull_after_unit.json`、`progress/_pull_baseline_unit.json`、`progress/_pull_fail_diff.txt`、`*_after.failed.txt`、`*_baseline.failed.txt`。

补充：本地提交 `25a2395e`（剧本增量追加）自带 spec 60 例全过。

## 五、⚠️ 重要环境情况：有并发开发者共用同一工作区

本次操作期间，**另一位开发者/agent 正在同一个工作目录（`C:\Users\daoge\code\project\the-bot`）内实时改代码并提交**：

- 21:57–22:00：provider 模板改造（`apiKeyPrefix`/`usageNotes`）、`progress/2026-09-10-bailian-token-plan.md`、`tasks/2026-09-10-bailian-token-plan/`。
- 22:09：`package.json` / `package-lock.json`（电子书依赖）。
- 22:12–22:13：`src/core/utils/extract-text.ts` + epub fixtures。
- **HEAD 被切走**：从 `feat/domain-learning` 新建并切到 `fix/kb-epub-parse`，先后提交 `e9232eb9`、`900d2e87`。

因此当前工作区状态与本次拉取**已不是同一分支**：

- `feat/domain-learning` 仍停在本次合并提交 `2a3f3845`（本地领先 origin 3 个提交，**未推送**）。
- 工作区 `HEAD` 现在在 `fix/kb-epub-parse`（他人分支）。

其余工作区改动（`provider-*`、`topic-research.json` 等）**均非本次拉取所产生**，属并发开发者与另一条 topic-research 线，未做任何触碰。

## 六、依赖与安装

- 合并带入的 `@lingo-reader/mobi-parser` 此前缺失，已 `npm install` 补齐；`dompurify` 已在。
- 复查当前 `package.json` 全部依赖均已安装。
- ⚠️ `npm install` 的 `postinstall`（`electron-builder install-app-deps`）**未能完成**：`better_sqlite3.node` 被正在运行的 Electron 进程占用（EBUSY）。因原生模块此前已是 Electron ABI 且改动未触及，实际未受影响（单测与构建均通过）。若后续确需重建，需先关闭在跑的 dev 实例再执行 `npm run rebuild:electron`。

## 七、遗留事项

1. ✅ **已处置**：`electron.vite.config.ts` 去重修复经独立 worktree 提交为 `96ddc6fa`（落在 `feat/domain-learning`，快进无冲突）；共享工作区内那份未提交副本已还原，工作区对 config 保持干净。
2. ⏸ **`feat/domain-learning` 领先 origin 4 个提交未推送**（2 个本地提交 + 本次合并 + 去重修复）——按用户决定，**等并发工作收敛后再推**。
3. ⚠️ 存在并发开发者共用工作区，全程**未做任何切分支/推送动作**，其改动（`provider-*`、`topic-research.json` 等）一概未触碰。
4. 存量 87 个单测失败为既有基线，未在本次范围内处理。

## 八、本次使用的临时资源（已清理）

- 临时 worktree：`the-bot-baseline`（拉取前状态跑基线）、`the-bot-cfgfix`（提交去重修复）、`the-bot-nodup`（验证重复键版本构建）——**均已 `git worktree remove`**。
- 临时脚本：`scripts/tmp_dupkey_check.cjs`、`scripts/tmp_parse_vitest.cjs`、`scripts/tmp_cmp_vitest.cjs`——**均已删除**。
