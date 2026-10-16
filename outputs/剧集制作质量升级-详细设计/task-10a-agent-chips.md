# 任务 T10a · Agent 快捷问法 chips

> Wave：W3（合并序第 5，最后合并）｜估时：1–2 人日｜依赖：无
> 必读：`00-共享约定与工程规范.md`

## 执行须知（subagent）

- **范围白名单**：仅下文 §3 所列文件。纯前端改动，无后端。
- **DoD / 报告**：见 README §6。

## 1. 背景与目标

DramaClaw 虾导（10.1）的四个预设问法降低 Agent 使用门槛："当前项目做到哪了？/下一步做什么？/哪些资产缺失？/哪集还有镜头未就绪？"本项目 `EpAgentPanel` 能力更强（14 种生产动作直驱），只差引导。

## 2. 功能设计

- `EpAgentPanel.vue` 输入框上方渲染 chips 行（空会话时展示；发送过消息后收起为一枚"+"可再展开）。
- 点击 chip = 以该文本走既有 `ep:agent:send`，无任何新后端（进度/缺失查询由 agent 既有 `query_database` 等能力回答）。
- 问法常量放组件内或 `src/shared/types` 旁的常量文件；文案可后续配置化，本期硬编码四条。

## 3. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 修改 | `renderer/src/components/episode-production/agent/EpAgentPanel.vue` | chips 区 + 点击发送 |

## 4. 测试与验收

**单测/组件测试**：chips 渲染与点击触发 send 的参数正确。

**人工验收 AC**：
- AC1 空会话显示 4 条 chips，点击即发送并得到基于数据库的进度回答
- AC2 agent 无数据时兜底话术不报错
- AC3 会话非空时 chips 收起且可再展开
- AC4 回归基线全绿
