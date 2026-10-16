/**
 * 消费记账埋点（v3 M3 #12）：两条工具通路（kb_brain_query / writing-brain-tool）
 * 取包成功后入账一笔——「第一用户是 AI」的可观测性底座。fail-soft，绝不影响取包。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('KbConsumption')

export async function recordConsumption(input: {
  knowledgeBaseId: string
  tool: string
  mode: string
  sceneType?: string | null
  task?: string
  packChars?: number
}): Promise<void> {
  try {
    const db = getCoreDatabaseManager()
    await db.kbConsumptionLogs?.record({
      knowledgeBaseId: input.knowledgeBaseId,
      tool: input.tool,
      mode: input.mode,
      sceneType: input.sceneType ?? null,
      taskExcerpt: input.task ?? '',
      packChars: input.packChars ?? 0,
    })
  } catch (e) {
    logger.warn(`消费记账失败（不影响取包）: ${e instanceof Error ? e.message : String(e)}`)
  }
}
