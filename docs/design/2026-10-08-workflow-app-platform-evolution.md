# 工作流「配置化应用平台」演进设计(2026-10-08)

> 状态:设计稿,待用户确认后分期实施
> 前置结论:本设计源于 2026-10-08 的三轮评估(信息搜集模块去留 → 应用模块增强 → 代码节点/行业调研)。
> 行业参照:n8n(Data Tables/task runner)、Zapier(HITL/Tables)、Dify(Human Input)、Salesforce Flow+invocable Apex、Retool Workflows(User Task)、Temporal(事件溯源/Signal)。行业 2025-2026 收敛方向即"引擎+数据表+表单交互+子流程"四件套。

## 0. 定位与范围

目标形态——三层应用体系,各层有明确纪律:

| 层 | 形态 | 典型 |
|---|---|---|
| 配置应用 | 工作流 + 应用壳 + **本设计补齐的数据层/展现层** | 早报、主题研究、定时巡检 |
| 编排增强型 pack | 领域 UI + 自有实体 + internal 节点上引擎 | 信息搜集(另案) |
| 纯 pack | 自有状态机与 UI | 剧集生产 |

本设计只做平台件补强,不动既有 pack:

- **P0 代码节点宿主桥**:code 节点可调用平台注册的白名单宿主函数(http/数据表),从"纯计算器"升级为"可 IO 的胶水层";
- **P1 应用数据层**:数据表 schema 化声明 + upsert 语义 + 应用侧数据浏览 UI;
- **P2 交互展现与运行闭环**:声明式结果视图卡片、cron 运行在应用侧可见、last_run_at 落库;
- **P3 治理**:复杂度上限、审核催办、API 渠道强制、版本固定。

明确不做(诚实边界,行业一致):自由画布 UI 编辑器、强事务、精细行级权限、Web 端任意 JS 执行(P2 前维持 RCE 门禁)。

## 1. 现状基线(已核实)

| 能力 | 现状 | 文件 |
|---|---|---|
| code 节点 | node:vm 白名单纯计算全局,无 require/网络/定时器,仅同步,**仅桌面端**(Web 端 RCE 门禁直接失败),同步超时 `workflowRuntimeParams().codeSandbox.timeoutMs`(默认 5s/上限 60s) | `nodes/code-nodes.ts` |
| 节点上下文 | `ctx.signal/logger/emitProgress/saveState/loadState/executionKey/toolBudget` 齐备 | `engine/node-handler.ts` |
| 数据表 | EAV JSON 行:列首行推导全 string、query 全表拉回、行操作须 rowId;无任何浏览 UI | `variables/variable-data.service.ts`、`nodes/variable-nodes.ts` |
| http 抓取 | `executeHttpFetch(input, signal)` 自带 SSRF 闸门/重定向上限/限长/响应分档 | `nodes/http-fetch.ts` |
| 应用模块 | 极薄分发壳:apps/app_sessions/app_session_messages/app_user_prefs 4 表;会话只存 last_run_id;cron 触发的 run 不进任何会话;apps.last_run_at 从未写入 | `packs/app/`、`migrations/create-apps-tables.ts` |
| 会话卡片 | 6 种(start-form/run-status/node-status/review/message/report),report 卡只渲染 markdown | `shared/types/app.types.ts` |
| 运行参数 | 登记表驱动:`WORKFLOW_PARAMS` + `workflowRuntimeParams()`,设置页与节点同源,保存即生效 | `shared/utils/workflow-runtime-params.ts` |

### 1.1 行业对照(2026-10 深调研,Dify/Coze/n8n 官方文档核实)

- **upsert 语义**:n8n 按"过滤条件"判重(无主键概念,多行匹配时行为官方未定义);Coze 无 upsert、无唯一索引(幂等只能"先查后写");Dify 无行式存储。本设计的 dedup_keys + dedup_hash 唯一索引**强于三家**,且天然消解多匹配歧义。
- **代码节点访问数据**:n8n Code 节点明确不能读写 Data Tables、不能发 HTTP;Coze 依赖白名单钉死(4 个库、60s 硬超时);本设计 host 桥为超越项(桌面单用户前提)。
- **容量治理对标**:n8n 实例级 200MiB 聚合上限(物理字节、80% 预警、到顶禁写);Coze 每表 20 字段/建议 ≤10 万行/500MB。本设计取行数维度(单表 1 万行)为最保守档,桌面场景够用;若未来 Web 化可加物理字节聚合上限。
- **挂起语义**:n8n 表单挂起 = waiting 状态 + ≥65s 卸载数据库(与本设计 journal 同构);Dify Human Input 的 form_token 一次性、超时走显式分支(默认 3 天)、首响应获胜;Coze 问答节点固定 24h 超时、最多恢复 3 次。本设计 form-collect/human-review 的挂起+超时策略语义完备,与两家对齐。
- **cron 粒度与容错**:n8n 秒级(错过默认丢弃,durable 补跑为其 2.36 新特性)、Dify/Coze 分钟级;本设计 30s tick ≈ 分钟级、错过不补跑,与行业默认一致。
- **审批指派/多接收人**:Dify"首个响应关闭"无指派、Coze 中断机制无审核人路由——两家都没做,自研如需指派无先例可抄(桌面单用户暂不需要)。

## 2. P0 代码节点宿主桥(host bridge)

### 2.1 目标与非目标

目标:code 节点内可 `await host.http(...)`、`await host.table.*(...)`,实现"调一次接口→清洗→写一行表"级 IO 胶水逻辑。先例:宜搭 FaaS 连接器(平台托管代码调注册服务)、Salesforce invocable Apex(编排层调代码原子能力)。**注意**:n8n 的 Code 节点做不到这一点——官方明确其不能发 HTTP、不能读写 Data Tables、`this.helpers` 是自定义节点开发 API 而非 Code 节点可用(2026-10 深调研核实);本设计在此处**超出 n8n 形态**,桌面单用户是这一放宽的前提。

非目标:不开放 require/npm/文件系统/进程;不提供 sleep;不做 Python;Web 端不放开(维持 `isElectronRuntime()` 门禁,多租户放开需进程隔离 task runner,列 P3 后评估)。

### 2.2 host API 面(V1 最小集)

注入沙箱的单个命名空间对象 `host`,全部为 async 函数,实现于沙箱外闭包(持有 ctx):

```ts
host.http(input: {
  method: string; url: string; headers?: Record<string,string>
  body?: string; timeoutMs?: number; responseType?: 'auto'|'text'|'json'|'base64'
}): Promise<HttpFetchOutput>          // 复用 executeHttpFetch,signal 透传,SSRF 闸门天然生效

host.table.insert({ table, row }): Promise<{ tableId; rowId }>
host.table.upsert({ table, row }): Promise<{ tableId; rowId; action: 'inserted'|'updated'|'unchanged' }>
host.table.query({ table, filter?, limit? }): Promise<Row[]>   // V1 内存过滤,P1 分页化
host.table.update({ table, rowId, row }): Promise<{ ok }>
host.table.delete({ table, rowId }): Promise<{ ok }>

host.log.info/warn/error(msg, extra?)   // 透传 ctx.logger,写 node_run 留痕
```

`table` 参数 `{ tableId?; tableName? }` 同 data-table 节点既有约定。

### 2.3 沙箱执行改造

`runCodeInSandbox` 升级(code-nodes.ts,保持既有导出名与调用方兼容):

1. 包装改为异步并注入 host:`result = await (async function(inputs, host){...})(inputs, host)`——vm.Script 求值得到 Promise,在沙箱外 await;
2. 双层超时:同步段沿用 vm `timeout`(防死循环,现值不变);整体墙钟新参数 `codeSandbox.asyncTimeoutMs`(默认 60s/上限 600s,进 `WORKFLOW_PARAMS` 登记表 + 设置页,与 `codeSandbox.timeoutMs` 同组);
3. 取消:`ctx.signal` 既透传给 host.http(executeHttpFetch 原生支持),也作为墙钟竞速的失败方——aborted 时抛错,遵守"settle 前不产生副作用"的契约纪律;
4. **host 调用计数红线**:单次节点执行内 host 调用上限 `codeSandbox.maxHostCalls`(默认 50/上限 500)——code 内的循环 await 会绕开引擎循环上限,必须自设闸门,超限抛错节点 failed(retryable=false);
5. 预算:每次 host.http / host.table 写操作调 `ctx.toolBudget?.tryConsume()`,预算耗尽抛错(与 agent-loop 同语义);
6. 中止围堵:host 函数入口自查 `ctx.signal.aborted`——中止后任何 host 调用立即抛错,使"宿主调用循环"可被可靠终止(墙钟定时器在真实 IO 等待期间事件循环空闲、能够触发)。

**已知残留风险(如实标注)**:纯微任务死循环(如 `while(true){await Promise.resolve()}`)无法在进程内抢占——vm timeout 只覆盖同步段,墙钟竞速依赖事件循环空闲,而微任务风暴会独占事件循环。同步死循环(vm timeout 拦)、宿主调用循环(墙钟+signal+host 计数拦)均已围堵,此为最后一类残留,仅限桌面单用户自伤场景;彻底解决 = P3 task runner 进程隔离(n8n 2.x 已全面转向该架构)。

### 2.4 确定性与恢复

- 节点输出仍整体 checkpoint(node_run output)——崩溃重放不重执行 succeeded 节点,host 副作用不放大;
- 在途节点崩溃重放会**重执行本节点**:推荐写法是 upsert(幂等),文档与表单提示中明示;需要强幂等的下游传 `ctx.executionKey`(引擎已提供);
- host 实现不持有跨调用状态,天然满足"execute 可重入"契约。

### 2.5 inputs 类型化(顺带小改)

现状 `inputs: Array<{key, value: string}>` 全字符串,结构化数据只能 `JSON.parse(inputs.x)`。增可选 `valueType: 'string' | 'json'`(缺省 string):引擎模板解析后按声明 JSON.parse 再注入。目录 `requiredConfigKeys` 不变,`NODE_CONFIG_FORMS` code 表单加每行类型下拉。

### 2.6 一致性影响

- **不新增节点类型**:NODE_TYPE_CATALOG 的 code 条目仅改 `description`(提"可调用 host.*");outputSchema 不变(`result: json`);
- `WORKFLOW_PARAMS` 增 `codeSandbox.asyncTimeoutMs/maxHostCalls` 两项(带 desc/limits,设置页自动同源显示);
- `tests/unit/.../code-nodes` 既有用例扩展:异步返回值、超时、取消、host 计数、预算、SSRF 拒绝(内网地址经 host.http 仍被拦)。

## 3. P1 应用数据层

### 3.1 决策与理由

**扩展现有 wf_data_table 体系,不另起炉灶**(新表 app_collections 方案否决:两套表服务/仓储/节点语义重复,且现状 data-table 节点/服务/类型骨架可直接升级)。

"应用作用域"的落地利用既有事实:**一个 workflow definition 至多一个 app**(`idx_apps_source` 唯一索引),故 **scope='app' 的表按 owner=definitionId 隔离即等价于按应用隔离**;发布新版本 definition id 不变数据延续;复制内置(导出→导入新 definition)得到新 id 空表,恰好符合"数据跟应用走"的语义。工作流编辑器内手动运行(triggerInfo 无 app 上下文)时 app 表同样可读写(owner 是 definitionId,判定不依赖运行来源)——这样作者在编辑器里可调试 app 表,实现上也不必反查。

**引擎小扩展(前置依赖)**:`WorkflowNodeContext` 现无 definitionId 字段(已核实,`engine/node-handler.ts` 仅有 runId/triggerInfo 等;引擎内部 `exec.input.definitionId` 持有)。P1 需给契约加 `readonly definitionId: string`,launchNode 装配 ctx 时从 exec.input 直填——一处接口扩展,data-table 节点与 host 桥的 app 作用域解析都消费它。

### 3.2 存储变更(两处 migration 同步)

`wf_data_table_defs` 增列(ensureColumn 幂等,SQLite/PG 双兼容,沿用 create-apps-tables.ts 的写法):

```
scope            TEXT DEFAULT 'workflow'    -- 'workflow'(现状,全局命名空间) | 'app'(按 owner 隔离)
owner_id         TEXT                        -- scope='app' 时 = workflow_definition_id
dedup_keys_json  TEXT                        -- upsert 去重键数组,如 ["url"]
```

唯一索引:`CREATE UNIQUE INDEX IF NOT EXISTS idx_wf_dt_name ON wf_data_table_defs (scope, owner_id, name)`(NULL owner 在 SQLite/PG 唯一索引中互不冲突,workflow 作用域维持按名全局唯一)。

`wf_data_table_rows` 增列:

```
dedup_hash       TEXT                        -- 按 dedup_keys 列值拼接的 sha256;无 dedup_keys 的表为 NULL
```

唯一索引:`(table_id, dedup_hash)`(NULL 互不冲突,不阻碍无去重键的表)。

实体(`entities/variable.entities.ts`)与共享类型(`variable.types.ts` 的 DataTableDef/DataTableRow)同步加字段;`database-manager.interface.ts` 仓储签名不变(仓储接口按表内字段直传)。

### 3.3 服务层(VariableDataService 扩展)

```ts
createTable({ name, columns: DataTableColumn[], dedupKeys?: string[], scope, ownerId })
  // 显式建表(幂等:已存在且 columns「只增不改」——新列键集 ⊇ 旧键集→返回既有;删列/改名→报错。对齐 n8n Data Tables 取舍:可加列、不改列类型)
insertRow(...): 现状自动建表仅限 scope='workflow';app 表必须先 createTable(编辑期声明,运行期不隐式建)
upsertRow({ table, row }): 按 dedup_hash 命中→整行覆盖 update,未命中→insert;返回 action
  // 并发兜底:(table_id,dedup_hash) 唯一索引——并行分支同键竞插,后插者撞索引改走更新(SQLite 写天然串行;PG 捕获冲突重试一次)
  // dedup_keys 建表时锁定:变更=报错(存量重复行会让唯一索引无法补建);确需变更→先去重再重建表
queryRows({ table, filter?: {field, contains}[] , page?, pageSize? })
  // 内存过滤+分页(行存储是 JSON 文本,SQLite 无法 SQL 过滤);返回 { rows, total }
countRows(table)
```

类型 coerce:insert/upsert 前按 columns[].type 做 string/number/boolean/json 校验(不符→节点 failed,错误带列名)。

容量红线(进 WORKFLOW_PARAMS 新组 `dataTables`):`maxRowsPerTable` 默认 10000(超限拒写并提示归档)、`maxTablesPerDefinition` 默认 20。行业对照:n8n Data Tables 200MiB 总量上限同级语义。

### 3.4 data-table 节点扩展

不新增节点,扩展现有 op 集(目录 description、表单同步):

- config 增 `scope: 'workflow' | 'app'`(缺省 workflow,向后兼容)、`columns/dedupKeys`(createTable 用);
- 新 op:`createTable`(声明式建表,通常放在流程首部或 start 后)、`upsert`(输出 `{ action, rowId, tableId }`)、`count`;
- `query` 增可选 `filter/page/pageSize`;
- outputSchema 增 `action`(upsert)、`total`(query/count)——目录与 handler 同步(一致性自检强制)。

推荐管线形态(文档与模板示范):`createTable(幂等) → loop{ … → upsert }`——即"非一次性应用"的增量更新骨架,信息搜集的 URL 去重/content-hash 语义在配置层的对应物。

### 3.5 应用侧数据 UI 与 IPC

app pack 的 `ipcChannelPrefixes` 增 `'app-data:'`(manifest contributions 声明,IPC 守卫自动覆盖),handler 收拢进 `packs/app/handlers/app.handler.ts` 同模式(单对象参数→IpcResponse,经共享 ipcBridge 双端注册):

```
app-data:list-tables(appId→definitionId 反查, scope='app', owner=definitionId)
app-data:get-table(tableId)                       // 含 columns/dedupKeys/行数
app-data:query-rows({ tableId, filter, page })    // 分页
app-data:update-row / delete-row                   // V1 只开放删行;整行编辑 P2 再议(JSON 行覆盖易误伤)
app-data:delete-table                              // 二次确认
app-data:export-csv({ tableId })                   // 导出备份/迁移(n8n Data Tables 同款能力;导入后置)
```

UI:`AppDetail.vue` 增第三页签「数据」——表清单(名称/列数/行数/最近更新)→ 行浏览(关键字过滤 + 50/页分页 + 行 JSON 展开),交互形态对齐信息搜集资料库页签(IcRowsPanel)已验证的模式,页签含导出 CSV 入口。渲染端 pack(`renderer/src/packs/app`)路由不变,仅组件内加页签。

### 3.6 host bridge 联动

`host.table.*`(P0)在 P1 后自动获得 upsert/分页 query 能力——桥面与节点面共用 VariableDataService,一处升级两端受益。

## 4. P2 交互展现与运行闭环

### 4.1 声明式结果视图(data-view 卡片)

- `WORKFLOW_SESSION_CARDS` 增 `'data-view'`;report 节点 config 增可选 `views: Array<ViewDecl>`:
  - `{ type: 'table', title, source: '{{nodeId.rows}}' 或 { tableId } 可选, columns?: [{key,label}] }`
  - `{ type: 'metric', title, items: [{ label, value: '{{...}}', unit? }] }`
  - `{ type: 'cards', title, items: '{{nodeId.items}}', fields: [...] }`
- 渲染:`SessionMessageCard.vue`(会话侧与 RunDetail 共用)加 data-view 分支;source 为 tableId 时经 `app-data:query-rows` 拉取(限前 100 行);
- 不做自由画布与图表库(行业结论:"配置化实现复杂业务"不含"配置化实现复杂界面");图表需求由 report-image 长图承接。

### 4.2 定时运行闭环 + last_run_at

- `AppSessionService` 事件桥扩展:run 终态事件若 `triggerInfo.source === 'cron'` 且 runToSession 未命中→按 `run.definitionId` 反查 app(`app:get-by-definition` 既有通道的服务方法)→命中则走既有写卡流程(report 卡/data-view 卡照常聚合)。会话归属**按天聚合**:`app_sessions` 增 `origin TEXT DEFAULT 'user'` 列('cron' 标记定时),当天已有 origin='cron' 会话则追加卡片、跨天新建(标题 `定时 · yyyy-MM-dd`)——15 分钟级 cron 也不至于一天刷出近百个会话;
- `apps.last_run_at` 在 startRun(app-session 触发)与上述 cron 分支统一写入——修掉"列从未写入"的遗留;
- AppDetail 增「运行记录」页签:复用编辑器侧按 definitionId 查 run 的既有 IPC(`wf:list-runs`),应用侧零新后端。

### 4.3 交互增强(小件)

- form-collect 已覆盖"中途表单提问/确认"(7 字段类型 + 服务端校验),无需新节点;V1.5 可加 `richtext` 展示型字段(纯渲染);
- human-review 增可选 `remindAfterMs`(催办:到点经 app-notify 重发 review 请求;语义对齐 Camunda followUpDate)。目录/表单/timeout 策略不动。

### 4.4 webhook-wait 节点(新节点,走全量三方一致流程)

`wait-webhook`:execute 返回 `waiting_review` 同构的挂起(payload 含运行级一次性 token URL),外部 POST 回调即 resume——补齐"等外部系统回调"的缺口(触发器已有 webhook 型,但缺流程中等待位)。实施时按 `nodes/README.md` 扩展指南走:types/catalog/forms 三处 + handler + `node-registry-consistency.spec` 若标 internal 需同步硬编码列表(本节点为公开节点,不涉及)。

### 4.5 sub-workflow × 挂起语义修正(review 发现的既有缺陷)

现状 `sub-workflow` 节点以墙钟 deadline 轮询子运行终态(`nodes/sub-workflow-nodes.ts:64`),子运行挂起在 `waiting_review` 时 deadline 照走——**子流程里放人工审核,等待时间会吃掉父节点的等待上限而误杀**(n8n 1.x 同型缺陷,其 2.0 才修正)。修正:轮询循环遇子运行 `waiting_review` 时暂停 deadline 累计(对齐引擎"审核等待不计入时长看门狗"的既有规则),恢复运行后继续计时。

## 5. P3 治理(要点)

1. **图复杂度上限**:`WORKFLOW_LIMITS` 增 maxNodesPerGraph(默认 60,script-to-video-v3 的 36 节点留余量),graph-validator 拦截——对齐 Power Automate 500-action 式"上限是制度设计"的行业纪律;
2. **API 渠道强制**:`/api/workflow/invoke` 校验 `apps.channel_api`(按 definitionId 反查)并支持按 appId 寻址(双路由并存);
3. **应用版本固定**:apps 增 `pinned_version`(NULL=跟随最新发布;固定后 startRun 用该版图,对齐"应用固定 v3,工作流演进到 v5");
4. **分享权限最小集**:令牌增可选 `expiresAt/maxUses`(分享页透出);
5. **Web 端 code 沙箱**:独立进程 task runner(n8n 2.x 同型;生产默认值可对标:任务超时 300s/排队等待 60s/单 runner 并发 5/心跳 30s)——评估成本后再立项,本设计不承诺。

## 6. 与现有架构/规范的一致性对照

| 规范 | 本设计如何遵守 |
|---|---|
| 三方一致性自检(types/catalog/forms×handler) | P0/P1 不加新节点仅改既有条目;P2 wait-webhook 按 `nodes/README.md` 全量流程;一致性测试锁死 |
| 双端迁移同步 | 所有 ensureColumn/索引在 `electron/database/index.ts` 与 `web/server/index.ts` 两处调用点同步挂接(create-apps-tables.ts 同款幂等写法) |
| 实体注册 | variable.entities.ts 原文件加列;不新增实体文件故 entities/index.ts 不动 |
| pack 纪律 | app 包 manifest 增 `app-data:` 前缀声明;handler 单对象参数→IpcResponse;依赖未就绪=pending 语义不变 |
| 运行参数登记表 | asyncTimeoutMs/maxHostCalls/maxRowsPerTable 等全进 `WORKFLOW_PARAMS`(desc+limits),设置页与节点同源、保存即生效 |
| journal 不变量 | 不动引擎写路径;code 节点输出仍整体 checkpoint;在途重执行以 upsert 为推荐写法 |
| 安全门禁 | Web 端 code 禁用维持(`isElectronRuntime()`);host.http 复用 validateOutboundUrl SSRF 闸门 |
| 节点契约 | host 实现无跨调用状态(可重入);signal 契约遵守;failed 不自行重试 |

## 7. 复用清单(已核实)

| 能力 | 位置 | 用途 |
|---|---|---|
| executeHttpFetch(SSRF/超时/响应分档/signal) | `nodes/http-fetch.ts:90` | host.http 直接包装,零新网络代码 |
| VariableDataService + 三仓储 | `variables/variable-data.service.ts`、`repositories/variable.repositories.ts` | 数据层扩展现址;boot 装配点 `workflow-boot.ts:615` 已有注册器模式 |
| ctx 契约(executionKey/saveState/toolBudget/signal) | `engine/node-handler.ts` | host 桥的幂等/预算/取消全部现成;definitionId 为本设计唯一新增字段 |
| apps↔definition 唯一映射 | `idx_apps_source`、`app:get-by-definition` | "app 作用域=definition 作用域"判定 + cron 反查 |
| 事件桥(at-least-once/幂等/recoverOnBoot) | `packs/app/services/app-session.service.ts` | cron 闭环仅扩 runToSession 未命中分支 |
| 参数登记表 | `workflow-runtime-params.ts` + `module-params/workflow.params.ts` | 新参数零成本进设置页 |
| 迁移幂等工具 | `create-apps-tables.ts` 的 ensureColumn/checkTableExists | 数据层迁移同款写法 |

## 8. 分期与验收

| 期 | 内容 | 验收(可演示) |
|---|---|---|
| P0 | code 宿主桥 + inputs 类型化 + 参数登记 | 桌面端 code 节点内 `await host.http` 抓接口→清洗→`host.table.insert` 落表;60s 墙钟/50 次调用/取消/预算四闸门各有单测 |
| P1 | 数据层(建表/upsert/分页查询/容量红线)+ app-data IPC + AppDetail「数据」页签 | 早报类工作流按日 upsert 增量;应用页签可筛选分页浏览历史数据;**改造一个现有内置应用(如 daily-news-brief)走 createTable→upsert→数据页签 全链路,作为示范模板随迁移入库** |
| P2 | data-view 卡片 + cron 会话闭环(按天聚合) + last_run_at + 运行记录页签 + wait-webhook + sub-workflow 挂起语义修正 | cron 定时产物出现在应用会话流;report 卡内嵌表格/指标;外部 webhook 回调续跑;子流程含人工审核不再被等待上限误杀 |
| P3 | 治理四件 + (评估)task runner | 61 节点图被拦截;API 渠道开关服务端生效;固定版本应用不受新发布影响 |

各期独立合入,无相互阻塞;P0/P1 合入后即达成"配置化非一次性应用"的最小闭环(createTable→loop→upsert→数据页签浏览)。

## 9. 风险与红线

1. **code 节点滥用**(行业最强教训):host 桥放开后可能把业务写进 code。对策写进节点表单提示与文档:"code 只做胶水;值得测试的逻辑应注册为节点(internal 节点是毕业通道)"。不设硬拦截(行业无此先例,靠纪律+评审)。
2. **JSON 行内存过滤的性能边界**:单表 1 万行红线 + 分页在服务端;超出提示归档。不承诺 SQL 级查询(外部数据源模式已有真 SQL)。
3. **在途重执行的副作用放大**:以 upsert 为推荐写法 + 文档明示;executionKey 兜底。
4. **vm 非完整安全边界**:维持"仅桌面端可信代码"口径,host 桥不改变这一前提(桌面单用户);Web 端放开必须先过 task runner 立项。
5. **cron 会话膨胀**:已按天聚合(§4.2);高频 cron 的单会话消息仍会增长,AppDetail 会话列表已有分页,会话内消息分页列开放问题;
6. **Web 端数据隔离(既有缺口,如实登记)**:wf_* 表与拟新增的 app-data:* 通道现状均未按 user_id 做行级过滤(桌面单用户假设)。Web 多租户放开这些通道前必须补过滤——本设计不扩大该缺口,也明确不在桌面先行阶段解决它。

## 10. 开放问题(实施前确认)

1. `app-data:update-row` 是否开放整行编辑(V1 只删不编,防 JSON 行误覆盖)——依 P1 用户反馈定;
2. data-view 的 `cards` 视图字段绑定语法(模板 vs 声明式映射)在 P2 出 2-3 个真实模板后再定;
3. `pinned_version` 固定后,蓝图级不兼容变更(如 data-table 列变更)的迁移策略;
4. task runner(进程隔离沙箱)成本评估——决定 Web 端 code 节点能否长期路线图化;
5. 变量是否需要 app 作用域(Dify 会话变量的先例):倾向**不加**——简单 KV 可用单行 app 数据表承载,避免作用域族扩大后再治理。
