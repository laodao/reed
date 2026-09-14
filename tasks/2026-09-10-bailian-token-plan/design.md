# AI 模型配置：新增「阿里百炼 Token Plan」支持（2026-09-10）

## 1. 需求

在「设置 → AI 模型配置」（提供商模板 + 提供商配置）中，增加对**阿里云百炼 Token Plan**（个人版 / 团队版订阅套餐）的接入支持，用户可直接用套餐专属密钥在本应用里对话。

## 2. 事实依据（全部来自阿里云官方文档，非推测）

| 项 | 值 | 来源 |
|---|---|---|
| OpenAI 兼容 Base URL | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | [三步完成 Token Plan 个人版订阅和接入](https://help.aliyun.com/zh/model-studio/token-plan-personal-quick-start) |
| Anthropic 兼容 Base URL | `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic` | 同上 |
| API Key 形态 | `sk-sp-` 开头；与按量计费（`sk-`）、Coding Plan 的 Key **及 Base URL 完全隔离，不可混用** | 同上 |
| 地域 | 仅华北2（北京） | [Token Plan 概述](https://help.aliyun.com/zh/model-studio/token-plan-overview) |
| 计费 | Credits 统一计量；个人版 7 天窗口限额（Lite 2500 / Standard 10000 / Pro 40000），团队版月度总额度 | 同上 |
| 协议支持范围 | 两个 Base URL 官方标注「**仅文本生成类**」模型 | [更多工具](https://help.aliyun.com/zh/model-studio/more-tools) |
| 文本/推理模型清单 | qwen3.8-max、qwen3.8-flash、qwen3.7-max、qwen3.7-plus、qwen3.6-flash、deepseek-v4-pro、deepseek-v4-pro-0813、deepseek-v4-flash-0731、glm-5.2 | [Token Plan 个人版概述](https://help.aliyun.com/zh/model-studio/token-plan-personal-overview) |
| 使用限制 | 仅限在 AI 编程工具/智能体工具中**交互式**使用；不支持工作流/自动化平台、自定义应用后端批量调用，违规可能被暂停订阅或封禁 | [更多工具](https://help.aliyun.com/zh/model-studio/more-tools) |
| 续订 | 订阅到期后重新购买，API Key 会变更 | [Token Plan 个人版概述](https://help.aliyun.com/zh/model-studio/token-plan-personal-overview) |

端点连通性实测（无密钥探测，2026-09-10）：

- `GET /compatible-mode/v1/models` → `401 {"code":"InvalidApiKey"}`（路由存在）
- `POST /apps/anthropic/v1/messages` → `401 {"code":"InvalidApiKey"}`（路由存在，Anthropic SDK 在 baseURL 后拼 `/v1/messages` 的约定成立）

## 3. 设计决策

### 决策一：新增独立模板，不在「阿里百炼平台」模板内做计费方式切换

现有 `bailian` 模板走按量计费（`dashscope.aliyuncs.com/compatible-mode/v1` + `sk-`）。Token Plan 的 Key 与 Base URL 与它**完全隔离**，混用会被拒（官方明确）。因此新增两张模板卡：

- `bailian-token-plan`：OpenAI 兼容（`compatible-mode/v1`）
- `bailian-token-plan-anthropic`：Anthropic 兼容（`apps/anthropic`）

好处：沿用既有「一个模板 = 一套端点 + 一套密钥」的语义，不改动已有配置与交互；两张卡各自独立，用户按工具/协议各取所需。

### 决策二：模型清单只收官方 Token Plan 文本/推理模型，规格逐项取自官方明细页

- 只放文本/推理类（官方明确这两个 Base URL「仅文本生成类」）；图片/语音/视频模型不属于本模板能力范围。
- 规格与能力**逐项取自官方文档，无一项推测**（Token Plan 表给能力，各模型明细页给上下文/输出上限/Function Calling）：

| 模型 ID | 能力（Token Plan 表） | type | 上下文长度 | 最大输出 | Function Calling |
|---|---|---|---|---|---|
| qwen3.8-max | 推理 + 视觉理解 + 文本 | multimodal | 1,000,000 | 131,072 | 支持 |
| qwen3.8-flash | 推理 + 视觉理解 + 文本 | multimodal | 1,000,000 | 131,072 | 支持 |
| qwen3.7-max | 推理 + 文本 | text | 1,000,000 | 131,072 | 支持 |
| qwen3.7-plus | 推理 + 视觉理解 + 文本 | multimodal | 1,000,000 | 131,072 | 支持 |
| qwen3.6-flash | 推理 + 视觉理解 + 文本 | multimodal | 1,000,000 | 65,536 | 支持 |
| deepseek-v4-pro | 推理 + 文本 | text | 1,000,000 | 393,216 | 支持 |
| deepseek-v4-pro-0813 | 推理 + 文本（pro 的日期快照） | text | 1,000,000 | 393,216 | 支持 |
| deepseek-v4-flash-0731 | 推理 + 文本（flash 的日期快照） | text | 1,000,000 | 393,216 | 支持 |
| glm-5.2 | 推理 + 文本 | text | 1,048,576 | 131,072 | 支持 |

- `type`（多模态）必须显式声明：qwen3.8-max 官方支持视觉理解，但模型名里没有 `vl`，纯字符串推断会漏判。
- `supportsThinking` 全为 true（官方均标「推理模型」）；`supportsTools` 全为 true（官方明细页 Function Calling=支持）；
  `supportsWebSearch` 官方未按模型声明 → 不赋值，交由既有名字兜底。
- 两张模板共用同一份模型清单常量（克隆后各自持有），不做复制粘贴。
- 附带收益：显式规格替代了原先「API 不返回 context_window → 一律 8192」的兜底，上下文预算与界面显示首次对得上真实值。

### 决策三：模板声明优先于字符串推断（能力解析）

`providerTemplateService.testConnection` 原先一律按模型名 `detect*` 猜能力。改为：**模板里声明的同类模型定义优先**（`type`/`supportsThinking`/`supportsWebSearch`/`supportsTools` 缺失字段再按名兜底，复用统一的 `resolveCapabilities`）。理由：Anthropic 协议端点没有 `/models` 接口，预置清单是唯一来源，能力必须来自声明；同时消除「模板声明与猜测不一致」的分叉。

### 决策四：Anthropic 协议 provider 的 baseUrl 必须能回退模板默认值

`AnthropicSdkProvider` 此前只用 `config.baseUrl`（用户不填就落到 `api.anthropic.com`），自定义 Anthropic 兼容端点（如 Token Plan 的 `apps/anthropic`）会打错地址。改为 `config.baseUrl || template.apiConfig.baseUrl || 官方默认`，与 `OpenAISdkProvider` 行为对齐。

### 决策五：BaseURL 校验放行「模板缺省端点」

`provider-config.handler` 的 `validateBaseUrl` 要求自定义 BaseURL 以版本段结尾（`/v1`）。Anthropic 协议根地址（`.../apps/anthropic`、`https://api.anthropic.com`）天然不带版本段（SDK 自行拼 `/v1/messages`），用户把官方文档里的地址粘进输入框会被误拒。改为：**等于模板缺省端点时直接放行**，其余仍按原规则校验（保留「自定义地址必须带版本段」的既有约定）。

### 决策六：两条 Anthropic 链路对 baseUrl 的期望不同，须在适配层区分（已核实源码）

| 链路 | 拼法 | baseURL 期望 |
|---|---|---|
| `@anthropic-ai/sdk`（`createProvider` → `AnthropicSdkProvider`，聊天/翻译/长写等） | `POST ${baseURL}/v1/messages` | **根地址**（官方默认 `https://api.anthropic.com`） |
| `@ai-sdk/anthropic`（agent-runtime `ProviderAdapter`，各类 Agent/Harness） | `POST ${baseURL}/messages` | **含版本段**（官方默认 `https://api.anthropic.com/v1`） |

而官方文档给第三方 Anthropic 兼容端点时给的是**根地址**。因此：模板 `baseUrl` 保持官方文档原样（根地址，两条链路共用同一份数据），由 `ProviderAdapter` 的 `anthropicBaseURLOpts` 在缺版本段时补 `/v1`（官方根地址与空值仍走「省略 baseURL，用 SDK 默认」分支，行为不变）。不补则 Agent 链路会打到 `.../apps/anthropic/messages`（404）。

### 决策七：配置界面展示「使用须知」与密钥前缀提示（数据驱动）

给 `ProviderTemplate` 增加两个可选字段：

- `usageNotes?: string[]`：使用须知（地域/限额/密钥隔离/官方使用范围限制），信息页以告警条展示；
- `apiKeyPrefix?: string`：该模板密钥的预期前缀，用于输入框提示与失焦时的**非阻断**提醒（有中转/代理场景，硬拦会误伤）。

两者都是模板数据驱动，界面不写死任何一家厂商文案。

## 4. 影响面

- 新增：2 张模板、1 份共用模型清单常量、2 个类型字段、1 个模板使用须知常量。
- 修改：`createProvider` 分发（按模板 `category` 判定 anthropic/google）、`AnthropicSdkProvider` 构造、`testConnection` 能力解析、`validateBaseUrl`、`AddProviderDialog` 信息页。
- 不影响：既有 `bailian`（按量计费）模板、聊天/图像/语音链路、数据库结构（模板是静态数据，配置表已有 `template_id` 字段）。

## 5. 验证计划

1. 单测（离线）：模板定义正确性、模型清单、`createProvider` 分发与默认 baseURL、`testConnection` 能力透出、`validateBaseUrl` 放行/拒绝矩阵。
2. `npm test` 相关文件 + 全量回归；`npm run lint`；`vue-tsc` 本批文件零新增错误。
3. 真机（待用户提供 `sk-sp-` 密钥）：测试连接 → 拉模型 → 发消息（流式）双协议各一轮。
4. 待核验与预案：Token Plan `/models` 是否对套餐密钥开放。当前实现沿用「4xx 冒泡」（无效密钥必须报错，不能被预置清单掩盖成"连接成功"）；
   若真机上 `/models` 返回 4xx（套餐密钥不开放该接口），用户仍可用「添加自定义模型」手工启用清单里的模型 ID，届时再按该模板加显式开关处理。

## 6. 合规提示（须让用户知情）

官方文档明确：Token Plan 个人版/团队版**仅限交互式编程/智能体工具使用**，不支持工作流平台与自定义应用后端批量调用，违规可能导致订阅被暂停或 Key 被封禁。本应用同时具备批量自动化能力（工作流节点、批量翻译等），因此该模板的「使用须知」中必须给出明确提示，由用户自行判断使用范围。
