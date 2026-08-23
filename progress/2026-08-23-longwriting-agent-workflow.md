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
