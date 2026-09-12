# AI 模型配置：新增「阿里百炼 Token Plan」支持（2026-09-10）

## 需求

在「设置 → AI 模型配置」中支持阿里云百炼 **Token Plan**（个人版 / 团队版订阅套餐）——用户可直接用套餐专属密钥在本应用里对话，无需改代码或手工拼端点。

用户拍板的三个取舍：① 新增**独立模板卡**（不在按量计费模板内做计费方式切换）；② **OpenAI 兼容 + Anthropic 兼容两张都做**；③ 稍后提供 `sk-sp-` 真实密钥做真机验证。

## 事实依据（官方文档核对 + 端点实测，无推测成分）

| 项 | 值 |
|---|---|
| OpenAI 兼容 Base URL | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` |
| Anthropic 兼容 Base URL | `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic` |
| 密钥形态 | `sk-sp-` 开头；与按量计费（`sk-`）、Coding Plan 的密钥 **及 Base URL 完全隔离** |
| 地域/计费 | 仅华北2（北京）；Credits 计量，个人版 7 天窗口限额、团队版月度总额度 |
| 协议能力 | 两个端点官方标注「仅文本生成类」 |
| 使用限制 | 仅限 AI 编程/智能体工具**交互式**使用；不支持工作流平台与自定义应用后端批量调用，违规可能封禁 |

端点连通性实测（无密钥探测）：`GET /compatible-mode/v1/models` 与 `POST /apps/anthropic/v1/messages` 均返回 `401 InvalidApiKey`（路由存在，后者印证 Anthropic SDK 在 baseURL 后拼 `/v1/messages` 的约定成立）。

模型清单（9 个文本/推理模型）的上下文长度、最大输出、Function Calling、视觉理解，逐项取自各模型官方明细页（详见 `tasks/2026-09-10-bailian-token-plan/design.md` 的规格表），**没有编造任何数值**。

## 实现

### 1. 新增两张模板（`src/core/platform/services/provider-template.service.ts`）

- `bailian-token-plan`：`category: openai-compatible`，Bearer 认证，`/chat/completions` + `/models`。
- `bailian-token-plan-anthropic`：`category: anthropic`，`x-api-key` 认证，`/v1/messages`，默认头 `anthropic-version: 2023-06-01`。
- 两张模板共用模块级常量 `BAILIAN_TOKEN_PLAN_TEXT_MODELS`（`cloneTokenPlanTextModels()` 克隆后各自持有，避免共享可变数组）与 `BAILIAN_TOKEN_PLAN_USAGE_NOTES`（使用须知），**无复制粘贴**。
- 声明 `apiKeyPrefix: 'sk-sp-'` 与 4 条 `usageNotes`（密钥隔离 / 地域限额 / 官方使用范围限制 / 续订换 Key）。

### 2. 模板数据字段扩展（`src/shared/types/provider-template.types.ts`）

`ProviderTemplate` 新增两个**可选**字段：`apiKeyPrefix?: string`（密钥前缀提示）、`usageNotes?: string[]`（使用须知）。均为通用字段，界面按数据渲染，不写死任何厂商文案。

### 3. Provider 分发与端点解析

- `createProvider`（`src/core/platform/providers/llm/index.ts`）：改为**模板 category 优先**判定协议族（`anthropic` / `google`），否则 Anthropic 兼容端点会落回 OpenAI 兼容实现；`bailian-token-plan` 进 `OPENAI_COMPATIBLE_CONFIGS` 默认端点表；`getSupportedTemplateIds()` 补齐两个新 id。
- `AnthropicSdkProvider`（`.../sdk/anthropic-sdk-provider.ts`）：baseURL 解析改为 `用户配置 > 模板默认端点 > 官方根地址`。此前只用 `config.baseUrl`，用户留空会静默打到 `api.anthropic.com`——第三方 Anthropic 兼容端点（含本次 Token Plan、以及既有 `anthropic` 模板缺省值）都受影响。
- `validateBaseUrl`（`src/electron/ipc/handlers/provider-config.handler.ts`）：**等于模板缺省端点时放行**。Anthropic 协议根地址天然不带版本段（`.../apps/anthropic`、`https://api.anthropic.com`），原规则会把官方文档地址误判为非法；其余自定义地址仍强制版本段（既有约定保留）。创建与更新两条路径都传入模板（更新时按既有配置的 `templateId` 反查）。

### 4. 能力解析收敛（`provider-template.service.testConnection`）

模板声明的同类模型定义**优先**，缺失字段再按模型名兜底——复用统一的 `resolveCapabilities`，并删除了本服务内自带的 `detectThinkingSupport` / `detectWebSearchSupport` / `detectToolSupport` 三份重复规则（两套规则分叉是隐患）。同时规格改为「模板声明 > provider 兜底」，使上下文窗口/输出上限显示与预算首次对齐官方真值（原先 API 不返回 `context_window` 时一律按 8192 兜底）。

### 5. 两条 Anthropic 链路的 baseURL 约定不同（读源码核实后分别处理）

| 链路 | 拼法 | baseURL 期望 |
|---|---|---|
| `@anthropic-ai/sdk`（`createProvider` → `AnthropicSdkProvider`：聊天/翻译/长写等） | `${baseURL}/v1/messages` | 根地址（`https://api.anthropic.com`） |
| `@ai-sdk/anthropic`（agent-runtime `ProviderAdapter`：各类 Agent/Harness） | `${baseURL}/messages` | 含版本段（`https://api.anthropic.com/v1`） |

官方文档给第三方 Anthropic 兼容端点的是**根地址**（`.../apps/anthropic`）。处理方式：模板 `baseUrl` 保持文档原样，`AnthropicSdkProvider` 补「模板默认端点」回退（见上节），`ProviderAdapter.anthropicBaseURLOpts` 在缺版本段时补 `/v1`（官方根地址/空值仍走「省略 baseURL 用 SDK 默认」分支，行为不变）。**不补的话 Agent 链路会静默打到 `.../apps/anthropic/messages`（404）**。

### 6. 配置界面（`src/renderer/src/components/settings/AddProviderDialog.vue`）

- 信息页新增「使用须知」告警条（`usageNotes` 逐条渲染）。
- API Key 输入框占位随 `apiKeyPrefix` 变化；失焦时若前缀不符给出**非阻断**提醒（中转/代理场景前缀可能不同，硬拦会误伤），每次打开对话框只提醒一次。

## 测试

新增三个 spec，**先写失败用例再实现**（TDD）：

- `tests/unit/core/platform/services/provider-template-token-plan.spec.ts`（11 例）：两模板的 id/name/category/Base URL/认证/端点；与按量计费 `bailian` 的隔离（id 与 baseUrl 均不同）；能力只声明 chat；`apiKeyPrefix` 与 `usageNotes`；模型清单与官方一致且两模板各持副本；逐模型规格与能力（含 qwen3.8-max 的视觉理解漏判点）；`createProvider` 分发与默认 baseURL（含用户自定义 baseUrl 优先）；`testConnection` 离线透出预置清单与能力（Anthropic 协议模板无 `/models`，预置清单是唯一来源）。
- `tests/unit/core/platform/agent-runtime/provider-adapter-anthropic-baseurl.spec.ts`（4 例）：Token Plan 根地址补 `/v1`、官方根地址省略 baseURL、已带版本段原样透传、用户填写的无版本段根地址补 `/v1`。
- `tests/unit/electron/ipc/provider-config-base-url.spec.ts`（4 例）：留空放行 / 等于模板缺省端点放行（含尾斜杠）/ 带版本段放行 / 其它无版本段拒绝。

测试用 `vi.mock` 替换 `openai`、`@anthropic-ai/sdk`、`@ai-sdk/anthropic`，全程不发网络请求。

## 验证

- 新增三个 spec：**19 passed**（11 + 4 + 4）。
- 回归：`tests/unit/core/platform`（含 agent-runtime / services / providers）+ `tests/unit/electron` + provider 仓库 spec → **673 例中 672 passed**。
- 失败项**均为基线既有失败**（已用 `git stash` 在 HEAD 上复现同样结果，非本批引入）：
  - `document-templates.spec.ts`（吃瓜文档模板注册表）、`gossip-event-report.spec.ts`（吃瓜事件报告工作流）——对应另一并行会话在改的 `builtin-apps/*.json`；
  - `asset-service-category.spec.ts`（内置资产分类数据）；
  - `provider-config.repository.spec.ts [postgres]` 子套件——本机无 Postgres（`ECONNREFUSED ::1:5432`），sqlite 套件通过。
- `eslint` 改动文件：**0 errors**（仅既有 `any` 风格 warning）。
- `vue-tsc --noEmit`：基线 905 error → 本批 904 error（错误集合逐条对比，**零新增**；顺手修掉本批文件内既有的 `UserProviderConfig` 未导入 TS2304）。本批文件内剩余报错（`AddProviderDialog` 的 5 处、handler 的 `updateTestResult` 参数个数、`fetchModels` 未使用）均为改动前既有。

## 待办

1. **真机验证（待用户提供 `sk-sp-` 密钥）**：创建配置 → 测试连接 → 从 API 刷新模型 → 发消息（流式）——OpenAI 兼容与 Anthropic 兼容两张模板各一轮。
2. 核验 Token Plan `/models` 对套餐密钥是否开放：当前沿用「4xx 冒泡」（无效密钥必须报错，不能被预置清单掩盖成"连接成功"）。若真机 4xx，用户仍可用「添加自定义模型」手工启用清单里的模型 ID，届时按模板加显式开关处理。
3. 合规提醒已进模板使用须知，但需向用户明确：本应用具备工作流/批量自动化能力，**请勿用套餐密钥跑批量任务**（官方明确禁止，可能封禁订阅）。

## 备注

- 不新增数据库结构（模板为静态数据，`provider_configs.template_id` 已可承载新模板）。
- Web 端无需额外接线：`provider-template:list` / `provider-config:test` 已在 `src/web/client/channel-map.ts` 通道表内，桌面与 Web 共用同一份模板数据。
- 未做 Coding Plan（`coding.dashscope.aliyuncs.com`）：用户本次只要求 Token Plan，且 Coding Plan 已停止新购/限量；将来若需要，按同一套模板模式加一张卡即可。
