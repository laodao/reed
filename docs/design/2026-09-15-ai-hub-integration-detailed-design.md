# ai-hub 集成详细设计（逐模块影响评估版）

> 日期：2026-09-15
> 前置文档：`docs/design/2026-09-06-ai-hub-integration-plan.md`（集成方案，下称"方案 A"）、`docs/design/2026-09-06-provider-router-unification-plan.md`（ProviderRouter 收敛方案，下称"方案 R"）
> 本文在方案 A/R 基础上，对**每一个受影响模块逐文件读码核实**后形成详细设计：确认方案 A 哪些结论成立、哪些要修正，并补齐方案 A 未覆盖的影响面。行号以当前 feat/story-room 分支代码为准。
> 本文只出设计，不动手实现。

---

## 0. 结论速览

方案 A 的总体架构（account session 直连、JWT 物化写入 config、LLM 复用 OpenAICompatibleProvider、image/video 写任务适配器）**全部经代码核实成立**。但逐模块评估发现 **8 个方案 A 未覆盖或判断有误的问题**，其中 3 个不修会让集成直接挂掉：

| # | 问题 | 严重度 | 出处 |
|---|---|---|---|
| N1 | 图像 skipHistory × 异步任务的结构性缺口：人像制作 10 处调用、EP 资产派生在 ai-hub（全异步）下必挂 | **阻断** | §2.4.2 |
| N2 | `video-segment.handler.ts:81` 的 provider 列表按 `VIDEO_PROVIDER_DEFINITIONS[templateId]` 过滤，ai-hub 会在项目设置视频模型列表里**静默消失** | **阻断** | §2.5.2 |
| N3 | 渲染端模型选择器 11 处调用点只过滤 `isEnabled`，登出后 ai-hub 模型照常列出、发送时才报错——**已由决策五（登出即禁用）主解，runtimeUsable 兜底** | 高 | §2.1.3 / §2.2.1 |
| N4 | 方案 R 的盘点表有误：longwriting-ai.service / translation.service / lw-entity-detection 实际**不走** ai-call，都是自复制解析（第 5~7 份复制） | 高（方案 R 修正） | §2.7 |
| N5 | `ProviderAdapter.invalidateCache()` 接线两头都断：主进程无人监听 `provider-config:changed`，缓存清理从不发生 | 高 | §2.1.2 |
| N6 | Web 端 `provider_configs` **没有 user_id 列**，全用户共享一套配置——JWT 物化在 Web 端会把用户 A 的 token 发给用户 B 用 | 高（P4 前置） | §2.1.4 |
| N7 | 聊天错误 UI 映射层不存在：`streamState.error` 全渲染端无组件渲染，发送失败只弹通用 toast——`AIHUB_NOT_LOGGED_IN` 引导是**新建能力**不是"改映射" | 中 | §2.3.3 |
| N8 | `updateTestResult` 不落 models——"从 API 刷新"得到的模型清单不会入库，ai-hub 的模型发现结果需由登录流程直接写库 | 中 | §2.2.3 |

另有方案 A 的 3 处行号/事实漂移（chat.service.ts apiKey 检查实为 :91 非 :85；invalidateCache 实为 :163 非 :149；视频轮询上限已是 30~75 分钟，方案 A §3.6"约 10 分钟需放宽"过时），见各模块章节。

---

## 1. 集成总览（承接方案 A，不再展开论证）

- **接入模式**：account session 直连（第一方客户端），`POST /api/account/login` 拿 JWT（7 天）。
- **账号与模型来源解耦**：自有 Key 是一等公民，不登录全功能可用；ai-hub 是可选的第二模型来源。
- **核心机制（决策一）**：登录态存独立加密会话槽位（真源）；登录成功时把 JWT 经 SecureStorage 加密物化写入 ai-hub provider config 的 `api_key_encrypted`；登出/401 清空。现有全部调用链（含各处的 apiKey 前置检查、decrypt）零改动通过。
- **核心机制（决策五，2026-09-15 新增）**：登出/401 时把 ai-hub config 的 `is_enabled` 置为 **false**；重新登录成功后置回 true（保留用户手动禁用偏好，见 §2.2.1 状态机）。这样 11 处模型选择器现有的 `isEnabled` 过滤**零改动天然生效**，§2.1.3 的 runtimeUsable 降级为兜底防线。
- **LLM**：复用 `OpenAICompatibleProvider`（工厂 fallback 分支，`providers/llm/index.ts:115-127`），零改动。
- **image/video**：新增 AihubImageProvider / AihubVideoProvider，走 ai-hub 统一任务 API（提交→轮询→下载转存）。
- **voice**：P5 可选扩展（TTS/STT/复刻/设计，仅阿里渠道）。
- **与方案 R 的关系**：物化机制保证 router 收敛未完成时也能工作；router 是终态。两者同一分支先后提交，router P0 先行。

---

## 2. 逐模块影响评估与详细设计

### 2.1 公共基础设施（ai-call / ProviderAdapter / SecureStorage / Web 多用户）

#### 2.1.1 ai-call 现状与 router 落地

`src/core/platform/services/ai-call.ts`（610 行）：
- `getProviderConfig()` :41-85——默认链"指定 ID → getDefault() → getEnabled()[0]"，:67 apiKey 空值挡板，:78-82 decrypt。**无 modality、无用户维度、无注入钩子**。
- modelId fallback 链**同文件内已复制 3 份**（callAI :131-135、callVLM :221-225、callAIStream :509-514）。

ai-hub 接入对 ai-call 本体的要求：**本期零改动**。物化机制下 `getProviderConfig` 对 ai-hub config 的解析与任何普通 provider 一致。router 化（方案 R P0）是并行工作，不阻塞 P1。

#### 2.1.2 ProviderAdapter 缓存失效接线（新发现 N5）

来龙去脉：harness 的 `ProviderAdapter`（`agent-runtime/provider/provider-adapter.ts`）按 `(configId, modelId)` 缓存 `LanguageModel` 对象 10 分钟（:79-80），缓存键里不含凭证——构造时把解密后的 apiKey 烘进了 SDK client。JWT 轮换（重新登录/401 后重登）后，缓存里的旧 token 模型对象还能"工作"到 TTL 结束，期间全部 401。

方案 A 假设 `invalidateCache()`（实为 :163-165）有现成事件接入点，核实结果是**两头都断**：
- `provider-config:changed` 事件由 `provider-config.handler.ts:27-33` 广播，但主进程没有任何监听者去清缓存，渲染端也没人订阅；
- grep 全仓 `invalidateCache(` 只命中定义处。

设计：在主进程装配处新增一个轻量订阅——
- 位置：`platform/workflow/workflow-boot.ts:327`（ProviderAdapter 模块级单例创建处）附近，或新建 `platform/services/provider-cache-invalidator.ts` 在 boot 时调用；
- 监听三个时机：① `provider-config:changed`（任何 config 增删改）；② ai-hub 登录/重新登录成功；③ ai-hub 401（onTokenExpired）。三个时机都调 `providerAdapter.invalidateCache()`；
- 成本：~20 行 + 单测。**列入 P1**（不接线则 Agent 模式下 JWT 轮换后有 10 分钟诡异 401 窗口）。

#### 2.1.3 渲染端模型选择器的"未登录不可用"语义（新发现 N3）

来龙去脉：渲染端**没有跨页面共享的 provider/model store**——11 处调用点各自 `window.electronAPI.providerConfig.list()` + 本地 ref（Settings.vue:1033、ChatHeader.vue:294、ChatMain.vue:107、useChat.ts:194、StoryEditor.vue:343、StoryRoom.vue:347、EpisodeWorkbench.vue:551、NodeConfigPanel.vue:106、RunInputForm.vue:356,500、AgentConsoleView.vue:646、ProjectSettingsDialog.vue:487），且过滤条件清一色只有 `c.isEnabled`（ChatHeader.vue:296 等）。`provider-config:list` 把 apiKey 掩码为 `'******'`（handler :82），**渲染端无法区分"有 Key"和"空 Key"**——登出后物化 Key 被清空，ai-hub 的模型照样列在选择器里，用户选了发送，才在 chat.service.ts:91 撞"未配置 API 密钥"。

设计（双层，第一层随决策五落地）：
- **第一层（主机制，决策五）**：登出/401 时主进程把 ai-hub config 的 `is_enabled` 置 false——11 处调用点现有的 `c.isEnabled` 过滤**零改动**即可让 ai-hub 模型从全部选择器消失；重新登录成功后置回 true。状态机详见 §2.2.1；
- **第二层（兜底防线）**：`provider-config:list/get` 的主进程响应里为每条 config 增加计算字段 `runtimeUsable: boolean`——`isEnabled && (templateId !== 'ai-hub' || aihubAuthService.hasValidSession())`，覆盖"会话过期但还没撞 401、config 仍是 enabled"的中间窗口；11 处调用点的过滤从 `c.isEnabled` 改为 `c.runtimeUsable ?? c.isEnabled`（机械替换，行为对其他 provider 零变化）；
- 设置页提供商列表例外：ai-hub config 始终显示（要让人看见它去登录），禁用状态下显示"未登录"徽标 + 点击引导到 AI Hub 登录面板（Settings.vue:98-149 加 `templateId==='ai-hub' && !session` 特判）；
- 已绑定 ai-hub 模型的存量业务（如某剧集环节已选 ai-hub 视频模型）：登出后发送时报错文案由错误映射层（§2.3.3）转成"该模型不可用，请重新登录 AI Hub 或更换模型"。

#### 2.1.4 Web 端多用户缺口（新发现 N6，P4 前置）

来龙去脉（三层缺口叠加）：
1. `provider_configs` 表**没有 user_id 列**（entity 全 75 行无 userId），repository 用 `useRawRepo()` 不过滤——Web 端所有用户共享同一套 provider 配置（含各家 apiKey，这是存量现状）；
2. 没有任何"按用户加密会话槽位"：users 表无 `aihub_session_encrypted` 列，无 user 级 KV 表；WebSecureStorage 是服务器级单 master key，能加密但没地方按用户寻址；
3. `getProviderConfig` 不感知 ALS userId，即使有了存储也无处注入。

**物化机制与多租户的根本冲突**：P1 的"JWT 物化进 api_key_encrypted"在 PC 单用户下成立；在 Web 端等于把"当前登录者的 ai-hub token"写进全用户共享的 config——用户 A 登录后，用户 B 的调用会带着 A 的 token 扣 A 的余额。所以 **Web 端开放 ai-hub 之前必须先解这个问题**，方案 A 把 Web 放 P4 是对的，但 P4 的内容要扩写为：
- ① users 表加 `aihub_session_encrypted` 列（或 user 级 KV 表），SQLite/PG 双端迁移；
- ② `provider_configs` 加 `user_id` 列——这不只是 ai-hub 的事，现状共享 apiKey 本身就是多租户债；P4 至少要把 ai-hub config 隔离成按用户（`templateId='ai-hub'` 的行按 ALS userId 过滤/填充，走 base-repository scoped API），其他 provider 行是否一起隔离是产品决策（建议一起，但工作量翻倍，可拆 P4a/P4b）；
- ③ 会话读取/物化键全部走 ALS userId（`user-context.ts:46`）；
- ④ 物化写入改成"按用户写自己那条 ai-hub config"。
- PC 端（P1~P3、P5）完全不受此影响。

#### 2.1.5 SecureStorage 没有"槽位"概念——会话存储设计

来龙去脉：`storage.interface.ts:11-40` 只有 `encrypt/decrypt/isInitialized` 三个方法，没有 KV 槽位。方案 A 说"SecureStorage 落 `aihub_session`"，实际没有现成载体。

设计（PC 端 P1）：
- 会话对象 `{jwt, expiresAt, email}` JSON 序列化 → `secureStorage.encrypt()` → 密文存 **settings KV 表**（若现有 settings 表有通用 KV 结构则用之，键 `aihub_session`；否则落 `<userData>/aihub-session.enc` 文件）。实施时先查 settings 表结构再定，两选一，均为 ~30 行；
- Web 端（P4）：密文写 users 表新列，按 ALS userId 寻址。

#### 2.1.6 embedding / rerank 链路（本期不接，记录在案）

`knowledge-base.service.ts:915-964`（embedding）与 :1204-1255（rerank）是**裸 fetch + templateId switch**（bailian/dashscope/zhipu/default），完全绕开 provider 工厂和 ai-call。ai-hub 若提供 embedding/rerank，这两条链路需要单独加分支——本期 ai-hub 不接 embedding（知识库文档解析保持现有 provider），列入"不做清单"，router 终态时把 embedding 纳入 modality 再处理。

---

### 2.2 设置与提供商配置体系

#### 2.2.1 模板与 config（方案 A §3.4 成立，补充细节）

- 新增模板位置：`provider-template.service.ts:57`（PROVIDER_TEMPLATES），照 `bailian-token-plan`（:246-275）范式：
  - `id:'ai-hub'`、`category:'openai-compatible'`（**不要**设 anthropic/google，否则被 `providers/llm/index.ts:80-87` 截走）、`capabilities:['chat','image']`、`allowCustomModels:true`；
  - `apiConfig.baseUrl` 必须含版本段（如 `https://{BASE}/v1`）——`validateBaseUrl`（provider-config.handler.ts:147-159）强制 `/v\d+` 结尾或等于模板缺省端点；模板默认值写对，用户留空即放行；
  - `authType:'bearer'`、`authHeader:'Authorization'`、`authPrefix:'Bearer '`、`chatEndpoint:'/chat/completions'`、`modelsEndpoint:'/models'`（base-provider.ts:207-215 的 joinUrl 会对双侧版本段去重，`/v1` 写哪边都正确）；
  - `usageNotes` 填登录/计费说明（数据驱动，UI 零改动）。
- **llm 工厂零改动成立**（fallback :115-127）。可选增强：把 `'ai-hub'` 加进 `OPENAI_COMPATIBLE_CONFIGS`（:27-39）改走 OpenAISdkProvider（结构化错误 :112-114，便于 401 检测）——倾向**不加**，保持与方案 A 一致走 OpenAICompatibleProvider，401 特判集中在一处（§2.3.2）。
- `provider_configs` 表零迁移：JWT 物化复用 `api_key_encrypted` 列。
- 物化写入必须走**主进程直接写库**（repo 层 encrypt+update），不能经渲染端表单往返——update 链路有 `'******'` 掩码哨兵（handler :293-321），渲染端提交的掩码会被当"保留原值"跳过。

**ai-hub config 启用状态机（决策五，2026-09-15 新增）**：

| 时机 | 动作 |
|---|---|
| 首次登录成功 | 自动创建 config（is_enabled=**true**），物化 JWT，拉模型落库 |
| 登出 | 清会话 + 清物化 Key + **is_enabled=false** + 记录 `autoDisabled=true` 标记（存会话槽位或 config customParams）+ 广播 `provider-config:changed` + `aihub:session-changed` |
| 401（onTokenExpired） | 同登出（标记 `autoDisabled=true`） |
| 重新登录成功 | 物化新 JWT + 刷新模型；**仅当 `autoDisabled=true` 时**置 is_enabled=true 并清标记——用户登录期间手动禁用的（`autoDisabled=false`）保持禁用，尊重用户偏好 |
| 用户手动切启用开关 | 正常生效，同时清 `autoDisabled` 标记（此后视为用户显式选择） |

语义要点：登出禁用解决"登出后模型仍在选择器里"（N3 的主机制）；`autoDisabled` 标记区分"系统因登出禁用"与"用户主动禁用"，避免重新登录把用户的手动设置冲掉。is_enabled 变化会走现有 `provider-config:changed` 广播（handler :27-33），渲染端各选择器订阅后自动刷新——当前渲染端无人订阅该事件（§2.1.2 核实），P1 需在 11 处调用点中的主要选择器（ChatHeader/ChatMain/EpisodeWorkbench 等）补上订阅，或随错误映射层一起做统一刷新。

#### 2.2.2 设置界面

- 新增 `src/renderer/src/components/settings/AihubSettings.vue`（仿 EmailSettings 独立 tab 组件模式，**不**继续往 2400 行的 Settings.vue 里塞）：登录/注册表单、已登录展示（邮箱/余额）、充值跳转（`shell.openExternal` 托管门户）、兑换码输入、登出；
- Settings.vue 加 `<el-tab-pane label="AI Hub 账号">` + import；
- `AddProviderDialog.vue:118-130`：ai-hub 模板下隐藏 API 密钥输入框（密钥由登录注入，手填无意义），并将"未登录"状态引导到 AI Hub tab；
- 新建 ai-hub config 的时机：**不由用户手动点"添加提供商"**，而是首次登录成功后主进程自动创建（避免用户手填 baseUrl 出错）。模板选择卡片栅格（AddProviderDialog :11-43）里 ai-hub 不出现或出现但点击后引导登录——倾向后者：卡片作入口，点击跳 AI Hub 登录面板。

#### 2.2.3 模型发现落库（新发现 N8）

来龙去脉：`provider-config:test` 链路（handler :389-480 → provider-template.service.ts:655-757）测连后调 `updateTestResult`，但 repo 该方法（:211-223）**只写 lastTested/testResult，不落 models**——handler 传的 models 实参被忽略。config.models 唯一的持久化途径是用户在对话框里保存 `form.models`。

影响：ai-hub 的模型发现（`GET /v1/models` → 映射 ModelDefinition）若复用 testConnection，模型清单不会自动入库，ai-hub config 的 models 永远是空——下游全部依赖 config.models 的逻辑（选择器、`deriveCapabilitiesFromModel`、`ep:list-video-providers` 的 ready 判定）都会瞎。

设计：登录/重新登录成功后，主进程流程为 `登录 → 拉 /v1/models → 映射（读 data[].x-ai-hub，不读顶层 model_type，手册 §7.6.1 警告过）→ repo 直接写 config.models → 物化 JWT`。"从 API 刷新"按钮链路对 ai-hub 改为走专用 IPC（`aihub:refresh-models`，主进程直写库），不走 testConnection。映射表（方案 A §3.3）不变：chat→text、image→image、video→video、audio→audio（P5）、embedding→embedding（不启用）、music→audio（不启用）。

#### 2.2.4 preload / IPC / Web 通道登记清单

新增 `aihub.*` IPC（P1~P4 逐步到位）：

| 通道 | 阶段 | 说明 |
|---|---|---|
| `aihub:login` / `aihub:register` / `aihub:logout` | P1 | 账号行为 |
| `aihub:session` | P1 | 查当前登录态（email/expiresAt），渲染端启动与各选择器用 |
| `aihub:refresh-models` | P1 | 主进程直写 config.models |
| `aihub:balance` / `aihub:redeem` / `aihub:recharge-url` | P3 | 计费 |
| 事件 `aihub:session-changed` | P1 | 登录/登出/401 广播，渲染端据此刷新选择器与设置面板 |

登记点（5 处，漏任一处该端即哑）：
1. `src/preload/index.ts`——IPC_CHANNELS 常量 + `electronAPI.aihub` 命名空间（事件订阅仿 onChanged :503-507）；
2. 新 handler 文件（建议放 `src/core/platform/aihub/aihub.handler.ts`，用 ipcBridge.handle 跨平台桥）；
3. `src/electron/index.ts:392` 附近调 register；
4. `src/web/server/api/register-channels.ts:32-65` 调同一 register；
5. `src/web/client/channel-map.ts` 加契约条目（或跑 `scripts/gen-channel-map`）。

---

### 2.3 聊天 / LLM 链路

#### 2.3.1 解析与调用（方案 A 成立，行号修正）

`chat.service.ts` 解析逻辑实测：前端传值优先 :63-64、getById :70-72、getDefault :75-77、getEnabled[0] :80-85、**apiKey 前置检查 :91-94**（方案 A 写 :85，已漂移）、decrypt :96-106、模板查找 :109-113、createProvider :123-132。物化机制下全链零改动。

LLM 其他消费点核实：聊天链**无 AI 标题生成**（标题截首条消息前 20 字，Chat.vue:162-164）、**无压缩摘要**（只截最近 N 条）——方案 A 无需为这两处设计；思考开关对 OpenAICompatibleProvider 本就无作用（reasoning_content 无条件解析 :430-437），ai-hub 模型落库时 `supportsThinking` 标对即可；function calling 只在 Agent 模式（走 harness，见 §2.1.2）。

#### 2.3.2 LLM 路径 401 检测（方案 A 成立，落点明确）

chat 请求不经过 AihubClient，status code 只在 OpenAICompatibleProvider 三处以局部变量存在，随后被压平进 error message：
- `chatStream` :370-373（抛 `API 请求失败: ${status} - ...`）；
- `chatSync` :493-499（返回 success:false，不抛）；
- `getModels` :59-61。

设计：在这三处非 2xx 分支前加统一判定 `status === 401 && this.providerId === 'ai-hub'`（providerId 需在 createProvider fallback :115-127 构造时传入实例——目前 fallback 传了 name/template，需确认 providerId 字段是否已在构造参数里；若无，加字段 ~5 行）→ 调 `AihubAuthService.onTokenExpired()`（清会话+清物化 Key+广播 `aihub:session-changed`）→ 以统一错误 `AIHUB_SESSION_EXPIRED` 上抛。特判严格限定 providerId，其他 provider 零行为变化。改动量：3 处 × ~5 行。

#### 2.3.3 错误到 UI 的映射（新发现 N7：是新建不是修改）

来龙去脉：现状聊天错误根本到不了用户视野——
- 流事件 `error` 存进 `dialog.ts:553-560` 的 `streamState.error`，但**全渲染端没有任何组件渲染这个字段**；
- `chat:send` 返回 `{success:false}` 后，Chat.vue:158-160 只弹通用 `ElMessage.error('发送消息失败')`，真实错误文本（"未配置 API 密钥"等）只在 console；
- 例外：Agent 模式错误会写进消息正文（system-agent.service.ts:276,284）。

影响：ai-hub 的核心交互（未登录引导、401 重新登录、402 余额不足）如果只在 error.message 里写字，用户看到的永远是一句"发送消息失败"。这不是 ai-hub 引入的回归，是存量缺口，但 ai-hub 让它从"难看"变成"功能缺失"。

设计（P1 一并做，小工作量）：
1. 定义错误码约定：ai-hub 相关错误 message 前缀 `[AIHUB_NOT_LOGGED_IN]` / `[AIHUB_SESSION_EXPIRED]` / `[AIHUB_INSUFFICIENT_BALANCE]`（主进程抛出处统一加前缀，兼容现有字符串通道，不动 IPC 协议）；
2. `dialog.ts` store 层（:374-386 与 :553-560 两处）拦截前缀码 → 写入 `streamState.error` 的同时置 `lastErrorCode`；
3. ChatMain/MessageList 渲染 `streamState.error`（现状缺位，补上），含错误码对应的操作按钮（"去登录"→ 跳设置 AI Hub tab；"去充值"→ 开托管门户）；
4. Chat.vue:158-160 的通用 toast 改为显示真实 error 文本（顺带修了存量问题）。
图像/视频/语音链路的错误展示通道各自存在（useImage.ts:379 直接显示 response.error、VideoSegmentPanel error-banner），同样按前缀码映射即可，不用新建。

---

### 2.4 图像生成链路

#### 2.4.1 现状链路与方案 A 成立项

`image.service.ts`（1240 行）：解析 :98-207（白名单 :111-114、Key 启发式 :156-174、能力门槛 :179-188）；轮询 :379-474（setInterval 5s×60≈5 分钟）；下载存盘 :484-574（天然支持 http URL 与 base64，download_url 拿来即下）；落库 `image_records` 表；无缩略图机制；**无 boot-resume**（重启后 pending 记录永久悬挂——存量问题，ai-hub 的 download_url 3600s 过期放大了它，但不阻塞集成）。

方案 A 要求的改动核实后清单：
1. 新增 `providers/image/aihub-image.provider.ts`（实现 BaseImageProvider）；
2. `shared/types/image-provider.types.ts:158` `ImageProviderType` 联合加 `'aihub'`；
3. `providers/image/index.ts:41-52` 工厂映射 + :57-105 `IMAGE_PROVIDER_DEFINITIONS`（requiresApiKey: true）；
4. `model-capabilities.ts:46-133` 登记 aihub 条目（不登记则 :179-188 能力门槛显式抛错，ai-hub 生图全挂——方案 A 已点名，确认成立）；
5. `image.service.ts:111-114` 默认白名单加 `'ai-hub'`（确认必要：渲染端 useImage.ts:360 传的是 `providerId` 而非 `providerConfigId`，实际总走默认白名单路径）；
6. `image.service.ts:153` templateId→providerType 映射加 `'ai-hub'→'aihub'`（仿 :156-174 特判）；`:1040-1058` 与 `:996-1000` 两处白名单同样补 `'ai-hub'`。

#### 2.4.2 skipHistory × 异步任务的结构性缺口（新发现 N1，阻断级）

来龙去脉：`image.service.ts` 的 `skipHistory: true` 分支**只在同步返回 `images[]` 时生效**（:244-269，saveImagesWithoutHistory 不写 image_records）。异步分支（:320-364）强制写 `image_records` 且返回的 images 是 pending 记录（`filePath:''`）。

谁依赖 skipHistory：**人像制作 `portrait.service.ts` 10 处调用**（:293/432/797/940/1003/1129/1190/1374/1504），以及 **EP 资产派生 `image-provider-adapter.ts:160-184`**（gallery 派生 + 全景，且 `img.filePath || img.url` 取空即抛"未返回可用路径"）。这些调用方目前实际选中的多是同步 provider（volcengine/openai/dashscope 多模态），所以坑一直没爆；dashscope-kling/bailian 异步路径本就有同样问题。ai-hub 图像**只有异步任务模型**——它一上线，人像制作和 EP 资产派生走 ai-hub 时必挂：要么抛"未返回可用路径"，要么返回空 filePath 的 pending 记录，还污染图像历史。

设计（两选一，推荐 A）：
- **方案 A（推荐）：适配器内部同步化**。`AihubImageProvider.generateImage()` 提交任务后**在适配器内部轮询**（5s 间隔、上限 5 分钟，复用手册建议），拿到 download_url 后直接返回 `{success, images:[{url}]}`——对 image.service 而言它是同步 provider，skipHistory 分支天然走通，image.service 零改动，存量异步暗坑不被触发。代价：单次生图 IPC 最长阻塞 ~5 分钟（与现有同步 provider 的网络耗时同量级，可接受）；超时则返回失败由调用方重试。
- 方案 B：修 image.service 异步分支支持 skipHistory（pending 记录不入库、轮询完成回调走 skipHistory 存盘）——改动在核心服务，影响全部存量异步 provider，回归面大，不推荐本期做。
- 同时：适配器 HTTP 层绕开基类裸 fetch，走 AihubClient（继承 401/统一解包语义）。

#### 2.4.3 download_url 3600s 过期

现有"完成即下载"链路满足要求（:416）。中途关应用的悬挂任务是存量问题（无 boot-resume），记录在案不单独立项；适配器文档注明"getTaskStatus 返回 completed 后上层必须立即下载"。

---

### 2.5 视频生成与剧集制作链路

#### 2.5.1 三条并行链路（现状结构）

- **链路 A**（旧/通用，后台轮询）：video-generation.service.ts——轮询上限实为 **900 次×5s≈75 分钟**（:247，评审 #103 已放宽；方案 A §3.6"约 10 分钟需放宽到 15 分钟"**过时，无需改**）；
- **链路 B**（剧集·单镜，同步等待，主链路）：video-segment.handler.ts:154 → createAdapterForProviderWithReason :210 → bridge callAndPoll（base-video-provider-bridge.ts:214，2s 间隔/30 分钟上限）；
- **链路 C**（剧集·片段级）：segment-video.service.ts，复用 B 的 adapter 链；
- **合成**：episode-mp4-exporter 只消费本地落盘路径，与 provider 无关。

结论：轮询超时全部 >15 分钟，方案 A 的"放宽"项删除；真正要注意的是 bridge 轮询间隔 2s 对手册建议 5~15s 偏密——AihubVideoProvider 的 getTaskStatus 内部做 5s 节流（记录上次查询时间，过密返回缓存状态），一行级改动。

#### 2.5.2 templateId→providerType 路由（新发现 N2，阻断级）

来龙去脉：视频链路的 templateId→providerType 推导分散在 4 处，都是 `replace('video-','')` 或白名单，`'ai-hub'` 原样残留后工厂查不到：

| 位置 | 现状 | 漏改后果 |
|---|---|---|
| `video-generation.service.ts:122,151` | `templateId.replace('video-','')` | 链路 A 报"视频生成服务 ai-hub 暂未实现" |
| `video-generation.service.ts:109-112` | 默认白名单 `video-` 前缀 + `['volcengine','runway','pika','kling']` | 未指定 config 时永远选不到 ai-hub |
| `video.handler.ts:291-294` | 同 replace + bailian 特判 | 链路 A 同步兜底挂 |
| `video-segment.handler.ts:81` | `ep:list-video-providers` 按 `VIDEO_PROVIDER_DEFINITIONS[templateId]` 过滤 | **ai-hub 在项目设置视频模型列表里静默消失，无任何报错**（N2） |
| `video-segment.handler.ts:224-227` | providerType 直接用 templateId | 链路 B/C 工厂查不到 |

设计：5 处统一加 `'ai-hub'→'aihub'` 映射（建议每处用同一常量 `AIHUB_PROVIDER_TYPE`，或抽一个 `resolveVideoProviderType(templateId)` 小函数放 providers/video/index.ts，5 处都调它——后者更防再漏）。同时：
- `providers/video/index.ts:27-32` 工厂映射 + :37-109 `VIDEO_PROVIDER_DEFINITIONS`（requiresApiKey: true）；
- `shared/types/video-provider.types.ts:122` 联合类型加 `'aihub'`；
- `video.handler.ts:300` 只用了 `providerConfig.baseUrl`，没像 video-generation.service.ts:168 那样优先 `videoBaseUrl`——顺手对齐（ai-hub 模板会把视频端点写在 videoBaseUrl 或同 baseUrl，对齐后两种填法都对）。

#### 2.5.3 AihubVideoProvider 设计

- 提交 `POST {baseUrl}/videos/generations`：t2v（prompt/size/duration/audio_url/camera_fixed/multi_shot）；i2v（`image` 首帧 / `last_image` 尾帧）；
- **i2v 首帧本地文件转 Data URI**：bridge 层 `resolveImagePath`（:147-155）把 user-rel 相对路径拼成绝对路径塞进 `VideoGenerationRequest.image`，**文件→base64 的转换在各 provider 内部做**——直接复刻火山范本 `volcengine-video.provider.ts:151-197`（resolveImageUrl + toBase64DataUri，≤20MB 走 data URI）；
- `getTaskStatus` → `GET {baseUrl}/tasks/{id}`：pending/processing→processing、completed→completed（`result.results[].download_url` 原值上抛，不缓存不延迟）、failed/timeout/cancelled→failed（透传 error_message）；单次查询加 15~20s 超时（参照 comfyui-video.provider.ts:196）+ 5s 节流；
- HTTP 层绕开 `BaseVideoProvider.sendRequest`（无 401 钩子），直接调 AihubClient 薄封装；
- 能力推导：`deriveCapabilitiesFromModel`（video-segment.handler.ts:282-326）按 model.id 命名（含 t2v/i2v）自动推断，ai-hub 视频模型按 id 命名即可，无需改；
- **尾帧 last_image 暂不支持**：`VideoGenerationRequest` 只有单个 `image` 字段，bridge 的 keyframesToVideo 是"首帧 fallback"（:110-128）——支持尾帧要扩请求 schema + bridge 策略，列为可选增强，本期不做（剧集制作现状也只传首帧）。

#### 2.5.4 剧集制作上层

VideoSegmentService / SegmentVideoService / provider-capability-matcher / 合成链全部 provider 无感，零改动。渲染端 VideoSegmentPanel 是同步 IPC + spinner，`video:generation-event` 事件渲染端无人监听（存量体验问题，不阻塞）。`ep:list-video-providers` 的 ready 判定（:108-111）要求 models 非空 + apiKey 非空——物化后天然满足；未登录时按 §2.1.3 的 runtimeUsable 过滤。

---

### 2.6 语音链路（P5 可选扩展）

#### 2.6.1 现状结构（摸清结论）

无 voice 工厂，全部硬编码 DashScope 系：
- `voice.service.ts`：getVoices :161-186 硬编码 `new DashScopeTTSProvider` 取 10 个预置音色 + 合并 `cloned_voices` 表 ready 行；generateSpeech :266-295 按 `isCustomVoiceId()`（`cosyvoice-v3` 前缀）二选一硬编码两个 TTS provider；recognizeSpeech :435 硬编码 DashScopeSTTProvider；文本上限 5000 字符 :199；
- 复刻：VoiceCloneService（占位行 providerId 写死 `'dashscope-voice-clone'` :117）+ OssUploader 两步上传 + VoiceCloneJobScheduler（10s tick、boot 恢复、终态事件）；
- 设计：VoiceDesignService（结构对称，providerId 写死 `'dashscope-voice-design'` :96，**无调度器**，靠 UI 手动刷新）；
- 存储：`cloned_voices` / `designed_voices` 两表都已有 `provider_id` 列；
- 20 个 voice:* IPC 全部在 voice-design pack 注册，协议不变；
- 消费方：剧集对白/旁白合成、scene-audio-orchestrator（兜底取 getVoices()[0] :76-85）、workflow 节点、agent 工具。

#### 2.6.2 P5 设计要点

- 新增 `AihubVoiceProvider extends BaseVoiceProvider`（TTS `/v1/audio/speech` 同步二进制、STT multipart ≤25MB、可选翻译）；`AihubVoiceCloneProvider` / `AihubVoiceDesignProvider`（clone 改 base64 ≤10MB **绕过 OSS 上传**，状态轮询改 `GET /v1/audio/voices/{id}?model=`；仅阿里渠道；错误码 30008~30015 映射中文）；
- **来源区分（互不可见问题的数据模型解）**：两表 `provider_id` 列天然分区（`'dashscope-*'` vs `'aihub'`），**零迁移**；`VoiceSpeaker` 类型加 `source: 'direct'|'aihub'` 字段；VoiceAssetService.listAvailable/listReady（:55,63）透传 source；UI（VoiceDesign.vue / Sidebar / VoiceCloneDialog / CharacterCardForm）按 source 分组加徽标；
- **合成路由**：generateSpeech 按 voiceId 查两表的 provider_id 决定走网关还是直连——`isCustomVoiceId` 的 `cosyvoice-v3` 前缀规则对网关音色（`qwen3-tts-vc-*` 系列）直接失效，必须以 DB 行的 provider_id 为准，前缀判断仅作直连兜底。scene-audio-orchestrator 兜底取列表第一个的逻辑要跳过未登录的网关音色（否则静默失败）；
- **字符上限分级**：现状 5000，网关 4096——按 provider 分级校验，剧集长旁白按句切分（切分逻辑语音服务层做）；
- VoiceCloneJobScheduler 骨架（单例/tick/超时/boot 扫描/事件）不动，tick 内按行 provider_id 分发 refresh；设计音色若经网关也要自动轮询需补调度器（或并入现有 scheduler 加表源）；
- 前置依赖：P1 会话体系 + ai-hub 管理端注册音色伪模型（方案 A §3.10-4）+ target_model 清单与运营对齐（网关示例 `qwen3-tts-vc-*`/`qwen3-tts-vd-*`，与现有直连默认 `cosyvoice-v3.5-plus` 不一致）。

---

### 2.7 其余 ai-call 消费方（新发现 N4：方案 R 盘点修正）

方案 R §1 的盘点表把以下三项标为"走 ai-call ✅"，**实际都是自复制解析，不走 ai-call**：

| 文件 | 用途 | 现状 |
|---|---|---|
| `longwriting-ai.service.ts:155-203` | 长文写作全部生成（~35 处调用点） | **第 5 份完整复制**（连 createProvider 都复制了），且 fallback 链更短（:224/:285 无 config.defaultModel/模板内置兜底） |
| `translation.service.ts:132-209` | 翻译 | 第 6 份复制，modelId 用 `providerConfig.defaultModelId \|\| template.defaultModel`（:178），链又不同 |
| `lw-entity-detection.service.ts:254-286` | 实体检测 | 第 7 份复制 |

对 ai-hub 的影响：这三条链路在物化机制下**零改动即可用 ai-hub 模型**（它们的自复制解析对任何 templateId 通用）。但要计入方案 R 的迁移清单（P2 阶段），且迁移时行为差异要逐项比对（fallback 链长度不同）。

真正走 ai-call 的消费方（长文叙事/分镜/剧本/场景润色、故事转视频、工作流 4 组节点、vlm-shot-inferrer、资产设定富化、video-segment.handler:218、harness ProviderAdapter:274）在物化机制下全部零改动。

不碰 provider 体系的：日记（无 AI）、搜索引擎（独立 UserSearchEngineConfig 体系）、web-search（key 直传）、oss/email/datasource（用 SecureStorage 但非 AI 链路）——零影响。

---

## 3. 数据模型与存储变更汇总

| 变更 | 阶段 | 双端迁移 | 说明 |
|---|---|---|---|
| 无（provider_configs 复用 api_key_encrypted / models 列） | P1-P3 | — | PC 端零迁移 |
| 会话密文存 settings KV 或 `<userData>/aihub-session.enc` 文件 | P1 | — | §2.1.5，实施时查 settings 表结构定 |
| `cloned_voices`/`designed_voices` 复用 provider_id 列 | P5 | — | 零迁移 |
| users 表加 `aihub_session_encrypted` 列（或 user 级 KV 表） | P4 | SQLite + PG | §2.1.4 |
| `provider_configs` 加 `user_id` 列（至少 ai-hub 行按用户隔离） | P4 | SQLite + PG | §2.1.4，是否推广到全部 provider 是产品决策 |

---

## 4. 分阶段实施计划（修订版）

> 与方案 A 的阶段划分保持同构，内容按本次评估补全。每阶段独立可交付、可回滚。

| 阶段 | 内容 | 关键改动点 | 预估 |
|---|---|---|---|
| **P0** | 方案 R 的 router 落地（先行，同一分支） | ai-call.ts 拆 provider-router.ts；单测覆盖默认链×模态矩阵 | 1~2 天 |
| **P1** 最小可用（PC） | aihub 模板 + AihubClient/AihubAuthService（含会话存储 §2.1.5 + 物化 + 自动建 config + **登出/401 禁用状态机 §2.2.1 决策五** + 模型发现直写库 §2.2.3）+ LLM 401 特判 §2.3.2 + invalidateCache 接线 §2.1.2 + runtimeUsable 兜底 §2.1.3 + 错误映射层 §2.3.3 + AihubSettings.vue + 5 处 IPC 登记 §2.2.4 | platform/aihub/（新）、provider-template.service、openai-compatible-provider、workflow-boot、provider-config.handler、Settings/AddProviderDialog、preload、electron/index、web 两处登记 | 3~4 天 |
| **P2** 图像 | AihubImageProvider（**适配器内部同步化** §2.4.2）+ 工厂/类型/能力登记/白名单/映射（§2.4.1 六项） | providers/image/、image.service 三处 | 1~2 天 |
| **P3** 视频 | AihubVideoProvider + 5 处路由映射 §2.5.2 + videoBaseUrl 对齐 + getTaskStatus 节流 | providers/video/、video-generation.service、video.handler、video-segment.handler | 1~2 天 |
| **P4** 计费闭环 + Web 多用户 | 余额/兑换码/充值跳转/402；**Web 端先行项：users 表会话列 + provider_configs.user_id + ALS 寻址 §2.1.4** | aihub-billing、Settings、web/server、双端迁移 | 3~4 天 |
| **P5** 语音（可选） | 见 §2.6.2 全清单 | providers/voice/、voice.service、voice-clone/design.service、voice-asset.service、语音 UI | 3~4 天 |
| **P6**（衔接） | 方案 R 的 P1~P3：chat/image/video 解析迁 router，**补迁移 longwriting/translation/entity-detection（N4）** + 架构守护 | 方案 R §3 清单 + 本次修正 | 2~3 天 |

验收标准（在方案 A 基础上增补）：
- P1：登录后聊天页可选 ai-hub 模型对话（含流式）；登出后 ai-hub config 自动禁用、模型从全部选择器消失（isEnabled 过滤原生生效），重新登录自动恢复启用但保留用户手动禁用偏好（autoDisabled 标记）；聊天报"请重新登录 AI Hub"（真实文案可见，不是"发送消息失败"）；401 后 harness Agent 模式 10 分钟内不再用旧 token（invalidateCache 生效）；未登录时自有 Key 全功能回归；
- P2：人像制作（10 处 skipHistory 调用）与 EP 资产派生走 ai-hub 各跑一次通；图像历史表不被 skipHistory 调用污染；
- P3：项目设置视频模型列表能选到 ai-hub（N2 回归）；t2v + i2v 首帧各跑通，片段正确落库可被合成消费；
- P4：Web 端两用户各自登录各自扣费互不串（N6 回归）；余额/兑换码/402 跳转正确；
- P5：网关复刻（base64→轮询→TTS）/设计/STT 全链路各一次；两类音色 UI 分组清晰、合成路由按 provider_id 正确分发。

---

## 5. 风险与开放问题（在方案 A 基础上增补）

1. （新）**适配器内部同步化的长尾**：P2 图像适配器内轮询上限 5 分钟，若 ai-hub 图像任务排队超时会返回失败——需要实测 ai-hub 图像任务的 P95 耗时，超 5 分钟则上限调大或改走方案 B（修 image.service 异步 skipHistory）。实施 P2 第一天先跑 20 次采样。
2. （新）**方案 R 与 ai-hub 的提交顺序**：P0/P6 与 P1~P5 在同一分支先后提交；router 迁移（P6）放最后是考虑到物化机制已保证功能，先交付 ai-hub 价值。若评审认为解析统一应先于一切，则 P6 提前到 P1 之前，工期 +2~3 天。
3. （新）**`streamState.error` 渲染补位**涉及聊天 UI 组件改动，属存量缺口修复，需在 P1 验收里单列回归（普通报错的展示也变了）。
4. （新）**Web 端 provider_configs 全量隔离**（N6 的 P4b）是产品决策：现状全用户共享各家 apiKey，隔离后老数据要归属到某个用户（建议归 admin/首个用户），需迁移脚本 + 产品确认。
5. ai-hub 部署地址 `{BASE}`/`{WEB_AUTH}`、已注册模型清单、音色伪模型注册、target_model 清单——**仍未确认**，P1 开工前必须先拿到地址并按手册 §12 联调清单跑通 `GET /v1/models` 和一次 chat 调用。
6. JWT 7 天过期体验、download_url 3600s 与无 boot-resume 的悬挂任务（存量）、Web 端"账号套账号"UX——同方案 A §5，不重复展开。

---

## 6. 不做清单（在方案 A 基础上增补）

- 本期不接 ai-hub 的 embedding/rerank/music（§2.1.6；知识库保持现有 provider）；
- 本期不支持视频尾帧 last_image（§2.5.3）；
- 本期不修图像异步 skipHistory 的服务层暗坑（§2.4.2 用适配器同步化规避；服务层修复单独立项）；
- 本期不做图像/视频 boot-resume（存量问题，单列）；
- 其余同方案 A §6（不强制登录、不做 HMAC/PKCE/用户同步/自研充值 UI、不动现有厂商实现、不动语音直连存量路径）。
