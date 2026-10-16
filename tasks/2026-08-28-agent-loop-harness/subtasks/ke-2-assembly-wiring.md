# KE-2 · scope 装配 + 任务打标 + 存量宿主补接（M-Ke1 后半）

> 前置：KE-1。本轮把"分层"真正接进装配面，并补齐存量宿主的欠账（用户纪律：四大能力缺一不可）。

## 改动

| 文件 | 内容 |
| --- | --- |
| `memory-flywheel.ts` | `assemble(taskText, scope?: {bizModule?, projectId?})`：候选=用户层∪业务层∪项目层；层级权重 L3×1.3/L2×1.15/L1×1.0；分层配额（每层 ≤2 总 6）；keyword 兜底不变。distill 打标：任务归属来自 task.runtimeContext（task-service 传入） |
| `tasks/task-service.ts` | assemble 调用带 scope（task.runtimeContext 透传）；失败负样本计数回写不变（教训蒸馏列 KE-3 可选项，评审 P2-9 口径） |
| `system-agent.service.ts`（chat 宿主） | **补接记忆装配**（现状缺失——评审+33 号核查）：装配 L0 摘要+L1（对话未绑定业务）；memory_assembly 轨迹留痕（console「已装配 N 条」对聊天生效） |
| **全宿主** ContextManager 接线 | chat（system-agent.service）/任务执行器（workflow-boot runAgentLoop）/长文（lw-agent-harness）/EP（EP-1 已接）的 `loop.deps.context` 全部接 ContextManager（现状四宿主全空缺）；Deps：contextWindowTokens 按宿主模型档位、summarize 缺省纯剪枝、compaction 事件桥各宿主事件面 |
| `system-agent-tools.ts` + EP/LW 宿主 | L0 系统知识摘要注入（M-Ke3 前先注最小版：注册表计数摘要） |

## 测试

- 装配合并：三层候选并存、层级排序、配额截断（mock 条目）
- 宿主补接断言：chat 一轮产生 memory_assembly 轨迹；长对话触发 compaction 事件（tokensBefore>tokensAfter）
- 打标：长文任务的经验落 L3（biz=longwriting, projectId=X），下一任务装配可见

## 验收

四大能力矩阵（35 号 §4 表）全绿；每宿主装配留痕+压缩断言可见。
