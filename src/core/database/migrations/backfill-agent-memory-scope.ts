/**
 * 飞轮记忆存量回填（六扇门复盘 / 37 号补漏）：
 * agent_memory_entries 中 biz_module 为空、但 source_task_id 可溯源的条目，
 * 从源任务 spec_json.scopeTag 回填 biz_module / project_id。
 *
 * 背景：37 号的分层打标依赖宿主在 runtimeContext 声明 memoryScope，此前部分
 * 宿主（dl/研讨室）未声明，蒸馏条目全部退化 L1 用户级——L1 对所有业务宿主
 * 可见，导致「多智能体框架调研」类记忆串进故事研讨室上下文。本迁移只回填
 * 可从源任务确证的归属；不可溯源的保持 L1（由装配侧 L1 相关度门槛兜底）。
 *
 * 兼容 SQLite + PG（TypeORM 仓储逐行处理，无方言 SQL）；幂等（仅更新
 * biz_module 仍为空的行）。
 */

import { IsNull, type DataSource } from 'typeorm'
import { createLogger } from '@core/utils/logger'
import { AgentMemoryEntryEntity } from '../entities/agent-memory-entry.entity'
import { AgentTaskEntity } from '../entities/agent-task.entity'

const logger = createLogger('BackfillAgentMemoryScope')

interface ScopeTag {
  bizModule?: string
  projectId?: string
}

/** 从任务 spec_json 提取 scopeTag（容错：空/坏 JSON/形状不符返回 null） */
export function deriveScopeFromTaskSpec(specJson: string | null | undefined): ScopeTag | null {
  if (!specJson) return null
  try {
    const spec = JSON.parse(specJson) as { scopeTag?: ScopeTag } | null
    const tag = spec?.scopeTag
    if (!tag || typeof tag !== 'object') return null
    if (typeof tag.bizModule !== 'string' && typeof tag.projectId !== 'string') return null
    return {
      bizModule: typeof tag.bizModule === 'string' ? tag.bizModule : undefined,
      projectId: typeof tag.projectId === 'string' ? tag.projectId : undefined,
    }
  } catch {
    return null
  }
}

export async function backfillAgentMemoryScope(ds: DataSource): Promise<void> {
  const memoryRepo = ds.getRepository(AgentMemoryEntryEntity)
  const taskRepo = ds.getRepository(AgentTaskEntity)
  const untagged = await memoryRepo.find({ where: { bizModule: IsNull() } })
  const candidates = untagged.filter((e) => e.sourceTaskId)
  if (candidates.length === 0) return

  let patched = 0
  for (const entry of candidates) {
    const task = await taskRepo.findOne({ where: { id: entry.sourceTaskId! } })
    const scope = task ? deriveScopeFromTaskSpec(task.specJson) : null
    if (!scope?.bizModule && !scope?.projectId) continue
    await memoryRepo.update(entry.id, {
      bizModule: scope.bizModule ?? null,
      projectId: scope.projectId ?? null,
    })
    patched++
  }
  if (patched > 0) logger.info(`[memory-scope] 存量记忆回填完成：${patched}/${candidates.length} 条已按源任务归属打标`)
}
