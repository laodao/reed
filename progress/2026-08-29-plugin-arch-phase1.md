# 插件（业务包）架构第一期 · 实施记录

> 日期：2026-08-29 ｜ 分支：feat/plugin-arch（自 feat/workflow-engine c069a365 切出）
> 设计依据：tasks/2026-08-28-agent-loop-harness/（18 业务包架构、19 重构评估、20 cordis 评估）
> 范围纪律：只做插件架构本体 + 现有功能迁移；事件平台/AgentRuntime/新业务包不做。

## 结果概览

| 阶段 | 提交 | 内容 |
|---|---|---|
| P0 | 39ead930 | 死代码清理：image/translate/voice(TTS/STT/Clone) 遗留视图组件、EP 旧版项目列表，约 5k 行（均无活路由引用） |
| P1 | 4c2dd7bc | `src/shared/types/pack.types.ts`：PackManifest/PackState/校验器（fail-fast），7 项单测 |
| P2 | ef64a042 | 后端内核：双端表迁移（business_packs/business_pack_bindings）、registry（依赖 pending + 级联 + disposer 逆序）、pack.service（启用解析链）、IPC 守卫（前缀归属 + PACK_DISABLED 拦截）、双端装配 |
| P3 | a6f25b2e | 前端内核：路由/菜单动态注册（壳静态 + 包贡献）、7 个前端包骨架、pack IPC namespace、废弃 pathTitleMap |
| P4-1 | fdf82f2d | skills/diary/portrait 迁移（9+16+26 channel） |
| P4-2 | 18d8dace | chat（dialog/message/role/chat，21 channel）/voice-design（20 channel）迁移 |
| P4-3 | e8daaee8 | longwriting 迁移（202 channel 全覆盖断言） |
| P4-4 | ee1af356 | episode-production 迁移（175 个 ep:* channel 全覆盖，dependencies=['voice-design']） |

## 架构形态（原地登记式）

- 业务代码零搬迁；包 = 装配清单：后端 `src/core/packs/<name>/index.ts`（manifest + activate 调既有 register 函数），前端 `src/renderer/src/packs/<name>/index.ts`（routes/menuItems）。
- 壳保留：`initIpcHandlers()`/`registerAllWebChannels()` 残留 20 个平台级 handler（settings/workflow/app/kb/assets/datasource/tool 等），平铺清单中的业务条目已清空。
- 禁用语义：前端入口消失（重启生效）+ IPC 守卫按前缀拦截；服务实例不卸载、在途数据不动。

## 验证记录

- 构建：electron-vite build / web:client:build 各阶段均通过。
- 单测：新增 pack 测试 36 项全绿（registry 生命周期/依赖 pending/disposer 逆序/启用解析链/迁移幂等/各包 channel 覆盖断言）；全量 sqlite 回归 2566 通过 / 74 失败——与重构前存量基线一致（74 失败均为存量问题）。
- typecheck：基线 1005 条存量错误，全期净增 0。
- eslint：新增/改动文件 0 error（存量 any 警告不动）。
- PG 方言测试未跑（本机 PG 凭据不可用）；迁移 PG 侧经代码评审，待有凭据环境补跑。

## 顺带修复/发现

- better-sqlite3 原生模块版本不匹配的环境缺陷已修复（npm rebuild），DB 类测试本机恢复可跑。
- `skill:*` 9 个 channel 此前 Web 端从未注册，随包激活补齐（修复而非回归）。
- 存量 lint 6 处错误清理（触碰文件内）；`portrait_characters` 迁移 prompt 列可空性早退检查疑点已注释记录（存量行为未改）。
- 已知耦合（仅记录未拆）：EP agent 复用 longwriting 的 `lw_design_messages` 表；EP 前端引用 voice-design 的 VoiceCloneDialog（已由 dependencies 表达）。

## 遗留（下一期候选）

- 运行时动态启停（applyPacks 一次性应用 + 桥表缺 removeHandler 逆操作）；包管理 UI（Settings 列表 + setEnabled 入口）；per-user binding 的 Web 端生效验证。
- 物理搬迁（可选第二步）：边界勘探本期已完成，搬迁时内核零改动、只改 import 路径。

## 启动冒烟（2026-08-29 补记，提交 1febab05）

PC 端真机启动暴露并修复了 4 个阻塞（前 3 个为存量 bug，与本架构无关但在本分支一并修复）：

1. **sanitize-share-tokens 迁移缺表存在性检查**：注册顺序早于 create-apps-tables，旧库无 apps 表必崩（"no such table: apps"）→ 加双方言存在性检查跳过。
2. **provider_configs.default_model 缺列**：entity 有列但历史无迁移，旧库被 drift 检查阻断 → 补 `add-provider-config-default-model` 迁移（双端登记）。
3. **lw 临时角色/地点模板串行门反模式**：`transaction(async () => { this.upsert(...) })` 回调内走全局代理 → 改用事务 manager 仓储（评审 🔴#39 同类；其余 12 处存量站点未动，留专项）。
4. **包重复激活 bug（本架构新增代码）**：activate 无 disposer 的包禁用后再启用会重跑 activate，重复注册 IPC channel 抛错把包打成 failed → registry 增加 contributionsLive 语义：无逆操作可执行时恢复启用只翻状态不重跑；含单测 + 修正一条锁定旧语义的存量断言。

验证：
- PC 端（DISPLAY=:1）启动成功：`[pack-kernel] 业务包子系统已启动（7 个内置包）`，7 包全部激活，工作流子系统正常。
- CDP 冒烟 `scripts/e2e-pack-smoke.cjs` 6/6 通过：pack.list 7 包、菜单渲染、6 条业务路由可达、禁用 skills → skill:* 被 `PACK_DISABLED` 拦截、依赖语义（禁 voice-design → EP pending 且 ep:* 被拦）、恢复启用。
- PG 方言补验（the-bot-test-pg 容器）：迁移双表 + 表达式唯一索引 `(pack_id, COALESCE(user_id,''))` 在 PG 实测通过；sanitize/default_model 迁移幂等通过。
- 遗留：PG 方言全套件仍受存量实体 `datetime` 类型（56 处）阻塞（非本次引入）；ABI 双态冲突（测试需 Node ABI、应用需 Electron ABI）需以 rebuild 命令切换。

## 逐模块 e2e（2026-08-29，CDP 真机，scripts/e2e-pack-*.cjs）

对 7 个内置业务包逐个跑端到端 IPC 测试（playwright 连 CDP `http://127.0.0.1:9333`，真实调用 `window.electronAPI.*`，真实用户库，测试实体一律 `E2E-` 前缀并在用例内清理，实测无残留）。脚本：`scripts/e2e-pack-{skills,diary,chat,portrait,voice-design,longwriting,episode-production}.cjs`。

### 结果概览

| 包 | 结果 | 覆盖要点 |
|---|---|---|
| skills | ✅ 8/8 | list/create/get/resolve/update/forkBuiltin/remove，inputs schema 持久化验证 |
| diary | ✅ 15/16 | 16 个 diary:* channel 全覆盖（目录嵌套/重命名/日记 CRUD/搜索/反链/移动/HTML+DOCX+PDF 导出） |
| chat | ✅ 8/8 | role/dialog/message 全套 CRUD + chat:send 真实 AI 流式（deepseek-v4-flash-0731，回复落库）+ chat:stop |
| portrait | ✅ 8/9（1 项环境受限） | 提示词模板 save/apply/delete、项目/角色 CRUD、变体列表；AI 生图因 API key 无效跳过 |
| voice-design | ✅ 5/6（1 项环境受限） | providers/voices/history/cloned-list 查询；TTS 因 API key 无效跳过 |
| longwriting | ✅ 11/11 | 项目/概要/背景/角色/地点/势力/情节/大纲/章节/记忆/字典/向导/向量索引/导出 + AI generateStoryOverview 真实生成成功 |
| episode-production | ✅ 10/10（含 2 项已知存量失败的反向验证） | 项目/剧集（outline 模式）CRUD、资产域查询、linked_lw 角色资产全链路、预设/provider 查询、门控/进度 |

结论：**7 个包的 IPC 收编与守卫未引入任何功能回归**；所有 CRUD/查询类 channel 在重构后正常工作。

### 失败项根因分类

**A. 本次包架构重构引入：0 项。**

**B. 存量问题（与重构无关，git log 证实涉及文件最后提交均早于本分支）：**

1. **diary 目录重命名不级联更新子目录/日记文件路径**（`src/core/services/diary.service.ts:125` updateFolder 只改自身 `path`）。重命名父目录后对子目录执行 `diary:move-entry` 必现 ENOENT（源路径已是新名、目标路径仍按旧名拼接）。e2e-pack-diary.cjs 步骤 12 实测复现。
2. **EP 真实库 schema 漂移：NOT NULL 残留**（生产不跑 synchronize，且 `relax-binding-lw-id-nullable` 迁移的 SQLite 分支是空转注释、"依赖 synchronize"，从未真正重建表）：
   - `video_episodes.outline_id NOT NULL` → uploaded 模式建剧集必炸（`relax-episode-script-outline-id` 只处理了 episode_scripts 表，漏了 video_episodes）。前端 `ScriptImportCard.vue:197` 等入口实际受影响。
   - `character_bindings.long_writing_character_id NOT NULL` → standalone 角色资产无法创建。
   - 另：`video_projects.config NOT NULL`，`ep:create-project` 不传 config 即撞约束（`NewProjectDialog` 传了 config 所以主流程无碍，但 `ScriptImportCard.vue` 的 `createProject(name)` 调用会炸）。
   - e2e-pack-episode-production.cjs 步骤 3b/7b 做了反向验证，确认错误信息符合上述判断。

**C. 环境 / AI 额度限制：2 项。**

- portrait AI 生图、voice TTS：provider `阿里百炼平台-tokenplan`（pc_mtee10tz_ijz2yq1ro）的图像/语音接口报 `Invalid API-key provided`（同一配置的 LLM 模型可用，疑似该 key 未开通 wan2.7-image / qwen-audio 权限）。非代码问题。

### 遗留风险

真实用户库的 SQLite schema 漂移（NOT NULL 残留）使 EP 的 uploaded 建集与 standalone 资产两条用户路径在当前库上实际不可用，需要一期专门的 SQLite 表重建迁移（与包架构无关，但比包架构更影响用户）。

---

## 物理搬迁（2026-08-29 下午）

将 7 个内置业务包的后端代码实体从 `src/electron/ipc/handlers/` 与 `@core/services` 收拢进各自包目录（`src/core/packs/<id>/handlers|services/`），包边界实体化。纯移动 + import 路径改写，零业务逻辑变更。前端视图（renderer/views/）本期不搬。

### 每包搬迁清单

| 包 | 搬入 handlers/ | 搬入 services/ |
|---|---|---|
| skills | `skill.handler.ts` | —（skill-registry/skill.service 属 workflow 模块，壳共用，留下） |
| diary | `diary.handler.ts` | `diary-export.service.ts`（仅 diary.handler 引用） |
| portrait | `portrait.handler.ts` | `portrait.service.ts`（仅 portrait.handler + 其单测引用） |
| chat | `chat/dialog/message/role.handler.ts`（4 个） | `chat.service.ts`（仅 chat.handler 引用） |
| voice-design | `voice.handler.ts` | `voice-design.service.ts`（仅 voice.handler 引用） |
| longwriting | `longwriting.handler.ts` | `longwriting.service.ts`、`material-processor.service.ts`（均仅 handler 引用）、`lw-migration.service.ts`（仅 handler 动态 import，electron 专属，随包走） |
| episode-production | 整个 `handlers/episode-production/` 目录（25 个 handler 文件 + 统一入口 index.ts，内部相对结构原样保留） | — |

### 判定为共用而留下的 service

| service | 引用方（除本包外） |
|---|---|
| `@core/services/diary.service` | workflow 壳 `modules/workflow/nodes/diary-nodes.ts` |
| `@core/services/voice.service` | EP 音频三件套（dialogue/scene-audio/narration-synthesis）+ workflow `ai-nodes.ts` |
| `@core/services/voice-clone.service` | `voice-clone-job-scheduler` + workflow `voice-clone-nodes.ts` |
| `@core/services/voice-clone-job-scheduler` | 双端壳启动（`electron/index.ts`、`web/server/index.ts`） |
| `@core/services/longwriting-ai.service`、`longwriting/agent/agent-workflow.service` | EP 包 `ep-agent-workflow.service` 复用（已知跨包耦合） |
| `@core/modules/episode-production/**`（EP 业务服务层） | Web 壳 `upload-router.ts` 直接引用 asset-image/panorama 等服务，且整体双端共用 |
| `@core/modules/workflow/skills/**`（skill-registry/skill.service） | workflow 壳 |

不确定归属的一律留下，无遗漏搬迁。

### 路径改写要点

- 包 index.ts 改为从 `./handlers/...` 相对导入，头注释由"原地登记式"改为"物理收拢式"并记录共用 service 判定。
- `longwriting.handler` 与 EP 4 个 handler 的 `./_platform`、`../../_platform` 改为别名 `@electron/ipc/handlers/_platform`（_platform 仍为壳层其他 handler 共用，留在原地）。
- `lw-migration.service` 的 `../database/index` 改为 `@electron/database/index`。
- 包内 handler↔service 用包内相对路径（`../services/...`），跨包/跨层一律走 `@core/@shared@electron` 别名，无深相对路径。
- 受影响测试同步改路径（纯路径，未动断言）：`tests/unit/packs/longwriting-pack.spec.ts`、`episode-production-pack.spec.ts`（读 handler 源码做前缀覆盖断言）、`tests/unit/episode-production/render/infer-subject-support.spec.ts`、`tests/unit/services/portrait*.spec.ts`（7 个）。
- renderer 与 web/client 均不 import `core/packs`，`web:client:build` 不涉及（跳过）。

### 验证结果

- `npx electron-vite build`：✅ 通过（20.1s）。
- `npx vue-tsc --noEmit`：993 条错误 ≤ 基线 1005，净增 0；触及文件中无新增错误、无 TS2307 模块解析错误（全部 TS2307 均为 renderer 存量）。
- 重启应用（CDP 9333）+ `e2e-pack-smoke.cjs`：✅ 6/6。
- 逐模块 e2e：skills 8/8、diary 15/16（move-entry 为已确认存量 bug）、chat 8/8、portrait 8/9（AI 生图 key 无效，同基线）、voice-design 5/6（TTS key 无效，同基线）、longwriting 11/11、episode-production 10/10——均不劣于搬迁前基线。
