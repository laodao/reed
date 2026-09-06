# 13 · AI 层 tool-calling 协议层详细设计

> Agent Loop Harness ｜ 2026-08-28 ｜ 配套：[01-design-spec.md](./01-design-spec.md) §8、[02-implementation-plan.md](./02-implementation-plan.md) M1.3/M2.2
> 主题：为 LLM 调用链补齐 function-calling / tool-use 协议能力（短板 S4），覆盖 10 家 provider 模板，含 prompt-based JSON 降级路径。

---

## 1. 目标与范围

**目标**：在不破坏现有 9+ 处 AI 调用点的前提下，为 AI 层增加统一的 tool-calling 协议——类型扩展、逐 provider 请求序列化与流式增量解析、能力检测、降级协议、用量统计——使 AgentRuntime 主循环（spec §7.2 的 `llm.decide`）可以在任意已配置 provider 上运行。

**范围内**：

- `ChatContext` / `ChatOptions` / `StreamCallback` / `ChatCompletionResponse` / `CallAIStreamResult` 的类型扩展；
- `OpenAISdkProvider`、`AnthropicSdkProvider`、`GoogleSdkProvider`、`VolcEngineSdkProvider`、`OpenAICompatibleProvider` 的适配；
- `model-capability.ts` / `model-detector.service.ts` 的 tool-calling 能力标记收敛；
- prompt-based JSON 降级协议（模板、解析器、校验、重试）；
- token 用量统计口径与 `agent_llm_calls` 流水表（本文新增）。

**范围外**：工具注册与执行（AgentToolRegistry，见 14-tool-registry）、agent 主循环编排（11-agent-runtime）、MCP。

## 2. 现状与差距（代码证据）

| 现状 | 证据 |
|------|------|
| `ChatContext` 仅 systemPrompt + messages，messages 元素 role 取自 `MessageRole = 'user'\|'assistant'\|'system'`，无 tools / role:'tool' 概念 | `src/shared/types/message.types.ts:11`、`:236-243` |
| `StreamCallback` 事件类型仅 start/delta/done/error/thinking，无 tool_call 增量 | `src/core/providers/base-provider.ts:21-28`；`StreamEventType` 同义于 `message.types.ts:188` |
| `ChatOptions` 无 tools/toolChoice | `base-provider.ts:33-48` |
| `ChatCompletionResponse` 无 toolCalls | `src/shared/types/provider.types.ts:71-80` |
| `CallAIStreamResult` 仅 content + usage | `src/core/services/ai-call.ts:492-495` |
| provider 装配：openai/deepseek/zhipu/bailian/moonshot/minimax → `OpenAISdkProvider`；anthropic/google/volcengine 各自 SDK；custom-model 及其他 → 旧 `OpenAICompatibleProvider` | `src/core/providers/index.ts:27-37`、`:67-122` |
| 10 家模板：openai/deepseek/zhipu/bailian/moonshot/volcengine/minimax/anthropic/google/custom-model | `src/core/services/provider-template.service.ts:15-460`（各 id 行 :18/:47/:77/:135/:202/:232/:293/:350/:383/:414） |
| 能力判定三处重复：`model-detector.service.ts:142-197`、`provider-template.service.ts:733`、`model-capability.ts:90-111`，规则已漂移（如 model-capability 补了 deepseek-v4，另两处没有） | 三处文件 |
| `resolveCapabilities` 已有 supportsTools 字段与"落库优先、模型名兜底"机制 | `model-capability.ts:129-153` |
| testConnection 检测后把 supportsTools 落库到 `UserProviderConfig.models` | `provider-template.service.ts:575-589` |
| `callAI`（非流式，:111-197）与 `callAIStream`（流式+取消+usage 回传，:501-560）为公共入口 | `ai-call.ts` |
| 现有调用方：llm-chat（`task-nodes.ts:191`）、skill-call（`skill-nodes.ts:79`）、extra-nodes.ts:115、a2-nodes.ts:125、longwriting-ai.service.ts（自有私有封装 :172/:218）、story-to-video-ai.service.ts:271、asset-setting-enrichment.service.ts:137 | grep `callAIStream(\|callAI(` |
| `extractJsonFromResponse` 已有"```json 块 / 裸 JSON / 首尾花括号"三级容错 | `ai-call.ts:417-467` |
| 差距：四家 SDK provider 的 chatStream/chatSync 均不构造 tools 参数、不解析 tool_calls/tool_use/functionCall | 各 provider 文件全文 |
| 差距：`GoogleSdkProvider.chatStream` 当前不传 system（`buildHistory` 只处理 messages，systemPrompt 被静默丢弃），且 `_signal` 未接线（:191） | `google-sdk-provider.ts:120-164`、`:188-235` |

## 3. 概念模型

```
AgentRuntime.llm.decide(AgentToolSpec[])                     ← 11-agent-runtime
        │
        ▼
ToolCallProtocol（本文核心，新增 src/core/providers/tool-calling/）
   ├─ resolveToolCallingMode(modelId, def, opts) → 'native' | 'prompt_fallback' | 'none'
   ├─ native 路径：各 provider 适配器序列化 tools / 解析 tool_calls（流式增量合并）
   └─ fallback 路径：PromptToolCodec —— 注入系统提示 → 解析 ```tool_call 块 → 严格校验 → 失败重试
        │
        ▼
BaseProvider.chatStream/chatSync（扩展后签名不变，能力经由 ChatContext.tools 流入）
        │
        ▼
agent_llm_calls 流水表（每次调用一行：mode、usage、解析重试次数、终态）
```

关键概念：

- **AgentToolSpec**：LLM 可见的工具描述（name/description/JSON Schema），由 AgentToolRegistry 产出，本层只消费。
- **ToolCall**：一次工具调用决策（id/name/argumentsJson），assistant 消息的负载。
- **ToolResultMessage**：`role:'tool'` 的工具结果回填消息，经各 provider 适配器翻译成各家原生格式。
- **mode**：`native`（走厂商协议）/ `prompt_fallback`（走 JSON 约定）/ `none`（未传 tools，现行行为）。

## 4. 数据模型

唯一新表 `agent_llm_calls`（本文新增）——协议层调用流水，供 token 用量统计口径（§5.6）、降级路径观测、审计。**与 `agent_trajectories`（spec §3.3，11-agent-runtime 落库，每轮迭代一行）分工：本表是"每次 LLM HTTP 调用"粒度，含重试与降级细节；轨迹表是"每轮迭代决策"粒度。**

SQLite（PC 端）：

```sql
CREATE TABLE agent_llm_calls (
  id                TEXT PRIMARY KEY,
  run_id            TEXT,                 -- 工作流 run；聊天/长文等无 run 场景为 NULL
  node_run_id       TEXT,                 -- 关联 workflow_node_runs.id
  iteration         INTEGER,              -- agent 循环轮次；非 agent 场景为 NULL
  provider_id       TEXT NOT NULL,        -- 模板 id（openai/deepseek/...）
  provider_config_id TEXT,
  model_id          TEXT NOT NULL,
  mode              TEXT NOT NULL,        -- native / prompt_fallback / plain
  stream            INTEGER NOT NULL,     -- 0/1
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  total_tokens      INTEGER,
  tool_call_count   INTEGER NOT NULL DEFAULT 0,
  parse_retry_count INTEGER NOT NULL DEFAULT 0,  -- 降级协议解析重试次数
  finish_reason     TEXT,                 -- stop / tool_calls / length / ...
  duration_ms       INTEGER,
  status            TEXT NOT NULL,        -- ok / error / aborted / parse_failed
  error             TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_agent_llm_calls_run ON agent_llm_calls(run_id);
CREATE INDEX idx_agent_llm_calls_created ON agent_llm_calls(created_at);
```

PostgreSQL（Web 端）差异点：

- `stream` 改 `BOOLEAN NOT NULL`；`created_at TIMESTAMPTZ NOT NULL DEFAULT now()`；
- 占位符 `$1,$2,...`（SQLite 用 `?`）——沿用项目既有双端迁移约定（02-横切工作）；
- 索引定义相同。

迁移成对编写（M1），不回填历史数据。无 `user_id` 列：Web 端多租户维度经 `provider_config_id` 关联（provider 配置本身按用户隔离）。

## 5. 接口设计

### 5.1 类型扩展（`src/shared/types/message.types.ts`、`provider.types.ts`、`base-provider.ts`）

```ts
/** LLM 可见的工具规格（由 AgentToolRegistry 产出，见 14-tool-registry） */
export interface AgentToolSpec {
  name: string                                  // ^[a-zA-Z][a-zA-Z0-9_-]{0,63}$（各家最严交集）
  description: string
  parameters: Record<string, unknown>           // JSON Schema（type:'object'）
}

/** 一次工具调用决策（assistant 侧） */
export interface ToolCall {
  id: string                                    // provider 原生 id；缺失时适配层合成 `call_${index}`
  name: string
  argumentsJson: string                         // 原始 JSON 字符串，原样保留便于审计/重放
}

/** 解析后的工具调用（CallAIStreamResult 使用，与 spec §8.1 的 ParsedToolCall 一致） */
export interface ParsedToolCall extends ToolCall {
  arguments: Record<string, unknown>            // argumentsJson 解析结果；解析失败时本对象不会产生
}

/** role:'tool' 的工具结果消息 */
export interface ToolResultMessage {
  role: 'tool'
  toolCallId: string
  name: string
  content: string                               // 已序列化的工具输出（截断由 tool-gateway 负责）
  isError?: boolean
}
```

`ChatContext` 改造（message.types.ts:236-243）：messages 元素提为命名类型并扩展。**`MessageRole`（:11）保持不变**——它同时被聊天模块持久化消息使用，贸然加 `'tool'` 会污染 chat 存储语义；本文新增独立联合类型：

```ts
export type ChatContextRole = 'user' | 'assistant' | 'system' | 'tool'   // 本文新增
export interface ChatContextMessage {                                     // 本文新增
  role: ChatContextRole
  content: MessageContent
  attachments?: AttachmentContent[]
  toolCalls?: ToolCall[]                    // role==='assistant' 时携带
  toolCallId?: string                       // role==='tool' 时必填
  name?: string                             // role==='tool' 时工具名（Anthropic/Google 适配用）
}
export interface ChatContext {
  systemPrompt?: string
  messages: ChatContextMessage[]
  tools?: AgentToolSpec[]                   // spec §8.1
  toolChoice?: 'auto' | 'none' | { name: string }   // spec §8.1
}
```

`StreamCallback` 增加 `tool_call` 增量事件（base-provider.ts:21-28）：

```ts
export interface ToolCallDelta {            // 本文新增
  index: number                             // provider 流式 tool_calls 数组下标
  id?: string; name?: string                // 通常只在首个增量出现
  argumentsDelta?: string                   // arguments JSON 的文本增量
  done?: boolean                            // 该 index 的参数拼接完成
}
export type StreamCallback = (event: {
  type: 'start' | 'delta' | 'done' | 'error' | 'thinking' | 'tool_call'   // 增 'tool_call'
  messageId?: string
  content?: string
  thinkingContent?: string
  error?: string
  usage?: TokenUsage                        // 本文新增：流式 usage 回传统一进 done 事件
  toolCall?: ToolCallDelta                  // type==='tool_call' 时携带
}) => void
```

注：`callAIStream` 现在从 `done` 事件读 usage（ai-call.ts:539-541），但 `StreamCallback` 类型上并没有 `usage` 字段——属历史欠账，本次一并补上（标注：本文新增，不改变运行时行为）。

`ChatOptions`（base-provider.ts:33-48）新增（本文新增）：

```ts
toolCallingMode?: 'auto' | 'native-only' | 'fallback-only'
  // auto（默认）：按能力标记选 native 或 prompt_fallback；
  // native-only：模型不支持原生则抛 ToolProtocolError（生产关键任务用，联动 02-开放问题2）；
  // fallback-only：强制走降级协议（测试用）。
```

`ChatCompletionResponse`（provider.types.ts:71-80）与 `CallAIStreamResult`（ai-call.ts:492-495）均新增可选字段：

```ts
toolCalls?: ParsedToolCall[]                // 非空即"模型要求调工具"，content 可能同时存在（思考/说明文本）
finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter' | string
```

### 5.2 协议层新模块（`src/core/providers/tool-calling/`，本文新增）

```ts
// mode-resolver.ts
export function resolveToolCallingMode(
  modelId: string,
  def: ModelDefinition | undefined,
  opts?: { toolCallingMode?: ChatOptions['toolCallingMode']; hasTools: boolean }
): 'native' | 'prompt_fallback' | 'none'

// stream-assembler.ts —— OpenAI 系流式 tool_calls 增量合并器（provider 无关，火山复用）
export class ToolCallStreamAssembler {
  apply(delta: ToolCallDelta): void
  /** 按 index 升序输出；argumentsJson 不是合法 JSON 时抛 ToolProtocolError */
  finalize(): ParsedToolCall[]
  get pendingCount(): number
}

// prompt-fallback-codec.ts —— 降级协议编解码（§5.5）
export class PromptToolCodec {
  buildSystemPrompt(base: string, tools: AgentToolSpec[]): string
  /** 从模型输出解析工具调用；返回 null 表示纯文本终答（收敛） */
  parse(content: string, tools: AgentToolSpec[]): ParsedToolCall[] | null
  /** 校验失败时生成回填给模型的纠错消息 */
  buildRetryMessage(error: ToolProtocolError): string
}

export class ToolProtocolError extends Error {
  constructor(message: string, readonly kind:
    'arguments_invalid' | 'unknown_tool' | 'schema_violation' |
    'format_violation' | 'unsupported' | 'truncated') { super(message) }
}

// llm-call-logger.ts —— agent_llm_calls 写库（成功/失败/取消均落一行）
export async function recordLlmCall(entry: AgentLlmCallRecord): Promise<void>
```

`callAIStream`/`callAI` 签名只追加可选参数（`tools?`、`toolChoice?`、`toolCallingMode?`），透传进 `ChatContext`/`ChatOptions`；`callAI` 因走 `chatSync` 天然支持 tool-calling 非流式路径。

### 5.3 逐 provider 适配表

| provider（模板 id） | 实现类 | 请求序列化 | 流式增量解析 | role:'tool' 回填格式 | toolChoice 映射 |
|---|---|---|---|---|---|
| openai | OpenAISdkProvider | `tools:[{type:'function',function:{name,description,parameters}}]` | `delta.tool_calls[]`：按 `index` 合并，id/name 首帧出现，`function.arguments` 文本追加；`finish_reason==='tool_calls'` 收尾 | `{role:'tool', tool_call_id, content}`；assistant 消息原样回显 `tool_calls` | `'auto'/'none'` 直传；`{name}` → `{type:'function',function:{name}}` |
| deepseek | 同上 | 同上 | 同上；**reasoner/r1 系不支持 tools**（能力标记必须先行拦截，否则 400） | 同上 | 同上 |
| zhipu(glm) | 同上 | 同上；但 messages 走数组格式且无 system role（`buildMessages:193,230-265`），tool 协议不受影响 | 同上 | tool 消息 content 必须是字符串（GLM 内容数组约定不适用于 role:tool） | 同上 |
| bailian(qwen) | 同上 | 同上 | 同上；qwen 流式增量 index 稳定，已验证的兼容模式 | 同上 | 同上 |
| moonshot | 同上 | 同上 | 同上 | 同上 | 同上 |
| minimax | 同上 | 同上 | 同上（abab6+ 宣称兼容，需冒烟，列 M1 风险） | 同上 | 同上 |
| custom-model | OpenAICompatibleProvider（旧 fetch 实现）→ **M2 迁移到 OpenAISdkProvider**（本文建议，消除两套解析逻辑） | 同 OpenAI | 同 OpenAI | 同 OpenAI | 同 OpenAI |
| volcengine | VolcEngineSdkProvider（数据面即 OpenAI 兼容，`volcengine-sdk-provider.ts:82-88`） | 同 OpenAI | 复用 `ToolCallStreamAssembler`；接入点（ep-xxxx）是否开启 tools 取决于控制台配置，能力标记以落库 `supportsTools` 为准 | 同 OpenAI | 同 OpenAI |
| anthropic | AnthropicSdkProvider | `tools:[{name,description,input_schema}]`；system 独立参数（现状已是，:187） | `content_block_start`(type=`tool_use`，带 id/name) → `content_block_delta`(`input_json_delta.partial_json` 追加) → `content_block_stop`；`stop_reason==='tool_use'`；按 block index 映射到 ToolCallDelta.index | **tool 结果不是独立 role**：放进下一条 `user` 消息的 `content:[{type:'tool_result', tool_use_id, content, is_error}]`；assistant 侧回显 `{type:'tool_use', id, name, input}` 块 | `'auto'` → `{type:'auto'}`；`'none'` → `{type:'none'}`；`{name}` → `{type:'tool', name}` |
| google | GoogleSdkProvider | `tools:[{functionDeclarations:[{name,description,parameters}]}]` | 流式 chunk `functionCalls()` 一次性返回完整 {name, args}（无增量参数），适配层直接发 `done:true` 的 ToolCallDelta | `Content` role=`function`（SDK 版本差异：旧 `function`/新 `user`，适配层封装），parts=`[{functionResponse:{name, response:{result: content}}}]`；model 侧回显 `{functionCall:{name, args}}` | `'auto'` → `functionCallingConfig{mode:'AUTO'}`；`'none'` → `mode:'NONE'`；`{name}` → `mode:'ANY', allowedFunctionNames:[name]` |

统一差异点清单（施工 checklist）：

1. **tool_call id**：OpenAI 系原生有 id；Anthropic 有 id；Google **无 id**——适配层合成 `call_${index}`，同一轮内稳定。
2. **并行调用**：OpenAI 系/Anthropic 原生并行（多 index / 多 block）；Google 一个 turn 可返多个 functionCall；降级协议用 JSON 数组表达。
3. **空 content**：仅 tool_calls 的 assistant 回合 content 为空串——OpenAISdkProvider 现有"空响应检测"（:529-536）必须把"有 tool_calls"视为非空，否则误报。
4. **usage 流式回传**：OpenAI 系需 `stream_options:{include_usage:true}`，不支持的平台会 400——捕获后本轮重发为不带该选项的请求并记 `agent_llm_calls.error` 备注（本文新增决策）；Anthropic 从 `message_start`/`message_delta` 的 usage 聚合；Google 取末 chunk `usageMetadata`。
5. **Google 的 systemPrompt 丢失**（现状 bug，§2）：本次适配顺带修复——`getGenerativeModel({model, systemInstruction})`。
6. **zhipu 无 system role**：降级协议的系统提示按现有"合并进首条 user 消息"逻辑注入（:315-335）。

### 5.4 能力检测收敛（model-detector / model-capability）

- **收敛三处重复**（§2）：删除 `provider-template.service.ts:733` 与 `model-detector.service.ts:142-197` 的私有实现，统一改为调用 `model-capability.ts` 的 `guessCapabilitiesByModelId` / `resolveCapabilities`（该模块本就是为此设立的"统一入口"，见文件头注释 :5-16）。
- `ModelCapabilities` 新增字段（本文新增）：`supportsToolCalling: 'native' | 'prompt_fallback' | 'none'`——由 `supportsTools` 推导：`supportsTools===true` → native；`type` 为 embedding/rerank/image/audio/video → none；其余文本/多模态 → prompt_fallback。
- 启发式规则表（`guessCapabilitiesByModelId` 内，在现有 supportsTools 清单基础上）：

| 规则 | 判定 |
|---|---|
| gpt-4o / gpt-4 / gpt-3.5 / o1 / o3 | native |
| claude-3+ / claude-sonnet / opus / haiku | native |
| gemini | native |
| deepseek 且非 reasoner/r1 | native |
| glm-4 | native |
| qwen 且非 vl | native |
| moonshot / kimi | native |
| minimax abab6+ | native（冒烟确认后生效，否则改 fallback） |
| doubao / ep- 接入点（名字不可判） | 落库 supportsTools 为准；缺省 prompt_fallback |
| 其他未知文本模型 | prompt_fallback |

testConnection 落库字段不变（`supportsTools: boolean`），`supportsToolCalling` 为解析期推导值，不落库。

### 5.5 prompt-based JSON 降级协议

**启用**：`resolveToolCallingMode` 返回 `prompt_fallback`（模型能力标记非 native 且传了 tools 且 mode=auto），或 `fallback-only` 强制。
**禁用**：`native-only` 下不支持原生的模型直接抛 `ToolProtocolError('unsupported')`；生产关键任务在 agent-loop 节点配置此模式（联动 02-开放问题 2：降级路径标记"实验"）。

**系统提示模板**（`PromptToolCodec.buildSystemPrompt`，中文指令，追加在原 systemPrompt 之后）：

```
你可以调用以下工具完成任务。工具清单（JSON Schema）：
<tools>[{name, description, parameters} 的 JSON 数组]</tools>
调用规则：
1. 需要调用工具时，输出且仅输出一个 ```tool_call 代码块，内容为 JSON：
   单个调用 {"name": "工具名", "arguments": {...}}；并行调用为上述对象的数组。
2. 不需要工具时，直接输出最终答案，不要输出 tool_call 代码块。
3. arguments 必须严格符合对应工具的 parameters schema，不得编造工具名。
```

**解析与严格校验**（`parse`）：

1. 提取 ```tool_call fenced 块（复用 `extractJsonFromResponse` 的容错思路，ai-call.ts:417-467：fenced → 裸 JSON → 首尾花括号）；无块 → 返回 null（收敛，content 即终答）。
2. JSON.parse 失败 → `ToolProtocolError('format_violation')`。
3. 归一化为数组；逐条校验：name 在本次 `tools` 白名单内（否则 `unknown_tool`）；arguments 是 object；对 `parameters` 做 JSON Schema 校验（required/properties/additionalProperties 最小子集，不引入完整 ajv——项目未依赖它，先手写 20 行校验器）（否则 `schema_violation`）。
4. 全部通过 → `ParsedToolCall[]`（id 合成 `fb_${iteration}_${index}`）。

**重试策略**：校验失败时把 `buildRetryMessage(error)`（含具体错误 + 正确格式重申）作为 user 消息回填重发，**最多 2 次**（对齐 jsonMode 的 3 次尝试模式，task-nodes.ts:213-226）；仍失败 → 抛错并落 `agent_llm_calls(status='parse_failed', parse_retry_count=2)`，由 AgentRuntime 护栏裁决。单次 LLM 调用内因降级重试产生的每次 HTTP 调用各占一行流水。

### 5.6 token 用量统计口径

| 场景 | 口径 |
|---|---|
| 非流式 | 响应 `usage` 原样映射（各家字段：openai `prompt_tokens`、anthropic `input_tokens`、google `promptTokenCount`——现有代码已做此映射，如 anthropic-sdk-provider.ts:256-262） |
| 流式 | 见 §5.3 差异点 4；统一经 `done` 事件 `usage` 字段上抛 |
| usage 缺失 | `agent_llm_calls` 三列记 NULL；**不估算、不计费**，UI 显示"未知"；AgentRuntime 的 maxTokens 护栏对未知部分按 `ceil(chars/4)` 估算兜底（本文新增，估算值不落库、不展示） |
| 降级协议重试 | 每次 HTTP 调用独立一行流水；护栏按行累计 |
| 取消（abort） | 已收到的 usage 照记（多数平台 abort 后无 usage，记 NULL），status='aborted' |

## 6. 状态机与关键时序

单次 LLM 调用（协议层视角）状态机：

```
idle → requesting → streaming ──(delta/text)──┐
                    │  └──(tool_call 增量)→ assembling（ToolCallStreamAssembler）
                    ▼
              validating（arguments JSON + schema 校验）
                    ├─ 通过 → done(toolCalls) 
                    ├─ 失败且 fallback 且 retry<2 → retrying → requesting
                    └─ 否则 → failed
任意外部 abort → aborted（增量全部作废，不入消息历史）
```

时序 1：native 流式 tool-call（OpenAI 系）

```
AgentRuntime → callAIStream(tools) → OpenAISdkProvider.chatStream
  → HTTP stream ── start ──→ onEvent('start')
  ← chunk: delta.tool_calls[0].id/name        → onEvent('tool_call',{index:0,id,name})
  ← chunk: delta.tool_calls[0].arguments:"{\"q"→ onEvent('tool_call',{index:0,argumentsDelta})
  ← chunk: finish_reason='tool_calls'         → assembler.finalize() → 校验
  ← usage chunk（include_usage）              → onEvent('done',{usage})
  → CallAIStreamResult{content:'', toolCalls:[...]} → 写 agent_llm_calls(ok)
```

时序 2：prompt_fallback 解析失败重试

```
AgentRuntime → chatStream(tools, mode=fallback)
  → systemPrompt 注入工具契约 → 模型返回文本
  → PromptToolCodec.parse → unknown_tool
  → 回填 buildRetryMessage 作为 user 消息 → 重发（parse_retry_count=1）
  → 解析通过 → done → 两行 agent_llm_calls（第一行 status='parse_failed'）
```

## 7. 失败模式与边界情况

1. **崩溃在 HTTP 请求发出后、响应前**：本轮迭代未完成、`saveState` 未执行（spec §7.2）；恢复后重发该轮。LLM 调用无副作用，幂等安全。
2. **崩溃在 tool_calls 组装完成、工具执行前**：恢复后重新决策，可能产生不同 tool_calls——可接受（工具未执行，无外部副作用）；轨迹按新决策续写。
3. **崩溃在工具执行后、saveState 前**：恢复后模型可能重复调用同一工具——按 spec §3.4 的幂等键约定由工具层兜底，协议层不负责。
4. **流式中途 abort**：`ToolCallStreamAssembler` 中的半成品**必须丢弃**，只有 finalize+校验通过才允许进入 `state.messages`；否则恢复后会把残缺 arguments 回显给模型造成连锁幻觉。
5. **tool_calls index 乱序/跳号**（非主流兼容平台）：assembler 按 index 归并容忍乱序；finalize 时 index 不连续（如只有 0 和 2）→ `ToolProtocolError('format_violation')`，按降级重试策略处理。
6. **arguments 因 max_tokens 截断**（finish_reason='length'，argumentsJson 不闭合）：标 `ToolProtocolError('truncated')`；native 路径不回填重试，直接抛给护栏（重试通常同样截断，应放大 maxTokens 或缩小工具结果）。
7. **能力标记误判为 native，provider 实际 400**（如接入点未开 tools）：适配层捕获含 tools 字样的 400，本轮自动改走 prompt_fallback 重发一次，流水记两行（本文新增决策）；连续两次失败不再降级，直接抛错。
8. **降级协议模型无视格式**：模型输出不含 ```tool_call 块 → 视为终答收敛（**不是错误**）；若护栏发现任务长期不收敛，由 maxIterations 兜底。
9. **模型在正文伪造 tool_call 块**：parse 只认第一个 fenced 块且做白名单校验；unknown_tool 重试，防止模型引用未注入的工具名。
10. **usage 缺失**：见 §5.6；不影响主循环，仅观测缺口。
11. **tool result 超长**：截断在 tool-gateway（14-tool-registry）完成，协议层收到的已是截断后字符串。
12. **Google 无 tool_call id / Anthropic tool_result 必须配对 tool_use_id**：恢复路径重建消息历史时若发现孤儿的 role:'tool' 消息（对应 assistant 消息缺失 toolCalls），state 加载校验直接报错拒绝恢复（本文新增决策），避免发出非法请求被 provider 400。

## 8. 安全与权限

- **LLM 输出即不可信输入**：arguments 必须先过 JSON Schema 校验再进 tool-gateway；工具白名单由 AgentRuntime 控制，协议层不执行任何工具。
- 降级协议系统提示中的工具描述**不得包含凭据/内部 URL**；凭据注入维持 ToolService 占位符机制，LLM 永不见明文（spec §9）。
- 工具执行的 SSRF 防护不变（`validateOutboundUrl` 统一闸门，spec §1.1）。
- `agent_llm_calls` 的 `error` 字段可能含用户数据：写入前截断至 500 字符；不记录完整 prompt/response（那属轨迹表职责，且需脱敏策略，归 11-agent-runtime）。
- Web 端多租户：协议层本身不新增 IPC/REST；流水表查询接口若暴露（M2 观测 UI），必须注册并鉴权（02-横切工作的历史教训）。

## 9. 与其他模块的契约

- **11-run-journal**：journal（`workflow_run_events`）只记节点级状态变迁，不记 LLM 调用明细；协议层流水走 `agent_llm_calls`，二者经 `run_id`/`node_run_id` 关联。崩溃恢复语义（E1/E2/E3）对协议层透明。
- **11-agent-runtime（规划中）**：消费 `CallAIStreamResult.toolCalls`；`state.messages` 中的 `toolCalls`/`role:'tool'` 消息经 E2 的 `state_json` 持久化，恢复后必须满足 §7-12 的配对校验。usage 汇总从 `done.usage` 读取。
- **14-tool-registry（规划中）**：`AgentToolSpec` 的唯一生产者；name 合法性（§5.1 正则）由注册表保证，协议层假设其成立。
- **质量门 Verifier（spec §6）**：LLM 评判走 `callAI` 普通路径（mode='plain'），不携带 tools。
- **provider-template / 设置 UI**：`supportsTools` 徽标（AddProviderDialog.vue）已有，无需改动；native/fallback 推导在解析期完成。

## 10. 测试策略

**单测**（vitest，mock fetch/SDK 流，不落网）：

- `ToolCallStreamAssembler`：正常多 index 合并、乱序、跳号、截断 JSON、空参数（`{}`）。
- `PromptToolCodec`：fenced/裸 JSON/首尾花括号三级提取、unknown_tool、schema_violation、纯文本判收敛、伪造工具名拒绝、重试消息构造。
- mode-resolver：能力标记 × toolCallingMode 全组合（含 native-only 抛错）。
- 能力收敛：三处旧实现删除后，`resolveCapabilities` 单测扩展覆盖 §5.4 规则表每行。

**provider 适配矩阵**（每家 × 流式/非流式 × 单调用/并行调用 × 降级路径）：

| | openai | deepseek | zhipu | bailian | moonshot | minimax | volcengine | anthropic | google |
|---|---|---|---|---|---|---|---|---|---|
| 非流式单调用 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 非流式并行 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 流式单调用（index 合并） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓（block 合并） | ✓（整包） |
| 流式并行 | ✓ | ✓ | ✓ | ✓ | ✓ | 冒烟 | ✓ | ✓ | ✓ |
| 400 误判自动降级 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a |
| prompt_fallback 解析+重试 | 任一非 native 模型共用 codec 单测 + 2 家真实冒烟 |

M1 期 OpenAI 系用录制 SSE 流回放，anthropic/google 留接口占位到 M2；每家真实 API 冒烟脚本（scripts/ 下，手动触发，不进 CI）。

**回归**：现有 9+ 调用点（llm-chat/skill-call/longwriting/story-to-video/chat）不传 tools 时行为与现行完全一致——请求体不得出现 `tools`/`tool_choice` 字段（序列化层对此有断言），`callAIStream` 的 delta/usage 语义不变。

**端到端**（M1 验收，02-M1）：OpenAI 兼容模型跑"查资料→写摘要"，≥5 轮工具调用收敛；杀进程重启后续跑；`agent_llm_calls` 行数与轨迹轮数一致。

## 11. 里程碑拆解

- **M1（地基，02-M1.3）**：§5.1 全部类型扩展；`tool-calling/` 四模块；OpenAISdkProvider 全量适配（覆盖 openai/deepseek/zhipu/bailian/moonshot/minimax）+ VolcEngineSdkProvider 复用 assembler；prompt_fallback 协议；能力检测三处收敛；`agent_llm_calls` 双端迁移；§7-4/5/6/8 的失败路径单测；§10 回归断言。
- **M2（工具生态与观测）**：Anthropic（tool_use 块）、Google（functionCall + systemInstruction 修复）适配；custom-model 迁移到 OpenAISdkProvider；usage 全平台流式回传口径收口；观测 UI 数据源（流水表查询接口 + 鉴权）。
- **M3（长程能力）**：协议层无新功能；为 Verifier 的 LLM 评判与 distiller 蒸馏提供稳定的 plain 模式调用；按真实运行数据校准 §5.4 启发式规则表（把误判过的型号落库为显式 supportsTools=false）。
- **M4（业务化收口）**：ep/longwriting 迁移到 AgentRuntime 后回归其全部调用点；按 `agent_llm_calls` 统计各家 tool-calling 成功率，收敛"推荐模型"清单；评估是否放开降级路径用于生产（联动 02-开放问题 2）。

## 12. 开放问题

1. `toolChoice` 是否需要 `'required'`（强制必须调工具）？spec §8.1 未列；Anthropic `any`、Google `ANY`、OpenAI `required` 均支持，加上成本低，建议 M2 评估。
2. usage 缺失平台是否引入本地 tokenizer 估算（引入 tiktoken 类依赖）？本文决策为"不估算、护栏用 chars/4 兜底"，若成本核算精度不足再立项。
3. custom-model 迁移到 OpenAISdkProvider 是否影响存量用户自建兼容端点（旧 fetch 实现对非标准 SSE 容错更宽）？M2 迁移前需保留回退开关。
4. 流式中 content 与 tool_calls 同时出现时的 UI 呈现（轨迹视图如何展示"边说边调"）——归轨迹视图设计，协议层已两者都上抛。
5. prompt_fallback 下并行调用的执行语义（顺序执行 vs Promise.all）——归 11-agent-runtime / 14-tool-registry，本文仅在协议层保证数组顺序稳定。

---

## 2026-09-06 修订（21 号决策落地：协议层载体 = AI SDK v6）

> 依据 [21-oss-adoption.md](./21-oss-adoption.md)。本文的**契约层全部保留**：
> 类型扩展（§5.1 的 tools/toolChoice/role:'tool'/tool_call 增量）、错误分类、
> 能力检测收敛（§5.4）、降级协议（§5.5）、token 口径（§5.6）、`agent_llm_calls` 审计表。
> **实现载体变更**：不再自研 §5.2 协议模块与 §5.3 十家逐家适配，改用 AI SDK provider 层。

### R1 载体映射

| 本文原设计 | AI SDK 替代 | 说明 |
|---|---|---|
| §5.2 mode-resolver / stream-assembler / 序列化 | `ai@^6` 内置（LanguageModelV3 协议统一 tools/流式增量/usage） | AgentToolSpec 序列化经 `tool()` + zod（standard-schema） |
| §5.3 OpenAI 兼容系 7 家 | `@ai-sdk/openai-compatible`（`createOpenAICompatible`，spike 验证按请求动态构造） | 挂在现有 getProviderConfig 之上（密钥解密/fallback 链/SSRF 不动，provider-adapter ~100 行） |
| §5.3 anthropic（tool_use 块） | `@ai-sdk/anthropic` 官方包 | §5.3 差异点 1/2/3（id/并行/空 content）官方包已处理 |
| §5.3 google（functionCall） | `@ai-sdk/google` 官方包 | 差异点 5（system 丢失）随包升级验证 |
| §5.5 PromptToolCodec | **保留自研**，作为 harness 级降级：ai@6 middleware（wrapLanguageModel）拦截不支持原生 tools 的模型 | 协议模板/严格校验/重试 2 次照本文 §5.5；能力标记（§5.4）仍先行 |
| §5.6 token 口径 | `usage` 从 stream `done` 事件统一上抛（spike 验证）；缺失记 NULL 照旧 | maxTokens 护栏 chars/4 兜底不变 |

### R2 收益与剩余工作

十家适配表坍缩为三个包依赖 + 一个 provider-adapter；剩余自研工作：
① provider-adapter（getProviderConfig→LanguageModel，LRU 缓存+更新失效）；
② 能力标记与降级路由（§5.4/§5.5 原样）；③ 审计表写入（llm-call-logger 原样）。

### R3 版本红线（违者埋坑）

钉 `ai@^6.0.277`（Electron 44 后 Node 门槛已满足，钉 6.x 依据为 @ai-sdk 配套生态，见 21 号 §1.3 更新）；
overrides 锁传递依赖 + CI `npm ls ai` 单版本断言；ESM-only——agent-runtime 内
动态 `import()`，类型 `import type`。详见 21 号 §1.3。
