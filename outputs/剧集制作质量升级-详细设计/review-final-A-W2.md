# 最终对抗性审查 · 报告 A（W2：T05/T06/T03）

> 审查员 A ｜ 只读静态审查 ｜ 2026-10-14

## 总评

三笔提交整体高于均值：T06 严守"不新造口径"硬约束；T05 resolver 扩展纯加法且 AC2 红线有测试锚；租户隔离/迁移双登记/双端接线到位；主 spec 夹具真实，未见恒真断言。但打中 **2×P1**。

## P1（必修）

### P1-1 保存设置弹窗用旧 stylePrompt 冲掉新应用的模板快照（三键分裂）
- `SettingsDialog.vue:417,532,685-687,715-716`：handleSubmit 以 store 最新 config 为底后又被 `...formConfig` 覆盖，而 formConfig 只剥 renderDefaults/episodeTargetChars **不剥 stylePrompt**；`StyleTemplateSection.vue:440` 应用模板只刷 store 不回写弹窗 form。
- 触发：弹窗内应用模板 → 点底部保存 → stylePrompt 回退旧值而 styleNegative/styleTemplateId 保留新值 → 风格错乱。T05 声称防住了但只防 2/3 键。`form.config.stylePrompt` 无任何输入绑定（grep 零命中），纯陈旧影子。
- **修法（一行）**：handleSubmit 中 `delete formConfig.stylePrompt`；或 applyTemplate 后回填 form。

### P1-2 自动刷新触发隐性重复 VLM 调用（T06 成本红线声明不成立）
- `workbench.store.ts:130-138` 进度 tick → 1.5s 防抖 refreshQuality；而既有第四项 `checkVlmSimilarity`（quality-check.service.ts:224，真实 ffmpeg 抽帧 + callVLM）**不受** faceConsistency/textArtifact 开关控制 → 生成期间每 ≥1.5s 一次 VLM 计费调用。
- **修法**：checkEpisode 加独立 `vlmSimilarity` 开关（默认关，自动刷新路径显式关）；或 refreshQualitySoon 仅在终态事件触发。

## P2

- **P2-1** `renderDefaults.videoResolution` 死键：设置可保存但全仓零消费（segment-video 高度恒 1080）。修：视频链读该键，或分区先隐藏。
- **P2-2** 避免指令只达关键帧链路：`main-image-generator.service.ts:157` 不含 styleNegative、缩略图 negative 硬编码——与 task-05 §4 声称的"资产图/缩略图自动携带"不符。修：两入口并入 effectiveNegative。
- **P2-3** text_artifact VLM prompt 缺输出 JSON 模板 → 任意其他形状一律判 pass（假阴性）。修：补 `{"hasText": bool, "detail"}` 模板。

## P3（9 项，择机）

1. 模板名 create 拒绝 >60 字 / update 静默 slice 口径不一致；重名无提示
2. `keyframe_exists` 未生成时 pass=true + severity=error 语义矛盾（建议 skipped）
3. `loadDialoguesByStoryboard` 裸 SQL `?` 占位符 PG 方言会抛错被吞成 skip（存量债同款）
4. aggregateStoryboards 逐镜串行 await；auto-refresh 不看事件 payload（他集生成也触发）
5. 模板命中时双通道重复注入（preset 替换 + projectStyle 快照同词两遍）——建议文档明确或去重
6. 清单卡"重新生成"同步 await 分钟级且全列表互斥、无进度反馈
7. `ep:quality:check-storyboard` 通道前端零调用（预留通道注明或移除）
8. add-ep-style-template 迁移单测仅 SQLite（同侪已有 PG 夹具）
9. fetchQualityReport 失败被缓存后不自动重试

## 设计符合性

- task-05：AC1 部分（资产图仅风格词，见 P2-2）；AC2–AC7 ✅
- task-06：AC1–AC6 ✅（AC2 的自动转绿有 P1-2 副作用）
- task-03：AC1–AC5 ✅；附加项 videoResolution ❌（P2-1）

## 结论

可保留合并。**P1-1/P1-2 建议立即修**（一行级 + 开关级）；P2-1/P2-2 排后续收口。
