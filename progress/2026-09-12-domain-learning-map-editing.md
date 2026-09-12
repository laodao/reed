# 领域共学空间：用户手工追加知识点 + AI 补全知识地图 + 关系人审接线（2026-09-12 第三轮）

> 日期：2026-09-12 | 前置：同日第一轮（内容质量/排版）、第二轮（前置要求体系）
>
> 用户提问：「如果觉得左侧的知识点不够完善，可以追加吗？」并在追问中明确口径：
> **「我希望支持用户创建知识点的同时，也要支持 AI 来完善知识点，用户既然是要学习，多半不太清楚完整的知识体系」**，
> 并选择「关系人审确认一起接上」。

## 1. 现状核查（回答"可以追加吗"）

改之前的三点事实（都是代码级核对，不是猜）：

1. **左侧知识地图是只读的**：`DomainLearningSpace.vue` 左栏只有搜索、掌握度过滤、展开/收起、点击选中，
   没有添加/编辑/删除入口。
2. **后端也没有对应通道**：`dl:` 全部 IPC 里没有 `save-concept/update-concept/delete-concept`；
   知识点唯一写入方是 agent 工具 `dl_save_concept`（研究/任务会话内）。
3. 两个连带问题：
   - **关系人审有后端没接前端**：`dl:confirm-relation`（handler/preload/channel-map/graph service 齐备）
     在渲染层**零调用**，所有边永远停在 `verified=false`；
   - **意图路由会挡住"追加"这个说法**：`routeDlIntent` 的任务词表里没有"追加/添加/补充"，
     用户打「追加几个知识点」会被判为**答疑**（tutor 无读工具、提示词不引导建图）→ 只得到一段建议文字。

## 2. 本轮实现

### 2.1 用户建点：左栏「+ 知识点」（`dl:save-concept`）

- 服务 `LearningGraphService.createConcept(projectId, input)`：
  - `source='manual'`、`researchState='unresearched'`（用户建的点还没有讲义，正好交给后续研究/AI 补全）；
  - **勾选的前置直接落成已确认的 `prerequisite` 边**（`verified=true`，用户自己确认的，不必再走人审）→ 学习门控立刻生效；
  - 前置名在空间里找不到 → 不报错，写进 `attrs.prerequisites` 并回 `missingPrereqs`
    （UI 提示"可让 AI 补全"，快照里的 ⚠️ 欠账清单也会带上它们 → 形成"用户建点 → AI 补齐"的闭环）；
  - 同父同名 → 幂等更新（补定义/补前置），不重复建点；
  - 校验：名称必填、不能建 group 目录、所属分支必须存在/属本空间且是 group。
- IPC `dl:save-concept` + preload `domainLearning.saveConcept` + channel-map（三端护栏 spec 自动校验）
  + store `createConceptOf`（成功后刷新空间视图，返回落库结果）。
- UI：左栏标题行「+ 知识点」→ 弹层（名称 / 类型 / 所属分支 / 一句话定义 / 前置多选可输入新名）；
  提交后自动选中新概念（中栏显示"研究此概念"入口），有"待补前置"时用页面反馈条提示。

### 2.2 AI 完善：左栏「AI 补全」

- 新增纯函数 `shared/utils/domain-learning-mission.ts` 的 `dlMapCompletionMission(...)`：
  把「补全知识地图」写成结构化任务指令——**四类缺口判定**（主干缺失 / 前置缺失 / 跨度太大 / 粒度太粗）、
  **落库口径**（`dl_save_concept`+`prerequisites` → `dl_save_relation` 前置边 → 领域外能力走
  `dl_save_space_prereqs`）、**只补结构**（不改写已有、不产讲义、不重复建同名、不编造）。
- 左栏「AI 补全」按钮 → 注入该指令并**强制 task 会话**执行（为此把 `ask()` 的会话主体抽成
  `runAsk(q, forcedMode?)`，按钮不再依赖意图路由）。
- `dlTaskSystemPrompt` 新增「补全知识地图」作业口径（含四类缺口、落库顺序、只补结构，
  并要求**优先把用户手工建的点（source=manual、无讲义）接进主干**，不要另建同义概念）。

### 2.3 关系人审确认接进界面

- 视图层 `buildNodeProfile` 的直接关系补 `verified` / `sourceId` / `targetId` / `evidence`
  （`DlNodeProfile.relations` 契约同步扩展）。
- `DomainAtlas` 右栏「直接关系」：未确认边显示「待确认」标签 + 「确认」按钮（`dl:confirm-relation`），
  已确认显示绿勾；标题行给"N 条待确认"提示；确认后刷新档案与图谱。
- store 新增 `confirmRelationOf`（确认后刷新空间视图，门控/声明随之更新）。

### 2.4 意图路由修复（顺带，但很关键）

`STRONG_TASK_PATTERNS` 新增三条**建图/改图**信号：
① 动词（追加/添加/新增/补充/补全/完善）+ 结构名词（知识点/概念/节点/分支/目录/地图/知识体系/体系/骨架）；
② 动词 + 前置/关系 + 边类尾词（"追加一条前置边""建立关系图"）；
③ 前置/关系 + 动作尾词（"把前置关系补上""这些前置连上"）。
反例仍回 tutor："补充一下这个前置的推导过程"、"这个前置关系我还是没懂，再讲讲"（有专门用例钉死）。

## 3. 测试与验证

- 新增 `domain-learning-mission.spec.ts`（7 例：四类缺口、落库口径、纪律、缺省入参、用户补充要求）。
- 扩展 `domain-learning-intent.spec.ts`（+2 例：10 个建图指令 → task；4 个答疑说法 → tutor）。
- 扩展 `learning-graph.service.spec.ts`（+5 例：用户建点 source/manual 与待研究、前置直连为已确认边且门控生效、
  前置无落点进 attrs 并回传、同父同名幂等补前置、名称/目录/分支归属校验）。
- 扩展 `dl-agent-deps.spec.ts`（+1 例：任务提示词含「补全知识地图」作业口径与 source=manual 衔接）。
- 相关全量 **28 文件 257 passed**（含本批 5 个 spec 46 例）；`eslint` 改动文件 0 error；
  `vue-tsc` 改动文件 0 新增错误（模板绑定由 vue-tsc 校验，新入口的
  `openCreateConcept/createConceptVisible/conceptDraft/groupOptions/prereqOptions/
  submitCreateConcept/completeMapWithAi` 等均无未解析引用）。

### 事故与纠正（记录在案）

编辑 store 时用 PowerShell `Get-Content -Raw | Set-Content -Encoding utf8` 做字符串替换，
**把 `src/renderer/src/stores/domain-learning.ts` 的全部中文变成了乱码**（编码往返损坏）。
发现后立刻 `git checkout --` 从上一提交恢复该文件，改用 edit 工具重做全部改动并复核首字节（无 BOM）。
教训：源码文件只用 read/edit/write 工具改，绝不用 PowerShell 文本往返。

## 4. 追加（同日）：AI 补全改为「先采集 → 再规划 → 落库 → 自检」

**用户口径**：「我认为应该先执行查询知识库、联网搜索等操作，结合获取的内容和模型自身的知识，规划整体的知识点体系。」
核查后确认这是**真实缺口**：原「AI 补全」指令只有"缺口清单 + 落库口径"，**完全没有采集阶段**，模型多半直接凭先验建点
（而 bootstrap 的 S1 是先采集的，两处口径不一致）。

改法（提示词/指令层，四处对齐）：

1. `dlMapCompletionMission` 重写为**四阶段**并显式声明"不许跳过 S1"：
   - **S1 采集**：知识库优先（`wf_kb_retrieve` 检索"目录/知识体系/大纲/综述/学习路径"）→ 再联网（`web_search` /
     `wf_web_extract` / `http_get` / arXiv）；**读工具预算 3-6 次**够用即停、同一步可并行；边读边记要点与出处；
     两处都取不到就写明"本轮无外部资料"；
   - **S2 规划**：资料事实搭主干（分支/层级/前置），资料没覆盖的公认主干概念可用**模型先验**补，但**必须标注**——
     有资料支撑 → `attrs.evidenceLevel = "有原文：<出处>"`；纯先验 → `attrs.prior = true` +
     `evidenceLevel = "prior_needs_verification：本轮无资料覆盖"`（沿用真机库里已有的标注习惯）；
     逐条 prerequisites + 两条硬自检（不跳级 / 相邻层级跨度 ≤1）；粒度到"具体小事"；对照资料查主干是否漏项；
   - **S3 落库**：`dl_save_concept`（含 attrs 证据级别）→ `dl_save_relation` 逐条前置边 → 领域外能力走
     `dl_save_space_prereqs`；已有概念只补边不重建；**不编造出处**（没读到原文只能按先验标注）；
   - **S4 自检**：可达性 / 顺序 / 证据构成（资料覆盖 vs 纯先验各多少）→ 收尾逐条说明新增了什么、依据哪些资料、哪些是先验。
2. `dlTaskSystemPrompt` 的「补全知识地图」作业口径同步改成同一顺序（先采集 → 再规划 → 再落库 → 自检），
   含采集顺序、预算、证据标注与"不跳级"自检；
3. `learning-domain-map` 技能新增「**取材顺序**」段：material 为空且有读工具时**先去采集再规划**（KB 优先 → 联网），
   资料/先验分开标（先验写"先验待查证"）、不编造文献标题与链接、无资料时说明"骨架来自模型先验"；
4. **task 模式步数预算 12 → 16**（新增 `DL_TASK_MAX_STEPS`）：四阶段要留步数落库，12 步容易"采完没步数建图"；
   仅放宽 task 会话，research/tutor 不变（成本有界）。

按钮 tooltip 同步改成"先检索知识库/联网取资料，再结合资料与模型知识规划整体体系"。测试：mission 契约 +5 例
（四阶段齐全 / S1 知识库优先与预算 / S2 证据标注与自检 / S3-S4 纪律）、task 提示词契约 +1 例、domain-map 取材顺序 +1 例。

**已知边界**：提示词是"软约束"，模型理论上仍可能跳过采集（收尾自检会暴露、缺口诊断会把它记为"纯先验"）。
若要**硬约束**，可在宿主侧加门禁：本轮未调用任何读工具且读工具已绑定 → 首次 `dl_save_concept` 被挡一次并提示
"先采集；若确实无资料请说明后重试"（`tool-start` 事件已带 `toolName`，技术上可行）——待用户拍板后再做。

## 4.1 追加（同日）：把这件事做成**技能**（用户："必要的话，可以创建一个 skill 或者工作流"）

**为什么选 skill 而不是工作流**：`run_workflow` 的产出与 `dl_*` 写入**还没有桥**（就是 2026-09-09 复盘里
"dl 域 workflow 半闭环"那条，用户已拍板平台批单独排期）——工作流目前能采集能规划，但**落不进知识地图**。
skill 走的是已跑通的路：**宿主注入技能正文 + 外层带工具模型真执行**（bootstrap 就是这个模式）。

落地：

1. **新技能 `learning-map-completion`（知识体系补全·先采集后规划）**：正文即四阶段完整规范
   （S1 采集：知识库优先→联网、3-6 次预算、记要点与出处；S2 规划：资料/先验分开标注 + 不跳级 + 跨度 ≤1 + 粒度；
   S3 落库：`dl_save_concept`(+attrs 证据级别) → `dl_save_relation` 逐条边 → `dl_save_space_prereqs`；
   S4 自检：可达性/顺序/证据构成），并声明"本技能是过程型技能：宿主注入带工具会话真执行；
   若无工具（`invoke_skill` 内层单次生成）只产出草案不落库，并提示在有工具的会话里执行"；
2. **宿主注入**（`dl-agent-harness`，与 bootstrap 同构）：`mode==='task'` 且消息命中补全意图 → 注入技能正文；
   新增 `dlSkillBody(id)` 公共实现（`dlBootstrapSkillBody` 改为它的包装）、`DL_MAP_COMPLETION_SKILL_ID`、
   `MAP_COMPLETION_MARKER`、`shouldInjectMapCompletionSkill()`；
   谓词同时认**按钮标记**与**用户自然语言**（"补全知识体系""把缺的知识点补上""完善知识地图"…；
   "补充一下这个前置的推导过程"这类答疑说法不注入）——用户不用非得点按钮；
3. **单一事实源 + 兜底**：按钮指令（`dlMapCompletionMission`）保留四阶段**摘要**并指向技能，声明
   "宿主会注入技能正文；若未注入就按摘要执行"——技能是权威扩展版，指令自带兜底（提示词层仍独立可用）；
4. 交叉引用：`learning-domain-map` 末尾注明"从零规划用本技能；已有知识点只是体系不完整 → 用 learning-map-completion"；
   `dlTaskSystemPrompt` 的补全口径指向技能（避免四处维护细节）。

测试：技能新增进 `learningSkillIds` 守卫 + 4 例契约（四阶段/采集/证据标注/落库自检）、
`dlSkillBody` 与注入谓词 1 例（含 5 个自然语言正例 + 3 个答疑反例）、mission 标记契约 2 例。

（过程中我又踩了一次"模板字符串里写裸反引号"的坑——`builtin-skills.ts` 里给技能名加反引号导致整文件解析失败，
已修；这类错误 eslint/vue-tsc 立刻报 41 处语法错，属于能被工具兜住的那类。）

## 5. 未做（如需可继续）

- **编辑/删除知识点**：本轮只做"新建"（用户明确要的是"追加"）。删除需要级联清理讲义卡/关系边/笔记/掌握度日志
  （DDL 零外键，须服务层兜），风险更高，未纳入。
- **分支目录维护**：用户不能新建/重命名目录（group）；当前目录来自建空间时的领域根与 AI 建骨架。
- **AI 补全的可撤销预览**：现在是直接落库（草稿态 + 人审关系确认），没有"先出建议列表让用户勾选"的两步式。
