# 系统功能模块能力注入 Agent 对话上下文（能力卡注册制）

- 日期：2026-09-20
- 需求：agent 对话模块（聊天 Agent 模式）应把**系统所有功能模块的能力**注入上下文，让用户可以直接下指令——「我想写一本小说」「生成关于某个事件的报告」「做个视频」「语音转文字」「语音复刻」——agent 按指令匹配功能模块，调用其能力：复用已有工作流、调用技能，或**现写一个工作流**；前提是 agent 知道系统有工作流引擎、引擎提供什么节点能力、有没有现成工作流可完成任务。

---

## 1. 现状盘点：系统已有的三层「注册制」，缺了什么

| 层 | 已有机制 | 对 agent 的可见性 |
|---|---|---|
| 业务包 | `builtin-packs.ts` + `PackRegistry`（12 包 manifest 注册，activate 贡献 IPC/路由） | 无——manifest 只有工程贡献点（IPC 前缀/路由），没有 agent 能力描述 |
| 工具 | `AgentToolRegistry`（pack 命名空间 `lw-*`/`ep_*` 等） | `discover_capabilities` 能列 moduleTools，但仅限声明了 `catalogPacks` 的宿主（聊天宿主无项目上下文，不开放） |
| 动态能力 | 工作流定义（DB）+ 技能（SkillService，内置+用户） | `discover_capabilities` 可查，但 agent **必须先想到去查**——系统提示词里没有任何「系统有什么模块、各能干什么」的先验 |

缺口：**没有一层是面向 agent 的模块能力清单**。「我想写一本小说」到来时，模型不知道系统有长文写作模块（研讨室/章法/卷设计工作流），更不知道工作流引擎有 tts/voice-clone/image-gen 等节点可以现写流程——只会泛泛回答。

## 2. 方案：能力卡注册制（单一事实源 + 双消费面）

### 2.1 数据契约（`src/shared/types/module-capability.types.ts`）

`ModuleCapability` 能力卡：`moduleId / name / tagline（一句话职责+主调用路径，唯一进摘要的字段）/ intents（典型指令）/ capabilities（能力条目）/ invocation[]（via: tool|workflow|skill|ui + how + note）`。

### 2.2 登记处（`src/core/platform/workflow/tools/module-capability-catalog.ts`）

`MODULE_CAPABILITY_CARDS`：13 张内置卡——工作流引擎、信息与数据、技能包、长文写作、短剧制作、语音、图像生成、翻译、知识库、资产中心、日记、人设工坊、领域共学。内容与代码实况一一对应（节点库对齐 `WORKFLOW_NODE_TYPES`，技能对齐 `BUILTIN_SKILLS`，直连工具对齐 `SYSTEM_AGENT_PASSTHROUGH_TOOLS`）。

**为什么是平台层静态登记处，而不是每包 activate() 动态注册**（与 `builtin-packs.ts` 登记处同构的理由）：
- boot 顺序：业务包 activate 早于 workflow 子系统初始化（system-agent-tools 头注释），动态注册需要新注册表单例 + 12 个包 index.ts 全改；
- 卡是「模块对 agent 的自述文案」，跟 manifest 工程字段生命周期不同步，集中一表 review 时与代码 diff 同 PR 可见；
- 后续演进路径明确（§5）：下沉为 pack manifest 贡献点，不需要改消费面。

### 2.3 消费面

1. **提示词摘要注入**（聊天宿主 `buildSystemPrompt`）：`renderModuleCapabilityDigest()` 每模块一行拼入系统提示词末尾【系统功能模块能力图】——模型零工具调用即可做「意图→模块」匹配；每轮现拼，卡演进即时生效。
2. **discover_capabilities 扩展 `modules` 段**：`filterModuleCapabilityCards(keyword)` 返回全量卡详情（意图/能力/调用路径），参数级细节按需查询；keyword 命中面含 intents/capabilities。

### 2.4 路由纪律重写（`SYSTEM_AGENT_CHAT_PROMPT`）

新增创作/产出类请求的匹配纪律，并把「复用 vs 现写」的判定写死：
- 现成技能/工作流 → `invoke_skill` / `run_workflow`（例：事件报告 = `web_search` 取材 + `invoke_skill: deep-analysis`）；
- 没有现成的但可自动化 → 一次性 `create_task_plan`，可复用流程 `create_workflow_draft`（节点库覆盖面写进纪律，模型才知道「可以现写」）；
- UI 主导的能力（研讨室/短剧流水线/语音工作台）→ 明确告知页面与用法，不在对话里空谈替代品；
- 兜底：能力图与目录都没有 → 如实告知，绝不虚构模块能力。

## 3. 改动清单

| 文件 | 改动 |
|---|---|
| `src/shared/types/module-capability.types.ts` | 新增：ModuleCapability 契约 |
| `src/core/platform/workflow/tools/module-capability-catalog.ts` | 新增：13 张能力卡 + 摘要渲染 + keyword 过滤 |
| `src/core/platform/workflow/tools/system-agent-tools.ts` | discover_capabilities 增加 `modules` 段与说明，工具描述更新 |
| `src/core/packs/chat/services/system-agent/system-agent.service.ts` | 提示词纪律重写 + 能力图注入 `buildSystemPrompt` + memory 系统能力行更新 |

## 4. 纪律与边界

- **能力卡写多了 = 诱导必败调用**（同 discover 目录的 review P3 红线）：卡上的每个可调用路径都必须真实可达——聊天宿主可直调的只写 passthrough 白名单工具；模块域工具（lw_*/ep_*，需项目上下文）一律标注「仅对应宿主内可用」，聊天侧给出 UI/工作流/任务树替代路径。
- 短剧制作/长文写作的重交互能力**不在聊天宿主直调**：卡片 invocation 如实写 `ui` 路径 + `workflow` 节点路径（chapter-writing/volume-design 可入编排，需 projectId）。
- 摘要有界：13 行 tagline（单卡 ≤220 字、总量 ≤2200 字，单测钉住），不随技能/工作流数量膨胀。

## 5. 后续演进（未做，登记待办）

1. **pack manifest 贡献点化**：`contributions.agentCapability` 随包声明，PackRegistry 聚合；包禁用自动从目录摘除（当前静态表不含启停过滤——12 包均为内置默认启用）。
2. **故事研讨室/短剧宿主注入**：领域宿主如需跨模块意识，可复用同一 digest（当前研讨室提示词保持领域聚焦，仅经 discover_capabilities 查询）。
3. **Web 端对齐**：Web server 的聊天 Agent 宿主如启用，走同一 buildSystemPrompt，无需分叉。
