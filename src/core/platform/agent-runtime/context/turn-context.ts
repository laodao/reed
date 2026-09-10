/**
 * 轮次上下文块 + 提示词缓存断点（39 号 P0-1）
 * @module core/platform/agent-runtime/context/turn-context
 *
 * 背景：记忆召回/状态快照此前拼进 system prompt——每轮内容变化使前缀缓存从
 * 第一块就失效（OpenAI/DeepSeek 自动前缀缓存、Anthropic cache_control 均以
 * system 为前缀起点），长会话每轮全额计费。
 *
 * 分层（借 Claude Code/codex 同款形态）：
 *   system        只承载跨轮稳定段（人设/规则）——跨轮可缓存
 *   轮次上下文块  记忆/快照等每轮刷新内容，作为 user-role 消息注入本轮消息尾，
 *                 随历史持久化（历史即"当时的上下文"，语义无损）
 *
 * 消息历史因此 append-only（压缩重写除外）→ 前缀缓存跨轮跨步最大化。
 *
 * 稳定标记（双端同检，防用户粘贴伪造——与 compaction.summary 同一纪律）：
 * 识别出的块在压缩守恒中不占用户消息预算、折叠时保留最新一块。
 *
 * 缓存断点：Anthropic 的 prompt caching 需显式 cache_control；对最后一条消息的
 * 末 part 打 ephemeral 断点 = 缓存「system+工具+截至上一步的全部历史」前缀，
 * 多步 run 内每步读缓存、写增量。其余 provider 忽略该 providerOptions，
 * 自动前缀缓存照常工作。
 */

import type { ModelMessage } from 'ai'

/** 轮次上下文块稳定标记（头；双端同检） */
export const TURN_CONTEXT_PREFIX = '[Turn context — system-injected, refreshed per turn]'
/** 轮次上下文块稳定标记（尾） */
export const TURN_CONTEXT_SUFFIX = '[End of turn context]'

/** 组装轮次上下文块消息（content 非空才调；空段由调用方过滤） */
export function turnContextMessage(content: string): ModelMessage {
  return {
    role: 'user',
    content: `${TURN_CONTEXT_PREFIX}\n\n${content}\n\n${TURN_CONTEXT_SUFFIX}`,
  }
}

/** 是否轮次上下文块（双端同时命中才认定——单前缀可被伪造） */
export function isTurnContextMessage(m: ModelMessage | undefined): boolean {
  if (!m || m.role !== 'user' || typeof m.content !== 'string') return false
  return m.content.startsWith(TURN_CONTEXT_PREFIX) && m.content.endsWith(TURN_CONTEXT_SUFFIX)
}

/**
 * 本轮是否已注入上下文块：从尾向前扫描，跳过 assistant/tool（本轮已产生的
 * 消息），先命中块=true（挂起恢复重入 loop 防重复注入），先命中真实用户
 * 消息=false（新轮）。
 */
export function hasCurrentTurnContextBlock(messages: ModelMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (isTurnContextMessage(m)) return true
    if (m.role === 'user') return false
  }
  return false
}

/**
 * Anthropic 缓存断点：最后一条消息的末 part 打 ephemeral cache_control。
 * 纯函数（不改入组；产物仅在本次 streamText 调用使用，不落盘——持久化历史
 * 保持原生形态）。字符串 content 转单 part 形态以承载 part 级 providerOptions；
 * 空 content 消息回退 message 级。其余 provider 忽略该键。
 */
export function withPromptCacheBreakpoint(messages: ModelMessage[]): ModelMessage[] {
  const last = messages[messages.length - 1]
  if (!last) return messages
  const cacheControl = { anthropic: { cacheControl: { type: 'ephemeral' } } }
  let content: ModelMessage['content']
  if (Array.isArray(last.content)) {
    if (last.content.length === 0) {
      content = last.content
    } else {
      // part 级 providerOptions 承载 cache_control（ai-sdk anthropic 读取位）；
      // 联合 part 类型收窄繁琐——以 never 断言收口
      content = last.content.map((part, i) =>
        i === last.content.length - 1
          ? ({
              ...part,
              providerOptions: {
                ...((part as { providerOptions?: Record<string, unknown> }).providerOptions ?? {}),
                ...cacheControl,
              },
            }) as never
          : part,
      ) as never
    }
  } else if (typeof last.content === 'string' && last.content.length > 0) {
    content = [{ type: 'text', text: last.content, providerOptions: cacheControl }] as never
  } else {
    content = last.content
  }
  const out = [...messages]
  out[out.length - 1] = {
    ...last,
    content: content as never,
    ...(Array.isArray(content) && content.length === 0 ? { providerOptions: cacheControl } : {}),
  } as ModelMessage
  return out
}

/** 提示词缓存开关（env kill switch：AGENT_PROMPT_CACHE=0 关闭；缺省开启） */
export function isPromptCacheEnabled(): boolean {
  return process.env.AGENT_PROMPT_CACHE !== '0'
}
