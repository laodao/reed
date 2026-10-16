# 剧集制作 · M2 剧本页 · 设计与实施计划

> 阶段 B（首屏可见价值）。参考截图「项目剧本页.png」。目标：进入剧集后看到剧本三段式
> （左场次导航 + 中央场景卡片 + 右侧剧本助手），支持浏览/编辑场景、AI 生成剧本/拆场景。

## 1. 页面布局（对齐截图业务功能部分）
```
┌───────────────────────────────────────────────────────────┐
│ 工具条：左「剧本」+「已拆 X 场」   右「版本历史」「AI续写」「重新拆分」│
├──────────────┬──────────────────────────┬────────────────┤
│ 场次导航       │ 中央工作区（选中场景）        │ 右侧剧本助手 agent │
│ 1 闪回:寒江跃江 │  场景标题「闪回：寒江跃江」     │ 空态：             │
│ 2 重生初醒      │  镜头提示 / 旁白（情境描述）    │ "你好，我是剧本助手，  │
│ 3 初见明礼      │  杜十娘 (过往事尘烟) (决绝)    │  可以让我给你拍偏、改编本、│
│ 4 转母斥责      │    对白…                    │  生成支线…。"        │
│ 5 临终立誓      │  孙富 (冷淡)  …              │ [让助手帮你写/生成内容…] │
└──────────────┴──────────────────────────┴────────────────┘
```

## 2. 数据链路（复用现有后端）
### 2.1 加载
- 进剧集：`getEpisode(episodeId)` → 若有 `scriptId`，`getScript(scriptId)` + `listScenes(scriptId)`。
- 无剧本 → 中央空态 + 右侧剧助引导「生成剧本」。

### 2.2 动作（阶段 B 只做真实能力，不做点了没反应的假按钮）
- **生成剧本**：`ep:generate-script(episodeId)`（后端 generateFullScript → 建/更新剧本 + 场景）。真实可用。
- **重新拆分**：`ep:generate-scenes(scriptId)`（generateScenesFromSynopsis → 重建场景）。真实可用。
- **AI 续写**：不新增独立后端动作。工具条按钮点击 → **填到右侧 agent 输入并发送**（走 M8 agent），
  由 agent 决策调已有动作；如 agent 不可用则该按钮 disabled + tooltip「需先配置模型」。
- **场景编辑**：行内编辑场景字段 → `ep:update-scene(sceneId, patch)`（现有）。真实可用。
- **版本历史**：若本期无版本表 → **工具条不渲染该按钮**；确认有真实版本能力后再加。绝不做一个空转假按钮。

## 3. 组件拆分（新增于 `src/renderer/src/components/episode-production/script/`）
- `StageScriptView.vue`（业务组件，挂到 M0 工作台「剧本」tab）：工具条 + 三段式。
- `SceneNav.vue`：左侧场次导航（序号 + 标题），选中态。
- `SceneCard.vue`：中央场景卡。区块：
  - 场景标题（location + sceneNumber）
  - 「镜头提示/情境描述」区块（sceneDescription / mood / lighting / narration）
  - 角色块（characters：name + 括号(描述)(表情) + 对白 dialogues 逐条 + 动作 actions）
  - 行内编辑（点击字段 → el-input/textarea → update-scene）
- `ScriptEmptyState.vue`：无剧本空态 + CTA。

## 4. 联动
- 右侧 agent 面板生成剧本/拆场景后，`dataChanged(['script','scenes'])` → 本页刷新剧本+场景；左侧导航同步。
- 场景编辑实时保存（debounce）。

## 5. 后端改动（Minimal）
- 复用现有 `generate-script` / `generate-scenes` / `get-script` / `list-scenes` / `update-scene`。
- 右侧剧助：复用 M8 `EpAgentPanel` + `EpisodeProductionAgentService`（已做）。
- agent 决策上下文增强：`contextHint` 传当前场景名/选中 tab，让 agent 更精准（剧助动作在 M8 已含 generate_script/split_scenes）。

## 6. 实施清单
- [ ] `StageScriptView.vue` + `SceneNav.vue` + `SceneCard.vue` + `ScriptEmptyState.vue`。
- [ ] 工具条（标题 + 已拆 X 场 + 重新拆分/AI续写）。**版本历史本期不渲染**（无真实版本能力）。
- [ ] 场景行内编辑接线 `update-scene`。
- [ ] 挂到 M0 工作台「剧本」tab；agent dataChanged 联动刷新。
- [ ] 复用现后端，无新 IPC（除 agent 已有）。

## 7. 验收清单
- [ ] 进剧集 → 剧本页三段式正确。
- [ ] 左侧场次导航点击切换中央场景。
- [ ] 无剧本 → 右侧剧助/中央 CTA 生成剧本 → 场景卡出现。
- [ ] 有剧本 → 显示所有场景卡（镜头提示/角色/对白）。
- [ ] 行内编辑保存生效。
- [ ] 右侧剧助「拆场景/生成剧本」→ 左侧+中央实时刷新。
- [ ] 工具条无假按钮：版本历史不渲染；AI续写不可用时不误导。
