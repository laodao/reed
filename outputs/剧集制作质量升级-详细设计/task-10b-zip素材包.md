# 任务 T10b · ZIP 素材包导出

> Wave：W3（合并序第 4）｜估时：2–4 人日｜依赖：无
> 必读：`00-共享约定与工程规范.md`

## 执行须知（subagent）

- **范围白名单**：仅下文 §3 所列文件。
- **成本红线**：大项目导出必须流式打包（`archiver` append file stream），禁止整体读入内存。
- **DoD / 报告**：见 README §6。

## 1. 背景与目标

面向后期交接：把一集的可交付素材（分镜图/视频片段/音轨/字幕）打包为 ZIP + 结构化清单（DramaClaw 8.4"导出 ZIP"）。本项目目前只有 MP4 导出。

## 2. 功能设计

- 新服务 `compose/episode-zip-exporter.service.ts`：与 `episode-mp4-exporter.service.ts` **共用素材收集逻辑**（抽取共同收集函数或复用其收集阶段）。
- 范围：按入选分镜（`include_in_final`）收集关键帧图 / 视频片段 / 音轨 / SRT 字幕（`subtitle.service.ts` 已能产出）。
- 目录结构：
  ```
  images/{分镜号}.png   videos/{分镜号}.mp4   audio/{音轨名}.wav|mp3
  subtitles.srt         manifest.json
  ```
  `manifest.json`：`{ episodeId, exportedAt, resolution, shots: [{ seq, 文案, 时长, 资产引用, includeInFinal }] }`——与时间线数据一致。
- 导出位置：与 MP4 导出同目录约定；完成后经通知中心提示（复用现有导出完成通知路径）。
- IPC：`ep:compose:export-zip { episodeId }` → `{ zipPath }`；前端 `stage-compose/ExportDialog.vue` 加"导出素材包 (ZIP)"选项，完成后提供"打开所在目录"。

## 3. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 新增 | `platform/episode-production/compose/episode-zip-exporter.service.ts` | 收集（复用 MP4 收集逻辑）+ archiver 流式打包 + manifest |
| 修改 | `packs/episode-production/handlers/compose.handler.ts` | `ep:compose:export-zip` |
| 修改 | `renderer/src/components/episode-production/stage-compose/ExportDialog.vue` | ZIP 选项 + 完成提示 |
| 修改 | `src/shared/types/`（compose 类型） | 导出参数/结果类型 |

> `archiver@7` 已在依赖（`package.json:82`），无需新增。

## 4. 测试与验收

**单测**：manifest 生成与时间线一致性（入选/调序后）；manifest 结构 schema 断言。

**集成**：真机或夹具集导出 ZIP → 解包校验目录结构完整、文件数与入选分镜数一致、SRT 可被播放器识别。

**人工验收 AC**：
- AC1 ZIP 五个部分齐全，manifest 与时间线一致
- AC2 大项目（50+ 分镜）导出内存平稳（流式）
- AC3 完成后通知提示 + 打开目录可用
- AC4 双端可导出
- AC5 回归基线全绿（MP4 导出不受影响）
