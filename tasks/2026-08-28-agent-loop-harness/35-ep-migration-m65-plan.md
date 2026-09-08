# 35 · EP 剧集制作接线 harness 迁移计划（M6.5，含省成本测试策略）

> 用户指令：剩余未接线的业务模块制定计划实施接线；测试以跑通流程为目标，用短时长/低分辨率/便宜 API，
> 图像与语音用「阿里百炼平台-tokenplan」，视频用「阿里百炼平台」wan3.0-video；考虑好再测，不反复测试。
> 迁移模式沿用 M6 长文的成熟路径（动作工具化 + 宿主直驱 LoopRunner + 事件面对齐 + 开关回退）。

## 1. 现状

- EP agent 走自有体系：自管 LLM 循环 + `ep-agent-actions.ts`（872 行，9 个动作）+ choice 确认流；
  事件协议是旧 stage/action:start/action:done，**无统一轨迹落库、无审批链、console 不可观测、无会话存储**。
- 动作清单（迁移映射的原料）：

| 动作 | 危险级 | 说明 |
| --- | --- | --- |
| generate_script | 纯生成 | 剧本生成 |
| split_scenes | 纯生成 | 分镜切分 |
| generate_storyboards | 纯生成 | 分镜画面描述 |
| generate_char/location/item_asset | **write+花费** | 图像/语音资产生成（成本敏感区） |
| update_entity / delete_entity | write | 数据变更（delete 需 projectId 绑定——沿袭长文登记教训） |
| query_database | read（有 SQL guard） | 数据源查询 |

## 2. 目标形态（M6 完成态的 EP 版）

```
EP 视图 → EpAgentHarnessService（宿主直驱 LoopRunner）
            ├─ AgentToolRegistry：9 个 EP 动作 → 9 个工具（registryWrapped 管线统一校验/截断/审计）
            ├─ 轨迹 TrajectorySink（scope=workflow 复用 or scope=ep 新增，console 时间线直接可观测）
            ├─ 会话 DbAgentSessionStore（agent-console 列表出现 EP 会话）
            └─ 开关 EP_AGENT_HARNESS='0' 一键回退旧 AgentWorkflowService（保留旧代码不删）
```

## 3. 关键改造点

### 3.1 动作工具化（M6.5-a，低风险先行）
- `executeXxx` 函数体**原样复用**（M6 经验：整体复用零重写，事件面对齐在宿主层做），包成 AgentToolDef：
  - 纯生成类 dangerLevel=read（autoApprovableInWorkflow）；资产生成类 dangerLevel=write + requiresApproval；delete_entity 需审批。
  - 入参 zod schema 从现有 action params 平移；projectId 从 runtimeContext 注入并在执行器内强制绑定（越权 = throw）。
- 事件对齐：emitStream(tool-start/tool-end/delta) → 现有 EP 前端事件桥 + ac:trajectory 广播（args 截 2000，沿用 chat 宿主做法）。

### 3.2 choice 确认流 → harness 审批（M6.5-b，本迁移的核心卡点）
- 现状：EP 循环在关键节点抛 choice（如"选哪个角色设定"）挂起等用户点选，UI 渲染选择卡片。
- harness 映射：**不新增机制**，复用既有审批通道（requestApproval）：
  - choice = 一个合成工具 `ep_confirm_choice`（dangerLevel=write、requiresApproval、executeTimeoutMs 放宽到小时级），
    入参=选项清单，审批即选择（approve 携带所选 option 作为回填值）。
  - 审批卡渲染：待办中心已有审批卡体系；EP 视图内的选择卡片改为读审批事件（与 M5.5 工作台审批同构）。
  - 拒绝语义 = choice 重问（reject + comment 回喂），与 loop 现有审批拒绝语义一致。
- 明确不做：不为 EP 发明 suspend/resume 新原语（独立宿主的挂起拆解是另一条线）。

### 3.3 成本闸门（资产生成）
- 资产生成工具在注册时注入 `estimateCost` 元数据（次数上限 maxCalls，默认单轮 3 次；视频类单轮 1 次）。
- 测试期全局压低：env `EP_TEST_BUDGET` 限制单次会话资产生成总次数。

## 4. 测试策略（一次性跑通，成本纪律）

### 4.1 分层
1. **单测（零 API 成本）**：9 工具 schema 校验、projectId 越权、choice 审批映射、开关回退——mock 模型全覆盖。
2. **干跑（零/近零成本）**：真实模型但纯生成类动作（script/scenes/storyboards），文本模型用 tokenplan 便宜模型（deepseek-v4-flash 或 qwen 系最低价档）。
3. **全链路一次跑通**：一个最小 EP 项目，动作链=生成剧本→分镜→1 个角色资产（图）→1 段台词（语音）→1 个短视频镜头：
   - 文本：tokenplan 便宜文本模型
   - 图像：tokenplan `wan2.7-image`（低分辨率档）
   - 语音：tokenplan `qwen-audio-3.0-tts-plus`（最短文本）
   - 视频：「阿里百炼平台」`wan3.0-video`（**最短时长 + 最低分辨率**；测试前确认该提供商模型清单里 wan3.0-video 已配置，未配则先添加）
   - 通过标准：全链路状态机走完、产物落库、轨迹完整——**不评判质量、不重跑**；失败只留证据登记，修后单点重跑失败段（不整链重跑）。

### 4.2 成本红线
- 视频仅 1 次生成（最短时长档）；图像 ≤2 张；语音 ≤1 段（≤50 字）。
- 测试前写好断言清单与产物检查脚本，跑一次即收口；登记项不允许进入重试循环。

## 5. 分期与顺序

| 期 | 内容 | 退出条件 |
| --- | --- | --- |
| M6.5-a | 9 动作工具化 + 宿主直驱 + 轨迹/会话落库 + 开关 | 单测全绿；干跑通过（纯生成链） |
| M6.5-b | choice→审批映射 + 审批卡 + projectId 绑定 | 单测全绿；带 choice 的干跑通过 |
| M6.5-c | 资产生成全链路一次性实测（§4.2 预算） | 全链路跑通留证；console 可观测 EP 会话 |
| 收尾 | 旧协议代码标记 deprecated（不删），33 号登记项清理 | 文档同步 |

## 6. 风险

- choice 审批卡若与 EP 前端现有交互冲突：回退开关保通路，UI 适配单列一期处理。
- wan3.0-video 接口参数（时长/分辨率档位）以实际 API 为准，干跑前先查该提供商模板参数定义，避免试错调用。
- 轨迹 scope 复用 workflow 还是新增 ep：倾向复用 `workflow`（console 解析零改动），若 EP 会话键冲突再新增 scope 值（handler 的 parseConversation 需同步，改动点已定位）。
