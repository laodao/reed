# 34 · 知识飞轮 v2 详细设计——分层知识 + 系统知识（待确认，确认后开工）

> 33 号实测反馈：现有飞轮太简单，期望知识模块支持 agent 获取知识和记忆，且分层：
> 用户习惯/喜好 → 业务模块（长文写作、剧集制作、未来更多）→ 项目级（同业务不同项目不同知识）。
> 另要求新增**系统知识**：系统提供了哪些业务模块/功能、函数工具、工作流、skill 等，供 agent 使用。
> 本文档为详细设计，**经确认后按 M-Ke1/2/3 分期开工**。

## 1. 现状盘点（v1，坦率边界）

| 环节 | 现状 |
| --- | --- |
| 实体 | `agent_memory_entries`：userId + kind(fact/sop/preference/skill) + contentJson{title,content,tags} + confidence + status + use/success 计数 + embedding_id(预留未用) |
| 写入 | 仅一条路：任务 succeeded 后 distill（LLM 从 goal+output 提炼 ≤3 条）；失败教训回写。对话轮次、文档、系统信息都不进 |
| 去重/生效 | overlapRatio 查重；confidence ≥ 0.7 自动 active，否则 pending → 待办中心人工批准（am:approve） |
| 读取 | `assemble(taskText)` 关键词命中排序 top-3 装配进任务循环；chat 宿主同链（memory_assembly 轨迹/检查器「记忆」） |
| **缺** | ①无业务/项目维度（全部平铺用户空间）②检索纯关键词（无语义）③来源单一④系统知识缺位（agent 靠 discover_capabilities 工具实时拉目录，无沉淀层） |

## 2. 设计总览：四层知识模型

```
┌─ L0 系统知识（新）：业务模块/功能、函数工具、工作流、skill、能力边界
│    来源=系统能力目录的结构化快照；只读，自动刷新，不经审批
├─ L1 用户知识：习惯/喜好/偏好/全局事实（跨业务生效）
├─ L2 业务知识：biz:<moduleId>（如 长文写作 的题材规范、剧集制作 的镜头惯例）
└─ L3 项目知识：project:<moduleId>:<projectId>（本项目的人物设定、世界观、进度事实…）
```

- 装配合并规则：**三层叠装，不是覆盖**——L1 全局带，L2/L3 按当前上下文过滤；同主题冲突时按 L3 > L2 > L1 排序靠前（项目事实最具体、最可信）。
- 预算纪律不变：装配 top-k 小额（默认 3→按层各 2，总 6 封顶，字节数二次收紧）。

## 3. 数据模型改造（M-Ke1）

```sql
ALTER TABLE agent_memory_entries ADD COLUMN biz_module  VARCHAR NULL;  -- NULL=用户级
ALTER TABLE agent_memory_entries ADD COLUMN project_id  VARCHAR NULL;  -- 与 biz_module 联用
```

- 不用单 scope 字符串，用两列：可索引、可按模块/项目各自过滤，迁移简单。
- 索引：`(user_id, status, biz_module, project_id)` 组合索引。
- 迁移兼容：存量行两列皆 NULL = L1 用户级，语义不变，零数据迁移。
- `contentJson` 增加 `source` 字段（task_distill / chat_preference / manual / system_snapshot），便于分层统计与调参。

## 4. 读取装配（M-Ke1）

```
assemble(taskText, scope?: { bizModule?, projectId? })
  ├─ 候选 = active 条目中：(biz=NULL,proj=NULL) ∪ (biz=当前) ∪ (proj=当前项目)
  ├─ 命中排序：关键词命中数（v1 兜底，保留）+ 层级权重（L3×1.3 / L2×1.15 / L1×1.0）
  ├─ 分层配额截断：每层 ≤2，总量 ≤6；字节预算二次收紧（沿用现有机制）
  └─ use_count 回写时机不变（succeeded 才回写）
```

- 宿主注入 `memoryScope`：任务树经 spec/runtimeContext 透传；长文=项目所在业务+项目 id；EP 同理；chat 默认仅 L0+L1（对话未绑定业务），若对话绑定了业务/项目则带上（后续随对话能力演进）。
- 检索升级（M-Ke2，可独立开关）：接 KB 检索同链（wf_kb_retrieve 同款词法检索）做候选增强；`embedding_id` 向量检索**暂不承诺**——KB 当前为倒排词法链路，向量检索在 KB 侧单独评估后接入，本设计只留接口位。

## 5. 写入路径（M-Ke1/2）

| 来源 | 层 | 时机 | 成本控制 |
| --- | --- | --- | --- |
| 任务经验 distill（v1 已有） | 按任务归属打标 L2/L3（任务树 spec 带业务/项目；无归属落 L1） | 任务 succeeded | 不变（distill 用便宜模型，成功才跑） |
| **对话偏好沉淀（新）** | L1 | 会话结束/每 N 轮节流触发，从近期对话提炼 preference | 低频（默认每会话 ≤1 次）+ 便宜模型 + 空结果即止 |
| **手工录入（新）** | 任意层 | 知识飞轮页「新增条目」表单 | 零模型成本；默认 pending 走审批 |
| 失败教训回写（v1 已有） | 同任务归属 | 任务 failed | 不变 |

## 6. 系统知识层 L0（M-Ke3，本设计的重点新增）

### 6.1 内容与来源

系统知识 = **系统能力目录的结构化快照**，数据源就是 `discover_capabilities` 背后的能力目录（业务模块与功能、函数工具（含 dangerLevel/审批要求）、工作流定义、skill），不新造第二份目录——单一事实源仍是注册表，快照只是**读优化**。

### 6.2 注入策略：摘要进上下文，目录走工具（关键取舍）

- **不**把全量目录塞进每轮上下文（工具 30+、工作流 N 个，会撑爆预算）。
- 装配时注入一份**极小摘要**（≈几百字节）：「当前系统有 X 个业务模块、Y 个函数工具、Z 个工作流、W 个 skill；用 discover_capabilities 按需查询」——保证 agent 知道"系统有什么、去哪查"。
- 详细目录仍由 agent 按需调 `discover_capabilities` 拉取（现有行为保留）。
- 摘要随目录变更自动刷新：注册表变更钩子（工具注册/工作流发布/skill 变更）触发快照重算，写入 L0 只读条目；**不经审批**（系统生成的客观事实）。

### 6.3 与 M7 草稿生成的关系

create_workflow_draft 的 NL→DSL 依赖能力认知，L0 生效后 agent 在"不知道系统有什么"场景下的自我汇报与工具选择将更准（33 号实测中 agent 靠 discover_capabilities 自查，行为正确但无沉淀）。

## 7. 审批与生命周期

- L1/L2/L3 的 pending→active 审批**复用待办中心**（am:approve），卡片增加层级/来源标识。
- L0 只读、自动刷新、免审批；系统知识条目不可手工删改（防误删能力认知）。
- 失效治理：use/success 计数已有；v2 增加手工「失效/删除」按钮（AgentMemoryView），重叠条目在审批时提示已有相似条目（现查重逻辑复用）。

## 8. UI（AgentMemoryView 改造，M-Ke2）

- 顶部按层切换：系统知识 / 用户 / 业务 / 项目（业务/项目再选具体模块、项目）。
- 条目卡：kind、来源、置信度、use/success、状态；操作：批准/驳回/失效。
- 新增「手工录入」入口。

## 9. 测试计划（省成本纪律，全期适用）

- 单测（mock 模型）：scope 过滤/合并配额/层级排序/审批流/系统快照刷新——覆盖全部逻辑分支，零 API 成本。
- 真模型冒烟（一次性，预算封顶）：1 次 distill + 1 次装配 + 1 次 L0 摘要注入，用 tokenplan 便宜文本模型；断言走结构化产物（落库行/轨迹事件），不做主观质量评判、不反复调参重跑。

## 10. 分期与验收

| 期 | 内容 | 验收 |
| --- | --- | --- |
| M-Ke1 | 数据模型 + scope 装配 + 任务经验打标 + 手工录入 + 对话偏好沉淀 | 单测全绿；一条长文任务的经验落到 L3 并在下一任务装配可见 |
| M-Ke2 | KB 检索增强 + AgentMemoryView 分层 UI + 审批卡片升级 | UI 四层可浏览；检索增强开关回退可用 |
| M-Ke3 | L0 系统知识快照 + 摘要注入 + 变更钩子 | 发布新工作流后摘要计数变化；agent 能答"系统有哪些工作流" |

## 11. 风险

- 上下文预算：摘要+装配总额硬上限，超限按 层级权重×命中 排序截断。
- 隐私边界：L3 项目知识严格随 projectId 过滤，跨项目永不串（与既有租户 where 覆盖纪律同一红线，单测强制）。
- 系统快照一致性：变更钩子丢失时快照陈旧——快照带 generatedAt，装配时超龄（>24h）强制重算兜底。
