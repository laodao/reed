# 剧集制作·系统问题清单与加固计划（2026-09-16）

依据：《忘川渡》第一集两轮端到端实测（失败轮 + cogen 修复后轮）+ 上线就绪评估。只收**系统问题**；模型能力问题（M 类）不在本计划内，除非系统侧有根治手段（如 H11）。

## 0. 本会话已修复并入代码（备查，不再列入待修）

| 编号 | 内容 | 位置 |
|---|---|---|
| F-A | 视频 provider 就绪判定无视 `requiresApiKey:false`（ComfyUI 永远灰） | `handlers/render/video-segment.handler.ts` |
| F-B | 关键帧多参考图致 Kontext 网关 400；参考图按 角色>物品>地点 排序 | `providers/image/sdk/comfyui-image.provider.ts`、`keyframe-generation.service.ts` |
| F-C | 关键帧固定 1024² → 跟随项目画幅（16:9=1344×768） | `keyframe-generation.service.ts` |
| F-D | 场景有角色但无绑定时拒绝生成关键帧（不再静默纯文生图） | 同上 `assertCharactersBound` |
| F-E | 导出必崩（fluent-ffmpeg 无 `.timeout()`）→ 看门狗 kill | `handlers/compose/episode-mp4-exporter.runner.ts` |
| F-F | cogen 联合生成路径 + Studio 设置入口 + videoQuality/videoSteps | `narrative/ai/storyboard-cogen.ts`、`services/storyboard-cogen.service.ts`、`EpisodeStudio.vue`、`dialogs/SettingsDialog.vue` |

## 1. 待修系统问题完整清单

### P0 必然踩坑 / 数据错误

| 编号 | 问题 | 证据/根因 | 修法 |
|---|---|---|---|
| H1 | 视频轮询超时默认 1800s < H3 高质量实测 30~45 分钟 → 高质量生成必然误报超时 | `base-video-provider-bridge.ts:48` | 默认改 75 分钟，保留 `EP_VIDEO_POLL_TIMEOUT_MS` 覆盖 |
| H2 | LLM 默认超时 60s < 长 JSON 生成（cogen 16k tokens 实测需数分钟）→ 必然 Request timed out | `openai-sdk-provider.ts:56-57` | 默认 300s，保留 `AI_PROVIDER_TIMEOUT_MS`；anthropic-sdk-provider 同步 |
| H3 | safeStorage 不可用时回退主密钥**每次启动随机生成** → 重启后所有已存 API Key 永久无法解密（报 "Invalid encrypted data format"，无引导） | `secure-storage.service.ts:48-51`（Electron 端实际注册实现，`electron/index.ts:437`） | 回退主密钥持久化到 userData 下 0600 权限文件（load-or-generate）；解密失败错误文案改为"密钥无法解密，请到设置重新输入 API Key" |
| H4 | 重新分段对已 completed 的旧片段"不动"（by design 注释），但分镜被 cogen/重拆替换后旧片段引用失效分镜，合成时新旧混排（本次第一集差点把两版不一致的视频拼进同一成片）；UI 无片段删除入口 | `ep-segmentation.service.ts:117-125`、`StageComposeTab.vue` | recompute 时校验 completed 片段的 storyboardIds 是否仍命中现存分镜，不命中 → `status='superseded'`；合成列表与导出排除 superseded；合成页片段行加「移除」（软删 `deleted_at`） |
| H5 | 进程重启后 generating 任务直接判 error，即使网关已完成（35 分钟算力白费）；startup-recovery 注释自述"按失败收敛" | `startup-recovery.ts`、`ep_video_segments`/`storyboards` 无 taskId 列 | 提交视频任务时持久化 provider taskId（两表各加一列，走迁移）；启动恢复对 generating 行先查网关：done → 下载落库转 completed；不存在/失败 → error |

### P1 体验 / 一致性

| 编号 | 问题 | 修法 |
|---|---|---|
| H6 | 分镜列表页「生成视频」硬编码 `forceMode:'text2video'`，与编辑器「参考图模式」行为分裂 | `StageStoryboardView.vue:406-410` 不传 forceMode，与编辑器一致由后端 pickVideoMode |
| H7 | 死组件/未接线：`CreateEpisodeDialog.vue`（含唯一的"关联长文章节"入口）无任何引用；双工作台并存 | 删 CreateEpisodeDialog（先全仓 grep 复核）；「关联长文章节」能力并入 BatchCreateEpisodesDialog 或记为后续需求；本期不做 Workbench 合并 |
| H8 | 字幕说话人全部"未知角色"；烧入字幕"不可关闭" | `compose/subtitle.service.ts` 说话人 fallback 按 scene_dialogues 角色名回填；`ExportDialog` 烧入字幕 checkbox 放开（exporter 已支持可选烧入，验证"不烧入"路径） |
| H9 | 实体识别以 `config.scriptModel` 非空为前提且静默跳过（`EpisodeCreator.vue:169-181`） | 跳过时 ElMessage 明确提示"未配置剧本模型，已跳过要素识别，可在设置配置后重试"；Studio 剧本 tab 提供「识别要素」手动入口（若已有则接线） |
| H10 | 旧分镜路径（`ep:generate-storyboards`、agent `generate_storyboards`）绑定缺失时静默 | 结果里带 `unboundCharacters: string[]` 字段，列表页 toast warning"N 个角色未绑定资产，将影响画面一致性" |
| H11 | 制作助手谎报执行结果（声称创建/删除成功但库中无记录）——模型幻觉，但系统可根治 | `ep-agent-actions.ts` 写类动作（generate_*_asset/update_entity/delete_entity）返回前重查 DB 核验，不符则结果里明确"实际未生效"并让助手据此回复 |
| H12 | cogen 转述偏差（"曼陀罗/忘忧草"→"断魂草"）；定妆图描述太薄（阿蘅现代装事故） | cogen prompt 加"药理/对白/数字等细节必须照抄剧本原文"约束 +【人物】段服饰逐字引用资产卡；定妆图 prompt 拼接项目 storyEra/风格锚点（复用 styleAnchors 机制） |
| H13 | cogen 无进度反馈（3 场景约 15 分钟无 UI 反馈） | 复用 `ep:storyboards-progress` 事件通道逐场景推送，前端按钮 loading 文案显示进度 |

### P2 排期

- H14 配音/TTS 链路未实测 → 本次做冒烟验证，坏则另立修复项。
- H15 双工作台合并、Web 端一致性、多参考图网关（Kontext 多图）→ 另立项。
- H16 仓库存量 ~888 个类型错误、src 目录 git 状态异常（改动不进 git status，疑似 skip-worktree）→ 发布管理风险，另立项清查。

## 2. 执行计划（波次）

### Wave A（4 个并行 coder，文件不相交）

- **A1 参数与密钥**：H1（`base-video-provider-bridge.ts`）、H2（`openai-sdk-provider.ts`/`anthropic-sdk-provider.ts`）、H3（`secure-storage.service.ts`）
- **A2 片段生命周期**：H4（`ep-segmentation.service.ts`、`StageComposeTab.vue`、`segment.handler.ts` 或新删除 IPC、导出 service 的片段选择处）
- **A3 字幕与列表一致性**：H6（`StageStoryboardView.vue`）、H7（死组件删除）、H8（`subtitle.service.ts`、`ExportDialog.vue`）
- **A4 cogen 加固**：H12（`storyboard-cogen.ts` prompt + 定妆图锚点拼接处）、H13（`storyboard.handler.ts` + `storyboard-cogen.service.ts` 进度事件 + `StageStoryboardView.vue` 进度文案——与 A3 的 H6 同文件不同函数，A3 先完成或协调：实际把 H13 前端部分并入 A3，A4 只做主进程侧）

> 协调修正：H13 的前端展示并入 A3（StageStoryboardView 归 A3），A4 只改主进程 + prompt。

### Wave B（A 完成后，2 个 coder）

- **B1**：H5 启动恢复（含两表加 taskId 列的迁移、提交时写 taskId、启动重拉落库）——依赖 A2 的片段状态语义
- **B2**：H9 + H10 + H11（episode 创建/旧路径告警/agent 核验）

### Wave C：验证

- 全量 typecheck（只允许存量错误）、相关单测通过；
- 应用带全量修复重启，冒烟：设置页可配模型、分镜页 cogen 按钮可用、合成页可导出；
- H14 TTS 冒烟。

## 3. 验收标准

1. 全新环境（无 env 变量、无 CLI flag）启动应用：高质量视频生成不再误报超时；长 JSON 生成不再 60s 超时；重启后已存 API Key 可用。
2. cogen 重拆后旧片段自动 superseded，合成页只见新片段且可手动移除；导出 MP4 只含新片段。
3. 杀掉应用再重启：generating 中的视频任务能从网关恢复落库（用 turbo 段实测）。
4. 导出字幕说话人显示角色名；可选择不烧入字幕。
5. 制作助手执行写操作后汇报与 DB 实测一致（故意让它删不存在的资产，必须如实报失败）。
6. 无绑定场景走旧分镜路径有明确 warning；未配 scriptModel 创建剧集有明确提示。
