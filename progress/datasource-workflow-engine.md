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
