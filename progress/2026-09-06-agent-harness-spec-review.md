# Agent Harness 规格集全面 Review 记录（2026-09-06）

> 范围：tasks/2026-08-28-agent-loop-harness/ 全部 23 份文档（含 21/22/23 号新增与 12-15/01/02/README 修订层）
> 方法：三层交叉核对（原文 → 修订节 → 索引摘要），矛盾清单 + 完整性检查 + 开工条件确认

## 一、发现并修复的矛盾（4 处，均已修复提交）

| # | 位置 | 问题 | 修复 |
|---|---|---|---|
| 1 | README 核心结论 #6 | 仍写"AI SDK v6 + @openharness/core"（v1 决策），与 22 号 v2（手动循环+vendor）矛盾 | 改为"协议与调用用开源，循环与语义全自研"，依赖仅 ai/openai-compatible/zod，接口以 23 号为准 |
| 2 | 02 号 M1.4 | "循环载体=open-harness Session"与 22 号/R4b 手动循环矛盾 | 改为 ai@6 单步手动循环（不传 stopWhen、步末 response.messages 拼接、步级 saveState），契约照 12 号 R2/R4b |
| 3 | 02 号 M1.3 依赖清单 | 仍列 `@openharness/core@^0.7` 为依赖 | 移除；压缩/重试形状/todos 走 vendor（22 号 §4） |
| 4 | 02 号 M1 风险 | "各家流式 tool_call 增量格式差异需逐家冒烟"已被 AI SDK 承担 | 更新为残余风险（国产端点兼容性，GLM/DashScope 各冒烟一轮） |

## 二、核对通过项（无需修改）

- 12 号 R1（Session 载体）与 R4b（手动循环）的关系：修订层约定明确（R4b 显式声明修正范围），保留 R1 作演化史，冲突以 R4b 为准 ✓
- 21 号原文（@openharness/core 整包）+ 文末 v2 修订节：同上，符合"追加修订不重写"纪律 ✓
- 23 号契约层与 12/14/15 号接口引用一致（AgentHost 原样、MemoryService 原样+conflicted、工具统一模型）✓
- 里程碑三方一致（21 号 §6 ↔ 02 号 M1-M4 ↔ 22 号 §6 映射）✓
- 22 号 §8 复用边界与 01 号 §1.3 定位原则、16 号任务树调度设计一致 ✓
- 事件双路径决策（直推 + 平台总线）在 21/22/23 三处记录一致 ✓
- 版本红线（钉 ai@6、ESM 动态 import、禁依赖 packs）在 21/22/23 一致 ✓
- 已实现资产对齐：10 号→platform/services/event-system、18 号→core/packs（三期重构）✓

## 三、完整性检查（M1 开工条件）

| 条件 | 状态 |
|---|---|
| 契约层（23 号）覆盖 M1 全部模块接口 | ✓ 门面/AgentHost/工具/审批/循环/上下文/持久化/Provider/事件 |
| 骨架代码 | ✓ src/core/agent（13 文件），M0 第一步 git mv 至 platform/agent-runtime |
| getProviderConfig 单一事实源 | ✓ platform/services/ai-call.ts:41 |
| 依赖无冲突 | ✓ 仓库现无 ai/zod（admin-vben 的 zod3 在独立 pnpm 树） |
| 测试基建 | ✓ vitest + ai/test MockLanguageModelV3（spike 已验证可用） |
| 11 号 journal 规格 | ✓ 已定稿（M1 第一项，引擎侧） |

## 四、Review 结论

规格集自洽：21 定路线 → 22 定自研/开源分界与复用边界 → 23 定契约 → 01/02/12-15 修订层就位。
**批准开工**。开工顺序（M1 内部，依据 02 号+依赖关系）：
P1 harness 核心（骨架迁移+依赖+契约类型+provider-adapter+手动循环+单测，零引擎侵入）；
P2 journal E1-E3（引擎侧，11 号规格）；P3 agent-loop 节点四件套（依赖 P1+P2）；
P4 真实 provider 冒烟（GLM/DashScope）。
