# 工作流引擎接入第三方数据库（数据源 Read/Write）

## 背景与目标
用户需求：让工作流「数据表」节点能连接第三方系统数据库（PostgreSQL/MySQL 等），读写真实数据。
核心洞察：现有 data-table 节点写死在本应用 SQLite（wf_data_table_*），缺一层"数据源"抽象。

## 架构
```
数据源(DataSource)      = { 类型, host/port/db/user/password(加密), ssl, testConnection }
   ↑ 驱动注册表（可插拔）
驱动适配器(Driver Adapter) { testConnection, query(sql, params) }
   ├─ PostgresDriver（pg，已实现，零新依赖）
Node（data-table）外部模式  = 绑 dataSourceId + sql + params → 路由到驱动
```

## 落地内容
- 类型：`src/shared/types/datasource.types.ts`（DataSourceDriver / 连接参数 / QueryResult / 驱动接口）
- 实体表：`data_sources`（密码 `password_enc` 为 SecureStorage 密文，绝不明文落库）
- 仓库：`DataSourceRepository`（共享配置类，`useRawRepo`）
- 服务：`DataSourceService`（CRUD + testConnection + execute + 加密/解密凭据）
- 执行器：`datasource-executor.service` + 驱动注册表 + `postgresql-driver`（pg Pool）
- 节点：data-table 增加 `dataSourceId/sql/params`；外部模式走参数化执行，防注入
- IPC + preload：`datasource:list/create/update/delete/toggle/test-connection`
- UI：设置页「数据库数据源」tab（列表/添加/编辑/测试连接/删除），密码不回显
- 工作流编辑器节点表单：数据源下拉（select-dynamic dataSources）+ SQL + params

## 测试
- `datasource.service.spec.ts`：CRUD + 加密凭据 + testConnection/execute 路由（7 用例）
- `variable-node.spec.ts`：修复预存 mock 缺失（VariableDataService 未导出）+ 新增外部分支 2 用例（9 用例）
- `datasource.repository.spec.ts`：仓库 CRUD（受 better-sqlite3 ABI 环境问题影响暂不可跑，同其它 repo 测试）

## 端到端验证（已在 GUI 实机）
1. 后端 `[DatabaseManager] 数据源仓库已初始化`，`[DataSourceHandlers] 数据源 IPC 处理器已注册`
2. 设置页「数据库数据源」tab 正常渲染（说明文案 + 添加按钮 + 空态）
3. `electronAPI.datasource.list()` → `{success:true,data:[]}`
4. create → 返回 `hasPassword:true` 且不回传 `passwordEnc`（加密且不泄露）
5. testConnection → 真实建立 pg Pool，连不通时优雅返回 `ECONNREFUSED`（不崩溃）
6. 列表显示 "🐘 PostgreSQL · host:port/db"，删除正常
7. 临时验证数据已清理（不留测试脏数据）

## 备注
- 数据库类型支持范围：postgres 已就绪；mysql/sqlserver/clickhouse 需新增依赖后按同一注册表补适配器；
  oracle/hadoop/flink/druid 需另行评估（原生模块/HTTP SQL 网关）。
- 遗留：node-registry-consistency / tool-call / tool.service / yt-dlp 等测试失败为**预存问题**，
  与本次改动无关（基线已失败）。

## 二期：MySQL / SQL Server / ClickHouse 驱动 + Agent 查询数据库

### 驱动适配器（全部走统一注册表，注册于 workflow-boot）
- `mysql-driver.ts`：mysql2/promise，占位符 `?`，getConnection/query/release/pool.end
- `sqlserver-driver.ts`：mssql@10（**注意：mssql 12 依赖 Node 20.13+ 的 diagnostics_channel.tracingChannel，
  Electron 28 内置 Node 18.18 不支持 → 必须锁 mssql@10**），$1 → @p1 归一 + input 绑定
- `clickhouse-driver.ts`：HTTP 接口（fetch，零新依赖），JSONEachRow 解析，$1 → {p1:Type} + param_p1

### Agent 自动生成 SQL（剧集制作 Agent）
- `ep-agent.types.ts`：新增 `query_database` 动作
- `ep-agent-workflow.service.ts`：`detectChoiceForDatabase`（用户说查订单/库存等但未点名数据源 →
  列出已配置数据源 choice）；sendMessage 注入数据源名单到决策上下文
- `ep-agent-actions.ts`：`executeQueryDatabase`（参数化 SELECT 执行，**仅允许 SELECT/CTE，禁止写**，
  结果预览前 8 行）
- `ep-agent-context.ts`：决策提示词加 query_database 动作 + 规则 0.1/8 泛化

### 端到端验证（真实 Electron 环境）
1. 四个驱动装配成功（无 boot 错误）；MySQL/SQLServer/ClickHouse 数据源 testConnection
   均真实发起连接并优雅失败（ECONNREFUSED / Failed to connect / fetch failed）——证明驱动注册与路由正常
2. 设置页数据源 tab CRUD 正常（临时数据已清理）
3. 测试：datasource 三驱动 + service + ep-agent = 55 项全过

### 依赖变更
- 新增：mysql2@^3.24.2、mssql@^10.0.4（mssql 必须 ≤10，Electron Node 18 兼容）

## 三期：统一占位符 $1,$2（跨驱动方言归一）
- 新增 `placeholder-utils.ts`：共享 `replaceDollarPlaceholders`（扫描 $n + 按编号收集参数值，支持乱序 $2,$1 / 复用 / 多位数 $10）
- MySQL：$n → mysql2 的 `?`，参数按**占位符出现顺序**收集（乱序也正确）
- SQL Server：$n → `@pn`，按编号 input 绑定
- ClickHouse：$n → `{pn:Type}` + param_pn
- PostgreSQL：原生 $n 无需改动
- 类型/表单 help 统一声明"参数用 $1,$2 占位"
- 修复：sqlserver-driver 局部变量 sql 与 import sql 同名 → vite 重命名 TDZ 崩溃 → 改名 sqlRendered
- 测试：placeholder-utils(6) + 三驱动翻译 + service + node + ep-agent = 71 项全过


