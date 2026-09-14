# the-bot 集成 ai-hub 详细方案

> 日期：2026-09-06
> 依据文档：`/home/ubuntu/workdir/ai-hub/docs/manual/third-party-system-integration-guide.md`（下称"接入手册"）
> 现状基线：插件化重构已完成，平台能力在 `src/core/platform/`，业务包在 `src/core/packs/`；五类 provider（llm/image/video/voice/search）各自有独立工厂，无统一 registry。
> 本文只出方案，不动手实现。

---

## 0. 集成定位与模式选择

### 0.1 the-bot 是什么角色的接入方

接入手册第 7 章把无后端客户端分成两类：

| 模式 | 适用 | 凭证 | 计费载体 |
|---|---|---|---|
| OAuth2 PKCE（§7.3） | **第三方**客户端，用户授权第三方访问 | `at_` access_token（短期，需轮换） | 用户全局余额 |
| account session（§7.6） | **第一方**客户端（平台自己的官方 PC/Web 端） | account JWT（登录态，默认 7 天） | 个人 workspace 余额 |

接入手册 §7.6 明确把"官方 PC 端 vedio-bot"列为第一方客户端示例——the-bot 与 ai-hub 同属一套产品体系，**应采用 account session 直连模式**，理由：

1. 无 OAuth2 授权码跳转、无 PKCE、无 refresh token 轮换，登录就是 `POST /api/account/login` 一步拿 JWT，桌面端体验最好；
2. 不签发 `sk-` 长期密钥，改密/禁用/强制登出即时失效，分发出去的安装包没有长期凭证泄漏面；
3. 模型 API 调用代码与 sk-/at_ 模式完全同构（`Authorization: Bearer <jwt>`），将来若要支持第三方分发可平滑切换。

**HMAC 模式（§4）不适用**：the-bot 是客户端不是服务端，secret_key 打进安装包即泄露，手册 §7.1 明令禁止。

### 0.2 集成后的产品形态：账号与模型来源解耦

**核心原则：注册登录 ≠ 必须使用 ai-hub 模型。账号体系和模型来源是两个独立维度，用户自由组合。**

- **账号**：用户只需注册/登录一次（ai-hub 账号，account session）。登录是轻量的身份行为，不强制绑定任何模型消费方式；登录本身不产生费用。
- **模型来源（二选一或混用，用户自选）**：
  - **自有 API Key（现状完全保留）**：用户自配 deepseek/百炼/火山等厂商 Key，走现有 provider 体系，**不登录也能用**（本地配置，与账号无关）；
  - **ai-hub 网关（新增）**：登录后即可使用平台全部已注册模型（chat/image/video/music），按个人 workspace 余额计费，可自助充值/兑换码。
- 两类来源在模型选择器中并存：同一个对话框里既可能列着用户自配的 `deepseek-chat`（自有 Key），也可能列着 ai-hub 的 `qwen3.6-27b`（网关计费）。用户可以只配自有 Key 从不登录，也可以只登录用网关，也可以混用（比如对话走网关、视频走自配的火山 Key）。

对应到设计上的三条推论：

1. **登录态与 ai-hub provider config 分离**：登录态（JWT）存账号体系；ai-hub 作为一条 provider config 参与现有模型路由，但它"可用"的前提是已登录。未登录时该 config 在模型选择器中置灰/不列出，**绝不影响自有 Key 的 provider 正常工作**；
2. **ai-hub 不是默认/强推项**：设置界面里它与其他提供商平级展示（可标注"官方网关·免配 Key"作引导，但不抢占默认）。`is_default` 逻辑不变——用户没选 ai-hub 的模型，就一次网关请求都不会发；
3. **登出只收回网关能力**：登出 = 清 JWT + ai-hub 模型不可用，自有 Key 配置与其下所有功能不受任何影响。

这要求 ai-hub 不是一个普通的"provider 模板"，而是一个**带账号体系、统一任务 API、计费闭环的网关接入层**，同时它必须"可插拔地"嵌入现有 provider 路由——在则多一路模型来源，不在则系统行为与今天完全一致。它横跨 provider 体系（五类中的四类）、设置界面（登录/余额/充值）、以及异步任务基础设施。

---

## 1. ai-hub 侧前置准备（平台管理员操作，非开发项）

1. 确认 ai-hub 已按 §7.6 开放 account session：`POST /api/account/register`、`POST /api/account/login` 可用；
2. 确认目标模型已在 ai-hub 注册并授权（注册即自动授权全部已注册模型）；
3. 取得部署地址：`{BASE}`（API 网关）与 `{WEB_AUTH}`（托管认证/充值门户）；
4. 充值渠道（微信/支付宝/兑换码批次）由平台侧配置，客户端零开发（走托管门户跳转）。

---

## 2. 总体架构设计

### 2.1 新增模块总览

```
src/core/platform/
├── aihub/                              # 新增：ai-hub 网关接入层
│   ├── aihub-client.ts                 # 统一 HTTP 客户端（JWT 注入、401 处理、统一解包 {code,message,data}）
│   ├── aihub-auth.service.ts           # 注册/登录/登出/JWT 加密持久化/401 重新登录
│   ├── aihub-models.service.ts         # GET /v1/models → ModelDefinition[] 映射缓存
│   ├── aihub-billing.service.ts        # 余额/流水/兑换码/充值门户跳转
│   └── aihub.types.ts                  # 契约类型（对齐手册 §4.7/§4.8/§8.4）
├── providers/
│   ├── llm/         （复用 OpenAICompatibleProvider，仅加 aihub 模板与 JWT 注入）
│   ├── image/aihub-image.provider.ts   # 新增：BaseImageProvider 的 ai-hub 实现
│   ├── video/aihub-video.provider.ts   # 新增：BaseVideoProvider 的 ai-hub 实现
│   └── voice/aihub-voice.provider.ts   # P5 可选：BaseVoiceProvider 的 ai-hub 实现（§3.10）
└── services/provider-template.service.ts  # 新增 'ai-hub' 模板
```

设置界面（`src/renderer/src/views/Settings.vue` 或其子组件）新增"AI Hub 账号"面板：登录/注册、当前账号与余额展示、充值入口（跳托管门户）、兑换码输入框。

### 2.2 关键设计决策

**决策一（2026-09-06 修订）：会话槽位为真源 + JWT 物化写入 config，双轨并行。**

> 修订原因：初版"独立会话槽 + 仅在 `getProviderConfig()` 注入"经代码核实走不通——① 配置解析逻辑在 chat.service.ts:60-126、image.service.ts:98-141、ai-call.ts:41-85 复制了至少 3 份，聊天和图片根本不过那个钩子；② 三处都有 `if (!config.apiKey) return 错误` 前置检查（ai-call.ts:67、chat.service.ts:85、image.service.ts:123），ai-hub config 的 Key 字段留空会在注入之前就被挡死。

修订后的机制：

- **真源**：登录态（JWT、`expires_at`、账号 email）存独立加密会话槽位——Electron 端 SecureStorage 落 `aihub_session`（PC 单用户）；Web 端按 userId 存（users 表挂列或 user 级 KV）。登出/换号只动这条会话记录，与 provider_configs 解耦；
- **物化**：登录/重新登录成功时，把 JWT 加密同步写入 ai-hub provider config 的 `api_key_encrypted`；登出/401 失效时清空该字段。这样现有全部调用链（含 3 处复制的解析、前置检查、decrypt）**零改动天然通过**——对它们而言 ai-hub 就是一个"Key 恰好是 JWT 的普通提供商"；
- **终态**：ProviderRouter 统一收敛（`docs/design/2026-09-06-provider-router-unification-plan.md`）完成后，注入改走 router 的 TokenInjector 钩子链（内存注入），物化可保留作双保险或移除，届时再定；
- 未登录/已过期时调用 ai-hub 模型：报统一错误 `AIHUB_NOT_LOGGED_IN`，UI 引导登录；**其他 provider 的解析路径零行为变化**。

**决策二（2026-09-06 修订）：llm 走 OpenAI 兼容透传，image/video/music 走统一任务 API，voice 列为可选扩展。**

- ai-hub 的 `/v1/chat/completions`、`/v1/embeddings`、`/v1/models` 是 OpenAI 兼容的，现有 `OpenAICompatibleProvider` 直接可用，只需模板指向 `{BASE}/v1` 并把 Authorization 换成 JWT（现有架构 apiKey 就是 Bearer 值，天然兼容）；
- image/video 必须按手册 §4.8 实现"提交→轮询→下载转存"三步走的适配器（`aihub-image/video.provider.ts`）；
- **voice（2026-09-14 修订）**：ai-hub 已新增音频 API（手册 §4.10）——OpenAI 兼容的 TTS `/v1/audio/speech`、STT `/v1/audio/transcriptions`、语音翻译 `/v1/audio/translations`，同步请求-响应（非任务模型），TTS 按字符、STT 按秒计费；并新增音色管理（手册 §4.12）——复刻 `/v1/audio/voices/clone`（阿里+火山）、设计 `/v1/audio/voices/design`（仅阿里）、list/get/delete，按次计费。可整体接入为本项目的第二语音来源，设计见 §3.10；一期范围仍不含 voice，统一列为 P5 可选扩展；
- music 能力一期不做，留扩展位。

**决策三（2026-09-06 修订）：任务轮询复用现有框架，一期不新建 AihubTaskService。**

现状（已核实）：图片轮询在 `image.service.ts:370`（setInterval 5s×60 次），视频轮询在 `video-generation.service.ts:182`（120 次≈10 分钟），模式相同、代码各写一份。ai-hub 的任务模型（`/v1/tasks/{id}`，pending→processing→completed/failed/timeout/cancelled）与现有 `getTaskStatus` 抽象同构——适配器只实现"提交返回 taskId + getTaskStatus 查状态"，轮询循环仍由现有 ImageService/VideoGenerationService 驱动，**现有轮询框架不动，一期也不新建统一任务服务**（见 §3.7）。将来若要收敛轮询（比如接入 music、或启用久置的 `TaskQueueService`），单独立项。

**决策四：`download_url` 必须在 3600 秒有效期内转存。**

手册 §4.8.2 明确结果是 OSS 预签名临时链接。现有 ImageService 完成轮询后已会"下载存盘"（`image.service.ts` 轮询回调），视频同理，天然满足要求；但需在适配器文档与错误处理中显式处理"下载失败/链接过期"（任务过期重提需新任务 id）。

---

## 3. 模块详细设计

### 3.1 AihubClient（HTTP 客户端）

职责：ai-hub **账号/计费/任务类**请求的唯一出口（login/register/balance/redeem/tasks 等）。**注意边界：LLM 聊天请求不经过本 client**——它走 `OpenAICompatibleProvider`（见 §3.4），因此 chat 的 401 检测不在此处，见 §3.4 的专门说明。

- 配置：`baseUrl`（`{BASE}`，来自 provider config 的 baseUrl 字段，默认官方地址）；
- 每个请求注入 `Authorization: Bearer <jwt>`（从 auth service 取当前 JWT）；
- 响应统一解包 `{code, message, data}`，`code !== 0` 抛 `AihubError(code, message)`；
- **401 拦截**：标记 JWT 失效 → 触发 `AihubAuthService.onTokenExpired()`（清会话 + 清 config 物化 Key + 通知 UI），不自动重试（无 refresh 机制，手册 §7.6.2：401 的统一处理就是重新登录）；
- 超时：任务提交 30s，任务轮询单次 15s，账号/计费 15s。

### 3.2 AihubAuthService（账号会话，独立于模型配置）

| 功能 | 端点 | 说明 |
|---|---|---|
| 注册 | `POST /api/account/register` | body `{email, password}`；注册即自动建个人 workspace + 授权全部模型。**注册/登录是纯账号行为，不要求用户立即启用 ai-hub 模型** |
| 登录 | `POST /api/account/login` | body `{identity, password}`，返回 `{id, token, expires_at}` |
| 持久化 | — | 独立加密会话槽位（见决策一）：Electron 端 SecureStorage 存 `aihub_session`（jwt/expiresAt/email）；Web 端按 userId 存。**不写进 provider_configs** |
| 登出 | 本地 | 清会话槽位 → ai-hub 模型立即不可用；自有 Key 的 provider 不受影响 |
| 401 处理 | — | 清会话 + 清 config 物化 Key → 通知 UI 跳登录面板；重新登录后物化新 JWT，业务层无感 |
| 会话查询 | — | `getSession()` 供设置面板展示当前账号；登录/登出/401 三个时机负责物化 JWT 到 ai-hub config（决策一） |

Electron（单用户）：固定 userId `local-default-user`，一条会话记录。Web（多用户）：**这是现状缺口**——会话按用户存（users 表新增 `aihub_session_encrypted` 列，或 user 级 KV），`getSession()` 从 ALS 取当前 userId 查。同一套代码路径，只是存储键不同。

> 一期简化建议：PC 端先行（单用户单会话）；Web 端按用户存会话列为 P4，避免一次性改动面过大。

**ai-hub provider config 的生命周期**：首次登录成功后自动创建（若不存在）一条 `templateId='ai-hub'` 的 config（baseUrl=官方网关地址、is_enabled=true、models 由首次模型发现填充），同时把 JWT 物化进其 `api_key_encrypted`；此后它与其他 provider config 一样参与列表/启停用/模型管理。登出不删 config（模型清单缓存保留），只清空物化 Key——此后再调用会在前置检查处报"未配置 API 密钥"，由 UI 层把该错误映射为"请重新登录 AI Hub"。用户也可以手动禁用这条 config——即使已登录也不用网关。

### 3.3 AihubModelsService（模型发现）

- `GET /v1/models` → 读 `data[].x-ai-hub`（**不要读顶层 `model_type`，OpenAI 标准没有此字段，手册 §7.6.1 专门警告过**）；
- 映射到现有 `ModelDefinition`：

| `x-ai-hub.model_type` | `ModelDefinition.type` |
|---|---|
| chat | text（capabilities 含 vision → multimodal） |
| image | image |
| video | video |
| audio | audio（TTS/STT，P5 可选扩展，见 §3.10） |
| embedding | embedding |
| music | audio（一期不启用） |

- `capabilities` → `features`；`supports_function_calling` → `supportsTools`；`supports_vision` → 多模态标记；`context_length` → `contextWindow`；`billing_mode` 存入 features 供 UI 估算成本；
- 挂到现有 `provider-config:test` 链路：把 `ProviderTemplateService.testConnection()` 对 ai-hub 模板的分支指向本服务，模型列表自动落库到 config.models——设置界面"从 API 刷新模型列表"零改动可用；
- 缓存 5 分钟，避免每次对话前都拉列表。

### 3.4 LLM 接入（复用 OpenAICompatibleProvider）

- `PROVIDER_TEMPLATES` 新增模板：

```ts
{
  templateId: 'ai-hub',
  name: 'AI Hub（统一网关）',
  category: 'gateway',            // 新类目，或复用 'custom'
  apiConfig: {
    baseUrl: '{BASE}/v1',
    chatEndpoint: '/v1/chat/completions',
    modelsEndpoint: '/v1/models',
    authType: 'bearer',           // JWT 作 Bearer，与现状 apiKey 语义一致
    requestFormat: 'openai',
  },
  capabilities: ['chat', 'image', 'video'],
}
```

- `createProvider` 的 fallback 分支（`providers/llm/index.ts:109-121`）已把未知 templateId 路由到 `OpenAICompatibleProvider`，**LLM 侧工厂零改动**；`buildHeaders`（`base-provider.ts:144`）按模板 `authType/authHeader/authPrefix` 拼鉴权头，apiKey（此处即物化的 JWT）作 Bearer 值天然兼容——实施前需核对 `ApiConfigTemplate` 的 `authType` 枚举实际取值并对齐；
- **LLM 路径的 401 检测**：chat 请求走 OpenAICompatibleProvider 自己发的 HTTP，不经过 AihubClient 的拦截器。方案：在 `OpenAICompatibleProvider` 的错误处理中识别 HTTP 401 且 providerId='ai-hub' 时，调用 `AihubAuthService.onTokenExpired()`（清会话+清物化 Key）再以统一错误抛出——改动是 provider 错误分支里加 3~5 行特判，不改通用逻辑；
- **harness 缓存联动**：agent-runtime 的 `ProviderAdapter` 按 (configId, modelId) 缓存 `LanguageModel` 10 分钟，JWT 轮换后缓存里是旧 token——`onTokenExpired` 和重新登录成功时都要调 `invalidateCache()`（`provider-adapter.ts:149` 已预留事件接入点）；
- 思考开关、function calling、`reasoning_content` 透传：ai-hub 对 OpenAI 兼容渠道做扩展参数透传（手册 §4.9），现有 provider 的 customParams 机制直接支持，无需特判；
- 校验放松点：`provider-config.handler.ts:138` 的 `validateBaseUrl()` 强制 `/v\d+` 结尾，ai-hub 的 `{BASE}/v1` 满足，无需改；但若官方网关地址不是 `/v1` 结尾需在模板里写死正确值。

### 3.5 Image 接入（aihub-image.provider.ts）

实现 `BaseImageProvider` 抽象（`getModels / generateImage / getTaskStatus / testConnection`）：

- `generateImage(request)` → `POST /v1/images/generations`，body `{model, params}`，**params 只用手册 §4.8.3 规范参数**：
  - t2i：`prompt / size / n / negative_prompt / seed / watermark / prompt_enhance`
  - i2i：另加 `image`（本地图先转 `data:image/...;base64` Data URI，或回传此前 ai-hub 结果的 download_url）、`mode / mask_image / strength`
  - 返回 `data[0].id` 作为 taskId，上层轮询框架接管；
- `getTaskStatus(taskId)` → `GET /v1/tasks/{id}`，状态映射：`pending/processing → running`，`completed → success`（结果取 `result.results[].download_url`），`failed/timeout/cancelled → failed`（透传 `error_message`）；
- 能力判定按手册：params 含 `image` 即 i2i，同端点区分，适配器内部判断；
- **能力登记表必须登记**（review 发现的遗漏）：`image.service.ts:172` 生成前调 `getModelCapabilities(providerType, ...)`（`image/model-capabilities.ts:127`），按 providerType+模型名显式匹配、匹配不到**直接抛错**。需在登记表为 `aihub` 增补条目（wanx/seedream 等模型名的 match 规则可复用现有 dashscope/volcengine 条目的模式），否则 ai-hub 生图必挂；
- **默认 provider 白名单必须扩展**（review 发现的遗漏）：`image.service.ts:111-114` 未指定 providerConfigId 时只在 `image-` 前缀或 `['bailian','volcengine','minimax','zhipu','openai']` 中找——需加入 `'ai-hub'`（或等 router 收敛后由模态过滤取代）；
- 在 `providers/image/index.ts` 工厂映射表加 `aihub: (config) => new AihubImageProvider(config)`，并把 `ImageService` 里"按 templateId 猜 provider 类型"的启发式（`image.service.ts:144-165`）加一条 `ai-hub → aihub`。

### 3.6 Video 接入（aihub-video.provider.ts）

实现 `BaseVideoProvider`（`generateVideo / getTaskStatus`）：

- `POST /v1/videos/generations`，规范参数：
  - t2v：`prompt / size / duration / audio_url / camera_fixed / multi_shot` + 公共参数
  - i2v：`image`（首帧，剧集制作的首帧图正是这个）/ `last_image`（尾帧过渡）/ `prompt / duration`；**首帧/尾帧图是本地文件时与 image 节同样处理——转 `data:image/...;base64` Data URI 提交**（前一版漏写）
- 轮询建议按手册：视频 5~15s 间隔、总超时 15 分钟——现有 `VideoGenerationService` 上限约 10 分钟，**需把该上限对 ai-hub 任务放宽到 15 分钟**（或做成 provider 可声明的建议值）；
- 剧集制作链路（`packs/episode-production/handlers/render/video-segment.handler.ts` 的 `adaptBaseVideoProvider`）复用 ai-call 的 `getProviderConfig`，config 是 ai-hub 时工厂路由到本适配器即可，链路无感；
- 计费注意：video 按次计费、提交即预扣——UI 侧在生成按钮上沿用现有确认提示即可，无需新逻辑。

### 3.7 任务轮询：不新建统一服务（与决策三一致）

image/video 适配器内部直接调 `AihubClient` 暴露的 `submitTask/pollTask` 薄封装即可，轮询循环仍由现有 ImageService/VideoGenerationService 驱动（它们调 `provider.getTaskStatus`）。**一期不创建 aihub-task.service.ts**——统一任务服务仅在以下情况单独立项：后续接入 music、或要把全项目轮询收敛到久未启用的 `TaskQueueService` 时。避免过度设计。

### 3.8 计费与充值（AihubBillingService + 设置界面）

| 功能 | 端点 | 客户端形态 |
|---|---|---|
| 查余额 | `GET /api/v1/me/balance` | 设置页"AI Hub 账号"面板显示；**金额是 int64 微积分**，展示 ÷10⁶ 为积分（1 元=10 积分） |
| 兑换码 | `POST /api/v1/me/redeem` | 面板内输入框，按 errcode 给中文提示（70015 不存在/70011 已使用/70012 已过期/70016 达上限…） |
| 充值 | 托管门户 `{WEB_AUTH}/#/recharge?return_url=...` | PC 端 `shell.openExternal` 跳系统浏览器；Web 端新标签页 |
| 钱包/流水 | `{WEB_AUTH}/#/wallet` 或 `GET /api/v1/me/transactions` | 一期跳托管钱包页即可，不自研流水 UI |
| 余额不足 | 402 `Insufficient balance` | 统一错误提示"余额不足，请充值"+ 跳充值入口 |

### 3.9 设置界面改动

`Settings.vue` 的 AI 模型配置区：

1. 新增"AI Hub 账号"卡片（置于提供商列表顶部，**与其他提供商配置相互独立**）：
   - 未登录：显示登录/注册表单 + 说明文案"登录后可使用官方网关模型（免配 Key，按量计费）；也可以不登录，直接在下方配置自己的 API Key"；
   - 已登录：显示邮箱、余额、充值/兑换/登出按钮；
2. 提供商列表中 ai-hub 作为一个 provider config 出现，与自有 Key 的提供商**平级并存**：
   - 已登录且启用：正常参与模型选择，模型管理复用现有对话框（搜索、启停用、能力标签都已有）；
   - 未登录：该条目置灰并标"未登录"，点击引导到上方登录卡片，**其模型不出现在任何模型选择器中**；
   - 已登录但用户手动禁用：与其他被禁用的 provider 行为一致；
3. 模型选择器（聊天页等）无需结构性改动——只加一个过滤：ai-hub config 在无有效会话时视为 disabled。自有 Key 的模型在任何登录态下行为与今天完全一致；
4. 不做"默认提供商"的强制改写：新用户什么都不配时现状不变；引导交给文案，不交给默认逻辑。

### 3.10 Voice 接入（P5 可选扩展，2026-09-06 新增；2026-09-14 补 §4.12 音色管理）

ai-hub §4.10/§4.12 提供音频端点，与本项目语音体系的能力对照：

| 能力 | ai-hub | the-bot 现状 | 结论 |
|---|---|---|---|
| TTS | `POST /v1/audio/speech`（model/input/voice/format/speed/stream，≤4096 字符，按字符计费，支持 chunked 流式） | DashScope TTS / CosyVoice | **可接入**，作为第二 TTS 来源 |
| STT | `POST /v1/audio/transcriptions`（multipart ≤25MB，按秒计费，响应直通上游） | DashScope STT | **可接入** |
| 语音翻译 | `/v1/audio/translations`（固定译向英文） | 无此功能 | 可选新增能力 |
| 声音复刻 | ✅ `POST /v1/audio/voices/clone`（阿里+火山渠道，按次计费） | DashScope 复刻 + VoiceCloneJobScheduler | **可接入**（经网关，见下） |
| 声音设计 | ✅ `POST /v1/audio/voices/design`（**仅阿里渠道**，按次计费） | DashScope voice-design | **可接入**（经网关，仅阿里渠道） |

**音色管理接口要点**（手册 §4.12，2026-09 新增）：

- 五个端点：clone / design / `GET /v1/audio/voices?model=`（list）/ `GET /v1/audio/voices/{id}?model=`（状态·详情）/ `DELETE /v1/audio/voices/{id}?model=`。clone·design 按次计费（per_request），list/get/delete 免费；`model` query 参数必填（决定代理的上游渠道）；
- 统一响应 `VoiceResult`：`{voice_id, status, kind(clone/design), provider, name, demo_audio/preview_audio, meta}`；状态轮询走 GET（替代现有直连的 `query_voice`）；
- **租户隔离**：音色归属以 ai-hub 本地 `voice_assets` 表为源、按 workspace 隔离，list 只出本 workspace，越权 get/delete 返回 404；
- **复刻音频输入简化为 base64**：`audio` 字段接受 data URI 或纯 base64（≤10MB，超出 413）——**不再需要现有直连实现里的 OSS 上传环节**（`dashscope-oss-uploader` 的 oss:// URL + `X-DashScope-OssResourceResolve` 头可以绕过）；
- **渠道差异**：design 仅阿里渠道（火山 400/errcode 30017）；火山渠道 delete 不支持；`target_model` 仅阿里必传（复刻如 `qwen3-tts-vc-2026-01-22`、设计如 `qwen3-tts-vd-2026-01-26`）；**火山克隆的音色无法经网关合成**（网关不透传火山自定义音色的 speech）——因此本项目经网关只用**阿里渠道**的复刻/设计，火山渠道无实际价值；
- **音色用于 TTS**：voice_id 直接填 `/v1/audio/speech` 的 `voice` 字段，音色与 TTS 模型须同渠道。

**对本项目的影响与决策**：

1. **走网关可简化现有实现**：复刻的"上传 OSS → 轮询训练"（VoiceCloneJobScheduler）可改为"base64 提交 → GET 轮询 VoiceResult.status"，链路明显变短；且复刻→设计→TTS 配音全链路只依赖 ai-hub 会话，用户无需自配 DashScope Key——对分发版是体验闭环（捏音色→配音全在网关内完成）；
2. **存量音色不迁移**：用户此前经直连 DashScope 创建的复刻/设计音色归属在厂商账号下，**不会出现在网关的 workspace 音色列表里**——两条路径的音色互相不可见，UI 需明确区分"网关音色"与"直连音色"（或仅对网关路径开放新建，存量直连音色只读保留）；
3. **target_model 待对齐**：现有直连实现默认 `cosyvoice-v3.5-plus`（`dashscope-voice-clone-provider.ts:112`），网关示例是 `qwen3-tts-vc-*`/`qwen3-tts-vd-*` 系列——实施前需与 ai-hub 运营确认渠道可用的 target_model 清单及与合成模型的配套关系；
4. **前置条件（平台侧）**：ai-hub 管理端须注册音色伪模型（阿里 `qwen-voice-enrollment`/`qwen-voice-design`，`model_type=audio`、`billing_mode=per_request`）并绑定渠道，否则端点不可用；
5. **建议**：复刻/设计与 TTS/STT 一起纳入 P5 语音扩展，走 ai-hub 阿里渠道；存量 DashScope 直连路径保留不动，用户自配 Key 时仍可用。

接入约束（实施前必须知晓）：

1. **TTS/STT 渠道限定 OpenAI 协议渠道与阿里百炼渠道**（手册 §4.10：openai/azure/custom/deepseek 等映射到 openai provider 的类型 + aliyun；Claude/Gemini 渠道返回 400）——经网关的复刻/设计音色只能用阿里渠道合成（见上方渠道差异）；`voice` 参数合法集由上游厂商决定、网关不做白名单，客户端声线列表需按模型/渠道动态获取或让用户填；
2. **同步请求-响应**，不是任务模型——不走 §4.8 的提交/轮询，适配器比 image/video 简单（一次 POST 拿音频二进制，STT 是 multipart）；
3. **前置依赖**：`VoiceService`（`platform/services/voice.service.ts:105`）目前硬编码遍历配置并只认 DashScope 系，没有 voice 工厂。接入 ai-hub 语音需先做一个小型 voice 工厂（或等 router 收敛时把 voice 纳入 modality），再实现 `AihubVoiceProvider extends BaseVoiceProvider`；
4. 错误码 30008~30015（文件超限/voice 非法/input 超 4096/渠道不支持等）需映射为中文提示；
5. TTS input 上限 4096 字符——长文本配音（如剧集旁白）需按句/段切分多次调用，注意切分处语气连贯；现有 DashScope TTS 是否有同样限制需对比确认。

**建议定位**：P5 可选扩展，排在 P1~P4 之后。理由：语音不是 ai-hub 集成的核心价值（对话/生图/生视频才是），且现有 DashScope 语音链路工作正常；其价值在于"用户零配置 Key 即可用 TTS/STT/复刻/设计"，对分发版体验有提升。

---

## 4. 分阶段实施计划

> **前置依赖（2026-09-06 修订）**：本方案 P1 依赖 ProviderRouter 统一收敛（`docs/design/2026-09-06-provider-router-unification-plan.md`）的 P0/P1——决策一的物化机制保证收敛未完成时也能工作，但 401 统一检测、`AIHUB_NOT_LOGGED_IN` 语义等终态行为以 router 落地为准。两工作可在同一分支先后提交。

| 阶段 | 内容 | 涉及模块 | 预估工作量 |
|---|---|---|---|
| P1 最小可用 | aihub 模板 + auth service（PC 单用户，含 JWT 物化）+ LLM 透传（含 401 特判、harness 缓存失效联动）+ 模型发现 + 登录面板 | platform/aihub、provider-template、Settings、openai-compatible-provider | 2~3 天 |
| P2 生成类 | aihub-image / aihub-video 适配器 + 工厂注册 + **能力登记表条目 + 默认白名单扩展** + 视频轮询超时放宽 | providers/image、providers/video、model-capabilities、image.service、video-generation.service | 2~3 天 |
| P3 计费闭环 | 余额/兑换码/充值跳转 + 402 处理 | aihub-billing、Settings | 1~2 天 |
| P4 完善 | Web 端按用户会话绑定、music 能力、登出/账号切换、E2E 测试 | web/server、全链路 | 2~3 天 |
| P5 语音（可选） | voice 小型工厂 + AihubVoiceProvider（TTS/STT/翻译）+ 音色管理（clone/design/list/get/delete，阿里渠道）+ 声线列表 UI + 错误码映射 | providers/voice、voice.service、Settings | 3~4 天 |

每阶段验收：
- P1：登录后聊天页可选 ai-hub 模型对话（含流式）、模型列表可从网关刷新；**未登录时自有 Key 的对话/生成全部功能与现状一致（回归测试）**；
- P2：图片生成（t2i+i2i）、剧集制作视频片段（t2v+i2v 首帧）全流程跑通，结果正确落库到资产；自有 Key 的 dashscope/火山生成链路回归通过；
- P3：余额显示正确、兑换码到账、402 提示可跳转；
- P4：Web 端两用户各自登录各自扣费互不串，且未登录用户用自有 Key 不受影响；
- P5：经网关完成 复刻（base64 提交→轮询就绪→TTS 使用）、设计（阿里渠道）、STT 各一次全链路；存量 DashScope 直连音色与网关音色在 UI 上明确区分、互不可见不混淆。

---

## 5. 风险与开放问题

1. **ai-hub 部署地址与可用模型清单待确认**——方案假设 `{BASE}/v1` OpenAI 兼容端点可用；实施前先按手册 §12 联调清单跑通 `GET /v1/models` 和一次 chat 调用。
2. **Web 端多用户会话绑定是现状缺口**：ai-hub 会话需按用户存（users 表加列或 user 级 KV），涉及数据库 migration，两端（SQLite/PG）都要做，放 P4。
3. **JWT 7 天过期体验**：用户一周后需重新登录。可在过期前 24h 在 UI 提示，或向 ai-hub 提"记住我/长时效 token"需求——一期按 401 重登录处理。
4. **download_url 3600s 过期**：现有轮询完成即下载的链路满足；但若用户中途关应用，重启后任务已 completed 而 URL 已过期——需要在重启恢复逻辑里检查 `expires_at`，过期则标记失败提示重新生成（现有图片/视频服务有没有 boot-resume 轮询需确认，voice-clone 有，image/video 疑似没有，这是个存量问题，不阻塞集成）。
5. **music/embedding/rerank 能力**：手册有端点但本项目无对应业务，一期不接；**语音（TTS/STT/翻译）与音色管理（复刻/设计）ai-hub 均已支持**（§4.10/§4.12），统一作为 P5 可选扩展（详见 §3.10——复刻/设计经网关仅走阿里渠道，存量直连音色与网关音色互相不可见）。
6. **双模型来源并存的回归风险**：ai-hub 只是新增一路 provider，但 `getProviderConfig()`（及收敛后的 ProviderRouter）是全部业务的公共解析函数，JWT 物化/注入的特判必须严格限定 `templateId='ai-hub'`，任何情况下不得改变其他 provider 的解析结果——这是 P1 验收里"自有 Key 全功能回归"存在的原因。
7. **模型选择器的"不可用模型"语义**：ai-hub 模型在未登录/登出后应从选择器消失或置灰；若某业务（如剧集制作的某个环节）已绑定了 ai-hub 模型，登出后要给"该模型不可用，请重新登录或更换模型"的明确提示，而不是静默失败（登出后物化 Key 被清空，底层会报"未配置 API 密钥"，UI 需把这错误映射成登录引导）。
8. **Web 端"账号套账号"的 UX 开放问题**（review 补充）：Web 端已有自己的 users/JWT 登录体系（`/api/auth/login`），叠加 ai-hub 账号后用户要登录两次、且两个账号无映射关系。可选方向：a) 保持双账号独立（现状方案，Web 端用户在设置里自行登录 ai-hub）；b) 把 the-bot Web 端账号与 ai-hub 账号做绑定/映射（需要账号关联设计，工作量大）；c) 长期看若 ai-hub 是同一产品体系的账号中心，可考虑让 the-bot Web 端直接以 ai-hub 为 IdP（OIDC 反过来用）。**一期选 a，b/c 留作产品决策，不在本方案内。**

---

## 6. 不做清单（明确排除，防范围蔓延）

- **不强制登录、不改写默认提供商**——自有 Key 路径是全功能一等公民，ai-hub 只是可选的第二个模型来源；
- 不做 HMAC 签名客户端（客户端禁用，§7.1）；
- 不做 OAuth2 PKCE 流程（第一方客户端用 account session，§7.6.2 明确建议弃用 PKCE）；
- 不做用户同步（`users/sync`）、X-User-Key——那是服务端集成的用户级计费，account session 天然用户级；
- 不做自研充值/流水 UI（用托管门户）；
- 不动现有五类 provider 的任何厂商实现；
- 声音复刻/设计的**存量直连路径**不动（DashScope 直连保留）；经 ai-hub 网关的复刻/设计纳入 P5 可选项（仅阿里渠道），非一期范围。
