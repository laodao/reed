# 2026-09-04 · 短视频脚本生成视频（script-to-video）

## 需求
用户希望新增「短视频脚本 → 视频」工作流，用已有视频模型（火山引擎 **Seedance 2.0** 图生视频）。要求：
1. 高质量产出（画面/配音/字幕/卡点/规格）。
2. **先用短脚本测试跑通全链路**；正式（长脚本/5 分钟）跑之前，**先把文案、图片素材设计好给用户确认**。

## 已实现

### 新增引擎节点（src/core/modules/workflow/nodes/video-nodes.ts）
- **`video-gen`**：文生视频/图生视频，复用 `VideoGenerationService.generateVideo`；
  `image` 支持本地路径与 `local-image://` URL（解析为本地文件转 base64）；异步任务用 `tapEvents` 监听 `video:generation-event` 的 `generation-completed`，返回 `videoPath`。
- **`video-compose`**：ffmpeg 合成——逐镜头段（图/视频）按时长转片段 → concat 拼接 → 烧录字幕(SRT 时间轴) → 音轨混音(配音 + BGM 压低避人声) → 输出 mp4（主进程 handler 调用 `@ffmpeg-installer`）。

### 注册链（新节点类型）
- `src/shared/types/workflow.types.ts`：`WorkflowNodeType` + `WORKFLOW_NODE_TYPES` 补 `video-gen`/`video-compose`
- `src/shared/types/workflow-node-catalog.ts`：`NODE_TYPE_CATALOG` 加两目录项
- `src/core/modules/workflow/nodes/index.ts`：注册 `VIDEO_NODE_HANDLERS`

### 新内置工作流（src/core/database/migrations/builtin-apps/script-to-video.json）
`start → parse1(AI拆解分镜, jsonMode) → htmlPre(素材预览文案) → loopShot(每镜头: img1 文生图 → vid1 Seedance 图生视频) → tts1(口播配音) → code1(组装镜头段) → comp1(合成) → save1(视频) → saveXml(素材预览) → end`
- 输入：script(markdown)/videoProviderConfigId/videoModelId(Seedance2.0)/imageProviderConfigId/imageModelId(Seedream)/voiceId/width/height/bgmPath/model
- 产出：成片 mp4（save1）+ 素材预览（saveXml，各镜头文案+时长），存资产库。

### 内置应用注册
- `create-builtin-apps.ts`：import + `BUILTIN_APPS` 加项（`builtin_app_script_to_video`，🎞️ 脚本生成视频，视频制作）
- `create-builtin-apps.spec.ts`：内置数量 20→21

## 质量要点
- 画面：Seedream 文生图 + Seedance2.0 图生视频动化（真动态）；统一竖版 1080×1920。
- 卡点/对齐：tts 口播配音（得 durationMs）→ 每镜头时长；字幕按时间轴烧录。
- 配音/音效：TTS 配音 + 可选 BGM（压低避人声）。
- 规格：1080×1920 竖版输出。

## 测试与预览
- ⚠️ 本地 `better-sqlite3`（NODE_MODULE_VERSION 119 vs 127）受限，`create-builtin-apps.spec` 等需匹配 Node 环境运行；tsc 复查：新增代码无类型错误（剩余报错均为既有）。
- **生效**：需重启 `npm run dev:debug`（触发 `createBuiltinApps` 注册新节点类型与新内置工作流）。
- **短脚本测试**：先取吃瓜脚本的 2–3 个镜头（约 30–60s）跑通 image-gen→Seedance→tts→compose→save 链路，控制费用。
- **正式前素材预览**：工作流 `saveXml` 已存「素材预览」资产（各镜头文案+时长）；正式跑长脚本前，可先取出每镜头**文案+图片**给用户审阅确认后再合成。

## 实测（2026-09-05 跑短测「星宇前3镜头」）发现并修复

用 `script_short_test.md`（星宇前3镜头约 38s）通过 CDP 触发 `wf:start-run` 实测，逐级排查出 3 个阻断链路的问题并修复：

1. **code 节点 `inputs` 格式错误**（`script-to-video.json` htmlPre/code1）
   - 错误：`"inputs": { "shots": "{{...}}" }`（对象），`code-nodes.ts` 期望 `[{key,value}]` 数组 → vm 报 `object is not iterable`
   - 修复：改为 `"inputs": [ { "key": "shots", "value": "{{...}}" } ]`（两处）
   - 同步 DB `published_graph`/`draft_graph`（`builtin_def_script-to-video`）

2. **video-gen 的 image 引用失效**（`script-to-video.json` vid1）
   - 错误：`image: "{{img1.images.0.url}}"`，但 image-gen 输出对象无 `url`（只有 `path`/`localUrl`）→ 图生视频退化为无图
   - 修复：改为 `image: "{{img1.images.0.localUrl}}"`（`local-image://`，video-gen 会 resolveAssetPath 转 base64）
   - 同步 DB 定义

3. **volcengine 视频 provider 是旧的 Vidol 实现，不支持 Seedance 2.0**
   - 错误：`VolcengineVideoProvider` 用旧端点 `/video/generation/image-to-video`（模型硬编码 `vidol-v1`），火山方舟 Seedance2.0 应为 `/contents/generations/tasks` + `content` 数组 → 返回 **HTTP 404**
   - 重写 `src/core/video-providers/sdk/volcengine-video.provider.ts`：
     - 端点：`POST /contents/generations/tasks`、`GET /contents/generations/tasks/{taskId}`
     - 图生视频 `content: [{type:'text',text}, {type:'image_url',image_url:{url}}]`，url 支持 `data:image/png;base64,...`
     - 参数：`resolution`/`ratio`/`duration`/`generate_audio:false`/`watermark:false`（配音走 TTS）
     - 轮询解析：`status:'succeeded'` → `content.video_url`
     - 本地图（含 `local-image://`）→ 用 `getPathProvider().getDataPath()` 拼绝对路径读文件转 base64
   - 修复后 Seedance 任务创建成功（`taskId=cgt-...`），轮询 HTTP 200，视频正常生成

4. **video-generation.service 保存视频时引用未定义的 DataPathService**
   - 错误：`saveVideoFromUrl` 用 `DataPathService.getInstance().getDataPath()`，但未 import → `ReferenceError: DataPathService is not defined`
   - 修复：改用已 import 的 `getPathProvider().getDataPath()`

5. **tts 配音用错 provider（Invalid API-key provided）**
   - 错误：tts 节点只传 `voiceId`，`VoiceService.generateSpeech` 用默认 provider（DeepSeek）给 CosyVoice API → key 不匹配
   - 修复：工作流 `start` 增加 `voiceProviderConfigId` 输入，`tts1` 节点加 `providerConfigId: "{{start.voiceProviderConfigId}}"`；运行传百炼 DashScope（`pc_mmxkxgpl_khcf6xrfp`）

6. **video-compose 校验音频/视频路径时未解析 local-*:// 协议**
   - 错误：`comp1` 直接 `existsSync(audioPath)`，但 tts 返回 `local-file://voice/tts/x.wav`（协议形式）→ 找不到文件
   - 修复：`video-nodes.ts` 加 `resolveMediaPath`：去掉 `local-*://` 协议前缀 → 按 dataPath 拼接绝对路径，用于 segments/audioPath/bgmPath

**当前状态**：3 镜头（img1+vid1）已全部生成成功，tts1/code1 已成功，compose 已修复。等待完整链路（compose→save→end）跑通。

## 待办（2026-09-05）
- 完整重跑时，第 3 镜头 Seedance 报「火山引擎账户欠费」（account has an overdue balance，Request id: 021788569102627bfe35b6525b6a）——外部账户余额问题，非代码 bug。
- 前 2 镜头视频已成功生成并保存（`C:\Users\daoge\the-bot\videos\2026\09\05\`）。
- **待用户充值火山引擎账户后**，重新触发完整 run 验证 compose→save→end 全链路。

## 回退
- 新增文件均为 git 新增；`script-to-video.json`/`video-nodes.ts` 可 `git` 回退；节点类型/目录改动可还原。
