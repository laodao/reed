# AI 调用统一收敛（Provider Router）详细实施方案

> 日期：2026-09-06
> 背景：AI 调用链的"配置解析→密钥解密→provider 实例化"段没有统一入口，聊天/图片/视频/语音各复制一份；harness（agent-runtime）已把 `ai-call.getProviderConfig()` 钦定为单一事实源，但主链路都没走它。ai-hub 集成（`docs/design/2026-09-06-ai-hub-integration-plan.md`）再次撞到这个缺口。
> 目标：全项目 AI 调用收敛到**一个解析入口 + 一个注入点**，为 ai-hub 集成和 harness 演进打底。
> 本文是实施方案（含迁移清单与验收标准），供评审后动手。

---

## 1. 现状盘点（已逐处核实）

| 调用方 | 解析路径 | 走 ai-call？ | 备注 |
|---|---|---|---|
| 聊天 `packs/chat/services/chat.service.ts:60-126` | 自复制：getById→getDefault→getEnabled[0]→查apiKey→decrypt | ❌ | 有"前端传值优先于 DB"语义 |
| 图片 `platform/services/image.service.ts:98-141` | 自复制 + 图像类型白名单（:111-114）+ Key 格式启发式（:147-165） | ❌ | 生成前调 `getModelCapabilities` 显式登记表 |
| 视频 `platform/episode-production/render/video/video-generation.service.ts` | 自复制 | ❌ | 轮询上限 ~10 分钟硬编码 |
| 语音 `platform/services/voice.service.ts:105` | 自遍历 enabled 配置，硬编码 DashScope 系 | ❌ | ai-hub 无 TTS，本期可不迁移 |
| 长文/翻译/剧集实体检测等 | `ai-call.getProviderConfig()` | ✅ | 已是目标形态 |
| 剧集视频片段 `packs/episode-production/.../video-segment.handler.ts:210` | `ai-call.getProviderConfig()` | ✅ | |
| harness `platform/agent-runtime/provider/provider-adapter.ts` | 包装 `ai-call.getProviderConfig()` + AI SDK + LRU 缓存 | ✅ | 契约钦定 ai-call 为单一事实源 |

存量问题清单：
1. **解析逻辑 5 份复制**，默认链语义各自微调，改一处不生效于全局（voice 修复时 preload 桥接漏合入就是这类分散的代价）；
2. **`apiKey` 空值前置检查 3 处**（ai-call.ts:67、chat.service.ts:85、image.service.ts:123），任何"Key 不由配置提供"的新接入方式（ai-hub JWT 注入）都会被挡死；
3. **模态路由靠硬编码白名单**（image.service.ts:111 的 `['bailian','volcengine',...]`），新增 provider 类型要改 N 处；
4. **能力登记表分散**（image/model-capabilities.ts 显式注册，匹配不到直接抛错），新 provider 类型必须登记，无统一机制。

---

## 2. 目标架构

```
业务层（chat / image / video / 长文 / 剧集 / harness / ...）
        │
        ▼
┌─────────────────────────────────────────────────┐
│  ProviderRouter（platform/services/provider-router.ts）│
│  resolve({ providerConfigId?, modality, modelId? })    │
│    ├─ 默认链：显式 → 默认 → 首个启用（按 modality 过滤）│
│    ├─ TokenInjector 钩子链（ai-hub JWT 注入挂这里）     │
│    ├─ 解密（SecureStorage，唯一 decrypt 点）            │
│    └─ 统一错误：未配置/未登录/解密失败/模态不匹配        │
└─────────────────────────────────────────────────┘
        │  ProviderInfo { config, template, apiKey, modality }
        ▼
现有 provider 工厂（createProvider / createImageProvider / createVideoProvider）
        │
        ▼
各厂商 provider 实现（不动）
```

**关键决策：**

1. **不新建平行体系，把 `ai-call.getProviderConfig()` 升级为正主**。harness 已押注它、契约文档已钦定它、长文/剧集已在用它——升级它比另起炉灶的迁移成本最低。具体做法：`ai-call.ts` 拆分为 `provider-router.ts`（解析）+ `ai-call.ts`（LLM 调用封装，内部走 router），`getProviderConfig` 保留为 router 的 re-export 一段时间，调用方逐步改引用。
2. **模态（modality）成为解析的一等参数**：`resolve({ modality: 'chat' | 'image' | 'video' | 'voice' })`。默认链的"首个启用"按模态过滤——判断依据从硬编码白名单改为**配置内模型清单的 type 字段 + 模板 capabilities**，image.service.ts:111 的白名单逻辑收进 router 一处。
3. **TokenInjector 钩子链**：router 在"拿到 config、解密之前"执行注入器链。ai-hub 注入器：templateId='ai-hub' 时从 AihubAuthService 取会话 JWT 填入 apiKey（内存注入）；无会话抛 `AIHUB_NOT_LOGGED_IN`。其他 provider 的注入器链为空，**零行为变化**。
4. **apiKey 空值检查下沉为 router 的统一校验**：注入器链跑完后仍无 apiKey → 统一报"未配置 API 密钥"。各调用方删除自己的前置检查（3 处复制随之消失）。
5. **能力登记表机制不变，但登记入口文档化**：ai-hub 等新型号在 `model-capabilities.ts` 增补条目即可（这是生成参数合法性校验，与解析正交，本次不重构它）。

## 3. 迁移清单（按调用方）

| # | 文件 | 改动 | 风险点 |
|---|---|---|---|
| 1 | `ai-call.ts` → `provider-router.ts` | 拆出 resolve()，加 modality 参数与注入器链；`getProviderConfig` re-export 兼容 | 无（纯新增+搬家） |
| 2 | `chat.service.ts:60-126` | 60~126 行整段替换为 `router.resolve({ providerConfigId: effectiveProviderConfigId, modality: 'chat' })` | **保留"前端传值优先于 DB"语义**（:57-58），迁移后 e2e 回归聊天 |
| 3 | `image.service.ts:98-165` | 解析段替换为 `router.resolve({ modality: 'image' })`；白名单:111 删除（收进 router）；Key 格式启发式:147-165 保留在原地（它是 bailian 双协议特判，与解析正交） | 默认图像 provider 的选择结果必须与白名单时代一致——router 的模态过滤要先对齐这张表的行为 |
| 4 | `video-generation.service.ts` | 解析段替换为 `router.resolve({ modality: 'video' })` | 轮询上限不动（ai-hub 集成时再放宽） |
| 5 | `voice.service.ts:105` | 本期**不迁移**（硬编码 DashScope 系且无替代实现），仅加 TODO 注释指向 router | — |
| 6 | 已走 ai-call 的调用方 | 零改动，自动获得新能力 | — |
| 7 | `agent-runtime/provider-adapter.ts` | 把 defaultLookup 指向 router（re-export 期可不动） | **缓存失效**：ProviderAdapter 按 (configId, modelId) 缓存 LanguageModel 10 分钟；ai-hub JWT 轮换后缓存里是旧 token——需在 401/重登录事件时调 `invalidateCache()`（:149 已留好事件接入点） |

**架构守护（防再分裂）**：迁移完成后加一条 ESLint 规则或 code review 约定——`platform/services/` 与 `packs/` 下禁止直接组合 `providerConfigs.getById/getDefault/getEnabled + secureStorage.decrypt`，必须走 router。这是本次重构要还的核心技术债，不守护就会再次长出来。

## 4. 与 ai-hub 集成的关系（修正 ai-hub 方案的决策一）

统一收敛落地后，ai-hub 集成方案（`2026-09-06-ai-hub-integration-plan.md`）的决策一**按"路线 B"修正**：

- 会话槽位为真源（独立、按用户）；
- 登录/重登成功时把 JWT **物化**写入 ai-hub config 的 `api_key_encrypted`——这样即使在迁移完成前，3 处前置检查也天然通过；
- 迁移完成后，物化可以保留（双保险），也可以纯走 TokenInjector 内存注入——届时再定，两可；
- ai-hub 方案中"适配点只有一个 getProviderConfig"的表述修正为"适配点只有一个 **ProviderRouter.resolve**，前提是本方案 P1/P2 迁移完成"。**因此 ai-hub 集成 P1 必须在本次收敛之后开工，或两者同一分支先后提交。**

## 5. 分阶段实施

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 router 落地 | 拆分 ai-call → provider-router.ts，加 modality/注入器链/统一错误；`getProviderConfig` re-export 兼容；单测覆盖默认链×模态矩阵 | 存量 vitest 全绿（基线 2784 通过）；router 单测覆盖"显式/默认/首个启用×chat/image"6 组合 |
| P1 迁移聊天 | chat.service.ts 解析段替换 | 聊天 e2e：发消息（含流式）、换默认提供商、前端指定 modelId 三场景与迁移前行为一致 |
| P2 迁移图片+视频 | image.service / video-generation.service 解析段替换；白名单收进 router | 图片生成（dashscope/火山各一次）、剧集视频片段生成回归通过；**默认 provider 选择结果与迁移前逐项比对** |
| P3 守护与清理 | ESLint 规则/review 约定落地；删除被替换的死代码；voice 加 TODO | grep 全仓不再有 `providerConfigs.get* + decrypt` 组合（router 内部除外） |
| P4（衔接） | ai-hub 集成 P1 开工，TokenInjector 挂 router | 见 ai-hub 方案 |

每阶段独立可交付、可回滚（router 与调用方迁移解耦，re-export 保证中间态可用）。

## 6. 风险

1. **默认链语义漂移**：各调用方的 fallback 有微妙差异（chat 的前端传值优先、image 的模态白名单）。迁移必须逐调用方做"迁移前后选择结果比对"，不能只看"能跑"。这是最大风险点，P1/P2 验收的核心。
2. **解密时序**：现状 decrypt 在每次调用时进行；router 化后若加缓存（暂不加，harness 的缓存只在 LanguageModel 层），要防止缓存住过期凭证——P0 不做配置缓存，规避此风险。
3. **harness 缓存与 JWT 轮换**：见迁移清单 #7，ai-hub 接入时必须接 `invalidateCache()`，否则 7 天过期后 harness 还在用旧 token 构造的模型对象。
4. **范围控制**：voice/search 本期不迁移（无替代实现/独立体系），避免把"统一"扩大成"重写所有 provider"。
