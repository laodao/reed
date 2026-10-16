# 长文写作高级模式表单审查报告（3 子任务汇总）

> 日期：2026-08-23
> 审查方式：3 个子代理并行只读审查（各阶段表单 + 全下游消费链路核验），主进程统一汇总
> 范围：高级模式 7 阶段（Overview/Plot/Background/Character/SkillItem/Outline/Chapter）

## 一、最严重问题（影响整条链路，需优先处理）

### 1. chapterNumber 计算 4 套实现全部失效（默认 3 级嵌套结构下）
- 前端 OutlineStage/ChapterStage：平铺数组全局排序计数，节会膨胀编号
- 向导 calcChapterNo：仅计 chapter，同章下节共享编号
- 后端 calculateChapterNumber：遍历树根数组（3 级即卷数组），**恒返回 1**；previousOutlines findIndex 只匹配根节点 → 上一章结尾恒空
- **后果**：getMemoryContext / getChapterStateSummaryContext / getEntityStateContext / buildGraphContextSection 的章节过滤全部落空 → **记忆/状态摘要/实体状态/图谱事件上下文在默认结构下静默失效**
- 建议：repository 层实现"深度优先章节序号"单一实现，前端三处+后端统一调用；迁移修复已入库错误编号

### 2. 高级模式不触发图谱流水线（已修复 ✓）
- ChapterStage 从不调用 graphExtractChapter → 高级模式下图谱事件/边永不产生
- **已修复**：saveChapter 后自动跑统一流水线（事件/状态快照/建边/摘要），删除重复手动摘要提取

### 3. buildGraphContextSection UUID 泄漏（已修复 ✓）
- 章节 prompt 注入原始 UUID 而非实体名 → AI 读不懂关系
- **已修复**：边两端注入实体名称（带缓存）

## 二、表单审查结论（每阶段）

### 阶段一 故事概要（OverviewStage）
- **死字段**：style/targetReader/estimatedLength/otherRequirements（仅生成概要时拼入一次，下游全部不读）；theme（DB 有列 UI 未暴露，coreTheme 实际取 coreIdea）
- **冲突**：keyCharacters/keyLocations 与角色/地点表双轨漂移（确认概要后不落库）；style↔targetReader 语义重叠；estimatedLength 冗余于 estimatedChapters
- **缺失**：主题立意、结局走向、视角 POV、时间跨度
- 建议：删 estimatedLength；启用 theme；概要角色/场景一键导入角色表/地点表

### 阶段二 故事情节（PlotStage）
- **死字段/丢数据**：involvedLocations UI 无入口且 batchCreate 硬编码置 []；entityRelations 仅图谱同步不入库；notes 仅进向量
- **冲突**：involvedCharacters 存名字 vs outline 存 ID 体系不一致
- **缺失**：涉及地点、时间/章节区间、情节类型（主线/支线）、伏笔标记

### 阶段三 时代背景（BackgroundStage）
- **重要修复已做 ✓**：buildBackgroundContext 原不含 techLevel（科幻题材缺陷），已补 techLevel/势力分布/地理方位
- 冲突：eraType 与 techLevel 无联动校验；factionDistribution 与势力表双轨
- 缺失：时间线/纪年结构化字段、经济文化维度

### 阶段四 角色（CharacterStage）
- **核心字段链路健康**：name/rolePosition/personality/occupation/appearance/background/abilities
- **死字段**：position（职务，全链路零消费）；generateNewCharacters 的 count（收集未用）；importance（恒 secondary 无消费者）
- **冲突**：importance 与 rolePosition 语义重叠；手动关系写 lw_character_relations 旧表不进图谱（双轨，用户手动配的关系不约束正文）
- **缺失**：人物目标/动机（goal）、成长弧线（arc）、秘密（悬疑需要）
- 建议：删 position；手动关系改走图谱边；新增 goal/arc 并接入章节 prompt；majorEvents 注入章节完整信息

### 阶段五 技能物品（SkillItemStage）
- **问题最集中**：几乎只有 name/description 到达正文生成
- **死字段**：skill.system 零消费；skill.characterIds / item.ownerId 不建图边（一致性规则 R3/R4 落空）；item.importance 恒 secondary
- **冲突**：skill.system 与 type 语义重叠；item.ownerId 与图谱"持有"关系重复；item.level 与 importance 双刻度
- **缺失**：技能习得章节、前置进阶关系、物品来源/获取章节
- 建议：characterIds/ownerId 保存时自动生成图谱边（masters/holds）；outline.involvedItems 的 buildItemInfo 接入活跃 generateChapter

### 阶段六 大纲（OutlineStage）
- name/summary/involvedCharacters/Locations 消费充分；involvedItems 弱；status 'completed' 不可达；无拖拽排序
- **缺失**：章节目标/冲突点/转折/伏笔标记（generateChapter 的"章节任务"只有 name+summary+字数）
- AI 大纲生成 involved* 全空（采纳即丢失实体关联）；删除节点不清理关联章节/预写/记忆

### 阶段七 章节写作（ChapterStage）
- **已修复**：style/extraPrompt 死字段激活（后端加参数全链路）；保存后自动跑图谱流水线
- 冲突：提取动作重复（预写记忆/状态摘要/实体状态/流水线最多 4 次 AI 调用、两套事实库）；每次保存都建 manual 版本（'generated' 从未产生）
- 缺失：写前一致性校验（graphValidateBeforeGeneration 未接入高级模式）；生成后无字数反馈/连续性提示；新实体无确认入库

## 三、预写 / 章节状态提取去留结论（用户重点关注）

**三者都不与图谱时间线重复，都应保留**，但需收敛为统一流水线：

| 产物 | 与图谱时间线关系 | 判定 |
|---|---|---|
| 预写 lw_prewrites | 无关（创作输入，"扩展大纲"） | **保留**；删除"从预写提取记忆"（预写是计划不是事实，提取"已发生记忆"语义错误，写手偏离后反而污染后续章节） |
| 实体状态 lw_entity_state_snapshots | **就是图谱时间线的数据源**（graphGetTimeline 消费） | **保留**；需修编号 + 双通道去重 |
| 章节状态摘要 lw_chapter_state_summaries | 不进 GraphView，是**生成连续性上下文**（上一章结束状态） | **保留**；统一流水线唯一入口；pendingEvents 可改为引用 lw_events |
| 事件 lw_events + 边 lw_graph_edges | **图谱时间线的核心** | **保留**；已接入高级模式 ChapterStage |

**图谱价值确认**：图谱"没用"的根因不是图谱本身，而是 ①高级模式不触发流水线（已修）②chapterNumber 错乱导致上下文注入失效（待修）③关系数据无来源（已解决：AI 关系分析 + 角色/故事线自动建边）。图谱 = 关系网络（设定层面）+ 事件/状态时间线（章节层面），是长文一致性的结构化载体。

## 四、全局优先级（按影响排序，待用户确认实施范围）

1. **统一修正 chapterNumber**（深度优先单一实现 + 数据迁移）——否则记忆/状态/摘要/事件整条链在默认结构下空转
2. 大纲补结构化创作字段（目标/冲突/转折/伏笔）并接入生成提示词
3. 技能物品建图边（characterIds→masters、ownerId→holds）+ involvedItems 注入章节 prompt
4. 手动角色关系改走图谱边（废弃旧表写路径）
5. 角色新增 goal/arc 字段接入章节 prompt
6. 大纲删除节点级联清理 + AI 大纲生成 involved* 补全
7. 死字段清理（position/skill.system/importance/count/estimatedLength）
8. 写前一致性校验接入高级模式 + 生成后连续性反馈
