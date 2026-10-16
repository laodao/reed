# 剧集制作 · 设计文档 Review 记录（2026-08-25）

> 目的：自行审查已写 4 份设计/实施计划（overall / m0-m8 / m1-home / m2-script），
> 对照参考截图、现有代码、后端 API、数据模型逐项验证。以下为**必须修正**的问题。

## 高优先级（不修会导致实现踩坑 / 糊弄用户）

### R1. M1 导入拆集缺「项目名称」来源
- **问题**：`analyzeScriptToEpisodes`（`script-splitter.service.ts`）只按「第X章/Chapter/#标题」
  切出 `episodes[]{title,content}`，**没有整剧/系列标题**。而 `createProject(name, ...)` 强制 name。
  导入多集剧本时项目名无来源。
- **方案**：导入向导在「预览确认」步加**项目名**输入框（默认取首集标题截断，或用户手填）；
  或者默认项目名「未命名剧本 + 日期」。前端交互补上，不能只靠后端。
- **影响**：M1 `ScriptImportCard` + 预览流。

### R2. M3 资产页的「多角度定妆图」依赖 `asset.image.listByCategory`，但当前只有部分资产有图
- **问题**：截图资产页展示角色多角度（正面全身/半身/全景左右/半身左右）。这些图来自
  `asset_image` 的 `category`（main/view/expression/outfit/pose/...）。**并非所有资产都有**这些图；
  参考图的「待生成/已定妆」状态需按 `callback` 已有图数量判断；缺失时点「生成图片」调 `generateMain`/派生。
- **方案**：M3 明确用 `asset.image.listByAsset` + `category` 过滤；「已定妆」= 该角色存在 `category='main'`
  图；其它角度若缺则显示「待生成」+ 生成按钮。参考图是「示意」，真实落地要按**实际有图**渲染，不写死角度。

### R3. M2「版本历史」「AI续写」占位与「不糊弄」原则冲突
- **问题**：文档写「版本历史本期占位」「AI续写先作引导词」。占位按钮点了没反应=糊弄用户，
  违反 CLAUDE.md「坚决禁止写死/糊弄」。
- **方案**：阶段 B 实现真实最小版：
  - **重新拆分**：真实调 `generate-scenes(scriptId)`（有真实能力）。
  - **AI 续写**：作为**右侧 agent 引导词**（真实走 agent）。若按钮放工具条，则点了填到 agent 输入并发送，
    不能空转。
  - **版本历史**：若本期无版本表，**工具条不渲染该按钮**（或明确 disabled + tooltip「开发中」），
    不做一个点了没反应的假按钮。

### R4. M8 `contextHint` 是后端签名变更，非前端小改
- **问题**：`ep:agent:send(projectId, episodeId, message, providerConfigId?, modelId?)` 现签名无 context。
  加 `contextHint` 要改：`agent.handler.ts`（签名+透传）、`sendMessage`（参数）、
  `buildEpDecisionContext`（拼进 userPrompt）、preload、channel-map。
- **方案**：M8 明确列出这 5 处改动；或**阶段 B 先不做 contextHint**，用现有生产状态即可，
  后续再增强（避免阶段 A/B 引入后端签名变更的额外风险）。**建议阶段 B 暂缓 contextHint**。

### R5. M0 路由冲突：`/episode-production` 及 `:projectId` 现有 `beforeEnter` 重定向
- **问题**：`/episode-production` 现指向 `EpisodeProjectListV2`；`/episode-production/:projectId`
  有 `beforeEnter`（自动选首集重定向到 `episode/:episodeId`）。新版首页要占 `/episode-production`，
  需处理该冲突，否则旧 beforeEnter 干扰。
- **方案**：M0 明确：新版首页用 `/episode-production`（覆盖旧项目列表）；旧列表移到
  `[legacy]` 路由不对外。旧 `:projectId` beforeEnter 保留给旧工作台路径，不与新首页冲突。

## 中优先级（影响体验/一致性，阶段内修）

### R6. M0 阶段 A 的「占位 tab」体验
- 资产/分镜/合成 tab 阶段 A 若空页，点了体验差。占位应为「建设中」提示卡 + 右侧 agent 已可用，
  而非空白。

### R7. M1「更多 >」与卡片点击目标未定义清楚
- 卡片点击「进该项目最新剧集工作台」——最新剧集可能无剧本，进空剧本页可接受但需空态引导。
- 「更多 >」：跳到项目全列表（新建一个列表视图或复用工作台 selector）。文档需明确。

## 已核实无误的项（放心）
- `listProjectsSummary` 返回 `VideoProjectSummary`（含 project 全字段 + episodeCount/progressPct/currentStageLabel）
  → M1 卡片可渲染标题/集数/进度 ✓
- `getScript(scriptId)` / `listScenes(scriptId)` / `generateScript(episodeId)` / `generateScenes(scriptId)` /
  `updateScene` / `getEpisode(episodeId)` 均存在 ✓
- `analyzeScriptToEpisodes(text)` 纯函数、零 AI、复用 StructureDetector ✓
- `generate-script` / `generate-scenes` / `batchCreateEpisodes` / `batchIdentifyEntities` 均存在 ✓
- 后端 agent 服务（`agent/*`）已建好，动作映射真实服务 ✓
- M2 剧本页为 episode 内场景（非跨集），数据模型吻合 ✓

## 结论
设计方向正确，但 **R1（项目名来源）、R3（占位/糊弄）、R5（路由冲突）需要在阶段 B 落地前修正**；
**R2、R4、R6、R7 在对应模块实现时补上**。建议在 M1/M2 的「验收清单」里收紧对 R3/R5 的检查。

## 修正状态
| 问题 | 状态 |
|---|---|
| R1 M1 项目名来源 | ✅ 已修（M1 预览步加项目名输入框，默认取首集标题截断） |
| R2 M3 资产图按实际有图渲染 | ⏳ 待 M3 文档（M3 复用 `asset.image.listByAsset`+category；「已定妆」= 有 category='main'；缺则「待生成」+生成按钮，不写死角度） |
| R3 M2 不做假按钮 | ✅ 已修（版本历史不渲染；AI续写走 agent；真实能力才放按钮） |
| R4 M8 contextHint 后端签名变更 | ✅ 已修（阶段 A/B 暂缓 contextHint，先复用现有生产状态） |
| R5 M0 路由 beforeEnter 冲突 | ✅ 已修（新首页覆盖 `/episode-production`；旧 beforeEnter 保留给旧工作台路径） |
| R6 M0 占位 tab 体验 | ✅ 已修（未完成 tab 用「建设中」卡 + agent 始终可用） |
| R7 M1 「更多>」与卡片点击目标 | ⏳ 待 M1 细化（卡片→该项目最新剧集工作台；「更多>」→项目全列表视图） |
