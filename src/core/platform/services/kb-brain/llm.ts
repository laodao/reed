/**
 * 知识大脑 LLM 调用封装（详细设计 §3.2）
 * @module platform/services/kb-brain/llm
 *
 * 注入式 LLM 函数（照 ChapterLlmFn 先例——测试注入 fake，生产走 simple-llm）。
 * defaultBrainLlm 在 simple-llm 之上加截断续写循环（isJsonTruncated → 续写指令
 * → 拼接，最多 2 次，拼接策略照 ai-call.callAIWithContinue 的轻量版——
 * 那个函数绑死 callAI 无法注入，故自立）。
 *
 * 模型路由（可行性核查 §5.1）：purpose 仅日志标签；廉价模型路由走 env 覆盖
 * （KB_ATOMIZE_MODEL / KB_ADJUDICATE_MODEL，照 AGENT_MEMORY_EMBEDDING 先例），
 * 缺省回落宿主模型。
 */
import { generateCompletionText } from '@core/platform/services/simple-llm'
import { isJsonTruncated } from '@core/platform/services/ai-call'

export interface BrainLlmRequest {
  system: string
  user: string
  maxTokens?: number
}

export type BrainLlmFn = (req: BrainLlmRequest) => Promise<string>

/** 环境变量模型覆盖（缺省回落宿主模型链） */
export function brainModelOverride(kind: 'atomize' | 'adjudicate'): { providerConfigId?: string; modelId?: string } {
  const raw = kind === 'atomize' ? process.env.KB_ATOMIZE_MODEL : process.env.KB_ADJUDICATE_MODEL
  if (!raw) return {}
  // 约定格式：modelId 或 providerConfigId:modelId（后者显式指提供商）
  const sep = raw.indexOf(':')
  if (sep > 0) return { providerConfigId: raw.slice(0, sep), modelId: raw.slice(sep + 1) }
  return { modelId: raw }
}

function defaultLlmOnce(purpose: 'kb-brain-atomize' | 'kb-brain-adjudicate'): BrainLlmFn {
  return async (req) => {
    const opts = brainModelOverride(purpose === 'kb-brain-atomize' ? 'atomize' : 'adjudicate')
    return generateCompletionText(purpose, { system: req.system, user: req.user, maxTokens: req.maxTokens }, opts)
  }
}

/** 续写指令（照 callAIWithContinue 的提示词，去其 provider 绑定） */
function buildContinuePrompt(previous: string): string {
  const start = previous.indexOf('{')
  const jsonSoFar = start !== -1 ? previous.substring(start) : previous
  return `上一轮你的 JSON 输出被截断了，请继续输出，从上次截断的地方继续完成 JSON。

这是你上次输出的内容（被截断）：
${jsonSoFar}

请直接继续输出剩余的 JSON 内容，不要重复已经输出的部分，不要添加任何解释说明。`
}

/** 拼接两段输出（重复开头检测照 callAIWithContinue；导出供单测） */
export function stitchContinuation(previous: string, continuation: string): string {
  const start = continuation.indexOf('{')
  if (start !== -1) {
    const contJson = continuation.substring(start)
    const soFar = previous.indexOf('{') !== -1 ? previous.substring(previous.indexOf('{')) : previous
    if (soFar.startsWith(contJson.substring(0, 50))) {
      return previous.trimEnd() + '\n' + contJson
    }
  }
  return previous.trimEnd() + continuation
}

/**
 * 生产默认 LLM：simple-llm + 截断续写（≤2 次）。
 * purpose 同时决定模型 env 覆盖通道（KB_ATOMIZE_MODEL / KB_ADJUDICATE_MODEL）。
 */
export function defaultBrainLlm(purpose: 'kb-brain-atomize' | 'kb-brain-adjudicate'): BrainLlmFn {
  const once = defaultLlmOnce(purpose)
  return async (req) => {
    let full = await once(req)
    let continues = 0
    while (continues < 2 && full && isJsonTruncated(full)) {
      full = stitchContinuation(full, await once({ system: req.system, user: buildContinuePrompt(full), maxTokens: req.maxTokens }))
      continues++
    }
    return full
  }
}
