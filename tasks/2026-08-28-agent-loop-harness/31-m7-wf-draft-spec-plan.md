# 31 · M7 规格与实施计划（NL→工作流生成 + create_workflow_draft）

> 状态：执行中（2026-09-08）
> 上游：28 号（系统 agent 工具集）、30 号（M6）、14 号（工具契约）、引擎 graph-validator
> 节奏：同前——实现 → 单测 → 真模型冒烟 → review → 提交

## 0. 目标

用户期望 2 的最后一块：系统 agent「也可以选择创建工作流来执行用户的任务」。
NL 描述 → 生成工作流 DSL（草稿）→ 人工在编辑器检查/发布后运行。
**生成物只到草稿**——不自动发布不自动运行（宁可慢不可脏；发布/运行是人的决定）。

## 1. 架构

```
描述文本 ──► WorkflowDraftService.draftFromDescription
              ├─ 提示词：节点目录（精选 11 类 + config 要点 + 变量语法）+ 严格 JSON 契约
              ├─ generateText（真模型）→ JSON 解析 → 归一化（edges source/target→
              │   sourceNodeId/targetNodeId、自动分层布局、version 1）
              ├─ definitionService.validate(graph)（引擎 graph-validator + 节点级
              │   validateConfig 深校验）→ 有错则回喂 LLM 修复（最多 2 轮）
              └─ create({name,description}) + saveDraft(id, graph)
                   → {definitionId, name, nodeCount}
```

- **节点目录（精选 11 类，config 要点逐一对照 validateConfig 核实）**：
  start（inputs）/end/llm-chat（prompt 必填，systemPrompt/temperature/maxTokens/jsonMode）/
  code（code）/http-request（method/url 必填）/web-search（query）/translate（text+targetLang）/
  template-transform（template）/condition（branches[].branchId+conditions）/delay（durationMs）/
  assign（assignments[]）。目录外的类型禁止生成（成功率优先，后续按需扩目录）。
- 变量语法：`{{start.<key>}}` 取开始输入、`{{<节点id>.<输出key>}}` 取上游输出
  （与模板资产/引擎深解析一致）。

## 2. 接入面

| 面 | 内容 |
|----|------|
| 系统工具 | `create_workflow_draft{description, name?}`（danger=write）→ 注册进 system-agent-tools（workflow-boot 传入 draftService）——对话页直接说"帮我做一个 XX 工作流"即可生成草稿 |
| IPC | `wf:draft-from-nl {description, name?}`（工作流列表页「从描述创建」入口）→ 编辑器打开草稿 |
| UI | WorkflowList 页新增按钮 + prompt 对话框；成功后跳转 `/workflow/editor/:id` |

## 3. 门禁

- 单测：假模型——合法 JSON 一次通过（create+saveDraft 断言）；首轮非法/校验错 →
  修复轮生效；两轮皆败 → 结构化错误；归一化断言（edges 字段映射/布局/version）。
- 真模型冒烟：scripts/p8-wf-draft-smoke.ts——"抓取网页正文并翻译成英文"类描述 →
  生成 → validate 通过 → 草稿落库。
- 对抗 review 单路（面积中等）。

## 4. 显式裁剪（登记）

- 触发器（cron/event）生成：后置（草稿先到编辑器，人配触发器更稳）。
- 节点目录扩充（sub-workflow/agent-loop/资产类）：按真实生成成功率逐步放开。
- 自动试运行（生成后跑一遍验证）：后置。
- 生成失败的重试 UX（编辑器内流式重生成）：后置。

---

## 5. 实施结果（2026-09-08）

全部落地，单 commit（含 M7 全部接线）。

### 5.1 对抗 review（单路）

P0×2 / P1×1 / P2×3 / P3×8，P0/P1/P2 全修，P3 修低成本项：

**P0**：handler 装配对象缺逗号（整文件 parse 失败——单测不 import 该文件故测试绿着也
拦不住，tsc 早前 grep 过滤面窄漏看，esbuild parse 门禁建议登记）；既有测试断言
`SYSTEM_AGENT_TOOL_NAMES` 长度 5 未随新增工具更新（门禁红）。
**P1**：prompt 契约「startInputs 填充进 start.config.inputs」normalize 未实现——validate
全绿但草稿实际是坏的（start 无入参、{{start.x}} 运行时空）→ 已接线 + 单测断言。
**P2**：未装配分支手工返回 {ok:false} 被双重包装成「成功」（改 throw 对齐约定）；
入参无长度上限（zod max 4000/100）；提示注入（描述加定界符+数据声明；生成含
code/http-request 节点时工具 hint 追加「重点检查」提醒；产物只到草稿有人审闸门）。
**P3 已修**：draftService 挂 subsystem（消除 handler 每请求 new 的双装配漂移）；
工具中文名补齐；系统提示词补 4b 分流规则（可复用流程→工作流、一次性→任务树）；
对话框 loading 期禁关闭；头注释过期更新。**登记**：create/saveDraft 非原子（失败
提示带定义 id 语义由 catch 兜底文案承担）、孤立子图/环仅 warning、频控后置。

### 5.2 验收

- 单测：workflow-draft.spec 9 例（解析/归一化含 startInputs 接线/修复轮回喂/两轮
  皆败/空描述）+ system-agent-tools.spec 既有断言更新——26/26 全绿。
- 真模型冒烟 scripts/p8-wf-draft-smoke.ts（真 validateGraph + 节点深校验）：
  "联网搜索 AI Agent 进展→翻译摘要→延时结束" → 5 节点图一次通过（repair=0）→
  草稿落库 ✅。
