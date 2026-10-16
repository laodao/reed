# 任务 T06 · 阶段检查清单产品化

> Wave：W2（合并序第 3）｜估时：5–8 人日｜依赖：无硬依赖
> 被依赖：T09 解说剧会扩展 StageGapBanner（解说声线缺失提示），故 T09 在 W3
> 必读：`00-共享约定与工程规范.md`

## 执行须知（subagent）

- **范围白名单**：仅下文 §4 所列文件。
- **VLM 成本红线**：`text_artifact`（文字/水印检测）必须做成默认关闭的开关项，仅对"拟入选合成"（`include_in_final`）的分镜执行；单测中不实际调 VLM。
- **DoD / 报告**：见 README §6。

## 1. 背景与目标

坏帧的价值损失在于传播（"前面的文案、角色、场景或首帧错了，后面的视频通常也会跟着错"）。把 DramaClaw 8.3.3 渲染图通过标准（角色脸一致/服装身份/场景/道具/文字残留/视频可用性）与 12.1 分阶段检查表产品化：分镜卡质检徽标 + stage 出口清单卡 + 不合格项一键跳转修复。

## 2. 功能设计

### 2.1 后端：分镜粒度检查

`quality-check.service.ts` 扩展：

```
checkStoryboard(storyboardId) -> {
  items: [{
    key: 'keyframe_exists' | 'keyframe_refs_covered' | 'subtitle_dialogue_match'
       | 'video_ready' | 'duration_deviation' | 'face_consistency' | 'text_artifact',
    label: string, pass: boolean, detail?: string,
    severity: 'error' | 'warn'
  }]
}
checkEpisode(episodeId) -> { passRate: number, items: 按 storyboard 聚合 }
```

- 前五项复用现有四指标实现，拆到单分镜粒度。
- **口径硬约束（review 修正）**：必须沿用现有 `QualityCheckStatus` 四态（green/yellow/red/skipped，`quality-check.service.ts:46`）与 `EpisodeQualityReport` 的 Report 结构——`checkStoryboard` 是 `checkEpisode`（`:137`）的分镜粒度下钻视图，**不新造状态枚举与报告形状**，防止两套质检口径分裂（深度评审 P1 的教训）。
- `face_consistency`：VLM 相似度（关键帧 vs 角色主图/身份图），阈值可配置，默认 0.75，severity=warn。
- `text_artifact`：VLM 问"画面是否含文字/水印"，severity=warn，**默认关闭**（项目设置或调用参数开关）。
- 新 IPC：`ep:quality:check-storyboard`、`ep:quality:check-episode { episodeId }`。

### 2.2 前端

1. 分镜卡（网格位于 `storyboard/StageStoryboardEditor.vue` / `StageStoryboardView.vue`，以实际卡片组件为准）右上角质检徽标：全过=绿勾；含 error=红点；仅 warn=黄点；悬停显示失败项 tooltip。
2. `workbench/StageGapBanner.vue` 扩展为可展开"检查清单"卡：逐项列出失败分镜与原因，点击跳转对应分镜并高亮失败项；失败项旁联动既有动作按钮（"重新生成关键帧"/"🎯 挑图"/"重新生成视频"）。
3. 合成导出的既有硬阻断（`stage-gate` + 导出阻断）**不变**，本任务只做可视化，不改门控语义。
4. 刷新时机：关键帧/视频生成完成事件后自动刷新当前集检查结果（复用既有生成完成 IPC 事件监听点）。

## 3. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 修改 | `platform/episode-production/services/quality-check.service.ts` | 分镜粒度拆分 + face_consistency + text_artifact（可选开关） |
| 新增 | `packs/episode-production/handlers/quality.handler.ts` | 两个查询 channel |
| 修改 | `packs/episode-production/handlers/index.ts` | 注册 |
| 修改 | 分镜卡组件（storyboard 目录，定位见 §2.2） | 质检徽标 |
| 修改 | `renderer/src/components/episode-production/workbench/StageGapBanner.vue` | 清单卡展开 + 跳转/联动修复 |
| 修改 | `renderer/src/stores/episode-production/workbench.ts` | 检查结果缓存 + 自动刷新 |
| 修改 | `src/shared/types/` | 检查结果类型 |

## 4. 测试与验收

**单测**（夹具不实际调 VLM，VLM 项注入 mock）：
- 各 item 判定：缺关键帧 / 缺视频 / 时长超差 / VLM 低分 → 对应 pass=false 与 severity
- checkEpisode 聚合通过率计算
- text_artifact 开关关闭时不执行

**集成**：对真机脚本产物集跑全量检查，结果与人工判断抽检一致。

**人工验收 AC**：
- AC1 清空某分镜关键帧 → 徽标红点、清单卡列出并可跳转高亮
- AC2 挑图修复后徽标自动转绿（生成完成触发刷新）
- AC3 联动按钮正确调起重生/挑图流程
- AC4 VLM 项默认关闭不出现在检查中；开启后仅对入选分镜执行
- AC5 导出门控行为与迁移前一致（只增可视化）
- AC6 回归基线全绿
