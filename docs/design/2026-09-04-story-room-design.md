# 故事研讨室（Story Room）设计方案 —— 对话式长文/剧本创作工作台

- 日期：2026-09-04
- 作者：评审修复后的功能设计提案
- 状态：待评审
- 关联代码：`src/core/services/longwriting/**`、`src/core/services/longwriting-ai.service.ts`、`src/renderer/src/components/longwriting/**`

---

## 0. 一句话结论

不重写底层，复活并重做已被下线的对话式 Agent UI（4 个孤儿组件），在其上补三个它当年缺失的核心机制——**阶段化对话流、提案-确认循环、增强多轮上下文**——形成「故事研讨室」作为创作主入口；现有表单式高级模式保留为精修工具，两者读写同一套 `lw_*` 业务表，数据零迁移。

---

## 1. 背景与诊断：上一版对话模式为什么被下线

代码考古（git 历史 + 现状核实）：

- `3cac676f` 曾实现完整对话式 Agent（前端 `agent/AgentWorkspace + AgentChatView + AgentDataPanel + AgentPreviewCards`，后端 `AgentWorkflowService`），并设为 StoryEditor 默认模式。
- `7076b241`（图谱改造）删除了挂载点，高级表单模式恢复默认。**4 个前端组件 + `useAgentChat` composable 共 2232 行至今完整保留但零引用**。
- 后端 Agent 链路（决策→动作→流式总结）一直在维护（近期还修了并发互斥与可打断），只是没了 UI 消费者。

它失败的根因不是"对话式不好"，而是当时的实现有四个结构性缺陷：

| # | 缺陷 | 现状证据 | 后果 |
|---|---|---|---|
| 1 | **动作即落库，没有讨论环节** | `normalizeDecision` 只认 `{reply, actions}`，`generate_characters` 等动作决策出来立即写 `lw_characters`（agent-actions.ts） | 构思期用户要的是"反复讨论、逐步细化"，AI 却直接把半成品写进数据库；用户对数据没有确认权，只好退回表单模式自己掌控 |
| 2 | **无阶段感** | 单一 `DECISION_SYSTEM_PROMPT` 覆盖全过程；`buildSuggestions` 是"缺什么补什么"的生产思维 | AI 在用户还在想核心冲突时就推"生成人物/生成故事线"，对话变成另一种形式的向导 |
| 3 | **多轮上下文太弱** | 历史重放 = 最近 20 条 × 每条截 200 字纯文本（agent-context.ts L88-91），卡片内容、动作结果、被否决的方案都不进上下文 | 讨论三轮后 AI"失忆"，用户重复说明，体验崩塌 |
| 4 | **卡片只读、无 markdown** | `AgentPreviewCards` 仅展示 `action.data`，无编辑/采纳/重生成；聊天气泡是 `pre-wrap` 纯文本 | AI 产物只能看不能用，改一个字要去高级模式开表单——两套 UI 割裂 |

> 结论：方案 = 修复这四个缺陷，而不是发明新东西。底层工具（8 类动作、AI 生成函数、图谱一致性、全部 `lw_*` 表）全部复用。

---

## 2. 目标与非目标

**目标**
1. 构思期（核心故事/人物/故事线）以多轮对话为主交互：AI 提问、给方向选项、出结构化提案，用户讨论/修改/确认后才落库。
2. 大纲生成建立在"已确认的讨论成果"之上；逐章写作可从对话直接发起或跳转到现有编辑器。
3. 同一研讨室支持长篇小说与短剧剧本两种内容目标（短剧经导出桥接）。
4. 高级模式（表单）不动，作为精修/直改工具并存，同表读写。

**非目标**
- 不改 `lw_*` 表结构（仅扩展两个既有 JSON 字段）。
- 不替换章节编辑器（ChapterStage/MarkdownEditor 仍是写作终局）。
- 不动图谱/一致性子系统（作为写作阶段的既有能力接入提示）。
- 不用工作流引擎重写（内置"长文写作"应用走资产/知识库，与 `lw_*` 表无关，二者并存）。

---

## 3. 总体架构：复用与新增清单

| 层 | 复用（不动/微调） | 新增/重做 |
|---|---|---|
| AI 生成 | `longwriting-ai.service.ts` 全部 generate* 函数（产出结构化 JSON） | 无 |
| 动作层 | `agent-actions.ts` 落库代码段（characters 去重入库、plots 建边、outline 建树、write_chapter 流水线） | **拆分 draft/commit 两段**（§4.2）；新增 `agent:commitProposal` 入口 |
| 编排 | `AgentWorkflowService.sendMessage`（互斥/取消/事件）已达标 | 决策协议扩展（proposals/questions/phaseSuggestion）；阶段 prompt 注册表 |
| 上下文 | `stateToSummary`、`buildSuggestions` | 卡片摘要 + 锁定元素 + 开放问题注入；历史窗口升级 |
| 持久化 | `lw_design_messages`（metadata JSON）、`lw_projects.wizard_state`（JSON） | metadata 扩展 `cards`；wizard_state 扩展 `phase/locked/contentTarget` |
| 前端 | `useAgentChat`（事件订阅）、`AgentDataPanel`（右侧六分区，改为故事板）、EP 侧 `EpAgentPanel` 的 pendingChoice 确认模式 | `StoryRoom.vue` 主视图、可编辑 `StoryCard*` 卡片组件、markdown 渲染（复用 marked + sanitize-html） |
| 路由/入口 | StoryEditor 高级模式 | `/longwriting/room/:projectId` 新路由；项目列表双入口 |

---

## 4. 核心机制一：阶段化对话流（Phase Machine）

### 4.1 阶段定义

```
ideation(构思) → characters(人物) → world(世界·可选) → plots(故事线) → outline(大纲) → writing(写作)
```

- 阶段状态持久化在 `lw_projects.wizard_state`（扩展现有 `{skipped}` 为 `{phase, locked, contentTarget, skipped}`，旧数据兼容读取）。已有 `wizard:getState` 通道，补 `wizard:setPhase`。
- **每阶段一个专属 system prompt 模块**（阶段 prompt 注册表，替代单一 DECISION_SYSTEM_PROMPT）。要点：

| 阶段 | AI 行为约束 | 产出目标 |
|---|---|---|
| ideation | 每轮最多问 1-2 个聚焦问题；方向不明时给 2-3 个选项（A/B/C）各附一句理由；素材足够时输出 `draftOverview` 提案 | 故事概要定稿 |
| characters | 围绕已定概要逐个讨论人物（主角→对手→关键配角）；每轮至多提案 2-3 人；人物动机/关系冲突在对话里磨，磨清才提案 | 人物卡全部采纳 |
| world | 可跳过（stepper 上标"可选"）；按故事需要提案地点/势力/技能物品 | 世界设定够用即可 |
| plots | 引导因果链而非事件罗列（"B 必须是 A 的后果"）；每轮 2-5 条故事线提案 | 故事线定稿 |
| outline | 基于锁定 bible 生成大纲提案（逐卷确认，避免一次性巨树）；可回退（改人物后重生成后续卷） | 大纲树建成 |
| writing | "写第 N 章"→ 章节卡片（预览开头 + 在编辑器打开）；一致性扫描结果以卡片提醒 | 章节产出（编辑器完成） |

- **阶段迁移**：AI 可在决策里给 `phaseSuggestion`，前端渲染为确认卡（复用 EP pendingChoice 模式）；用户也可点 stepper 自由跳转（含回退）。
- **定稿/锁定（locked）**：用户说"概要定了"或卡片点"定稿"→ 元素进 `wizard_state.locked`（如 `{overview: true, characters: ['id1']}`）。锁定元素在后续所有决策/生成 prompt 中**原样注入**（概要全文、人物核心字段），未锁定内容仍走摘要——这是"讨论成果不丢失"的锚点。随时可解锁重议。

### 4.2 动作层拆分：draft 与 commit 分离（本方案最关键的一步）

现状：`generate_*` 动作 = "AI 生成 + 立即落库"一体。拆为两段：

```
现状:  decide → generate_characters ──→ AI 生成 JSON → 去重入库 lw_characters（立即）
拆分后: decide → draft_characters  ──→ AI 生成 JSON → 卡片进消息 metadata（不落库）
        用户点[采纳] → agent:commitProposal ──→ 入库段（原代码，含去重/建边）→ lw_characters
```

- 新增 draft 前缀动作：`draft_overview / draft_characters / draft_world / draft_plots / draft_outline`（决策白名单扩到 13 类）。
- 原 `generate_*` 直通动作保留（用户明确说"直接加上，不用问我"时走），prompt 在构思期引导优先 draft。
- `update_entity / delete_entity / write_chapter` 不变（前两者改的是已确认数据；write_chapter 产物走章节卡片→编辑器）。
- **落库必须经用户显式确认是架构保证而非 prompt 约束**：`commitProposal` 只接受前端显式调用，draft 路径物理上不写业务表。

---

## 5. 核心机制二：提案卡片协议

### 5.1 决策 JSON 扩展

```json
{
  "reply": "简短回应",
  "questions": ["1-2 个聚焦问题（构思期）"],
  "proposals": [{ "type": "draft_characters", "params": { "requirements": "..." } }],
  "actions": [{ "type": "write_chapter", "params": {} }],
  "phaseSuggestion": "characters",
  "lockSuggestions": ["overview"]
}
```

`normalizeDecision` 容错解析（沿用 jsonMode 容错基建），未知字段忽略。

### 5.2 消息 metadata 卡片结构

```ts
// lw_design_messages.metadata（JSON 字符串，向后兼容旧格式）
{
  cards: [{
    cardId: 'card_1693...',
    type: 'overview' | 'character' | 'plot' | 'world' | 'outline' | 'chapter' | 'consistency',
    status: 'draft' | 'adopted' | 'dismissed' | 'outdated',   // outdated: 后续同实体有新版本
    version: 2,
    data: { /* 与各 AI 生成函数的 JSON 输出同构 */ },
    rationale: 'AI 一句话提案理由',
    commitResult?: { ids: [...], summary: '已保存 2 位人物' }
  }],
  suggestions: [...],          // 既有 chips
  phase: 'characters',         // 本轮所属阶段
}
```

- 卡片在 `reply:done` 后随消息一次性出现（流式期间只有正文），实现简单且稳定。
- **卡片操作**：
  - `采纳`：可先 `行内编辑`（字段就地改，编辑结果随 commit 提交）→ 调 `agent:commitProposal` → 卡片转 `adopted`，聊天流插入"✓ 已保存：林晓（主角）"，右侧故事板刷新。
  - `重新生成`：附一句反馈（"动机改成复仇"）→ `agent:regenerateProposal` → 新卡片 v2，旧卡转 `outdated`（保留可回看）。
  - `忽略`：转 `dismissed`——**被忽略的卡片摘要仍进决策上下文**（"用户否决过：修仙流开局"），避免 AI 反复提同类方案。
  - `定稿`：采纳之上的锁定（§4.1）。
- 人物/故事线支持一卡多人时的**逐项勾选采纳**（采纳 2/3）。

---

## 6. 核心机制三：上下文与多轮记忆增强

分层注入决策上下文（`buildDecisionContext` 重构）：

1. **项目状态**：`stateToSummary`（现状保留）+ 锁定元素全文（§4.1）。
2. **对话历史**：窗口 20→30 条；用户消息截断 200→400 字；助手消息替换为一行结构化摘要：`助手：{reply}（提案：人物×3 → 采纳2/忽略1）`。
3. **卡片摘要**：最近 N 张卡片的 `type + 标题字段 + status` 列表（如 `人物卡「林晓」已采纳 v2`），被忽略的方案显式标注。
4. **开放问题**：`wizard_state.openQuestions`（AI 在 questions 里问过、用户未答的，跨轮保留，最多 3 条，防丢线）。
5. （M3 可选增强）`agentDecide` 从"文本重放"升级为原生 messages 数组（借鉴工作流引擎 llmHistory 机制），进一步提升多轮连贯性——先用 1-4 项验证效果再决定是否做。

---

## 7. UI 设计

### 7.1 布局（新视图 `StoryRoom.vue`，路由 `/longwriting/room/:projectId`）

```
┌────────────────────────────────────────────────────────────────────┐
│ ← 返回 │ 项目名 │ ●构思─○人物─○世界(可选)─○故事线─○大纲─○写作 │ 高级模式↗ │ 模型▾ │
├──────────────────────────────────────────┬─────────────────────────┤
│  对话流（markdown + 卡片）                  │  故事板（实时结构化视图）   │
│                                          │  ▸ 故事概要      🔒已定稿 │
│  ┌─ AI ─────────────────────────────┐    │  ▸ 人物(3)  林晓·主角 🔒  │
│  │ 核心冲突我建议二选一：              │    │  ▸ 世界设定  背景✓ 地点2  │
│  │ A. 复仇线：…  B. 救赎线：…         │    │  ▸ 故事线(2)             │
│  └───────────────────────────────────┘    │  ▸ 大纲  12节点/已写0     │
│  ┌─ [提案卡·人物 v1] 林晓 ───────────┐    │    点任意元素→带入对话讨论  │
│  │ 身份: 青云宗外门弟子  [行内编辑]    │    │                         │
│  │ 性格: 隐忍/重情      [行内编辑]    │    │                         │
│  │ [✓采纳并保存] [↻重新生成…] [✗忽略] │    │                         │
│  └───────────────────────────────────┘    │                         │
│  ┌─ AI ── 已保存「林晓」。对手我建议…  ┐    │                         │
├──────────────────────────────────────────┴─────────────────────────┤
│ [输入框… Enter发送/Shift+Enter换行]  💡补充对手人物 · 让AI再问 · ⏹打断 │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 组件拆分与复用

| 新组件 | 复用基础 | 改造点 |
|---|---|---|
| `StoryRoom.vue`（外壳+stepper） | `AgentWorkspace.vue` | 阶段条替代进度带；双栏比例可拖 |
| `StoryChat.vue`（消息流） | `AgentChatView.vue` + Chat.vue 的 markdown 渲染 | markdown（marked+sanitize-html 白名单消毒，复用评审 #15 基建）；卡片区 |
| `StoryCard*.vue`（按类型：Overview/Character/Plot/World/Outline/Chapter/Consistency） | `AgentPreviewCards.vue` | 从只读改为可编辑+操作按钮；字段编辑用轻量行内控件 |
| `StoryBoard.vue`（右栏） | `AgentDataPanel.vue`（六分区增量刷新） | 加锁定徽标、"讨论此元素"按钮（向输入框插入上下文 chip） |
| `useStoryRoom.ts` | `useAgentChat.ts` | 增加卡片操作 API、阶段状态、`agent:${projectId}` 事件扩展处理 |
| 阶段确认卡 | EP `EpAgentPanel` pendingChoice 模式 | phaseSuggestion 渲染 |

### 7.3 入口与导流

- `LongWriting.vue` 项目卡片双按钮：**「进入研讨室」(主)** / 「高级模式」；新建项目对话框直接选内容目标（长篇/短剧）后进研讨室。
- StoryEditor 顶部加"↖ 返回研讨室"。
- 旧 `WizardContainer` 六步组件维持孤儿，研讨室稳定一个版本后删除。

---

## 8. 短剧剧本衔接（contentTarget = 'script'）

- 研讨室对两种目标**共用同一套构思/人物/故事线阶段**（故事圣经是共享资产，仍落 `lw_*` 表，项目即长文项目）。
- 差异在出口：
  - `novel`：outline 阶段生成小说卷/章/节大纲（现状）。
  - `script`：outline 阶段改为"分集大纲"提案（集→场两级，复用 outline 树 + 专用 prompt），定稿后出现 **「转为短剧项目」** 按钮 → 调用 EP 侧既有"AI 生成剧本"链路（EpisodeCreator 已有），以概要+人物+故事线+分集大纲为种子生成剧本初稿，创建 episode 项目并跳转 EpisodeStudio。
- 这样短剧的"前期讨论"复用全部本方案能力，剧本生产复用 EP 现有管线，两边都不重造。
- 建议 **V1 只做 novel 目标，script 桥放 M5**（见开放问题 1）。

---

## 9. IPC / API 变更清单

| 通道 | 类型 | 说明 |
|---|---|---|
| `longwriting:agent:send / history / cancel / state` | 复用 | 不变 |
| `longwriting:agent:commitProposal` | 新增 | `{projectId, messageId, cardId, editedData?}` → 执行入库段，返回 `{ids, summary}`，卡片转 adopted |
| `longwriting:agent:regenerateProposal` | 新增 | `{projectId, cardId, feedback}` → 重跑 draft，新卡片进新消息 |
| `longwriting:agent:dismissProposal` | 新增 | `{projectId, cardId}` → 仅改卡片状态（metadata 更新） |
| `longwriting:agent:setPhase` / `lockElement` | 新增 | wizard_state 写入 |
| `wizard:getState` | 复用 | 返回值扩展 phase/locked |
| 事件 `longwriting:agent:${projectId}` | 复用 | payload 扩展 cards（reply:done 时）；无需新事件类型 |

---

## 10. 数据兼容

- `lw_design_messages.metadata`：旧格式（actions/suggestions）原样可读；新读端对缺 `cards` 字段容错。
- `lw_projects.wizard_state`：旧 `{skipped}` 兼容（phase 缺省按数据现状推断：无概要→ideation，有大纲→writing）。
- 业务表零变更；高级模式与研讨室同表并发读写（已有 ALS 租户隔离），故事板每次操作后拉取最新，不做长驻缓存。

---

## 11. 里程碑（TDD，每步含验收标准）

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| **M1 后端提案协议**（约 2 天） | agent-actions 拆 draft/commit 段；决策白名单扩展 proposals/questions/phaseSuggestion/lockSuggestions；阶段 prompt 注册表；wizard_state 扩展；commitProposal/regenerate/dismiss/setPhase/lock IPC | 单测 ≥12 例：draft 全程不写业务表（断言各仓库零调用）；commit 落库断言（人物去重/建边不变）；阶段迁移与回退；锁定元素注入 prompt；决策解析容错（含非法 proposals） |
| **M2 研讨室骨架**（约 2 天） | StoryRoom 路由+布局；StoryChat（markdown+消毒）；卡片只读渲染；StoryBoard 复用；入口双按钮 | 从项目列表进入可完整对话（发消息/流式/建议 chips/打断）；卡片随消息出现；旧项目（含历史 agent 消息）打开不报错 |
| **M3 提案闭环**（约 3 天） | 卡片行内编辑/采纳/忽略/重新生成(带反馈)/逐项勾选/定稿锁定；阶段跳转 stepper；开放问题管理 | 端到端手测脚本：新建→讨论出概要→采纳→人物 3 轮讨论逐个采纳（其中 1 次编辑后采纳、1 次重生成）→故事板各分区实时正确；被忽略卡片影响后续提案（上下文断言单测） |
| **M4 大纲与写作衔接**（约 2 天） | outline 阶段逐卷提案/确认/回退重生成；writing 阶段章节卡片→"在编辑器打开"（跳 ChapterStage 定位节点）；一致性扫描（scanContradictions）结果卡片化 | 大纲树最终结构正确（卷/章/节、涉及角色挂接）；章节卡片打开编辑器定位正确；矛盾卡片可跳转对应章节 |
| **M5 短剧桥 + E2E**（约 2 天） | script 目标：分集大纲 prompt + 转短剧项目（EP AI 生成剧本 seeded）；Playwright E2E 主链路 | 长文 E2E：新建→两轮讨论→采纳概要+1 人物→生成大纲 1 卷→打开编辑器；短剧桥手动验收 |

总量约 11 个工作日。每个里程碑独立可合并、可回退（旧 UI 全程可用）。

---

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| 决策 JSON 稳定性（新增字段后解析失败率上升） | normalizeDecision 逐字段容错（缺 proposals 当空数组）；沿用 jsonMode 重试基建；单测覆盖畸形输入 |
| 提案生成延迟（人物卡 5-15s）破坏对话感 | draft 期间 UI 显示卡片骨架 + 阶段文案；决策 reply 先流式出来、卡片后到（事件顺序天然如此） |
| 上下文膨胀（锁定全文 + 30 条历史） | 锁定元素按类型限注入量（人物卡只注核心 6 字段）；卡片只进摘要不进全文；token 预算监控（agentDecide maxTokens 提到 2048） |
| 双 UI 数据竞争（高级模式同时改） | 同表 + 操作后即拉取；commitProposal 返回后故事板定向刷新该分区 |
| AI 绕过提案直接落库 | 架构保证：构思期 prompt 引导 + draft 动作物理不写表；generate_* 直通仅当用户消息明确要求"直接保存" |
| 阶段机变成新的束缚 | 自由跳转/回退；world 可跳过；AI 可建议回退（"你改了主角动机，第 2 卷大纲需要重议"） |

---

## 13. 开放问题（需产品拍板，不阻塞 M1-M4）

1. **短剧目标是否进 V1**：建议 V1 只做长文（M5 做桥）。若短剧优先级高，M5 提前。
2. **世界设定阶段**：独立阶段（本方案，可跳过）还是并入人物/故事线阶段按需触发？建议先独立，观察使用率。
3. **旧六步向导（WizardContainer）**：确认研讨室上线一个版本后删除。
4. **构思期多方案对比**：是否需要"方案 A/B 并列卡片、用户择一"的专用卡片形态（当前用文本选项即可），V2 再考虑。
