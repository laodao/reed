/**
 * 研讨室直调 LLM 助手（v2.1 M2）
 * @module core/packs/longwriting/story-room/room-llm
 *
 * 静默共识提取、滚动摘要等后台微任务不走 agent run（避免工作台噪音），
 * 直调 provider generateText——模型档位沿用宿主 resolveModel（设计文档
 * 开放问题 #2：先同模型，量产后再配置化）。
 */

import { generateText } from 'ai'
import { createLogger } from '@core/utils/logger'
import { getAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'

const logger = createLogger('StoryRoomLlm')

export interface RoomLlmRequest {
  system: string
  user: string
  maxTokens?: number
}

/** 直调文本生成；失败抛错（调用方自行 fail-soft） */
export async function generateRoomText(
  purpose: string,
  req: RoomLlmRequest,
  opts?: { providerConfigId?: string; modelId?: string },
  signal?: AbortSignal,
): Promise<string> {
  const harness = getAgentLoopHarness()
  const model = await harness.resolveModel({
    providerConfigId: opts?.providerConfigId,
    modelId: opts?.modelId,
  })
  try {
    const r = await generateText({
      model: model as never,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      maxOutputTokens: req.maxTokens,
      abortSignal: signal,
    })
    logger.info(`[story-room] 直调完成 purpose=${purpose} chars=${r.text?.length ?? 0}`)
    return r.text ?? ''
  } catch (e: any) {
    // 供应商 4xx/5xx 细节（responseBody）对定位 Bad Request 至关重要
    logger.error(`[story-room] 直调失败 purpose=${purpose} url=${e?.url ?? ''} status=${e?.statusCode ?? ''} body=${String(e?.responseBody ?? e?.message ?? '').slice(0, 300)}`)
    throw e
  }
}
