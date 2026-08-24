# 长文写作「对话式工作流」开发进度

> 分支：feat/workflow-engine（本轮提交在分支上）
> 方案：tasks/2026-08-23-longwriting-agent-workflow.spec.md（已确认）
> 计划：tasks/2026-08-23-longwriting-agent-workflow.plan.md

## 目标形态（用户确认）

- 一个对话框（类似 agent），通过与 AI 对话逐步完成长文创作；流程由工作流驱动（依赖规则 + 生产状态，顺序由 AI 推进，不写死在 UI）
- 生成内容按现有数据结构落库并逐步显示（对话内嵌预览卡 + 右侧数据面板）
- 界面现代美观，颜色主题跟随系统设置（主题色 + 深浅色）

## 提交记录

| commit | 内容 |
|---|---|
| 阶段0 | lw_design_messages.metadata 列（幂等迁移）+ entity/DTO/repository 扩展；修复 getByConversationId 与 batchAdd 的多租户泄露（scoped 覆盖/事务内未注入 user_id） |
| 阶段1 | AgentService 后端：agent.types / agent-deps（生产状态+依赖+chips）/ agent-context（决策+总结）/ agent-actions（8 类动作分发，去重落库）/ agent-workflow（sendMessage 编排）；LongWritingAIService 增 agentDecide/agentSummarize；IPC 四通道 + 事件通道 |
| 阶段2 | useThemeMode（跟随系统深浅色 + html.dark + EP dark css-vars + 变量重映射）；useAgentChat / useAgentPanelData（composable，11 测试）；AgentChatView / AgentPreviewCards / AgentDataPanel / AgentWorkspace；StoryEditor 默认进入对话工作流，高级模式保留 |

## 测试

- 阶段0：迁移幂等 + repository metadata/多租户（9 用例）
- 阶段1：AgentService 16 用例（决策解析/依赖/去重/降级/编排/cancel）
- 阶段2：useAgentChat 7 用例 + useAgentPanelData 4 用例
- 受控子集回归（改动相关 + longwriting 相关）：28 文件 173 用例全绿
- 全量测试：环境性失败（原生模块 ABI 段错误/超时/postgres ECONNREFUSED 为既有基线），非本改动引入
- 类型：tsc -p tsconfig.node.json 绿；vue-tsc 新增错误清零（@/ 别名 TS2307 为既有基线）
- 渲染进程 electron-vite build 通过

## 真机验证（CDP，2026-08-23）

项目「沉案2」进入后：
- 对话工作区出现（无步骤条向导、无阶段导航），空态欢迎语 + 示例 chips
- 输入"帮我设计一个明朝锦衣卫与江湖门派对抗的故事…"→ 发送：
  - 事件流：`AI 正在思考…` → `生成故事概要`（action:start）→ `设计人物`（AI 自主连发第 2 个动作）→ `AI 正在组织回复…`（流式总结）
  - 预览卡 2 张（故事蓝图 + 人物卡）
  - AI 总结：《断刃山河》预计 32 章，核心冲突围绕信任与怀疑
  - 数据面板实时刷新：人物 6 位、概览标题、生产状态（故事概要✓ 人物✓）、下一步 chips（规划故事线 / 生成故事大纲）
- 工作流驱动闭环（决策 → 执行 → 落库 → 面板刷新）完整打通

## 后续独立优化项（记录，未做）

- ContextBuilder 编排器完成 + generateChapter 切换
- generateChapter 补 style/extraPrompt
- 大纲批量建树通道（当前 agent 内逐条 create，可接受）
- 双 calculateChapterNumber 统一
- done 事件携带解析数据

---

## 追加：高级模式默认 + 图谱改造 + 表单审查（2026-08-23 第二轮）

用户反馈：向导模式不达预期 → 默认高级模式并隐藏向导入口；图谱需与高级模式结合、动态更新；图谱打开新 Tab；点击实体右侧详情；表单审查。

### 提交记录

| commit | 内容 |
|---|---|
| 菜单入口 | config/menu 移除 longwriting hidden（侧边栏+首页显示长文写作） |
| 图谱改造 | 默认高级模式（隐藏向导入口）；图谱改内部 Tab（非对话框）；generateEntityRelations（AI 识别设定关系）+ GraphService.syncEntityRelations（名称解析/幂等落库，6 测试）+ IPC 三通道；角色生成输出 relations、故事线输出 entityRelations → 落库自动建边（CharacterStage/PlotStage/AgentService 同步）；GraphView 重构（左图右详情栏：实体信息/相关实体[点击跳转]/状态历史快照/关系时间线、时间轴过滤事件节点、时间轴联动章节状态、AI 分析实体关系按钮）；generateChapter 背景上下文补全 techLevel/势力分布/地理方位；真机验证：6 节点→AI 分析→21 关系边、点击实体右侧详情正常 |
| 图谱结合修复 | ChapterStage 保存章节自动跑统一流水线（事件/状态快照/建边/摘要），删除重复手动摘要提取；buildGraphContextSection UUID 泄漏修复（注入实体名称）；generateChapter 激活 style/extraPrompt（全链路） |
| 审查报告 | tasks/2026-08-23-longwriting-advanced-review.md：7 阶段表单评估 + 最严重问题（chapterNumber 4 套实现全部失效）+ 预写/状态提取保留结论 + 8 条优先修复建议 |

### 审查核心结论

- **最严重**：chapterNumber 计算 4 套实现全部在 3 级嵌套结构下失效（后端恒返回 1）→ 记忆/状态摘要/实体状态/图谱事件上下文静默失效（待修，最高优先级）
- **保留**：预写（创作输入）/ 实体状态提取（=图谱时间线数据源）/ 章节状态摘要（=生成连续性上下文）全部保留；删除"从预写提取记忆"（计划≠事实）
- **图谱价值确认**：无用根因 = 高级模式不触发流水线（已修）+ chapterNumber 错乱（待修）+ 关系无来源（已解决）
- 死字段：position（职务）/skill.system/importance/count/estimatedLength 等（见报告）

### 验证

- 受控子集回归：graph-relations 6 + graph.service 8 + agent-workflow 16 + consistency 9 + chapter-processor 4 = 43 用例全绿
- 主进程 tsc 绿；electron-vite build 通过；vue-tsc 新增错误清零（既有 TS6133/TS2307 基线）
- 真机：图谱 AI 关系分析 6→21 边；点击实体右侧详情（相关实体 17 条）；默认高级模式
