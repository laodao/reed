# 任务 T03 · 画幅/模型集级统一

> Wave：W2（合并序第 4，最后合并）｜估时：2–4 人日｜依赖：无硬依赖
> 冲突注意：与 T05 同碰项目设置组件（本任务加"制作默认"分区，T05 加"风格"分区，**模板不同分区**），按 README §4 合并顺序执行。
> 必读：`00-共享约定与工程规范.md`

## 执行须知（subagent）

- **范围白名单**：仅下文 §4 所列文件。
- **零迁移红线**：默认值存 `video_projects.config`（simple-json）。
- **DoD / 报告**：见 README §6。

## 1. 背景与目标

同一集混用不同渲染模型/画幅会产生风格跳变。提供项目级制作默认（画幅/图像模型/视频模型/分辨率），生成面板默认读取；**只影响新生成**，存量资产不动（默认值语义天然满足，DramaClaw 8.3 同款规则）。

## 2. 功能设计

**数据**（`config` 新键，零迁移）：

```json
"renderDefaults": {
  "aspectRatio": "9:16",
  "imageModel": "<provider:modelId>",
  "videoModel": "<provider:modelId>",
  "videoResolution": "720p"
}
```

**三级默认值取值**：新增纯函数 `resolveRenderDefaults(project, lastUsed, fallback)`（放 `renderer/src/stores/episode-production/` 或 shared utils）——`项目默认 → 用户上次选择 → 全局兜底`，逐字段独立解析（项目只设了画幅时，模型仍走上次选择）。

**UI**：
- 项目设置组件新增"制作默认"分区：画幅（9:16/16:9/1:1）、图像模型、视频模型（选项来自 provider 能力注册，参照 `render/video/provider-capability-matcher.ts` 已注册能力）、分辨率（720p/1080p，视频高度受 `episode-mp4-exporter` 约束）。**双端都要加**（PC 与 Web 的项目设置是两套实现，review 修正）。
- 关键帧/视频生成面板（`storyboard/StageStoryboardEditor.vue`、`storyboard/ShotPromptEditor.vue`、制作 stage 视频生成 panel）：初始化默认值走三级解析；面板临时覆盖仅影响本次生成；已应用项目默认的字段旁显示"项目默认"小标记。

## 3. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 修改 | 项目设置组件（studio 项目设置弹窗，实现时经 `views/EpisodeStudio.vue` → 设置入口定位） | "制作默认"分区 |
| 新增 | `src/shared/utils/render-defaults.ts`（review 修正：纯函数放 shared，双端共用） | `resolveRenderDefaults` 纯函数 |
| 修改 | `renderer/src/stores/episode-production/project.ts` | renderDefaults 读写 |
| 修改 | `storyboard/StageStoryboardEditor.vue`、`ShotPromptEditor.vue`、制作 stage 视频生成 panel | 默认值接入 + 标记 |
| 修改 | `src/shared/types/`（project 类型） | config 类型扩展 |

## 4. 测试与验收

**单测**：`resolveRenderDefaults` 表驱动——项目全设/部分设/未设 × 上次选择有无 × 兜底，逐字段断言。

**人工验收 AC**：
- AC1 设置默认 9:16 + 指定图像模型后，新生成关键帧默认按此执行
- AC2 面板临时覆盖单次生成，不回写项目默认
- AC3 已生成资产、已合成视频、导出不受影响
- AC4 未设置时行为与现状完全一致
- AC5 回归基线全绿
