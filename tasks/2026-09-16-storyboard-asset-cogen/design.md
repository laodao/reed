# 剧集制作：分镜与资产识别联合生成（2026-09-16）

## 1. 需求

《忘川渡》第一集按「剧本 → 分镜 → 资产图 → 关键帧 → 参考图模式视频」流程走完后，成品视频出现严重一致性问题：

- 人物角色图首版与设定不符（现代装阿蘅）；
- 不同视频片段之间人物长相/服饰不一致；
- 资产定妆图（修复后已符合设定）**从未进入生成管线**。

复盘确认的根因（全部有日志/数据库证据，见 §2）：分镜生成早于资产创建，且实体识别被静默跳过，导致场景→分镜→关键帧全链路没有任何资产绑定 ID，关键帧调用 `referenceImages:[]` 一路纯文生图。

本需求：**把"资产识别"与"分镜生成"合并为单次 LLM 调用**（按场景粒度），让分镜与资产的关联关系在响应结构里天然成立，由代码（而非模型自觉）完成绑定落库，并在下游关键帧/视频环节加硬校验，杜绝"无绑定静默降级"。

## 2. 事实依据（全部来自代码/日志/数据库，非推测）

| # | 事实 | 证据 |
|---|------|------|
| F1 | 全部 13 个分镜 `characters[].characterId` 为空字符串；`location_binding_ids`/`item_binding_ids` 为空 | `storyboards` 表实测（项目 `vp_1789525436879_74qyevrpt`） |
| F2 | 场景级 `scene_characters.character_binding_id` 全部为空；`scene_scripts.location_binding_id` 为空 | 同库实测 |
| F3 | 创建剧集时 `batchIdentifyEntities` 以 `config.scriptModel` 非空为前提，未配置则静默跳过 | `src/renderer/src/views/EpisodeCreator.vue:169-181` |
| F4 | 剧集制作的 `dialogs/SettingsDialog.vue` 存在但无任何 import 引用（死组件），项目级 scriptModel/videoModel 无 UI 入口 | 全仓 grep 无引用 |
| F5 | 分镜生成器要求模型把 `ID: ${characterBindingId}` 回填 `characterId`； binding 为空时给出 `ID: `（空），模型无法回填，`normalizeAiCharacters` 置空串并打日志 | `src/core/platform/episode-production/narrative/ai/storyboard-generator.ts:70-78, 465-466` |
| F6 | 关键帧生成时 `resolveSceneAssets` 依赖 binding ID 解析资产；storyboard.characters 条目非空但 ID 全空时**不会**回退场景级（else-if 结构），`collectReferenceImages` 结果为空 | `src/core/platform/episode-production/render/keyframe/keyframe-generation.service.ts:619-679, 824-912` |
| F7 | 关键帧生成本身支持参考图注入（override / 自动评分挑图），provider 层会把 refs 透传网关；网关按有无 refs 自动路由 Krea2（文生图）/ Flux Kontext（参考图生图） | 同 F6 文件；`src/core/platform/providers/image/sdk/comfyui-image.provider.ts:98-150`；`ComfyUI/gen_gateway.py` 模块注释 |
| F8 | 本次所有关键帧图像调用 `referenceImages:[]`（纯文生图）；视频片段全部 `image2video`，H3 参考图 = 各片段首镜头关键帧 | 主进程日志 `[ai-call] image/video 调用完成` |
| F9 | 关键帧尺寸固定 1024×1024，与视频 16:9（1920×1080 项目配置）画幅不匹配 | `keyframe-generation.service.ts:64-65`（`DEFAULT_KEYFRAME_WIDTH/HEIGHT`） |
| F10 | H3 视频默认 `quality:'high'`、`steps:20`（12~14s 片段实测 30~45 分钟/段）；`quality/steps` 仅工作流 start 输入可透传，分镜 UI 路径不可控 | `src/core/platform/providers/video/sdk/comfyui-video.provider.ts:155-159` |
| F11 | 片段级视频轮询超时 1800s，小于 H3 高质量实测时长；可用官方环境变量 `EP_VIDEO_POLL_TIMEOUT_MS` 覆盖 | `src/core/platform/episode-production/render/video/base-video-provider-bridge.ts:48, 214-229` |
| F12 | 分镜文本对同一角色的服饰描述跨镜头漂移（阿蘅：素色医袍/深色古朴衣袍/素衣/深色旧衣） | `storyboards.frame_description` 实测 |
| F13 | 已有事后修复件：`ScriptBindingFixerService` 可按名回填 `scene.characters[].characterBindingId` 并自动补建 standalone binding | `src/core/platform/episode-production/narrative/services/script-binding-fixer.service.ts` |
| F14 | `listVideoProviders` 的就绪判定曾无视 `requiresApiKey:false`（ComfyUI 永远 not ready），已修为按模板定义判定 | `src/core/packs/episode-production/handlers/render/video-segment.handler.ts:108-111` |

## 3. 设计决策

### D1：按场景做「资产识别 + 分镜」单次 LLM 联合生成

每场景一次调用，输入 = 场景剧本全文 + 项目已有资产清单（名 + 描述 + binding ID），输出单个 JSON：

```json
{
  "assets": {
    "characters": [{ "name": "...", "description": "...", "gender": "...", "age": 0, "outfit": "...", "existing": false }],
    "location":  { "name": "...", "description": "...", "existing": true },
    "items":     [{ "name": "...", "description": "...", "existing": false }]
  },
  "shots": [{
    "shotType": "long|full|medium|close|detail|...",
    "cameraAngle": "...", "cameraMovement": "...", "duration": 5,
    "frameDescription": "【场景】...【人物】...【动作】...【氛围】...",
    "subject": "...", "composition": "...",
    "characters": [{ "name": "阿蘅", "position": "left|center|right", "expression": "...", "action": "...", "facing": "front" }],
    "itemNames": ["引渡名册"]
  }]
}
```

- `shots[].characters[].name` 必须 ⊆ 本响应 `assets.characters[].name` ∪ 已有资产名（prompt 中强约束 + 代码校验）。
- 已有资产在 prompt 中带 ID 与描述注入，要求模型`直接引用、不得改名、不得重复创建`；新资产在响应中给出完整描述（含服饰/外貌，供定妆图与分镜文本共用，消除 F12 的服饰漂移）。
- 场景逐串行：第 1 场景建资产，后续场景引用（跨场景去重在代码侧按名匹配已有 binding）。

### D2：关联由代码构造，不让模型回填 ID

联合响应解析后，service 层（非 LLM）执行：

1. 角色/地点/物品：按名查项目现有 binding（`standaloneName`/`overrideName`）→ 命中复用；未命中调既有 `createStandalone` 建绑定（描述来自响应资产卡）。
2. 回填：`scene.characters[].characterBindingId`、`scene_characters.character_binding_id`、`scene.location_binding_id`、`storyboards.characters[].characterId = binding.id`、`storyboards.location_binding_ids/item_binding_ids`。
3. 分镜落库策略与现「批量生成分镜」一致：**整场景替换**（删旧分镜写新分镜），不增量。

### D3：打通剧集项目设置入口，联合生成用显式配置的模型

- 把现有 `dialogs/SettingsDialog.vue` 挂到 UI：Studio 顶栏加「设置」按钮（项目列表项亦可加，二选一，先 Studio）。
- 联合生成读取 `project.config.scriptModel`（与剧本生成/实体识别同一字段，不新增概念）；未配置时报错引导配置，**不再静默落回默认 provider**。
- 验收用模型：`bailian-tokenplan / qwen3.8-max`。

### D4：三道硬校验（失败即报错，不静默降级）

1. 联合响应解析后：JSON schema 校验（shots 数量 2~8、每镜必备字段、name ⊆ assets∪已有）；不合法 → 把具体错误喂回模型**纠错重试 1 次**，仍失败 → 该场景置 error 并给出原因。
2. 分镜落库后：`characters[].characterId` 必须全部非空（代码构造保证，断言防回归）。
3. 关键帧生成前：`scene.characters` 非空但 `resolveSceneAssets` 解析结果为空（无任何绑定）→ 直接报错拒绝生成，不再纯文生图静默通过（守 F6 的 else-if 死路）。

### D5：关键帧画幅跟随项目

`DEFAULT_KEYFRAME_WIDTH/HEIGHT` 固定 1024×1024 改为按项目 `config.aspectRatio/resolution` 推导（16:9 → 1344×768；9:16 → 768×1344；1:1 → 1024×1024），消除 F9。

### D6：视频 quality/steps 透传

- `video_projects.config` 增加 `videoQuality`（`high|low`，默认 high）、`videoSteps`（默认 20）；
- 片段/单镜视频生成路径读取并透传到 `VideoGenerationRequest`（comfyui provider 已支持 F10）；
- 项目设置对话框加这两项（随 D3 的入口一起露出）。验收重跑用 `low/4`（turbo），定稿可回 high/20。

### D7：资产卡确认环节不做（本期非目标）

联合生成的资产卡直接落库生效；定妆图仍在资产 tab 逐资产生成/重新生成（现有 UI 不变）。用户审查点在资产 tab（定妆图生成前看得到描述），不新增确认对话框。阿蘅现代装事故的防线 = 资产卡描述质量（D1 同一响应保证）+ 用户在资产 tab 可重建。

### D8：旧「批量生成分镜」入口替换为联合生成

Studio 分镜 tab 的「批量生成分镜」改走联合生成（不再有独立"识别"步骤可跳过）。`normalizeAiCharacters` 旧回填逻辑保留给存量数据/旧入口（agent 动作 `generate_storyboards`）使用，不删。

## 4. 详细设计

### 4.1 新增/改动文件

| 文件 | 动作 | 内容 |
|---|---|---|
| `src/core/platform/episode-production/narrative/ai/storyboard-cogen.ts` | 新增 | 联合生成 prompt 构建（场景 + 已有资产注入 + 强约束）+ 响应解析（`extractJsonFromResponse`）+ schema 校验（D4-1） |
| `src/core/platform/episode-production/narrative/services/storyboard-cogen.service.ts` | 新增 | 编排：逐场景 → 调 cogen → 纠错重试 → 建/复用 binding（复用 character/location/item-asset.service `createStandalone`）→ 替换式写分镜 → 回填全部绑定字段（D2）→ 落库断言（D4-2） |
| `src/core/packs/episode-production/handlers/narrative/storyboard.handler.ts` | 改 | 新增 IPC `ep:cogen-storyboards`（整集逐场景）；「批量生成分镜」renderer 侧改调它 |
| `src/preload/index.ts` + `src/renderer/src/.../stores` | 改 | 暴露 `episodeProduction.cogenStoryboards(episodeId)` |
| `src/renderer/src/components/episode-production/storyboard/StageStoryboardView.vue` | 改 | 「批量生成分镜」→ cogen IPC；未配置 scriptModel 时提示去项目设置 |
| `src/renderer/src/views/EpisodeStudio.vue` | 改 | 顶栏加「设置」按钮，挂 `dialogs/SettingsDialog.vue`（D3）；对话框增加 videoQuality/videoSteps 项（D6） |
| `src/core/platform/episode-production/render/keyframe/keyframe-generation.service.ts` | 改 | 画幅按项目推导（D5）；`resolveSceneAssets` 空绑定守卫（D4-3） |
| 视频生成 service（`render/video/segment-video.service.ts` 等） | 改 | 读 `config.videoQuality/videoSteps` 透传 `VideoGenerationRequest`（D6） |

### 4.2 关键时序

```
剧本拆场景（已完成）
  → 逐场景 cogen：LLM(资产+分镜) → 校验/纠错 → 建/复用 binding → 写分镜+回填
  → 资产 tab：生成/补齐定妆图（现有 UI；参考图模式的参考图源）
  → 分镜 tab：进入制作 → 参考图模式 → 生成片段视频
      （内部：关键帧[含定妆图 refs] → H3 image2video）
  → 合成 tab：导出 MP4
```

### 4.3 模型与参数

| 用途 | 模型 | 参数 |
|---|---|---|
| cogen（文本） | `pc_mtee10tz_ijz2yq1ro / qwen3.8-max`（项目 scriptModel） | maxTokens 16000 + `callAIWithContinue`；temperature 走 provider 默认 |
| 定妆图/关键帧（图像） | ComfyUI 网关（krea2 / 有 refs 自动 flux-kontext） | 关键帧 1344×768（D5） |
| 视频 | ComfyUI 网关 h3 | 验收：`quality=low, steps=4`；轮询 `EP_VIDEO_POLL_TIMEOUT_MS=7200000` |

## 5. 验收标准

1. 第一集 3 个场景 cogen 后：全部 `storyboards.characters[].characterId` 非空；`scene.location_binding_id` 非空。
2. 关键帧生成日志：每个关键帧调用 `referenceImages` 非空（含角色定妆图）；画幅 1344×768。
3. 6 个片段视频 `video_mode=image2video` 全部落库；人物与定妆图同人、片段间一致（逐片段抽帧人工核）。
4. 合成导出 MP4 成功；对照剧本逐片段评估内容匹配度（情节要素：摔碗/药方质疑/名册死账/灯芯信物/七日倒计时）。
5. 未配置 scriptModel 时点「批量生成分镜」→ 明确报错引导，不静默用默认模型。

## 6. 非目标

- 整集一次出的合并粒度（保持场景粒度）；
- 资产卡确认 UI（D7）；
- 制作助手（ep-agent）能力改造；
- `normalizeAiCharacters` 旧回填逻辑与 agent `generate_storyboards` 旧路径重构（保留原样）；
- ComfyUI 网关/H3 模型本身的画质调优。
