/**
 * 平台层 LLM 单轮文本生成（供跨包后台微任务使用）
 * @module platform/services/simple-llm
 *
 * 用途：知识库章节摘要、其他不进入 agent run 的后台小任务（避免工作台噪音）。
 * 直调 provider（经 agent-loop harness 的 resolveModel 解析模型档位），
 * 与 story-room 的 room-llm 同思路，但归属平台层以免跨包引用。
 *
 * 失败抛错，调用方自行 fail-soft（后台任务不应把异常抛给主流程）。
 */

import { generateText } from 'ai'
import { createLogger } from '@core/utils/logger'
import { getAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'

const logger = createLogger('SimpleLlm')

export interface SimpleLlmRequest {
  system: string
  user: string
  maxTokens?: number
}

export interface SimpleLlmOptions {
  providerConfigId?: string
  modelId?: string
}

/**
 * 单轮文本生成。
 * @param purpose 用途标签（日志定位）
 * @param req system/user 提示
 * @param opts 可指定 provider/model（默认用宿主解析的模型档位）
 */
export async function generateCompletionText(
  purpose: string,
  req: SimpleLlmRequest,
  opts?: SimpleLlmOptions,
): Promise<string> {
  const harness = getAgentLoopHarness()
  const model = await harness.resolveModel({
    providerConfigId: opts?.providerConfigId,
    modelId: opts?.modelId,
  })
  const modelTag = (model as { modelId?: string; model_id?: string })?.modelId
    ?? (model as { modelId?: string; model_id?: string })?.model_id
    ?? 'unknown'
  try {
    const r = await generateText({
      model: model as never,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      maxOutputTokens: req.maxTokens,
    })
    logger.info(
      `[simple-llm] 完成 purpose=${purpose} model=${modelTag} chars=${r.text?.length ?? 0}` +
        (r.text ? '' : '（空文本：推理型模型可能耗尽 token 预算，需提高 maxTokens）'),
    )
    return r.text ?? ''
  } catch (e: unknown) {
    const err = e as { url?: string; statusCode?: number; responseBody?: unknown; message?: string }
    logger.error(
      `[simple-llm] 失败 purpose=${purpose} url=${err?.url ?? ''} status=${err?.statusCode ?? ''} ` +
        `body=${String(err?.responseBody ?? err?.message ?? '').slice(0, 300)}`,
    )
    throw e
  }
}