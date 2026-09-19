# 视频渲染服务

渲染域视频子域 — AI 视频 provider 调用 / 异步任务轮询 / 视频下载保存。

## 文件列表

| 文件 | 职责 |
|------|------|
| `video-generation.service.ts` | AI 视频生成服务：调用视频 provider、管理轮询任务、下载保存视频、provider 列表查询与测试 |
| `segment-planner.ts` | 片段拆分规则 + 多镜头提示词拼接（纯函数）；`buildSegmentPrompt` 默认在约束尾巴追加「画面中不得出现字幕、文字、水印、LOGO」（字幕由合成阶段后加；`SegmentPromptOptions.allowOnScreenText=true` 可豁免） |
| `index.ts` | barrel 导出 |

## 依赖关系

```
video-generation.service.ts
  ├── @core/video-providers（createVideoProvider / BaseVideoProvider）
  ├── @core/database/database-manager.interface（providerConfigs）
  ├── @core/interfaces/event.interface（getEventEmitter）
  ├── @core/interfaces/storage.interface（getSecureStorage）
  └── @core/utils/asset-path（toAssetUrl）
```
