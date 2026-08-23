# 长文写作「对话式工作流」开发计划 v1

> 依据：tasks/2026-08-23-longwriting-agent-workflow.spec.md（用户已确认全部建议）
> 用户补充要求：界面要以设计师角度做（现代/美观/易用）；颜色主题要能跟随系统设置的颜色主题。
> 方法：TDD（先写测试 → 实现 → 跑绿）；迁移幂等（SQLite/PG 双 DDL）；主进程改动需 kill + rebuild:electron + 重启 dev 验证；渲染进程改动 reload 即可。

## 主题机制决策（用户要求"使用系统设置的颜色主题"）

现状：useTheme.ts 只做主题色（data-theme + EP 主色变量）；settings store 的 theme='auto'|'light'|'dark' 全是 TODO，无 html.dark 切换、无 EP dark css-vars 引入。

做法（阶段 2 实现）：
1. 引入 `element-plus/theme-chalk/dark/css-vars.css`，实现 settings store 的 setTheme/applyTheme/getSystemTheme/setupSystemThemeListener（matchMedia prefers-color-scheme，auto 跟随系统，light/dark 手动锁定）。
2. styles/index.scss 增加 `html.dark` 下 `--bg-color-*` / `--text-*` / `--border-*` / `--fill-*` 的深色值覆盖（用现有变量体系重映射，现有页面大致可用；个别写死色值的组件 dark 下不完美，渐进改进）。
3. **新对话界面全部使用 CSS 变量**（--bg-color-* / --text-* / --color-primary-* / --el-* / --shadow-* / --radius-*），禁止写死色值 → 自动跟随应用主题色 + 系统深色模式。

## 阶段划分

### 阶段 0：数据层 —— 对话消息扩展 metadata
- [ ] 迁移：`lw_design_messages` 增加 `metadata` TEXT 列（幂等 ensureColumn，SQLite/PG 双 DDL；并入现有迁移文件或新增迁移）
- [ ] Entity：LwDesignMessageEntity 加 `metadata` 列
- [ ] DTO：shared/types/longwriting.types.ts 的 DesignMessage 加 `metadata?: string`
- [ ] Repository：toDto / add / batchAdd 支持 metadata
- [ ] 测试：迁移幂等 + repository metadata 读写

### 阶段 1：后端 AgentService + IPC
- [ ] `agent.types.ts`：AgentAction（type+params）、决策输出、ActionSummary、AgentEvent 类型
- [ ] `agent-deps.ts`：生产状态计算（overview/characters/world/plots/outline/chapters 数据存在性）+ 最小依赖检查
- [ ] `agent-context.ts`：决策上下文（项目数据摘要 + 历史 N 条 + 生产状态）/ 总结上下文（动作摘要 + 更新后状态）
- [ ] `agent-actions.ts`：动作分发 executeAction（generate_overview/characters/world/plots/outline/write_chapter/update_entity/delete_entity）→ 调现有生成方法 → 解析 → 落库（生成类按名称去重只入新增）→ 执行摘要；write_chapter 后跑图谱流水线（extractChapterEvents/States/Summary）
- [ ] `agent-events.ts`：事件推送（stage / action:start / action:done / reply:start / reply:content / reply:done / error）
- [ ] `agent-workflow.service.ts`：sendMessage(projectId, message) 编排 ①-⑥（组装上下文 → 决策调用 → 执行动作 → 总结调用 → 持久化对话 → 返回）
- [ ] 决策/总结用现有 callAI / callAIStream + 长文默认模型；决策失败降级为纯对话
- [ ] IPC 四通道：AGENT_SEND / AGENT_HISTORY / AGENT_CANCEL / AGENT_STATE + 事件通道 `longwriting:agent:${projectId}`（preload + channel-map）
- [ ] 测试：AgentService 单测（mock 生成方法/落库）：决策解析、动作分发、依赖检查、增量去重、降级路径、事件顺序；handler 注册测试

### 阶段 2：主题机制 + 对话界面 + 数据面板（以设计师角度）
- [ ] 全局主题机制（见上"主题机制决策"）
- [ ] `useAgentChat` composable：消息列表状态机（user/assistant/过程消息演进）、发送/取消、事件订阅、历史恢复
- [ ] `AgentChatView.vue`（对话区）：
  - 消息气泡（用户右 / AI 左，Markdown 渲染）；过程消息同一气泡内演进（决策中 → 动作进度 → 预览卡 → 正式回复）
  - 内嵌产物预览卡（人物/故事线/大纲/章节），点击跳面板 Tab
  - 下一步建议 chips（点击即发送）
  - 底部输入框（多行自适应、Enter 发送、生成中禁用+打断按钮）
  - 空态引导（项目刚开始时的欢迎语）
- [ ] `DataPanel.vue`（数据面板，360-400px，可折叠）：
  - Tab：概览 | 人物 | 世界 | 故事线 | 大纲 | 章节（只渲染当前 Tab，独立滚动）
  - 概览：标题/类型/摘要/核心冲突/预估章节 + 生产状态环节清单
  - 人物：卡片网格（头像占位 + 姓名 + 定位 + 简介），点击详情/编辑弹窗
  - 世界：折叠组（背景/地点/势力/技能/物品，按 enabledFeatures）
  - 故事线：时间线列表（序号+标题+摘要+角色 tag）
  - 大纲：树（卷→章→节，复用/轻量实现），章节节点状态/字数，点击阅读
  - 章节：列表（章节名+字数+状态），点击阅读弹窗
  - 空态引导文案；事件驱动自动刷新（changed 分区）+ 角标提示
- [ ] 顶栏进度带：想法→人物→世界→故事线→大纲→章节（✓/○ 状态展示，点击跳面板 Tab，非流程导航）
- [ ] 测试：useAgentChat 状态机单测；面板数据聚合 composable 单测

### 阶段 3：入口切换 + 交互打磨 + 联调
- [ ] StoryEditor：默认进入对话式工作流（替换 WizardContainer），右上角保留「高级」切换 7 阶段平铺 + 图谱按钮
- [ ] 修改/删除实体动作的用户侧支持（对话指令 → update_entity/delete_entity）
- [ ] 错误恢复：动作失败在对话中说明 + 可重试；决策失败降级提示
- [ ] 与图谱联动：write_chapter 后图谱新节点/边可见（已有能力，验证打通）
- [ ] 全量回归（基线 ~115-118 环境性失败除外）+ vue-tsc 无新增错误 + 主进程 tsc 绿

## 测试命令备忘
- 单元测试：`npm test -- tests/unit/...`（跑前需 `npm run rebuild:node`，先 kill electron）
- UI 验证：`npm run rebuild:electron` + `npm run dev:debug`（CDP 9222）
- 类型：`tsc -p tsconfig.node.json` 必须绿；vue-tsc 基线脏不视为门禁
