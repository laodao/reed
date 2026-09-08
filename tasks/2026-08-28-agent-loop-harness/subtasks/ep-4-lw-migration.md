# EP-4 · 长文 M6 本地工具迁移共享注册（M6.5-d）

> 前置：EP-1 验收（共享注册形态已在 EP 上验证）。可与 EP-2/3 并行。

## 改动

| 文件 | 内容 |
| --- | --- |
| `src/core/packs/longwriting/agent-harness/lw-agent-tools.ts` | 8 动作从"宿主每 send 闭包构建"改为共享注册形态：def 不捕获项目，projectId 从 `ctx.logContext` 读（宿主 task.runtimeContext 注入）；`registerLwAgentTools(registry)` 幂等懒注册（packId='lw-agent'）；依赖检查/生产状态快照的取数逻辑保留（LW 旧协议同轮同状态，轮首快照语义合法——与 EP 不同，不强制逐调用重算） |
| `src/core/packs/longwriting/agent-harness/lw-agent-harness.service.ts` | doSend 改用 registry 中的共享工具（白名单=listSpecs({packId:'lw-agent'}) 全名）；传 runtimeContext；LW_AGENT_HARNESS 开关语义不变 |
| `system-agent-tools.ts` 目录 | 无需改（catalogPacks 由宿主声明；长文宿主声明 catalogPacks:['lw-agent']） |

## 测试

- 既有 lw-agent-harness.spec（10 用例）改造后全绿（闭包→logContext 的用例调整）
- 越权：logContext 无 projectId / 与实体归属不符 → 拒绝
- 干跑：长文动作链（角色提取→设定写入）轨迹+产物断言

## 验收

discover_capabilities（长文宿主声明 catalogPacks）目录出现 pack:lw-agent:* 全部工具；
`LW_AGENT_HARNESS='0'` 回退不变。完成后 discover 目录即覆盖 lw+ep 全部模块域能力（34 号 L0 同源闭环）。
