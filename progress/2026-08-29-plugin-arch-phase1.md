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
