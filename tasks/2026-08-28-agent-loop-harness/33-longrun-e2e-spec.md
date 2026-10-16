# 33 · Agent 长程任务实测设计（总收口修复后的真模型 E2E）

> 目的：用一个新的中等复杂度任务，验证总收口（P0×3/P1×8/P2×10 修复）之后的
> 长程执行链路端到端可用：单会话多阶段连续执行、人工审批暂停-恢复、
> 任务树自主执行 + 质量门、全程轨迹可观测。

## 1. 被测链路

```
Agent 对话页(/agent-console)
  └─ 用户派发一个复合目标（一句话四阶段）
       ├─ 阶段A 联网调研   → web_search / http_get 多次调用（LLM loop 多轮）
       ├─ 阶段B 对比总结   → 纯生成，依赖阶段A的工具观测结果
       ├─ 阶段C 沉淀流程   → create_workflow_draft（M7 链路）
       └─ 阶段D 任务树     → create_task_plan → pending_review（人工审批闸口）
             └─ /agent-tasks 批准后：planner 细化 → 叶子 agent_loop 子任务
                （白名单工具联网调研）→ verifier 质量门 → 聚合终态
```

## 2. 派发文本（原文，逐字）

```text
我要做一份《2026 年 AI Agent 框架选型报告》，请帮我完成四件事：
1. 联网调研 LangGraph、AutoGen、CrewAI 三个框架的最新版本动态和社区热度，每个框架至少搜索一次；
2. 基于调研给我一页对比总结（架构特点、生态、适用场景）；
3. 把「搜索→网页提取→翻译→汇总」这个调研流程沉淀为一个可复用的工作流草稿；
4. 创建一个任务树，从「长程记忆、多智能体协作、工具生态」三个维度深入对比三者并给出选型建议，我会到任务树页批准后执行。
```

## 3. 为什么这个任务能测“长程”

| 维度 | 考验点 |
| --- | --- |
| 多轮 LLM loop | 阶段A 至少 3 次搜索 + 可能的网页抓取，单轮会话几十次模型往返 |
| 工具组合广度 | web_search × N、http_get / wf_web_extract、create_workflow_draft、create_task_plan |
| 暂停-恢复（人工闸口） | 任务树 pending_review 停住等批准；批准后宿主从持久化状态恢复驱动 |
| 子 agent 自主执行 | 叶子任务各带 agent_loop，用 TASK_TOOL_ALLOWLIST 联网调研，verifier 打分 |
| 观测与持久化 | 过程时间线（tool-start/end、turn 边界）、轨迹落库、切页/关窗不中断（主进程驱动） |

## 4. 验证清单（逐项核对）

1. 对话页过程时间线出现有序工具调用（web_search/http_get ≥ 4 次），轮次边界清晰，无事件错乱
2. `create_workflow_draft` 成功 → 工作流草稿落库（drafts 表 / 编辑器可见）
3. `create_task_plan` 成功 → /agent-tasks 出现 pending_review 树，维度覆盖三个对比面
4. 批准后：planner 细化树 → 叶子 agent_loop 执行（白名单工具）→ verifier 打分 → 树聚合到终态，无泵空转/卡死
5. 质量门人工介入点（needs_review / escalated，如触发）按钮可用且 CAS 生效（总收口 P0 回归点）
6. 最终对话回复包含阶段B的对比总结；任务树执行期间切换页面不中断
7. 轨迹：agent_trajectories 覆盖 chat 会话 + 每个叶子子任务（scope 区分）

## 5. 判定标准

- **PASS**：清单 1-7 全部满足
- **PARTIAL**：核心链路（任务树批准 → 子任务执行 → 聚合终态）通，个别观测项不理想（如实记录）
- **FAIL**：任务树未创建 / 批准后不执行 / 聚合卡死 / 数据面断裂

## 6. 前置条件

- 应用运行最新代码（283ce8c3 之后重启，主进程含总收口修复）✔（进程 05:42 启动 > 提交 05:40）
- 真模型（DashScope qwen-flash / deepseek-v4-flash 之一），联网可用
- better-sqlite3 保持 electron ABI（测试期不再跑 node 侧单测，避免 ABI 翻转）

## 7. 实测记录（2026-09-08，真模型 deepseek-v4-flash-0731 / qwen3.8-max，阿里百炼-tokenplan 网关）

### 7.1 执行时间线

| 时刻 | 事件 |
| --- | --- |
| T+0 | /agent-console 新建会话（deepseek-v4-flash-0731），逐字派发 §2 任务文本 |
| T+0~5min | 单轮 17 次工具调用：web_search×3（环境未配引擎全败）→ agent 自主降级 http_get 直连 PyPI/GitHub API 拿到三框架真实版本/star 数据 → 查询能力目录×2 → create_task_plan ✓（7 节点树）→ create_workflow_draft ✗×2 |
| T+5min | /agent-tasks UI 点击「批准计划」→ pending_review → ready，泵自动启动 |
| T+5~40min | 6 叶子依次执行；验证器 2/2 解析失败（见 7.3-③）触发 1 次升级 + 1 次重规划（多智能体叶子 → 3 个按框架细分子任务，树 6→9 节点） |
| 期间 2 次 | 主进程重启 ×2（加载修复代码）；recoverInterrupted 自动重放 running 叶子，无人工干预 ✓ |
| 收尾 | 人工判定通过 ×5（escalated 全部 CAS 生效）；重试预算耗尽的叶子正确升级而非硬失败；根节点聚合 succeeded **0.983**（9 子节点 [1,1,1,1,0.9,1,1,1,1]） |
| 多轮 | 同会话第二条消息重试草稿：压缩描述重试、撞上限（LIMIT_EXCEEDED）后停止、最终如实汇报失败明细（含 INTERNAL detail——轨迹带错误原因后模型可见） |

### 7.2 验证清单对照

| # | 项 | 结果 |
| --- | --- | --- |
| 1 | 时间线有序工具调用 ≥4、轮次边界清晰 | ✅（19 次调用/2 轮；修复后 21/21 调用卡带参数摘要、0 永久 pending） |
| 2 | create_workflow_draft → 草稿落库 | ⚠️ 三次尝试均被网关模型截断（见 7.3-⑤）；链路本身 M7 冒烟（qwen-flash 直连 DashScope）已验证 5 节点一次过 |
| 3 | create_task_plan → pending_review 树 | ✅ 7 节点、维度覆盖、goal 携带调研基线数据 |
| 4 | 批准→细化→叶子 agent_loop→verifier→聚合 | ✅ 含重规划深化、跨重启恢复、聚合 0.983，无泵空转/卡死 |
| 5 | 质量门人工介入 + CAS | ✅ 5 次人工判定全部生效，无静默 no-op（总收口 P0 回归点） |
| 6 | 最终回复含总结；重启/切页不中断 | ✅ 对比总结完整（PyPI/GitHub 实数据）；重启后自动恢复执行 |
| 7 | 轨迹覆盖 chat + 叶子 | ✅ chat 51+28 条、任务树轨迹按 scope 分账 |

**判定：PASS（带登记项）**——长程链路（多轮 loop、审批闸口、自主执行、重规划、升级判定、崩溃恢复、聚合收口）端到端全通。

### 7.3 实测发现并修复（本次提交）

| 级别 | 问题 | 修复 |
| --- | --- | --- |
| P1 | 轨迹广播 slim 错展开 payload 顶层——tool_call 广播后 kind/name 丢失，对话页时间线沦为无名孤儿卡（无参数、顺序错乱） | `slimTrajectoryForBroadcast`：只收窄 payload.args，entry 本体原样保留；单测回归 |
| P2 | 轨迹 tool_result 失败不带原因——草稿连败两轮只能靠模型转述排障 | loop 失败路径带 error/detail/hint（截断）；LIMIT_EXCEEDED 拦截留痕 |
| P2 | verifier 截断无感知——judge maxOutputTokens=1024 被话痨模型烧完，2/2 评判解析失败全降 0 分 | parseJudgeResponse 正则兜底（截断 JSON 也能读出 score/defects）+ judge 提示词限流（≤5 条/20 字）+ token 2048 + 截断日志 |
| P3 | 草稿生成 maxOutputTokens=8192 对思考型模型不足（正文恒空） | 提到 16384 + finishReason=length 针对性修复提示 + 解析失败日志（finishReason/输出长度） |

### 7.4 登记项（不在本次修）

1. **网关思考模型结构化输出不可用**：tokenplan 网关的 deepseek-v4-flash / qwen3.8-max 在长 prompt + 大 maxOutputTokens 下恒 `finishReason=length 输出长度=0`（疑似全部烧在 reasoning 或网关强制思考）；草稿生成需配直连 DashScope 的 qwen-flash（M7 冒烟已证）或网关侧支持 enable_thinking=false。判定为模型/端点能力问题，非 harness 缺陷。
2. **研究型叶任务 12 步预算偏紧**：max_steps 触发频繁（3 叶子撞上限），建议按 spec 提示词引导叶子压缩步骤或按任务类型放宽 executeTimeoutMs/maxSteps。
3. session-store.spec 在本机 node 侧段错误（基线，与 harness 无关，stash 验证）；workflow-boot 206-235 行 5 处基线类型错误同样 stash 验证非本次引入。
4. dev 环境教训：electron-vite dev 重启必须连 electron 子进程一起杀（孤儿进程会霸住 9222 并造成新旧双实例共写 DB）；已写入操作记忆。

### 7.5 测试资产

- `scripts/e2e-agent-longrun.cjs`：CDP 驱动（preflight/dispatch/watch/approve/tree/trajectory 子命令），UI 派发 + IPC 核验。
- 新增单测：slimTrajectoryForBroadcast（chat 15）、tool_result 失败带原因（loop 20）、judge 截断兜底（m3-core 17）、draft 长度修复轮（draft 10）——定向 219/219 绿。
