# 19 · 现有系统重构评估（Refactoring Assessment）

> 2026-08-28 ｜ 状态：评估结论，待决策 ｜ 配套：01 总纲、18 业务包架构、02 分期计划
>
> 基于全量模块盘点（后端 + 前端两份独立调查）评估：以"业务无关内核 + 业务包"思路重构现有系统，哪些模块要改、技术可行性如何、工作量多大。

## 0. 总体判断

**这不是推倒重来，而是"内核补三件新衣 + 收口两类重复 + 业务逐步包化"。**

底座比预期完整：AI 调用层、10 家 provider、双端 DB（SQLite/PG）、kb/向量检索、工具/技能/数据源执行层、挂起恢复机器均已存在——它们就是内核雏形。真正的新代码集中在 M1 的三个件：通用事件平台（10 号设计）、运行 journal（11 号）、tool-calling 协议层 + AgentRuntime（13/12 号）。

## 1. 盘点数据总览（事实基线）

### 后端

- `src/core/services/`：30 个服务 + 4 子目录，约 2.2 万行。
- `src/core/modules/`：workflow 11.7k 行（引擎 3064 + 节点 4261 + 工具/技能/数据源/触发器）、episode-production **20.7k 行/100 文件**、app 608、assets 835。
- `src/core/database/entities/`：约 **100 个实体**；`lw-*`（长文写作）约 45 个 + episode-production 17 个 = 最大两个数据域。
- `src/electron/ipc/handlers/`：31 个 handler + EP 子目录，约 10.5k 行；最大单文件 `longwriting.handler.ts` **3316 行 / 100+ channel**。Web 端经 `register-channels.ts` 复用同一份 handler——后端改动天然双端一致。
- `src/agents/`：369 行，EP 专属的"能力→HTTP Skill"暴露层。

### 前端

- 单前端双宿主：一套 Vue3 代码跑 Electron 和 Web，**所有前后端耦合收敛在 `window.electronAPI` 单一契约面**（preload 2856 行 / 34 命名空间）。
- 路由集中在 `router/index.ts`（338 行）、菜单集中在 `config/menu.ts`——包级 UI 注册只需改这两处为"内核静态 + 包动态注册"装配模式。
- 规模：views ~1.78 万行、components ~4.5 万行（其中 EP 组件 144 文件 / 4.5 万行）、stores ~4.5k 行。
- 遗留死代码：image / translation / voice(TTS/STT/Clone) 视图与组件约 5k 行已无活路由；EP 两代并存（stage-* vs v2/v3、ProjectList 三版）约数千行。**约占业务代码 15-20%，重构前应先扣除。**

## 2. 模块修改清单（按改动性质四类）

### A 类 · 内核扩展（必须改，增量式）

| 模块 | 改什么 | 可行性 |
|---|---|---|
| `workflow/engine/`（3064 行） | E1 事件日志 + E2 `state_json` + E3 `resume()` 回调（11 号设计） | 高：扩展点明确，不动调度器本体；风险在恢复路径兼容测试 |
| `trigger/domain-event-bus.ts` | 升级为持久化通用事件平台（10 号设计） | 高：现有订阅方仅 2 个（触发器、app-session），迁移面小 |
| `ai-call.ts` + `src/core/providers/` | tool-calling 协议层（13 号设计） | 中高：协议成熟，风险在 10 家 provider 行为差异，需逐家冒烟 |
| `workflow/tools/` + `skills/` + `datasource/` | 并入 AgentToolRegistry、补 jsonSchema（14 号设计） | 高：ToolService 凭据注入 + SSRF 闸门原样复用 |
| `chat.service.ts` / `translation.service.ts` / `longwriting-ai.service.ts` | provider 解析统一到 ai-call（现状三处重复直连 `createProvider`） | 高：纯收口消重复 |
| `knowledge-base` / `chunk-splitter` / `lance-db` / `vector/` | 不动本体，被飞轮复用（15 号 `__memory__` 命名空间方案，零迁移） | 高 |
| `image/voice*/translation/web-search/email/oss/file/cache/task-queue` 等 | 不动本体，逐步封装为 AgentTool | 高 |

### B 类 · 收口迁移（最大技术债）

| 项 | 现状 | 工作量判断 |
|---|---|---|
| 两套野生 agent 编排：`longwriting/agent/`（~1.4k 行）与 `episode-production/agent/`（~1.8k 行），docstring 逐字相同 | 对话式"AI 决策 JSON→执行→总结"循环；ep 还借用 `lw_design_messages` 表存对话 | **最高风险项**：与 AgentRuntime 任务循环有语义 gap，需语义对齐而非代码搬运 |
| "能力暴露"两套机制：`src/agents/skills/`（EP 专属 HTTP Skill）vs `workflow/tools/` | 双轨 | 中：统一到 14 号注册表 |
| 前端 agent 面板三套重复：`useAgentChat` / `useEpAgentChat` / 面板组件 | 长文与 EP 各写一套事件订阅状态机 | 中：先在核心抽象通用 Agent 面板 + 统一事件协议，否则包化只是搬家 |
| deprecated facade 残留（`story-to-video-*`、`video.*` re-export 壳）+ 前端死代码 ~5k 行 + EP 两代并存 | 迁移未完成 | 低：删除即可，反向减少 15-20% 业务代码基数 |

### C 类 · 业务包化（数据层不动是最大减负点）

| 业务包 | 后端 | 前端 | 改动形态 |
|---|---|---|---|
| content-production（长文 + EP） | ~26k 行；**62 张表（45 lw + 17 ep）全部不动** | ~7 万行 | 编排层迁 AgentRuntime + handler 边界切分 + UI 登记；`longwriting.handler.ts` 3316 行是最大单点 |
| portrait（人像设计） | 1.8k 行 | 9k 行（WebGL 面部几何纯前端，整包搬走） | 接近纯搬迁 |
| approval（新） | 全新 | 全新 | 依赖 M4 审批缺口（lan-collab E1-E4） |
| ai-coding（新） | 全新（4 个新工具节点） | 全新 | 全新（18 号文档有详设） |

### D 类 · 不动的模块

diary（纯文件 CRUD）、EP `compose/`（ffmpeg 管线，性能敏感，包化后仍作包内确定性子模块）、EP `workflow/` 7 态状态机（确定性规则保留，输出供质量门）、export/document-tools、设置页等纯壳、news-source/topic 配置 CRUD、voice-clone-job-scheduler（确定性轮询，可被事件平台吸收但不必）。

## 3. 技术可行性结论

**可行性高，无"做不了"的硬障碍。** 风险按序：

1. **野生 agent 语义迁移（最高风险）**：两套对话式编排与 AgentRuntime 任务循环的语义 gap；ep 借用 lw 表的耦合。对策：strangler 模式——新旧并行，影子迁移跑通后可回切，验证后再删旧。
2. **provider tool-calling 适配面**：10 家行为差异。对策：M1 只保 OpenAI 兼容系（7 家同一协议）+ prompt 降级路径，Anthropic/Google 放 M2。
3. **引擎恢复路径侵入**：11 号设计已备"旧格式 run 降级"兼容方案，必须配双端迁移测试（历史教训：PG 用 `$1,$2` 占位符）。
4. **大爆炸风险**：严禁一次性重写；每期独立可交付、独立验收（02 计划的验收标准），业务包逐个迁移。

## 4. 工作量粗估

口径：1 名熟悉代码库的高级工程师，含双端迁移与测试，不含返工余量。

| 阶段 | 内容 | 估算 |
|---|---|---|
| M1 地基 | 事件平台 10-15 + journal 10-15 + tool-calling 15-20 + AgentRuntime 最小闭环 15-20 + 轨迹/流式 5-8 | **55-75 人日** |
| M2 工具生态 | 注册表 jsonSchema、Anthropic/Google 适配、oas V2、轨迹视图 UI | 20-30 人日 |
| M3 长程能力 | 任务树 + 质量门 + 知识飞轮最小闭环 | 40-60 人日 |
| M4 业务化 | 审批缺口 10-15 + 包机制 15-20 + content-production 收口 20-30 + ai-coding 包 15-20 + 死代码清理 3-5 | 60-90 人日 |
| **合计** | | **约 180-250 人日**（2 人并行约 5-6 个月） |

## 5. 迁移策略建议

1. **先清后建**：动手 M1 前删除前端死代码与 deprecated facade（降基数、降噪音）。
2. **内核先行**：M1-M3 不碰任何业务模块，只在引擎/AI 层/事件层做增量扩展——业务无感知。
3. **试点验证**：M4 第一个包用 content-production（最重、最能暴露扩展点缺口）；portrait 作第二个（验证"轻量包纯搬迁"路径）；approval、ai-coding 随后。
4. **可回切**：每个业务包迁移期保留旧链路开关，灰度验证通过后删除。
