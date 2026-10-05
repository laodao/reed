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

/**
 * 知识大脑 LLM 输出预算统一上限（review M5）。
 * 推理型模型的思考（reasoning）计入输出 token 预算：77245113 实证 2000 都会被
 * 思考耗尽成空文本，随后 cleanup 提到 8000、goal-distill 提到 6000/8000——但
 * profile/book-passes 走同一 adjudicate 档位模型，仍留 400~3500 的低预算，
 * 推理型配置下几乎必空文本。此处统一为 8000（maxTokens 是上限不是目标，按实际
 * 输出计费，抬高不增加正常路径成本）。
 */
export const BRAIN_LLM_MAX_TOKENS = 8000

export type BrainLlmFn = (req: BrainLlmRequest) => Promise<string>

/** 模型引用解析："modelId" 或 "providerConfigId:modelId" */
export function parseModelRef(raw: string): { providerConfigId?: string; modelId?: string } {
  const sep = raw.indexOf(':')
  if (sep > 0) return { providerConfigId: raw.slice(0, sep), modelId: raw.slice(sep + 1) }
  return { modelId: raw }
}

/** 环境变量模型覆盖（缺省回落宿主模型链） */
export function brainModelOverride(kind: 'atomize' | 'adjudicate'): {
  providerConfigId?: string
  modelId?: string
} {
  const raw = kind === 'atomize' ? process.env.KB_ATOMIZE_MODEL : process.env.KB_ADJUDICATE_MODEL
  if (!raw) return {}
  return parseModelRef(raw)
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

/** 拼接两段截断输出（导出供单测）。语义对齐 ai-call 原版并修正其重开头分支：
 * - 续写重复了开头（模型整份重答）→ 丢弃半截 previous，用续写替换；
 * - 正常续写 → 剥掉续写的前导散文，只拼 JSON 主体（散文混进 JSON 流必解析失败）。 */
export function stitchContinuation(previous: string, continuation: string): string {
  const start = continuation.indexOf('{')
  if (start === -1) return previous.trimEnd() + continuation
  const contJson = continuation.substring(start)
  const jsonStart = previous.indexOf('{')
  const soFar = jsonStart !== -1 ? previous.substring(jsonStart) : previous
  if (soFar.startsWith(contJson.substring(0, 50))) {
    return contJson // 整份重答：替换而非串联
  }
  return soFar.trimEnd() + contJson
}

/**
 * 生产默认 LLM：simple-llm + 截断续写（≤2 次）。
 * purpose 决定模型 env 覆盖通道；dynamicOverride（每库模型设置）优先于 env——
 * 由调用方每次现求值（库配置运行时可变）。
 */
export function defaultBrainLlm(
  purpose: 'kb-brain-atomize' | 'kb-brain-adjudicate',
  dynamicOverride?: () => { providerConfigId?: string; modelId?: string }
): BrainLlmFn {
  const once = (req: BrainLlmRequest): Promise<string> => {
    const opts =
      dynamicOverride?.() ??
      brainModelOverride(purpose === 'kb-brain-atomize' ? 'atomize' : 'adjudicate')
    return generateCompletionText(
      purpose,
      { system: req.system, user: req.user, maxTokens: req.maxTokens },
      opts
    )
  }
  return async req => {
    let full = await once(req)
    let continues = 0
    while (continues < 2 && full && isJsonTruncated(full)) {
      full = stitchContinuation(
        full,
        await once({
          system: req.system,
          user: buildContinuePrompt(full),
          maxTokens: req.maxTokens
        })
      )
      continues++
    }
    return full
  }
}

export type BrainModelRef = { providerConfigId?: string; modelId?: string }

/**
 * 每库（kbId）隔离的模型解析 + LLM 工厂（review M7）。
 *
 * 背景：goal-distill/cleanup/layer-relabel/book-passes 是模块级单例，handler 每次
 * 请求用 setModelOverride 覆盖同一个共享解析函数——KB-A 提炼进行中（分钟级
 * fire-and-forget）用户切到 KB-B 触发同类动作时，A 的后续 LLM 调用解析到 B 的
 * 模型。改为按 kbId 存解析函数、调用时以当前 run 的 kbId 取（llm 实例按 kbId
 * 缓存，dynamicOverride 闭包求值时查本 kb 的覆盖）。
 *
 * 优先级：kbId 覆盖 > 构造时 fallback（digest-orchestrator 等按库构造的场景）> env。
 * injected（测试注入的 llm）存在时覆盖整体失效——与旧语义一致。
 */
export interface KbScopedLlm {
  llmFor(kbId: string): BrainLlmFn
  setOverride(kbId: string, fn: () => BrainModelRef): void
}

export function createKbScopedLlm(
  purpose: 'kb-brain-atomize' | 'kb-brain-adjudicate',
  opts: { injected?: BrainLlmFn; fallback?: () => BrainModelRef } = {}
): KbScopedLlm {
  const overrides = new Map<string, () => BrainModelRef>()
  const cache = new Map<string, BrainLlmFn>()
  return {
    setOverride(kbId, fn) {
      overrides.set(kbId, fn)
    },
    llmFor(kbId) {
      if (opts.injected) return opts.injected
      let llm = cache.get(kbId)
      if (!llm) {
        // kb 覆盖 > 构造 fallback > env——链到 env 而非空对象，否则会吞掉 env 覆盖
        llm = defaultBrainLlm(purpose, () => {
          const ref = overrides.get(kbId)?.() ?? opts.fallback?.()
          return (
            ref ?? brainModelOverride(purpose === 'kb-brain-atomize' ? 'atomize' : 'adjudicate')
          )
        })
        cache.set(kbId, llm)
      }
      return llm
    }
  }
}
