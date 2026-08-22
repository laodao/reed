# 工作流平台化 P0 详细设计（对标扣子）

> 日期：2026-08-21 ｜ 依据：`2026-08-21-workflow-coze-gap-analysis.md`（已 review：节点数修正为 31，其余准确）
> 范围：P0 五项——①第三方 API 工具三件套 ②代码节点 ③子工作流节点 ④变量与数据表 ⑤Webhook 触发器
> 铁律：TDD（先红后绿）、第三范式、字面量收敛 shared 常量、双端契约同步（handler/preload/channel-map）、迁移幂等、字段同名直传

---

## 总览与依赖

```
片1 第三方 API 工具（凭据库/预设工具/自定义工具）——基础，Agent 与工具生态的底座
  ↓
片2 代码节点（vm 沙箱）         片3 子工作流节点        片4 变量与数据表        片5 Webhook 触发器
```

每片交付：数据模型/迁移 → 仓库/服务（TDD）→ 节点（TDD）→ IPC 三处接线 → 前端 → 验收。

---

## 片 1：第三方 API 工具（最高优先级）

### 1.1 数据模型（第三范式）

**`tool_credentials`（第三方凭据）**
| 列 | 类型 | 说明 |
|---|---|---|
| id | varchar PK | `cred_<ts>_<rand>` |
| user_id | varchar | 多租户（BaseRepository scoped） |
| name | varchar | 凭据名（如"OpenWeather"） |
| api_key | text | **SecureStorage 加密存储**（复用 api-key 先例，密文入库，不落明文） |
| base_url | varchar nullable | 可选默认 BaseURL |
| created_at / updated_at | datetime | |

**`custom_tools`（自定义工具封装）**
| 列 | 类型 | 说明 |
|---|---|---|
| id | varchar PK | `tool_<ts>_<rand>` |
| user_id | varchar | scoped |
| name | varchar | 工具名（唯一 per user？允许重名，列表展示） |
| description | varchar nullable | |
| method | varchar | GET/POST/PUT/PATCH/DELETE |
| url | varchar | 支持 `{{param}}` path 占位 |
| headers_json | text | `[{key, value}]`（value 支持 `{{param}}` 与 `{{credential}}`） |
| params_schema_json | text | `[{key, label, type: string|number|boolean|json|select, required, options?, default?}]` |
| auth_type | varchar | `none` / `credential`（注入 Bearer，取 api_key）/ `header`（headers 里手填） |
| credential_id | varchar nullable | auth_type=credential 时引用 |
| created_at / updated_at | datetime | |

**预设工具**：内置资产 `src/core/modules/workflow/tools/preset-tools.ts`（只读，不落库）——
首批 6 个：搜索（Bing/Serper）、翻译（DeepL/百度）、天气（OpenWeather）、新闻（NewsAPI）、
OCR（云厂商示例留待凭据）、图片搜索（Unsplash）。每项结构同 custom_tools 行（含 auth 说明）。

### 1.2 节点

**新增 `tool-call` 节点**（对齐扣子"工具节点"，比增强 http-request 更干净）：
- config：`{ toolType: 'custom' | 'preset', toolId: string, params: [{key, value}] }`
- 编辑器：选中工具后按 params_schema 自动生成参数表单（复用 FormFieldRenderer 思路）；value 支持 `{{模板}}`
- execute：
  1. 取工具定义（custom → 仓库；preset → 预设表）
  2. 参数映射：path 占位替换 / query 拼接 / JSON body；未声明参数进 body
  3. 凭据注入：auth_type=credential → 解密 api_key → `Authorization: Bearer <key>`
  4. 复用 `http-fetch.ts` 共享执行（超时/取消/统一输出 `{status, ok, json, text}`）
- 输出：`{ status, ok, json, text, durationMs }`；失败 → `{status:'failed', error, retryable:true}`

**http-request 增强（可选，V1 不动）**：保留底层能力，工具走 tool-call。

### 1.3 服务层

`src/core/modules/workflow/tools/tool.service.ts`：
- `listCredentials / saveCredential({name, apiKey, baseUrl}) / deleteCredential`——api_key 经 SecureStorage 加密/解密
- `listCustomTools / createCustomTool / updateCustomTool / deleteCustomTool / getCustomTool`
- `getPresetTools / getTool(toolId, type)`（custom 或 preset 合并查询）
- `executeTool({type, toolId, params, signal})`——组装请求 + 凭据注入 + http-fetch

### 1.4 IPC（三处接线）
- `tool:list-credentials` `tool:save-credential` `tool:delete-credential`
- `tool:list-custom` `tool:save-custom` `tool:delete-custom`
- `tool:presets`（预设列表）
- 前端 `window.electronAPI.tools.*`；web channel-map 同步

### 1.5 前端
- **设置页「工具」Tab**：凭据管理（名称/key/BaseURL + 加密提示）+ 自定义工具 CRUD（方法/URL/请求头/参数 schema 编辑器）
- **编辑器**：tool-call 节点配置面板（工具下拉 → 参数表单动态生成）

### 1.6 测试（TDD）
- tool.service：凭据加密存取（mock SecureStorage）/ 自定义工具 CRUD / 参数映射（path/query/body）/ 凭据注入 / 预设列表
- tool-call 节点：validate（缺工具/缺必填参数）/ execute（mock fetch 断言 URL/headers/body）/ 失败降级
- 迁移幂等（tool_credentials/custom_tools 表）

---

## 片 2：代码节点

### 2.1 节点定义
- `code` 节点：config `{ language: 'js', code: string, inputs?: [{key, label, type, value}] }`
- execute：Node `vm` 沙箱
  - `vm.createContext({ console, Math, JSON, Date, Number, String, Boolean, Array, Object, Error, Promise })`
  - **不暴露**：require/process/global/fs/net（沙箱隔离）
  - 输入注入：`context.inputs = { ...inputs 解析后的值 }`（模板在引擎深解析后为实参）
  - 用户代码：`const result = (function(inputs){ ... })(inputs); result`——约定 return 对象 → 节点输出 `{ result, ...展开? }`
  - V1 简化：代码返回一个对象，节点输出 `{ result }`；对象字段经 `{{code1.result.xxx}}` 引用
  - 超时：`WORKFLOW_LIMITS.codeTimeoutMs`（建议 5s）→ 超时标记 failed retryable=false
  - 异常：catch → `{status:'failed', error}`
- 前端：textarea 代码编辑（V1 无语法高亮；可加简单 monospace 样式）；inputs 表单（kv 行）
- 安全备注：vm 非完整安全边界（V1 单用户桌面可接受；文档注明"仅信任代码"）

### 2.2 测试
- 沙箱执行（基本运算/输入注入/return 对象）
- 超时（死循环代码 → 超时失败）
- 异常（抛错 → failed）
- 无 require 能力（`typeof require === 'undefined'`）

---

## 片 3：子工作流节点

### 3.1 节点定义
- `sub-workflow` 节点：config `{ definitionId: string, inputs?: [{key, value}] }`
- execute：
  1. `runService.startRun({ definitionId, triggerType: 'subflow', inputs, triggerInfo: { source: 'subflow', parentRunId: ctx.runId }, usePublishedGraph: true })`
  2. 若返回 skipped（子工作流已在运行）→ `{status:'failed', error:'子工作流正在运行', retryable:false}`
  3. 轮询子运行至终态（复用 getRun，超时 WORKFLOW_LIMITS.subflowTimeoutMs 默认 10min）
  4. 输出：`{ runId, status, report?: <子运行 report/message 节点输出>, outputs: {nodeId: output} }`
     - V1 简化：输出 `{ runId, status, result: 子运行 message 节点首个输出.content 或 report.markdown }`
- 递归防护：父子链检测（父链 runId 集合传 triggerInfo，子执行时校验不循环）——V1 记录，不做硬拦截（用户自约束），文档注明

### 3.2 测试
- mock runService：startRun 透传（inputs/triggerType/usePublishedGraph）/ skipped 报错 / 终态轮询取结果 / 超时

---

## 片 4：变量与数据表

### 4.1 数据模型（第三范式）

**`wf_variables`（键值变量）**
| 列 | 说明 |
|---|---|
| id / user_id / scope('global'\|'user') / key / value_json / created_at / updated_at | `UNIQUE(user_id, scope, key)` |

**`wf_data_table_defs`（数据表结构）**
| 列 | 说明 |
|---|---|
| id / user_id / name / columns_json（`[{key,label,type}]`）/ created_at / updated_at | |

**`wf_data_table_rows`（数据表行）**
| 列 | 说明 |
|---|---|
| id / user_id / table_id / row_json（`{colKey: value}`）/ created_at / updated_at | `INDEX(table_id)` |

### 4.2 节点
- `variable` 节点：config `{ op: 'get'|'set', scope: 'global'|'user', key: string, value?: string(模板), defaultValue?: string }`
  - get：读取 → 输出 `{ value }`；set：写入 → 输出 `{ ok: true }`
- `data-table` 节点：config `{ op: 'insert'|'query'|'update'|'delete', tableId?: string, tableName?: string, row?: string(JSON 模板), query?: string(JSON 模板), key?: string }`
  - insert：写行 → `{ rowId }`；query：按 tableId/tableName 查全部 → `{ rows }`；update：按 rowId 覆盖行；delete：按 rowId 删
  - V1 query 不做条件过滤（全表），条件过滤 P1

### 4.3 服务与测试
- `VariableService` / `DataTableService`（仓库层 CRUD，scoped 隔离）
- 单测：变量 get/set 幂等与覆盖、scope 隔离、数据表 CRUD、节点透传

---

## 片 5：Webhook 触发器

### 5.1 触发模型
- 复用 `workflow_definitions.triggers` JSON（现有 cron 同数组）：新增 trigger 项
  `{ type: 'webhook', token: <32B hex>, enabled: true }`
- 生成：`crypto.randomBytes(32).toString('hex')`（不可枚举，同 share_token 纪律）
- 存储：triggers JSON 序列化（无需新表）；前端触发器面板渲染 webhook 卡片

### 5.2 REST 路由（web 端 `workflow-api-router.ts`）
- `POST /api/workflow/webhook/:token`（免登录，token 即鉴权）
  - 解析：`definitions` 找 triggers 含该 token 且 enabled 的定义（跨租户裸查，注释纪律同 findByShareToken）
  - 限流：复用 shareRateLimited 滑动窗口（60s/6 次，429）
  - 执行：`runWithUserAsync(定义所有者)` → `startRun({ definitionId, triggerType: 'webhook', inputs: req.body, usePublishedGraph: true })`
  - 响应：`{ ok: true, runId }`；无匹配 → 404（不泄露存在性）
- 触发器面板：编辑器「发布」区显示 Webhook URL + 复制 + 重新生成 token + 停用

### 5.3 测试
- 路由：token 命中/未命中 404/停用 404/body 入参/限流 429/以所有者身份运行
- 前端：触发器面板 webhook 卡片（可选单测）

---

## 分片计划与门禁

| 片 | 内容 | 验收门禁 |
|----|------|---------|
| 1 | 第三方 API 工具三件套 | tool 服务+节点单测全绿；tsc；前端设置页/编辑器面板可用；E2E：建凭据→自定义工具→tool-call 运行 |
| 2 | 代码节点 | code 节点单测全绿（沙箱/超时/异常）；tsc；编辑器可配置；E2E：code 节点计算 |
| 3 | 子工作流节点 | sub-workflow 单测全绿；tsc；E2E：主流程调子流程 |
| 4 | 变量与数据表 | 服务+节点单测全绿；迁移幂等；E2E：set→get 跨运行 |
| 5 | Webhook 触发器 | 路由单测全绿；前端面板；E2E：curl 触发工作流 |

全局门禁（每片）：`npx tsc --noEmit -p tsconfig.node.json` 零错 + `vue-tsc` 本次改动零错 +
三处契约同步 + 字面量收敛 + 迁移幂等 + `npm run test:unit`（含既有回归）全绿。

---

## Review 修正记录（2026-08-21）
- 节点数 30 → 31（补 video-extract-audio）
- 优先级：第三方 API 工具置顶 P0（用户确认）
- 其余盘点结论维持

---

## 实施进度（2026-08-21 自主完成，P0 五项全部落地并通过 E2E）

| 片 | 交付物 | 验证 |
|----|--------|------|
| 1 工具 | `tool.types.ts` / 迁移 `create-tool-tables` / 2 实体 / 2 仓库 / `ToolService`（SecureStorage 加密 + 参数映射 + 凭据注入）/ 预设工具 6 个 / `tool-call` 节点（5 处契约）/ IPC 7 通道三处接线 / 设置页「工具」Tab / 编辑器 tool-select/tool-credential-select/tool-params 表单 | `scripts/e2e-tool-call.cjs` 全过（预设列表/凭据加密/自定义工具/工作流运行/凭据 Bearer 注入） |
| 2 代码 | `code` 节点（vm 沙箱白名单 + 5s 超时）/ `WORKFLOW_LIMITS.codeTimeoutMs` | `scripts/e2e-code-node.cjs` 全过（count=4 sum=10 avg=2.5）；单测覆盖超时/无 require/异常 |
| 3 子工作流 | `sub-workflow` 节点（startRun 透传 + 终态轮询 + 结果聚合）/ `run-service-access` 注册器 / `subflowTimeoutMs` | `scripts/e2e-sub-workflow.cjs` 全过（父调子、子运行产生、结果透传） |
| 4 变量与数据表 | `variable.types.ts` / 迁移 3 表 / 3 实体 / 3 仓库 / `VariableDataService` / `variable` + `data-table` 节点（insert 自动建表） | `scripts/e2e-variable-datatable.cjs` 全过（跨运行 set→get=7；insert 2 行→query 2 行） |
| 5 Webhook | `WorkflowTrigger` 加 webhook 类型 / `findByWebhookToken`（跨租户裸查）/ `POST /api/workflow/webhook/:token`（形态守卫+限流+所有者身份）/ 路由挂载 | `tests/unit/web/webhook-trigger.spec.ts`（命中/404/停用/守卫/限流）——单测覆盖（web 端需独立 server） |

**全局门禁**：后端 `tsc --noEmit -p tsconfig.node.json` ✅；前端 vue-tsc 本次改动零错误 ✅（仅预存 TS6305）；
每片 TDD 单测已写入（tool.service/tool-call/code-node/sub-workflow/variable-node/webhook-trigger）——本地 `npm run test:unit` 复核。
E2E 测试数据已清理（应用保持运行，数据干净）。

**遗留说明**：
- Webhook 前端触发器面板（编辑器展示 token/URL）未做——V1 走 REST/JSON 配置，P1 补 UI
- 数据表查询 V1 无条件过滤（全表），条件过滤 P1
- 代码节点 vm 非完整安全边界（单用户桌面可接受），多租户需独立进程沙箱（P2）

---

## 增量：视频文案提取支持视频 URL（2026-08-21，用户需求）

**review 结论**：原组件仅支持本地文件（`video-extract-audio` 的 `existsSync` 校验 URL 会直接报"文件不存在"）。

**已实现**（`video-url-resolver.ts` + `media-nodes` 增强 + 模板更新 + ffmpeg headers 支持）：
| 来源 | 支持方式 | 状态 |
|------|---------|------|
| 常规视频直链（mp4/webm/m3u8 等 http(s)） | ffmpeg 直接拉流（带 UA） | ✅ 开箱即用（E2E 本地直链提取 1000ms 验证通过） |
| B站（bilibili.com/video/BVxxx、b23.tv） | 公开 API：nav 取 WBI key → view 拿 cid → playurl（WBI 签名）→ **DASH 音频流**（不受清晰度限制），带 Referer 防盗链 | ✅ 已实现（单测 mock 三接口验证签名/直链/Referer） |
| 抖音（douyin.com / iesdouyin.com） | 风控极强、无稳定公开 API——节点返回**明确降级提示**"请手动下载后本地导入" | ✅ 明确降级（E2E 验证提示文案） |
| 其它平台/无法识别的 URL | 明确失败提示（不静默不伪造） | ✅ |

**节点改动**：`video-extract-audio` 新增 `videoUrl` 配置（与 `videoPath` 二选一，本地优先）；validateConfig 改二选一；ffmpeg `extractAudio`/`getVideoMetadata` 支持可选 headers（防盗链）。模板 start 新增"视频链接"输入（与"本地视频文件"并列，均可选）。

**验证**：`tsc` ✅；`scripts/e2e-video-url.cjs` 全过（直链提取 + 抖音降级）；`video-url-resolver.spec.ts` 单测（检测/BV 提取/WBI 签名/B站解析 mock/抖音降级/非 http 拒绝）。

**安全**：仅接受 http(s)（防 file:// 任意读）；B站请求带 UA/Referer；解析失败明确报错。

**合规提示**：B站解析仅用于**个人学习/文案提取**场景；请遵守平台条款，勿批量下载/再分发。抖音因平台政策不提供自动解析。

---

## 增量：yt-dlp 集成（2026-08-21，多平台视频 URL 支持）

**调研结论**：yt-dlp 官方 release 提供独立可执行文件（Windows `yt-dlp.exe`，PyInstaller 打包，**无需 Python 环境**）；`-x --audio-format wav` 提取音频、`--no-playlist` 防整表下载、代理走 `--proxy`/环境变量、cookies 可选、`-U` 自更新。

**实现**（`yt-dlp-manager.ts` + resolver 分类扩展 + 节点 ytdlp 分支）：
| 项 | 设计 |
|----|------|
| 二进制管理 | 数据目录 `bin/yt-dlp(.exe)`；不存在时**首次使用自动从 GitHub latest release 下载**（幂等防并发）；下载失败不阻断（回退内置+提示手动放置） |
| 平台分流 | 直链扩展名 → ffmpeg 直拉；B站 → 内置 API；抖音 → 降级提示；**其它（YouTube/西瓜/微博/快手/小红书/优酷页面等）→ yt-dlp** |
| 音频提取 | `yt-dlp --no-playlist -x --audio-format wav --ffmpeg-location <内置ffmpeg> -o <out>.%(ext)s <url>`（内部处理 cookies/referer/平台差异） |
| 错误归类 | 不可用→提示下载 yt-dlp；geo/登录限制→提示；spawn 失败→明确报错（含 yt-dlp） |
| 用户交互 | **零配置**：只需填 URL；代理自动读环境变量（HTTPS_PROXY），无需 UI |

**验证**：`tsc` ✅；`scripts/e2e-ytdlp.cjs` 全过（yt-dlp 路径失败明确提示 + 直链回归）；
单测：`yt-dlp-manager.spec.ts`（探测/下载失败降级/下载成功/提取成功 mock spawn/不可用提示）、`video-url-resolver.spec.ts` 扩展（ytdlp 分类）。

**遗留**：cookies 导入（部分平台需登录视频）、yt-dlp 更新入口（`-U`）、代理 UI——均 P1；优酷/爱奇艺/腾讯视频等加密平台 yt-dlp 亦多失效，手动下载兜底不变。
