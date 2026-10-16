# Web 端基础设施多用户并发审计（2026-09-16）

> 承接 `2026-09-16-web-compat-findings.md`（架构与硬阻断）、`2026-09-16-web-module-isolation-audit.md`（逐模块隔离）。
> 本文审计基础设施在多用户并发下的正确性：agent 运行时（agent-runtime + 三个 harness）、工作流引擎、事件总线、WS、后台定时器、LLM 资源面。3 个并行只读 agent。
> 评级口径：单进程多用户（Web 单副本）与多实例（水平扩展）分开评。

## 0. 总体结论

| 设施 | 单进程多用户 | 多实例 | 一句话 |
|---|---|---|---|
| 工作流引擎 | **B+（主体健壮，4 个竞态待修）** | **D（不可部署）** | DB 唯一索引兜底防双跑；内存协调机制全是进程内 |
| agent 运行时/harness | **有正确性漏洞（C）** | 不可部署 | 数据面 fail-closed 做得好；控制面（stop/cancel/decide）有一族越权洞 |
| 事件总线 | **有实 bug（C）** | 重复投递 | deliver 不重建 ALS，Web 端会话卡片写错租户/写 NULL |
| WS/事件推送 | B（不串用户，但丢事件） | 需 sticky session | 无背压、无离线缓冲、断线即丢 |
| 后台定时器 | 参差（C） | — | trigger 调度器是正确范本；VoiceClone/视频轮询在 Web 端失效 |
| LLM/资源面 | 无防护（D） | — | 无并发上限、无限流、共享 key 裸奔 |

**共同的好底子**：失败方向基本是 fail-closed（ALS 丢失→查不到/不广播，而非越权）；`runWithUserAsync` 按行重建 ALS 的正确范本已存在（trigger 调度器、审核 ticker、agent 任务恢复 `task-service.ts:161-189`）；journal/run 互斥唯一索引能把分裂脑转成失败而非静默错。

## 1. Agent 运行时与 harness

**重要前提**：`AgentRuntimeImpl` 门面（`runtime/agent-service.ts`）**未接线**（`initAgentRuntime` 无调用方），里面的 ownerUserId 校验是死代码；生产路径是 chat/ep/dl 三个 harness 各自直驱 LoopRunner，防护参差（dl 全、ep 缺、chat 缺）。

### 必须修（正确性）
1. **视频生成轮询回写丢租户（P1）**：`video-generation.service.ts:235-347` 的 75 分钟 setInterval 回调无 ALS——`video:generation-event` 在 Web 端全部静默丢弃，且 `onCompleted` 回写（`video.handler.ts:307-330`）走 scoped repo 按 `user_id IS NULL` 恒 0 行命中，**分镜永久卡 generating**。修法：入口捕获 userId，轮询回调 `runWithUser` 包裹。
2. **`ac:stop` task 分支越权 abort（P1）**：`agent-console.handler.ts:104-110` 未比对 run.userId 即 `cancelTree`，内存 abort 先行（`task-service.ts:593`）。

### 越权洞（知道 uuid 即可利用，P2）
3. `chat:stop` 双通道无属主校验（`chat.handler.ts:50-63` → `chat.service.ts:403`、`system-agent.service.ts:444`）。
4. `ep:agent:cancel`/`ep:agent:decide` 无 ensureOwned（`agent.handler.ts:52-82`；dl 已全覆盖，ep 是漏网）。

### 容量治理（P3）
5. agent 轮次无全局/每用户并发上限、无 token 限流：N 用户并发 = N 个分钟级 LoopRunner + 共享 API key 裸奔；ffmpeg 无队列（N 用户同时导出 = N 个 ffmpeg 抢 CPU）。
6. EP 审批卡内存态、Web 重启蒸发（`ep-agent-harness.service.ts:317` 未接 DB store，靠 30min 超时收敛）。
7. 模块级单例审查结论：缓存的都是无状态仓储，无"首用户污染"问题 ✅；per-scope 互斥（busy Map、拒重入）全部到位 ✅。

## 2. 工作流引擎

### 单进程多用户：B+，4 个竞态必修
1. **队列饿死/插队（P0）**：`drainQueue` 只在 `executeRun` finally 触发（`workflow-run.service.ts:352`）；`resumeSuspended` 续驱到终态、cancel 成功路径都不出队；`launch` 在低于上限时绕过队列插队（`:319-323`）。排队 run 可无限期滞留，FIFO 名存实亡。
2. **决策双跑窗口（P0）**：`tickReviewTimeouts` 不检查 `deciding`，`resumeReview` 不检查 `waitExpiresAt`（`workflow-engine.service.ts:856,1127-1177`）→ 用户决策与超时 ticker 并发双写 journal。
3. **cancel vs rehydrate（P0）**：rehydrate 读行时状态仍是 waiting_review，重建成功后内存复活已被 cancel 的 run；引擎 `patchRun` 无条件写会把 cancelled 覆盖成 running（`workflow-engine.service.ts:1075,2658`）。
4. **引擎终态写条件化（P0）**：finalize/resumeSuspended 的 patchRun 应对"库中已是终态"做守卫（复用 `transitionIfStatus`），杜绝复活终态行。

### 其他发现
- 启动互斥有部分唯一索引兜底（`uq_wf_run_mutex`），不会双跑同 scope ✅；journal seq 唯一索引把双执行体炸成 failed 而非静默错（半个护栏）✅。
- 仅全局限额 `maxConcurrentRuns`（默认 3），**无每用户配额、队列无界**——单用户可挤占全部槽位。
- 挂起 run 不占并发槽但内存无上限（全图快照常驻）。
- 事件触发限流按 definitionId 全局：内置共享定义被多用户互相消耗配额；且 `:243` 的 `t.userId !== event.userId` 使内置定义的事件触发器在 Web 端永不命中（附带 bug）。
- **多实例 D**：取消跨实例失灵、boot 恢复无 fencing 启动即分裂脑、cron 双触发、事件触发是进程内 EventEmitter、WS 推送需亲和性。唯一护栏是 DB 唯一索引。

## 3. 事件总线

- pump 靠进程内标志串行化 + 游标乐观前移，单进程正确；无 FOR UPDATE/SKIP LOCKED，多实例重复投递（at-least-once 可容忍，但 markRetrying 无单调守卫）。
- **deliver 不重建 ALS 是实 bug（P0）**：`event-bus.service.ts:669` 直接 `consumer.handler(event)`。唯一命名消费者 `app-session-bridge` 在 Web 端：sweep 定时器驱动时卡片写 `user_id=NULL`（属主查不到、会话卡 running）；被用户 A 的 publish 同步驱动时若批内混入 B 的事件，B 的卡片以 user_id=A 落库（跨租户错写）。修法：`runWithUser(event.userId, ...)` 包裹投递（ws.channel.ts:63 是正确范例）。
- EventAdmin.requeue 游标回拨与在途 pump 竞态，重投可静默丢失（低概率，P2）。

## 4. WS / SSE / 后台定时器

- WS：连接表 `Map<userId, Set<client>>`，同用户多标签页都收到 ✅；无 per-user 连接上限、无出站背压（慢客户端内存堆积）、断线即丢无补偿（SSE 混合流有 replay，WS 通道没有）。
- **后台定时器全清单结论**：正确的（trigger 调度器、审核 ticker、event-bridge 节流、approval 超时）都是"捕获 userId + 回调包裹"模式；失效的两个——VoiceCloneJobScheduler（Web 端整体失效，训练行永久卡 training）与视频轮询（§1.1）——都是没套这个模式。image 轮询靠 async_hooks 继承 ALS，基本正确。
- `CacheService` 键不带租户前缀（`cache.service.ts:80`），串缓存风险取决于各调用方自觉。

## 5. LLM / Express 资源面

- provider key 全局共享 + LLM 调用**无队列/信号量/熔断**（全 src/core 唯一出站节流是 favicon 信号量）——一个用户失控可耗尽共享 key 额度拖死全站（侧向 DoS）。SDK 统一 `maxRetries: 0`，无重试风暴。token 有统计无配额闭环。
- multer 内存存储 50MB 无并发闸（`upload-router.ts:41`）：N 并发上传 = 50MB×N 常驻堆。
- SSE 无连接数控制（含免登录 share 面）。
- **登录/注册无限流**（`auth/routes.ts:58`）：bcrypt ~100ms/次 CPU → 暴力破解 + CPU DoS 双暴露。
- JWT 无吊销：停用用户 token 在 7 天 TTL 内仍有效（middleware 只验签不查 isActive）。
- 进程级全局状态：settings 全表共享且 `settings:set` 可改进程级限额（任一用户调全站参数）；pack 启停全局（跨租户 DoS）；运行时参数 boot 读一次无 reload hook。

## 6. 修复优先级汇总（基础设施部分）

**P0（多租户正确性）**
1. 事件总线 deliver 重建 ALS（`event-bus.service.ts:669`）。
2. 工作流引擎 4 个竞态（队列 drainQueue、deciding/waitExpiresAt 双向检查、cancel vs rehydrate、终态写条件化）。
3. 视频轮询回写捕获 userId + `runWithUser` 包裹；VoiceClone 调度器同款修复或 Web 端不启动。

**P1（越权与资源安全）**
4. stop/cancel/decide 四处补属主校验（chat×2、ac:stop、ep agent×2）。
5. 登录/注册限流；multer 并发闸或 disk storage；SSE/WS 连接上限与背压。
6. settings/pack 全局开关加管理员判定（依赖角色鉴权落地）。

**P2（健壮性）**
7. JWT 吊销/每次查 isActive；CacheService 键注入租户前缀；运行时参数 reload hook；每用户并发配额 + 队列有界。
8. EP 审批接持久 ApprovalStore。

**P3（规模化前置）**
9. LLM 并发信号量（per-user 1 + global K）与 provider 侧限流；ffmpeg 队列。
10. 多实例路线图：文档明确单实例 → sticky session → cron lease/boot fencing → 事件与 WS 外置总线（`src/web/server/index.ts:592` 自称可水平扩展与实际机制冲突，需先纠正认知）。

## 7. 与模块审计的关联

基础设施层的 ALS 缺口与模块层互相放大：事件总线 deliver 不重建 ALS → app 会话卡片 NULL（模块审计 §1.4）；视频轮询丢租户 → ep 分镜卡 generating；VoiceClone 调度器失效 → voice-design 模块功能归零。建议修复时把"捕获 userId + runWithUser 包裹"做成统一工具函数/装饰器，按 trigger 调度器范本全量清扫后台任务。
