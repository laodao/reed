# 18 · 业务包（Business Pack）详设：平台内核与业务的边界

> Agent Loop Harness ｜ 2026-08-29 ｜ 状态：设计中 ｜ 配套：[01-design-spec.md](./01-design-spec.md)（总纲）
> 立论：**AI 编码也是一种业务，平台要广泛支持各类业务。** 平台内核（10-17 号文档的全部能力）保持业务无关；每类业务以"业务包"形式接入。本文泛化吸收腾讯 Harness Engineering 实践的四个核心概念：约束三级分层（Rules/Skills/Safety）、Skills 封装领域经验、SDD 工作流角色（Planner/Generator/Evaluator/Archiver）、评估分层 L1-L4 与度量回流闭环——分别映射到 17/15/12 号的质量门规则层/L4 技能/护栏与 16/17/15 号的任务树+质量门+飞轮。

## 1. 目标与范围

- 定义**业务包（Business Pack）**抽象：一份清单（Pack Manifest）声明一类业务接入平台所需的全部可定制面——工具集、技能集、规则集、工作流模板、质量策略、记忆命名空间、触发器预设、UI 入口。
- 定义**包的生命周期**（开发/安装/启用/升级/卸载）与 **per-user 启用**（Web 多租户）。
- 定义**隔离与安全边界**：包间工具权限、记忆命名空间、预算隔离；内置包与第三方包的可信度分级。
- 给出三个示例包（ai-coding / approval / content-production）的具体设计，具体到能照着做。
- 非目标：第三方包市场与分发渠道（开放问题）；包内自定义 UI 渲染沙箱（UI 入口本期只做路由级登记）。

## 2. 现状与差距

| # | 现状 | 证据 | 差距 |
|---|------|------|------|
| G1 | 内核四大支柱（事件/journal/runtime/任务树/质量门/飞轮）设计均为业务无关 | 10-17 号文档 | 缺"业务如何接入"的汇聚点：工具白名单散落在 agent-loop 节点 config（12 §5.3）、质量类目散在 `quality_policies`（17 §4.2）、记忆类目散在 `memory_entries.category`（15 §4.2），无统一声明与装配 |
| G2 | 两套野生 agent 编排（ep/longwriting）各自硬编码业务逻辑 | 01 §0：`ep-agent-workflow.service.ts`、`longwriting/agent/agent-workflow.service.ts` | 迁移到 AgentRuntime（02 M4-2）后，业务差异需要沉淀为可声明的包，否则只是把硬编码搬进新运行时 |
| G3 | 存量"技能包"（SKILL.md 目录 + `skill-call` 节点） | `src/core/modules/workflow/skills/skill.service.ts`、`nodes/skill-nodes.ts:1-12` | 是 L4 技能的野生前身；需收口进 15 号 `memory_entries`（kind='skill'）体系，存量条目作为种子迁移 |
| G4 | 项目已有成文工程红线（禁假数据、最小改动、TDD、分层架构） | `CLAUDE.md`（职业道德/开发原则） | 这些规则目前靠人读；ai-coding 业务要求以机器可注入（系统提示）+ 可检验（质量门）的形式表达 |

**差距总结**：内核机制齐了，缺一层"业务声明 → 内核各模块装配"的胶水层。本文即该层设计。

## 3. 概念模型

### 3.1 业务包的构成（Pack Manifest 八要素）

```
BusinessPack
  ├─ tools        工具集：14 号注册表工具白名单（按名引用）+ 包私有工具（新节点走 E4 四件套注册）
  ├─ skills       技能集：软约束层，安装时物化为 15 号 L4 条目（memory_entries kind='skill'）
  ├─ rules        规则集（三级分层，见 3.2）：硬红线 rules + 安全兜底 safety
  ├─ workflowTemplates  工作流模板：安装时物化为 workflow_definitions 行（带 pack_ref 标记）
  ├─ qualityPolicies    质量策略：安装时物化为 17 号 quality_policies 行（类目带包前缀）
  ├─ memory       记忆命名空间声明：15 号 category 前缀约定（见 4.4）
  ├─ triggers     触发器预设：引擎四种触发器（manual/cron/event/webhook，01 §1.1）的模板参数
  └─ ui           UI 入口：路由 + 菜单登记（本期只登记，不做包内渲染沙箱）
```

### 3.2 约束三级分层（Harness Engineering ①→本平台的映射）

| Harness 层 | 语义 | 本平台落点 | 违例后果 |
|---|---|---|---|
| Rules（硬红线） | 不可违反 | ① 文本注入 agent-loop 系统提示最高优先段（12 §5.3 buildSystemPrompt 的 memoryCtx 同位扩展，本文新增注入位 `packCtx`）；② 可机检部分物化为 17 号 `AcceptanceCheck`（layer='rule'/'tool'） | 任务判 fail，走 17 号失败链 |
| Skills（软性推荐） | 领域经验，建议遵循 | 15 号 L4 技能条目，装配命中时注入工具调用范式（`SkillContent.toolPattern`） | 不违例；质量分体现优劣 |
| Safety（安全兜底） | 出事先拦 | 14 号批准策略（dangerLevel/approval）+ 12 号护栏（maxIterations 等）+ SSRF 闸门 + 平台门禁 | 工具调用 blocked / 循环终止 |

### 3.3 平台内核 vs 业务包的边界（不变量）

**内核永恒不变（包不可改）**：事件系统信封与投递语义（10）、journal 溯源与恢复（11）、AgentRuntime 主循环与 AgentHost 契约（12）、tool-calling 协议层（13）、工具注册表的装配/分发/审计机制（14）、飞轮四环机制（15）、任务树状态机与 Planner 框架（16）、质量门四层验证器框架（17）。

**包可定制（且仅可定制这些）**：§3.1 八要素。包**不得**：新增内核表（只能消费/物化进既有表与本文 §4 的包管理表）、改状态机、绕过护栏、注册不经过 14 号 registry 的执行通道。

**核心不变量：内核不知道任何具体业务。** 反向校验：删除全部业务包后，内核代码与全部内核测试必须原样通过；内核代码中不得出现任何 pack id 字面量（包感知只经 `agent_tasks.pack_id`、`quality_policies.category` 等数据行体现）。

### 3.4 示例包一：ai-coding（AI 编码，最详细）

**工具集**（14 号命名规范 `node:<nodeType>`）：

| 工具 | 来源 | dangerLevel | 说明 |
|---|---|---|---|
| `node:code` | 复用现有 | write | vm 沙箱执行（M1 首批白名单成员，02 M1.4）；Web 端按既有门禁禁用（`code-nodes.ts:76-83`） |
| `node:web-search` / `node:http-request` | 复用现有 | read / external-post | 查文档、读 issue |
| `node:kb-retrieve` | 复用现有 | read | 检索项目知识库 |
| `node:read-asset` / `node:save-asset` | 复用现有 | read / write | 产物落资产库 |
| `node:git-ops` | **包私有，新建**（E4 四件套） | exec | status/diff/log/branch/commit；桌面端专属，`requireDesktopCli` 同门禁；**不含 push/reset --hard**（该两操作走 human_request 批准，14 §6 时序） |
| `node:run-build` / `node:run-tests` | **包私有，新建** | exec | 包装 `npm run build` / `npm test`，工作目录锁沙箱根 |
| `node:fs-read` / `node:fs-write` | **包私有，新建** | read / write | 路径白名单限定项目根内；fs-write 落审计（`agent_tool_calls`） |

**规则集示例**（对应 CLAUDE.md 惯例）：

- 硬红线（rules）：禁假数据/写死数据糊弄（机检：llm_judge rubric + 人工抽审）；最小改动、不顺手重构；TDD；分层架构（渲染进程不直访 DB，逻辑在服务层）；凭据/密钥不入代码与日志（机检：rule 层 regex 扫描 diff 中的密钥模式）。
- 软推荐（skills）：「修 bug 先复现」SOP、「改节点四件套」SOP（catalog/types/handler/forms，nodes/README 既有惯例）——L4 技能条目，含 `toolPattern`。
- 安全兜底（safety）：exec 级工具默认需人工批准；fs-write 限项目根；护栏 maxIterations=30、maxTokens 按任务预算；git push 永远走批准。

**SDD 工作流模板**（Harness ③ 用 16 号任务树 + 17 号质量门表达）：

```
requirements  form-collect 收集需求 → human-review 需求确认（复用现有节点）
plan          Planner.decompose 分解任务树 → approvePlan 整树人工批准（16 §5.2 硬性约束）
execute       子任务 executor=agent_loop：Generator 角色 = AgentRuntime + 本包工具白名单
evaluate      每子任务过质量门（下表 L1-L4 映射）；失败走 retry→replan→escalated（17 §3）
archive       根任务终态 → 15 号 distiller 蒸馏（Archiver 角色）→ 闸门 → L3/L4 入库
```

工作流模板同时物化一条骨架 workflow_definition：`start → form-collect → agent-loop(本包白名单+规则) → human-review → end`，供轻量任务不走完整任务树时使用。

**Harness 评估 L1-L4 → 17 号四层验证器映射表**：

| Harness 评估层 | 含义 | 17 号落点 |
|---|---|---|
| L1 语法 | 可解析/可编译/schema 合法 | rule 层（`json_parseable`/`schema`）+ tool 层 `compile`（17 §5.2/§5.3） |
| L2 逻辑 | 测试通过、行为正确 | tool 层 `test_suite`/`js_assert`（跑 `npm test` 结果断言，17 §5.3） |
| L3 规范 | 符合工程规范与验收叙述 | llm_judge 层 rubric（规范符合度/最小改动/无假数据，17 §5.4） |
| L4 架构 | 分层与架构决策正确 | human 层强制验收（高风险类目）+ 对抗性抽查（17 §5.5/§9.4） |

质量策略物化 `quality_policies` 行：category=`builtin.ai-coding:code`（layers=rule+tool+llm_judge+human，gray 0.6-0.85，max_retries=3）。

### 3.5 示例包二：approval（业务审批）

- **工具集**：复用 `node:form-collect`（表单）、`node:app-notify`/`node:message`（通知）、`node:data-table`（台账登记）；无包私有工具。
- **规则集**：硬红线——审批人必须由 assignee 指派、操作者校验不可跳过（lan-collab 04 文档 E1-E4：节点 config `assignee`、node_run `assignee_id`、`reviewDecide` 操作者校验、事件带 assigneeId）；安全兜底——审批链全程 human 层，不允许 agent 自动批准。
- **工作流模板**：串行审批链 `form-collect(发起) → human-review(assignee=直属主管) → human-review(assignee=财务) → app-notify(结果通知) → data-table(台账)`；并行会签 M4 后按需（01 §12 非目标）。
- **质量策略**：category=`builtin.approval:*` 类目强制 layers 含 human（关键节点强制人工层，17 §5.5）。
- **依赖声明**：本包依赖 **M4**——总纲 E6（放开单实例互斥、reviewDecide 操作者校验、human-review 加 assignee）与 lan-collab E1-E4 落地前，模板可安装但 assignee 字段校验不生效（以 manifest `minKernelVersion` 表达，见 §5.1）。

### 3.6 示例包三：content-production（内容生产：长文写作 + 电商成片）

对应 02 M4-2 的野生 agent 迁移，收口路径：

1. **编排迁移**：`longwriting/agent/agent-workflow.service.ts` 与 ep 的 `ep-agent-workflow.service.ts` 的编排逻辑迁到 AgentRuntime（任务树 + agent_loop），**删除重复实现**；两者差异不再体现为代码分支，而是同一 runtime 下两个工作流模板 + 不同 pack 配置。
2. **业务差异沉淀为 manifest**：工具集 = 复用媒体/素材节点（`node:save-asset`/`node:read-asset`/`node:kb-retrieve`/`node:web-search`/image-gen/tts 等）；技能集 = 长文写作 SOP、电商脚本 SOP（存量 `skill.service` 的 SKILL.md 条目作为 L4 种子迁移，G3）；质量策略 = `builtin.content:writing`（rule+llm_judge，gray 0.5-0.85，对齐 17 §4.2 既有 seed 的 writing 口径）。
3. **记忆命名空间**：`builtin.content-production:*` 前缀，沉淀的写作偏好/风格条目与 ai-coding 完全隔离。
4. 前端既有长文写作/EP 页面保留，作为本包的 UI 入口登记；后端服务瘦身为"构造任务 → 调内核"。

## 4. 数据模型

迁移范式照搬 15/16 号惯例：单迁移函数 `create-business-pack-tables.ts`，`isPg` 分叉，幂等 ensureTable/ensureIndex，PC/Web 两处初始化成对提交（02 横切约定）。**SQLite 方言如下；PG 差异**：`TEXT→varchar`（短串）/`text`（JSON 大列）、`DATETIME→timestamp`、`INTEGER→integer`、`REAL→double precision`，索引同名。

### 4.1 `business_packs`（包注册表，本文新增）

```sql
CREATE TABLE business_packs (
  id             TEXT PRIMARY KEY,          -- manifest.id（反域名式，如 builtin.ai-coding）
  version        TEXT NOT NULL,             -- semver
  source         TEXT NOT NULL,             -- builtin / third_party
  status         TEXT NOT NULL,             -- installed / enabled / disabled / failed（§6.1）
  manifest_json  TEXT NOT NULL,             -- 安装时清单快照（运行时只读此快照，不读目录）
  manifest_hash  TEXT NOT NULL,             -- sha256(manifest_json)，升级比对与防篡改
  installed_by   TEXT,                      -- 操作者 userId（内置包为 NULL）
  installed_at   DATETIME NOT NULL,
  updated_at     DATETIME NOT NULL
);
```

### 4.2 `business_pack_bindings`（per-user 启用与配置，本文新增）

```sql
CREATE TABLE business_pack_bindings (
  id          TEXT PRIMARY KEY,
  pack_id     TEXT NOT NULL,                -- FK → business_packs.id（应用层维护，不建外键，与既有惯例一致）
  user_id     TEXT,                         -- NULL = 全局默认行（PC 单用户即此形态）
  enabled     INTEGER NOT NULL DEFAULT 0,   -- 0/1
  config_json TEXT,                         -- 用户级覆写：{ budgetOverrides?, defaultModel? }
  created_at  DATETIME NOT NULL,
  updated_at  DATETIME NOT NULL,
  UNIQUE(pack_id, user_id)
);
```

### 4.3 `business_pack_metrics`（包级度量，日聚合，本文新增）

```sql
CREATE TABLE business_pack_metrics (
  id               TEXT PRIMARY KEY,
  pack_id          TEXT NOT NULL,
  user_id          TEXT,
  period           TEXT NOT NULL,           -- 'YYYY-MM-DD'
  tasks_total      INTEGER NOT NULL DEFAULT 0,
  tasks_succeeded  INTEGER NOT NULL DEFAULT 0,
  tasks_escalated  INTEGER NOT NULL DEFAULT 0,
  retries_total    INTEGER NOT NULL DEFAULT 0,
  quality_sum      REAL NOT NULL DEFAULT 0, -- 质量分累计（均值 = quality_sum / 有分任务数）
  quality_count    INTEGER NOT NULL DEFAULT 0,
  tokens_total     INTEGER NOT NULL DEFAULT 0,
  memory_pending   INTEGER NOT NULL DEFAULT 0, -- 期末该包命名空间 pending_review 条目数（污染观察）
  memory_rejected  INTEGER NOT NULL DEFAULT 0, -- 当日被闸门驳回数
  updated_at       DATETIME NOT NULL,
  UNIQUE(pack_id, user_id, period)
);
```

数据源：`agent_tasks.pack_id`（§4.5）终态聚合 + 15 号 `memory_entries` 按 category 前缀统计。聚合由 cron 工作流每日跑（复用现有触发器，01 §1.1），失败重跑幂等（UPSERT by 唯一键）。

### 4.4 记忆命名空间：category 前缀约定（本文新增约定，零迁移）

不加新列。包的记忆命名空间 = 15 号 `memory_entries.category` 取值强制带包前缀 `<packId>:<name>`（如 `builtin.ai-coding:sop-debug`）；装配查询以 `category LIKE '<packId>:%'` 过滤（15 §5.2 `assemble` 已有 category 入参）。向量层沿用 `__memory__` 哨兵 kbId 不变（15 §4.3），隔离由 category 过滤保证。`memory_episodes` 不加列——episode 的归属经 `task_id → agent_tasks.pack_id` 反查。

### 4.5 既有表增列（本文新增，幂等补列，风格对齐 16 §4.2）

```sql
ALTER TABLE agent_tasks          ADD COLUMN pack_id TEXT;    -- PG: varchar；归属包（NULL = 无包任务，向后兼容）
ALTER TABLE workflow_definitions ADD COLUMN pack_ref TEXT;   -- PG: varchar；'<packId>@<version>'，模板来源标记（NULL = 用户自建）
CREATE INDEX idx_agent_tasks_pack ON agent_tasks (pack_id, status);
```

`agent_tasks.pack_id` 由 dispatch 入口写入：经包模板/包上下文创建根任务时填（16 §5.3 `createRootTask` 入参加可选 `packId`，本文新增字段透传）。

## 5. 接口设计

类型位置 `src/shared/types/business-pack.types.ts`（本文新增，双端同源）；服务位置 `src/core/services/business-pack/`（本文新增模块，与 agent-runtime 平级——它不属于 harness，是内核的装配胶水层）。

### 5.1 Pack Manifest 完整类型

```ts
export interface PackManifest {
  id: string                                   // 反域名式：builtin.ai-coding / third.<org>.<name>
  version: string                              // semver
  name: string                                 // 展示名
  description: string
  minKernelVersion: string                     // 内核契约版本（本文新增概念，见 §11）；approval 包借此声明依赖 M4 能力
  tools: PackToolEntry[]
  skills: PackSkillEntry[]
  rules: PackRuleSet
  workflowTemplates: PackWorkflowTemplate[]
  qualityPolicies: PackQualityPolicyEntry[]
  memory: { namespacePrefix: string }          // 必须等于 `${id}:`（安装校验强制）
  triggers: PackTriggerPreset[]
  ui: PackUiEntry[]
  budgets: { maxTokensPerTask?: number; maxConcurrentTasks?: number }  // 包级预算缺省（8/§5.4）
}

export interface PackToolEntry {
  tool: string                                 // 白名单引用：'node:http-request' / 'tool:custom:<id>'（14 §3 命名）
  private?: { nodeType: string }               // 包私有工具：声明其随包提供的节点类型（E4 四件套注册）
  binding?: Omit<AgentToolBinding, 'tool'>     // 静态 config/credentialId/approval/maxCalls（14 §5.3 原结构复用）
}

export interface PackSkillEntry {              // → 15 号 L4（kind='skill'）物化源
  name: string; description: string
  toolPattern?: SkillContent['toolPattern']    // 15 §5.1 SkillContent 复用
  promptTemplate?: string
}

export interface PackRuleSet {                 // 三级分层（§3.2）
  hard: Array<{ id: string; text: string; check?: AcceptanceCheck }>  // text 注入系统提示；check 可机检时落质量门（17 §5.1）
  safety: {
    toolApprovals?: Record<string, 'always' | 'never'>   -- 按工具名收紧/显式放宽批准策略（只能比 14 §8 默认更严）
    guardrails?: { maxIterations?: number; maxToolCalls?: number; maxDurationMs?: number }
    pathAllowlist?: string[]                   -- fs 类工具路径白名单
  }
}

export interface PackWorkflowTemplate {
  key: string                                  -- 包内键
  name: string
  graph: Record<string, unknown>               -- workflow_definitions.graph 同构 JSON
  defaults?: { inputs?: Record<string, unknown>; taskCategory?: string }
}
export interface PackQualityPolicyEntry {      -- → quality_policies 行（17 §4.2），category 安装时自动加包前缀
  category: string                             -- 包内短名，落库为 `${packId}:${category}`
  layers: Array<{ layer: 'rule' | 'tool' | 'llm_judge' | 'human' }>
  grayLow?: number; grayHigh?: number; maxRetries?: number
}
export interface PackTriggerPreset {           -- 引擎四种触发器的参数模板（01 §1.1）
  type: 'manual' | 'cron' | 'event' | 'webhook'
  workflowTemplateKey: string
  config: Record<string, unknown>              -- cron 表达式 / event 名（须为本包事件命名空间，§9.1）
}
export interface PackUiEntry { route: string; menu: string; icon?: string }
```

### 5.2 BusinessPackService（`business-pack.service.ts`，本文新增）

```ts
export class BusinessPackService {
  /** 安装：校验 manifest（schema + 命名冲突 + minKernelVersion）→ 快照落库 → 物化（§6.2 时序） */
  install(manifest: PackManifest, operatorId: string | null): Promise<{ packId: string }>
  /** 启用/禁用（全局）；per-user 开关走 bind() */
  setEnabled(packId: string, enabled: boolean): Promise<void>
  /** per-user 绑定（Web 端；userId 走 ALS，与 wf_variables.user_id 语义一致） */
  bind(packId: string, userId: string, enabled: boolean, config?: Record<string, unknown>): Promise<void>
  /** 升级：新版 manifest 校验 → 数据迁移回调（§6.3）→ 原子替换物化产物 */
  upgrade(packId: string, next: PackManifest, operatorId: string | null): Promise<void>
  /** 卸载：仅当无在途任务（agent_tasks.pack_id 非终态=0）；物化产物按 §6.4 规则处置 */
  uninstall(packId: string, operatorId: string | null): Promise<void>
  list(filter?: { source?: 'builtin' | 'third_party' }): Promise<PackRecord[]>
  /** 装配：任务/工作流启动时解析"该用户该包"的完整运行时上下文 */
  resolve(packId: string, userId: string | null): Promise<ResolvedPackContext>
}

export interface ResolvedPackContext {         // resolve 的产出，喂给内核各注入位
  systemPromptBlocks: { hardRules: string[] }  // → 12 号 buildSystemPrompt 的 packCtx 注入位（本文新增注入位）
  toolBindings: AgentToolBinding[]             // → agent-loop 节点 config toolWhitelist 的装配源（12 §5.3 / 14 §5.3）
  plannerHints: string[]                       // → 16 号 Planner 的领域提示词片段（本文新增入参 domainHints）
  verifierCategories: string[]                 -- 本包注册的 quality_policies 类目（带前缀）
  memoryNamespace: string                      -- '<packId>:'（15 assemble 的 category 过滤前缀）
  budgets: { maxTokensPerTask?: number; maxConcurrentTasks?: number }
}
```

### 5.3 内核注入位（本文新增的接缝，全部向后兼容缺省）

| 内核位置 | 新增可选入参 | 语义 |
|---|---|---|
| 12 号 `buildSystemPrompt` | `packCtx?: { hardRules: string[] }` | 硬红线段插入系统提示最高优先位（低于系统指令、高于记忆段；记忆段防注入包裹纪律不变，15 §7.4） |
| 16 号 `Planner.decompose` input | `domainHints?: string[]` | 包提供的领域分解提示（如 ai-coding 的"按模块边界拆分"），拼进 Planner 系统提示 |
| 16 号 `createRootTask` | `packId?: string` | 写 `agent_tasks.pack_id` |
| 17 号策略解析 | category 查找顺序：任务 spec 声明 → 包类目 → `default` | 17 §4.3 向后兼容语义不变 |

### 5.4 度量回流（Harness ⑤ 度量驱动迭代，本文新增机制）

`business_pack_metrics`（§4.3）每日聚合后按固定规则产出**包健康报告**（不做自动改包——改包永远走人来改 manifest）：

- **任务成功率** = tasks_succeeded / tasks_total 连续 7 日 < 60% → 报告提示"检查硬红线是否过苛 / 工具描述质量"；
- **质量分均值**走低且 retries_total 升高 → 提示"验收标准与能力错配"，建议调 gray 区间或补技能；
- **污染率** = memory_rejected / (memory_rejected + 当日入库 active 数) > 30% → 提示"蒸馏源质量差"，建议收紧该类目闸门（15 §8.2 灰度策略回退人工）；
- 报告落 `pack:metrics-report` 事件（本文新增，登记 10 §5.1 常量目录）→ UI 包管理页展示。**规则/技能迭代由人改 manifest 升版本完成**，度量只负责指出改哪里。

## 6. 状态机与关键时序

### 6.1 包状态机（穷举）

```
(未安装) ──install──→ installed ──setEnabled(true)──→ enabled
                         ↑↓ setEnabled(false)              │
                       disabled ←──────────────────────────┘
enabled/disabled ──upgrade──→ enabled/disabled（原子，无中间态；失败整体回滚，status 不变）
enabled/disabled ──uninstall（前置：禁用 + 无在途任务）──→ (已卸载，行删除；metrics 行保留 audit)
install 校验失败 → 不落库；物化中途失败 → status=failed，可重试 install（manifest_hash 幂等键）
```

`business_pack_bindings` 的 per-user enabled 独立于全局 status：**解析规则 = 全局 enabled ∧ (binding.enabled ?? 全局默认行)**。禁用不杀在途任务（在途 run 的 spec 快照语义同 14 §7-11：装配发生在启动时，中途禁用不影响在途）。

### 6.2 安装物化时序（install 内部，单事务 + 补偿）

```
校验 manifest（TS schema + id 唯一 + namespacePrefix === id+':' + minKernelVersion ≤ 当前内核契约版本）
→ business_packs 落快照行（status=installed）→ 物化（幂等 UPSERT，pack_ref/前缀标记归属）：
  skills → memory_entries（kind='skill'，status='active'，category='<packId>:skill:<name>'，gate_mode='auto'，
          source 记 'pack:<packId>@<version>'；包物化条目免检进闸门——已经过代码评审，本文新增约定）
  qualityPolicies → quality_policies（category 加前缀；UNIQUE(category) 冲突且归属不同 → 拒绝安装）
  workflowTemplates → workflow_definitions（pack_ref 标记）
→ 任一物化失败 → 补偿删除本包已物化行 + status=failed
```

### 6.3 升级时序与数据迁移责任

- **责任划分（本文新增决策）**：内核表结构迁移永远归内核迁移体系（02 横切约定）；**包只负责自己物化产物的升级**——manifest 差异 diff（增删工具/技能/类目）→ 物化产物按 diff 重放；包私有数据（本期不支持，开放问题 4）若未来开放，迁移由包提供 `migrate(fromVersion, toVersion)` 回调在 upgrade 事务内执行。
- 在途任务按"启动时快照"语义跑完旧版，新任务用新版；降级（装回旧版本）视为一次普通 upgrade，不特殊支持回滚数据。

### 6.4 卸载处置规则

物化产物按来源区别：`workflow_definitions`（pack_ref 命中）保留行、置 archived（存量 run 引用不断链）；`quality_policies`/`memory_entries`（包前缀命中）置 archived 不删除（审计留痕，15 号状态机既有取值）；包私有工具节点若仍被存量定义引用 → 拒绝卸载并列出引用清单。

### 6.5 三条外部借鉴的设计纪律（cordis 评估结论，详见 20 号文档）

以下来自 cordis 时空可组合性框架的评估（20-cordis-evaluation.md），经"我们的需求是否真实存在"标尺收缩后采纳的 3 条：

1. **effect 必须带逆操作（revertible effects）**：物化的每个动作（落快照行、UPSERT 技能/策略/模板、注册私有节点）必须同时登记逆操作；卸载 = 逆操作栈反序执行，保证系统回到"未安装态"。§6.2 的补偿与 §6.4 的处置规则按此纪律重写为显式逆操作清单，而非口头约定。
2. **依赖声明 + 就绪才激活（reactive coeffects）**：`minKernelVersion` 保留为安装期静态校验（§7-9）；**运行时语义另行补齐**——包可声明运行时依赖（内核契约版本、其他包 packId、内核服务名），依赖未就绪时包处于 `pending`（新增状态，区别于 failed），依赖上线自动激活、下线自动停用回 pending。包状态机（§6.1）据此增加 `pending` 态。
3. **配置 schema 即校验器、加载时 fail-fast**：Pack Manifest 的 schema 声明处即校验处（§6.2 第一步），非法 manifest 在安装期拒绝；节点 config 同纪律（见 14 号文档）。

> cordis 的其余机制（fiber 生命周期树、增量 reconciliation、HMR、isolate/intercept）经评估为"包带活代码"场景的解法，本平台包为数据清单，暂不采纳；触发再评估的条件见 20 号文档 §4/§5。

## 7. 失败模式与边界

1. **安装中途崩溃**：物化按幂等 UPSERT 设计，重试 install 以 manifest_hash 幂等；status=failed 的包对 resolve 不可见。
2. **包间类目/工具名冲突**：quality_policies 类目与 memory 命名空间强制包前缀，冲突只剩"两个包注册同名包私有节点"——节点类型全局唯一（E4 catalog 一致性断言既有机制），后装包校验失败拒绝安装。
3. **在途任务遇包升级/禁用**：§6.1 快照语义；journal/轨迹不受影响（11/12 号机制业务无关）。
4. **包私有工具泄漏出包**：resolve 只装配本包白名单；14 号 `NOT_WHITELISTED` 错误兜底——跨包调用直接被 registry 拒绝。
5. **包规则与内核护栏冲突**：`safety.guardrails` 只允许收紧（取 min），放宽请求安装校验拒绝（本文新增校验规则）。
6. **记忆跨包污染**：distiller 产出的 candidate.category 由管线按任务 pack_id 强制前缀（模型不得自填，同 15 §6.1"出处由管线注入"纪律）；无包任务落无前缀类目，装配互不命中。
7. **度量聚合 cron 错过/重跑**：UPSERT by (pack_id, user_id, period) 幂等；重跑同结果（同 15 号代谢幂等口径）。
8. **Web 端 exec 类工具**：ai-coding 包在 Web 端可安装但 git-ops/run-tests 按 14 §8 平台门禁不出现在 spec——resolve 时按平台裁剪，不算安装失败。
9. **minKernelVersion 不满足**：拒绝安装（如 approval 包装在未落 E6 的内核上），报错列出缺失能力。

## 8. 安全与权限

- **工具权限隔离**：包的工具面 = manifest 白名单 ∩ 14 号 registry 可导出集 ∩ binding 批准策略；LLM 永远只见本包装配后的 spec（14 §5.6 凭据纪律不变）。
- **记忆隔离**：§4.4 前缀过滤 + 15 号既有 user_id 租户隔离双闸；包无通道读他包条目（assemble 的 category 前缀由 resolve 注入，非任务可改）。
- **预算隔离**：`budgets` 缺省 + binding.config 覆写，落到 16 号 TaskBudget 体系；`maxConcurrentTasks` 与 16 §5.5 `maxConcurrentTasksPerTree` 取 min。
- **代码可信度分级**：`source='builtin'` 的包随仓库代码评审发布，物化技能免检（§6.2）；`source='third_party'` 的包**本期不允许注册 exec/external-post 级私有工具、物化技能一律走人工闸门**（gate_mode='manual'）；第三方包的审批流与签名机制留开放问题 1。
- **Web 端**：包管理的 REST/IPC 全量注册并鉴权（02 横切安全纪律）；install/upgrade/uninstall 仅 admin。

## 9. 与其他模块的契约

### 9.1 内核模块 → 包的扩展点一览

| 内核模块 | 为包提供的扩展点 | 包不得触碰 |
|---|---|---|
| 10 事件系统 | 包可发布/订阅命名空间事件 `pack:<packId>:*`（本文新增命名段，登记常量目录）；triggers 预设的 event 类型仅限本命名空间 + 公共事件 | 信封结构、投递语义 |
| 11 journal / 12 runtime | 无直接扩展点；包经 agent-loop 节点 config（白名单/护栏/模型）与 packCtx 系统提示注入位（§5.3）间接生效 | 主循环、轨迹格式、AgentHost 契约 |
| 13 协议层 | 无扩展点（业务无关） | — |
| 14 工具注册表 | 包注册私有工具（新节点 E4 四件套 + catalog 标注归属）；白名单引用装配 | 装配/分发/审计机制、SSRF 闸门 |
| 15 飞轮 | 包级记忆命名空间（category 前缀）+ 包物化 L4 技能条目 + 包级污染指标（§4.3） | 四环机制、闸门管线 |
| 16 任务树 | 包提供 Planner 领域提示词片段（domainHints）；`agent_tasks.pack_id` 归属 | 状态机、预算体系 |
| 17 质量门 | 包注册类目策略行（quality_policies 带前缀）+ 硬红线机检 check | 四层验证器框架、防骗机制 |

### 9.2 包 → 内核的依赖与示例包落点

包只消费内核公开接缝（§5.3 注入位 + 既有表行），不 import 内核内部实现；`minKernelVersion` 表达依赖（内核契约版本 = 01 总纲扩展点 E1-E6 的落地进度号，本文新增约定：M1 落地=1，M3 落地=3，M4 落地=4）。ai-coding（§3.4）、approval（§3.5，依赖 M4/E6 + lan-collab E1-E4）、content-production（§3.6，对应 02 M4-2 迁移）三个示例包均以 manifest 数据表达、内核零分支代码——这是对 §3.3 不变量的检验用例。

## 10. 测试策略

- **单测**：manifest schema 校验（缺字段/前缀不符/放宽护栏拒绝）；resolve 装配（per-user 规则 ∩ 全局开关、平台裁剪 exec 工具）；物化幂等（同 manifest 装两次产物一致）；升级 diff 重放。
- **集成**：双端迁移（SQLite 内存 + PG 容器各跑两遍）；install→enable→跑任务→质量门类目命中包策略→蒸馏条目带包前缀→度量聚合落行的全链路；卸载引用检查。
- **不变量回归**：删除全部包后内核既有测试套件全绿（§3.3 反向校验，进 CI）。
- **示例包验收**：ai-coding 包跑"给一个模块加测试"任务，走完 SDD 全链（计划批准→执行→L1-L4 验证→蒸馏归档）；approval 包走 A 发起 B 审批跨重启（02 M4 验收场景复用）；content-production 包跑通长文写作全链路回归（02 M4-2）。

## 11. 里程碑拆解

| 期 | 本模块内容 |
|---|---|
| M1 | 无交付（纯内核期）；内核契约版本号记 1 |
| M2 | 无交付；工具生态成熟是包工具集的前提 |
| M3 | **基础设施**：§4 全部迁移（含 agent_tasks.pack_id、workflow_definitions.pack_ref 增列）、PackManifest 类型与校验、BusinessPackService（install/setEnabled/resolve/upgrade/uninstall）、§5.3 三个内核注入位、category 前缀约定进 15/17 实施 |
| M4 | **三个内置包落地**：ai-coding 包（含 4 个新建私有节点）、approval 包（E6/lan-collab E1-E4 落地后启用）、content-production 包（随 ep/longwriting 迁移收口）；per-user bindings（Web）；度量聚合 cron 与健康报告页 |
| M4 之后 | 第三方包签名与审批流；包私表与 migrate 回调；包内 UI 沙箱 |

## 12. 开放问题

1. **第三方包可信度**：审批流（谁审、审什么）与签名机制（密钥管理、校验点）未定；本期以 source 分级 + 能力裁剪兜底（§8）。
2. **包间共享记忆**：是否存在跨包的公共技能库（如通用 SOP）？当前完全隔离；共享需可见性字段与审批链（与 15 号开放问题 5 的多租户共享记忆同源，合并决策）。
3. **UI 入口形态**：本期只登记路由/菜单（页面仍属内核代码）；包自带渲染（iframe/远程组件）的沙箱与安全模型 M4 后单独立项。
4. **包私有数据**：包是否需要自带表（当前答"不允许"，只能复用内核表）？若开放，`migrate` 回调与双端迁移责任需配套规范。
5. **内核契约版本号**的维护方式：手工递增还是由 E1-E6 落地状态自动推导？倾向手工（显式发布），M3 实施前定。

*一致性自查：表名与列名（agent_tasks/quality_policies/memory_entries/memory_episodes/workflow_definitions/agent_tool_calls）、类型（AgentToolBinding/SkillContent/AcceptanceCheck/TaskBudget）、扩展点编号 E1-E6 与 E4 四件套、事件命名约定（10 §5.1）、lan-collab E1-E4、分期 M1-M4 均与 01/02/10-17 号文档一致；新增表/列/接口/事件/约定均已标注"（本文新增）"。*
