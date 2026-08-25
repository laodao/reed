# 剧集制作 · M0 挂载与壳 + M8 通用 Agent 面板 · 设计与实施计划

> 阶段 A（骨架）。目标：所有业务页统一为「左侧树/列表 + 中央工作区 + 右侧 agent 面板」三段式，
> 挂在应用壳内（保留全局侧边栏/标签页），业务页顶部保留页面内工具条（不做 DramaForge 大顶栏）。

## 1. 现状与目标
- 现状：`EpisodeAgentStudio.vue`（我先做的简易三栏）太简单、与截图差距大。旧 6-stage 工作台 `EpisodeWorkbench.vue` + 旧项目列表 `EpisodeProjectListV2.vue` 保留（菜单隐藏）。
- 目标：菜单「剧集制作」点击进入**新版入口**；新版首页/各业务页统一三段式布局 + 右 agent。

## 2. 布局壳（M0）

### 2.1 顶层入口与路由（注意现有 beforeEnter 冲突）
- 菜单：`src/renderer/src/config/menu.ts`「剧集制作」`hidden: true → false`（对外可用）。
- 路由（新版）：
  - `/episode-production` → 新版首页 `EpisodeHome.vue`（**覆盖**旧 `EpisodeProjectListV2` 所在路径）。
  - `/episode-production/:projectId/studio/:episodeId` → 新版工作台 `EpisodeStudio.vue`（四 tab）。
- 旧版处理：
  - 现 `/episode-production` 指向 `EpisodeProjectListV2` —— 改为新版首页；旧项目列表组件保留但不挂路由。
  - 现 `/episode-production/:projectId` 有 `beforeEnter`（自动选首集重定向 `episode/:episodeId`）——**保留**，
    只服务旧工作台路径，不与新首页冲突；不必把它改成新逻辑。
  - 旧工作台 `/episode-production/:projectId/episode/:episodeId` → `EpisodeWorkbench`，**路径保留 + 菜单隐藏**。
  - 旧 `[legacy]` 入口（如需）再评估，不新增冗余路由。

### 2.2 三段式布局骨架（通用容器组件 `EpisodeStudioLayout.vue`）
```
┌───────────────────────────────────────────────────────────────┐
│ 页面内工具条（可选 slot：左标题 + 右操作按钮）                    │
├────────────┬──────────────────────────────────┬───────────────┤
│ 左侧树/列表  │  中央工作区                        │ 右侧 agent 面板 │
│ (slot left) │  (slot center)                    │ EpAgentPanel  │
└────────────┴───────────────────────────────────┴───────────────┘
```
- 设计原则：
  - 三段式布局容器只负责栅格（左固定宽 / 中 flex / 右固定宽），不写业务。
  - 右侧 agent 面板默认展开，可折叠（记忆折叠状态）。
  - 工具条只在业务页需要操作入口时渲染（slot），不为凑布局硬加。
- 样式：贴合当前 El 主题 CSS 变量（`--bg-color-page` / `--border-color-lighter` 等），避免生硬。

### 2.3 顶部剧集选择 / 项目上下文
- 工作台顶部工具条左区：返回 + 「第 X 集 · 标题」（下拉切换，跨 tab 共享）。
- 上下文对象 `useEpStudioContext`：当前 projectId / episodeId / activeTab / 选中场景 / 选中资产；
  供中央区 + 右侧 agent 共同消费（agent 借此感知"当前在干吗"）。

## 3. 通用 Agent 面板（M8）

### 3.1 组件 `EpAgentPanel.vue`（重构已有简易版）
- 复用后端 `EpisodeProductionAgentService`（`ep:agent:{send,history,state,cancel}`）+ 事件通道
  `ep-agent:${projectId}:${episodeId}`。
- 输入：`projectId` / `episodeId` / `contextHint`（可选，如"当前选中场景：xxx"，注入 agent 决策上下文）。
- 输出事件：`dataChanged(sections)` → 父级（中央区/左侧树）据此刷新对应数据。
- UI：
  - 空态欢迎 + 引导 chips（随 context 变化，如剧本页提供"拆场景/生成剧本"，资产页提供"生成定妆图"）。
  - 消息流（user/assistant + 过程状态 deciding/acting/summarizing + 动作摘要卡 + 建议 chips）。
  - 底部输入框 + 发送/打断。
- 宽度：默认 360px，可折叠到 40px 图钉。

### 3.2 context 感知
- 面板按当前 `activeTab` + `contextHint` 生成**不同的欢迎语/引导 chips**（前端侧纯展示，无需后端改动）。
- 后端决策上下文增强（`contextHint` 场景名/资产名拼进 userPrompt）**涉及后端签名变更**（见下），
  属于增强项。**阶段 A/B 暂缓**，先用现有生产状态即可跑通；后续 M8 增强时一并做。
- 若要增强，改动点（5 处，需列出）：①`agent.handler.ts` `ep:agent:send` 加 context 参数并透传；
  ②`sendMessage` 加 context 参数；③`buildEpDecisionContext` 拼进 userPrompt；
  ④preload `agentSend` 加参数；⑤channel-map 透传。阶段 B 不做，避免引入额外风险。

### 3.3 阶段 A 的「占位 tab」体验
- 资产/分镜/合成 tab 在阶段 A 若业务组件未完成，渲染**「建设中」提示卡**（非空白页），
  且右侧 agent 面板**始终可用**（不因 tab 未完成而隐藏）。避免点了空页的差体验。

## 4. 交互链路（M0 验收）
1. 菜单点「剧集制作」→ 新版首页。
2. 进任一项目/剧集 → 三段式工作台（左树/中央/右 agent）。
3. 右 agent 面板可折叠/展开，输入消息能触发后端动作并回显摘要。
4. 中央数据变化时，agent `dataChanged` 驱动刷新。

## 5. 实施清单
- [ ] `config/menu.ts`：剧集制作 `hidden:false`。
- [ ] `router/index.ts`：新增 `/episode-production` 重定向到新版首页；`:projectId/studio/:episodeId` 新版工作台。
- [ ] 新增 `components/episode-production/studio/EpisodeStudioLayout.vue`（三段式骨架）。
- [ ] 新增 `composables/useEpStudioContext.ts`（projectId/episodeId/tab/场景/资产上下文）。
- [ ] 重构 `components/episode-production/agent/EpAgentPanel.vue`（折叠 + context 提示（前端） + 联动）。
- [ ] 后端 `ep-agent.context.ts`：**阶段 B 暂缓** contextHint（后端签名变更，见 3.2）；先用现有生产状态。
- [ ] 新增 `views/EpisodeStudio.vue`（四 tab 容器；未完成的 tab 用「建设中」提示卡渲染，agent 始终可用）。

## 6. 验收清单
- [ ] 剧集制作菜单可见，点击进入新版首页。
- [ ] 进项目后三段式布局正确（左/中/右），不含 DramaForge 式大顶栏。
- [ ] 右 agent 面板可折叠，空态引导随 context 变化。
- [ ] agent 消息发送→后端决策→动作→摘要回显，正常。
