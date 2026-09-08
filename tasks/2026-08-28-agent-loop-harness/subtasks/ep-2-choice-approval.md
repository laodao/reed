# EP-2 · choice→审批通路（M6.5-b）

> 前置：EP-1。核心：把"AI 多轮确认"从无状态重走升级为进程内挂起审批，
> 并补齐审批 decide 的前后端通路（评审 P0-2：该通路整条不存在）。

## 设计契约（评审钉死）

1. **ep_confirm_choice schema 一形两用**（LLM 首呼与用户编辑同构，approve_with_edit 是**整体替换**非合并）：
   ```ts
   z.object({
     actionType: z.enum([9 动作]),
     param: z.string(),
     choices: z.array(z.string()).min(1),
     prompt: z.string().optional(),
     selected: z.string().optional(),   // approvalCard.editable: ['selected']
   })
   ```
   前端 decide 必须回传**完整 input**（PendingApproval.input + selected 覆写），只发 selected 会 zod 必败。
2. **双 choice 卡分流**（评审 P1-2）：
   - 规则型 choice（detectChoiceForAssetImage/Database，无 approvalId）：保持现状——文本消息重入 sendMessage
   - 审批型 choice：事件必须带 approvalId（桥接审批 pending 时发 `choice:request` 扩展字段，前端据以分流）
3. **超时**：ApprovalCoordinator 默认 5min=自动拒绝——EP 宿主调大 approvalTimeoutMs（建议 30min）；
   超时后模型自动收尾、前端 pendingChoice 卡清理（decide 幂等返回 false 作为失效信号）。

## 改动文件

| 文件 | 内容 |
| --- | --- |
| `ep-agent-tools.ts` | +ep_confirm_choice（requiresApproval=true、approvalCard.editable=['selected']、maxCalls=2） |
| `ep-agent-harness.service.ts` | 审批 pending→发 choice:request（带 approvalId+完整 input）；decide 透传协调器；approvalTimeoutMs 调大；超时/拒绝的清理事件 |
| `agent.handler.ts` | +`ep:agent:decide`（approvalId+decision）、+`ep:agent:list-pending` |
| `src/preload/index.ts` + `src/web/client/channel-map.ts` | 双端通道映射（评审 P0-2） |
| `useEpAgentChat.ts` + `EpAgentPanel.vue`（+核对 `EpisodeAgentStudio.vue`） | choice 卡分流：有 approvalId→decide（完整 input+selected 覆写）；无→文本重入；超时失效处理 |

## 测试

- 单测：schema 双形态均过 zod；approve_with_edit 整体替换语义（只发 selected 必败断言）；decide 幂等（二次 false）；超时拒绝路径（注入 clock）
- 干跑：真实模型触发 AI choice → 挂起 → UI 点选 → 恢复执行 → 同轮后续动作依赖检查通过

## 验收

带 choice 的完整干跑通过；规则型 choice 行为与迁移前一致；审批超时 UI 无残留卡。
