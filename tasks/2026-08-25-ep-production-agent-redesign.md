# 剧集制作 Agent 助手重构设计

> 背景：用户反馈当前「剧集制作」功能太复杂、交互全是复杂表单，难以使用。要求参考
> `C:\Users\daoge\Pictures\Screenshots\the-vedio` 下的截图（目标产品 DramaForge）重构，
> 核心诉求：**剧本 / 资产 / 分镜 三个界面右侧的助手是 agent，可调用系统工具能力，
> 根据用户指令自动化完成工作。**

---

## 1. 参考截图分析（DramaForge）

### 1.1 页面结构（每页统一的三段式布局）
```
┌──────────────────────────────────────────────────────────────┐
│ 顶栏：logo + 项目/剧集切换 + 剧本|资产|分镜|合成 (tab) + 通知/更多│
├────────────┬──────────────────────────────┬──────────────────┤
│ 左侧栏      │  中央主区                     │ 右侧助手 agent    │
│ (资产树/     │  (编辑/预览工作区)            │  (对话式 agent)  │
│  角色树/    │                              │                 │
│  场次列表)  │                              │                 │
└────────────┴──────────────────────────────┴──────────────────┘
```

### 1.2 各页面要点
- **首页**：导入剧本（粘贴完整剧本 → AI 自动拆集，或上传 .txt）。极简单卡，无表单堆砌。
  底部「最近项目」卡片流。
- **项目剧本页**：左侧场次列表（第 1-6 集）；中央剧本编辑工作区（对白/旁白卡片式，非表单）；
  右侧「剧本助手」agent。
- **项目资产页**：左侧资产树（角色/地点/物品 + 定妆图）；中央角色定妆展示（正面全身/半身/全景左右，
  多角度图 + 镜头提示词）；右侧「资产助手」agent。
- **项目分镜列表页**：左侧角色；中央按场次分镜卡（SHT-xx，生成状态/时间码）；右侧「分镜助手」agent。
- **项目分镜制作页**：左侧分镜列表；中央「编辑提示词」工作区（提示词 + 分镜参数）；
  右侧「分镜助手」agent。
- **项目视频合成页**：视频轨 + 音频轨时间线；跑片进度/占位。
- **任务队列页**：进行中/已完成/已清除三种任务状态总览 + 任务流水。

### 1.3 差异化点（当前系统 vs 参考）
| 维度 | 当前系统 | 参考（目标） |
|---|---|---|
| 交互范式 | 多 stage（内容/资产/剧本/分镜/制作/合成）+ 复杂表单 | 统一三段式：左树 + 中央工作区 + 右侧 agent |
| 驱动方式 | 用户手动填表、点按钮、逐个维护 | **agent 对话驱动 + 手动微调兜底** |
| 核心入口 | 6 个 stage tab，用进度条门控 | 4 个 tab（剧本/资产/分镜/合成），顶部下拉切换剧集 |
| 助手 | 无（或仅占位） | 剧本/资产/分镜 各有右侧 agent，可调用系统工具 |

---

## 2. 现状盘点（本仓库）

### 2.1 前端
- 入口视图：`src/renderer/src/views/EpisodeProjectListV2.vue`（项目列表/资产）→
  `EpisodeWorkbench.vue`（6 stage tabs）。
- Stage 组件：`src/renderer/src/components/episode-production/stage-*`（content-script-v3、
  storyboard-v2、production-v2、compose-v2 等，共 137 个文件）。
- stores：`src/renderer/src/stores/episode-production/*`（workbench/project/episode/asset/script/
  storyboard/production/compose/active-context）。
- 参考 `progress/2026-08-25-old-progress-ep-performance.md` 单测基线：13 个环境性失败（无关本次）。

### 2.2 核心能力（agent 可复用的工具/服务）
`src/core/modules/episode-production/`：
- `narrative/ai/script-generator.ts`（生成剧本）、`scene-script.service.ts`（场景拆分）。
- `narrative/ai/storyboard-generator.ts`（分镜生成）、`narrative/services/storyboard.service.ts`。
- `assets/services/*`：character/location/item asset、main-image-generator、panorama 等。
- `auto-binding/uploaded-entity.service.ts`（上传剧本识别实体）。
- `workflow/episode-status.machine.ts`（状态机）+ `stage-gate.service.ts`、`project-summary.ts`。

### 2.3 已有 Agent 基础设施（**核心复用点**）
长文写作已有完整「对话式工作流 Agent」，与本需求范式完全一致：
- `src/core/services/longwriting/agent/agent-workflow.service.ts`：sendMessage 一轮循环
  （存用户消息 → 计算生产状态 → AI 决策(JSON: reply+actions) → 执行 actions(调用生成/落库) →
  AI 总结(流式) → 持久化 → 事件推流）。
- `agent.types.ts`：`AgentAction`（type+params）、`AgentDecision`、`AgentActionSummary`、
  `AgentEvent`、`AgentProductionState`。
- `agent-actions.ts`：`executeActions` / `dispatchAction` 分发执行各 action。
- `agent-context.ts` / `agent-deps.ts`：决策上下文组装、生产状态计算、依赖规则、下一步建议。
- 前端：`components/longwriting/agent/AgentChatView.vue`（对话区：消息流+过程状态+预览卡+chips）、
  `AgentDataPanel.vue`、`AgentPreviewCards.vue`、`AgentWorkspace.vue`（左对话+右数据面板+进度带）。
- IPC：`ipcBridge.handle(CHANNELS.AGENT_SEND/HISTORY/CANCEL/STATE)`，事件通道
  `longwriting:agent:${projectId}`。

> **结论：参考图的「右侧 agent」本质上就是长文写作 agent 的同一套机制。** 在长文写作上它已经
> 被验证是"对话驱动 + 调用系统工具完成工作"的形态。剧集制作把它复刻过来即可，无需发明新范式。

---

## 3. 目标方案

### 3.1 设计原则
1. **复用 agent 机制，不为剧集制作重新发明轮子。** 抽出一套通用的「agent 对话式工作流」骨架，
   长文写作已用的组件尽量复用/轻度泛化。
2. **保留手动能力作为兜底**：agent 驱动自动生成，但底层的表单/编辑器保留（参考图也是"agent 优先 +
   可手动微调"）。重构重点是**降低默认交互复杂度**（把复杂表单隐藏到"高级"入口），让用户默认
   通过对话+简单操作完成。
3. **不写死、不用假数据**：agent 的 action 全部映射到现有真实服务（生成剧本/分镜/资产/图片/音频等）。
4. **三段式布局与 agent 面板去重**：新增通用右侧「Agent 助手面板」组件，剧本/资产/分镜三页复用，
   agent 归属通过 context（当前剧集/当前场景/当前角色）感知。

### 3.2 核心动作（agent 可调用的工具，映射到现有服务）
| Action 类型 | 说明 | 底层服务 |
|---|---|---|
| `generate_script` | 生成整集剧本 | script-generator + scene-script.service |
| `split_scenes` | 拆分场景 | scene-script.service |
| `identify_entities` | 从上传剧本识别角色/地点/物品 | uploaded-entity.service |
| `generate_storyboards` | 按场景生成分镜 | storyboard-generator |
| `generate_char_asset` | 生成角色定妆图 | assets/services/character-asset + main-image-generator |
| `generate_location_asset` | 生成地点图 | location-asset.service |
| `generate_item_asset` | 生成物品图 | item-asset.service |
| `generate_shot_image` | 生成分镜画面 | production.store.generateStoryboardImage |
| `generate_scene_audio` | 生成场景配音 | render/audio/* |
| `update_entity` / `delete_entity` | 编辑/删除资产 | assets/services |
| `compose_video` | 合成出片 | compose/* |

> 注：以上 action 只是映射清单，具体每个 action 的入参/落库需对照现有服务实现，实施阶段逐个落地。

### 3.3 布局重构（对齐三段式）
参考图把「6 stage 表单流」简化为「4 tab + 左树 + 中央工作区 + 右侧 agent」。但本系统已有成熟的
stage + 能力，**不建议彻底推倒**，而是：
- **优先级 1（核心）**：给剧本/资产/分镜三个界面各挂一个**右侧 agent 助手面板**，复用 agent 机制 +
  AgentChatView。这是用户明确点名的诉求。
- **优先级 2（降复杂度）**：把现有复杂表单收敛——默认只显示"简单卡片/对话驱动"，复杂配置收进
  「高级」弹窗/抽屉（如同长文写作「高级」按钮），降低首屏表单感。
- **优先级 3（信息架构）**：顶部 tab 与左侧树统一成参考风格（可选，工作量较大，可后置）。

### 3.4 阶段划分（工作量估算）
| 阶段 | 内容 | 预估 |
|---|---|---|
| E1 | 抽通用 agent 骨架 + 剧集制作 Agent 服务（decision/action/state）+ IPC + preload | 1.5~2 天 |
| E2 | 通用右侧 Agent 面板组件（复用 AgentChatView）+ 挂到剧本/资产/分镜 | 1~1.5 天 |
| E3 | 落地 E1 的 action → 真实服务映射（首批：generate_script/split_scenes/identify_entities/generate_storyboards） | 1.5~2 天 |
| E4 | 表单收敛：复杂配置收进「高级」入口，默认卡片化 | 1~1.5 天 |
| E5 | 顶部 tab/左树信息架构对齐（可选） | 1~2 天 |
| — | 合计 | **6~8 人天** |

### 3.5 验收
- 剧本页右侧 agent：输入"把这段剧本拆成 5 场"，agent 调 split_scenes，列表/场景实时更新。
- 资产页右侧 agent：输入"为角色 杜十娘 生成正面半身定妆"，agent 调 generate_char_asset，图片落库并预览。
- 分镜页右侧 agent：输入"为场景3 生成 6 个分镜"，agent 调 generate_storyboards，卡片生成。
- 手动能力仍可用（原表单/编辑器保留，仅入口收敛）。

---

## 4. 风险与建议
- **工作量**：6~8 人天，属于较大重构。若只做"用户点名"的核心（右侧 agent + 复用），
  可先把 E1+E2+E3 落地，E4/E5 视效果决定。
- **agent 动作映射**：E3 是关键风险，每类 action 都要对齐现有服务的入参/落库，需逐个验证，
  避免"看似调用、实际空跑或报错"。
- **表单收敛**：收敛复杂表单可能引发"高级功能找不到"的反馈；需保留清晰入口。
- **单测基线**：既有 13 个环境性失败与本次无关，新增 agent 动作补单测时不受影响。

## 5. 决策与实施进度（已确认）

**用户决策（2026-08-25）：**
1. **全新做一版**：参考截图重做，**现有界面保留不删除、不做手术**；新增独立视图。
2. **全量 E1~E4**。
3. **首批动作**：split_scenes / generate_script / generate_storyboards / generate_char_asset。

**已落地（首轮实现）：**
- 后端 Agent 服务（全新 `src/core/modules/episode-production/agent/`）：
  `ep-agent.types` / `ep-agent.events` / `ep-agent.deps` / `ep-agent.context` /
  `ep-agent.actions` / `ep-agent-workflow.service`，复用长文写作「决策→执行→总结」机制，
  动作全部映射现有真实服务（script/scene/storyboard/asset）。
- IPC：`ep:agent:{send,history,state,cancel}`（`agent.handler.ts`）+ preload `episodeProduction.agent*` +
  web `channel-map.ts` 双端接线。
- 前端：新视图 `EpisodeAgentStudio.vue`（三段式：左场景/资产树 + 中央工作区 + 右侧 agent 助手面板），
  组件 `EpAgentPanel.vue`、composable `useEpAgentChat.ts`。路由
  `/episode-production/:projectId/studio/:episodeId`。
- 单测：`ep-agent-workflow.service.spec.ts`（18 例通过，纯逻辑：决策解析/状态摘要/依赖/建议）。
- 构建验证：`npm run build` 成功（view 产出独立 chunk）。

**尚未落地（后续阶段）：**
- E4 表单收敛：把现有复杂配置收进「高级」入口，默认卡片化（需在现有 stage 上做，用户已明确现有不删，
  收敛应新建轻量面板而非改老表单）。
- E5 顶部 tab/左树信息架构整体对齐参考图（当前新视图已具备三段式骨架，视觉细节待调）。
- generate_location_asset / generate_item_asset 两个动作已实现但未重点验证；缺 IPC 实体维度的
  "主图编辑"面板联动。

## 6. 下一步（等用户确认）
1. 进入新视图 `/episode-production/:projectId/studio/:episodeId` 验证 agent 驱动（造数据跑通
   split_scenes / generate_script / generate_storyboards / generate_char_asset）。
2. 确认是否需要把「左侧资产/场景树 + 中央内容」与现有工作台入口打通（还是先独立访问验证）。
3. E4 表单收敛是否纳入本版本范围。
