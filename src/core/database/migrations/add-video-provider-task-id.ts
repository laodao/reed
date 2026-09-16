/**
 * storyboards / ep_video_segments 增加 provider_task_id 字段
 * （tasks/2026-09-16-ep-hardening H5：视频任务崩溃恢复）
 *
 * H3 图生视频是异步任务（提交返回 taskId，轮询 30~45 分钟）。进程重启后
 * 启动恢复需要凭 taskId 回网关查任务终态——done 则下载落库转 completed，
 * 避免"网关已完成但本地复位 error、算力白费"。
 *
 * 只加列，不动旧列。SQLite + PG 兼容。幂等。
 */

import type { DataSource } from 'typeorm'
import { checkTableExists, ensureColumn } from './migration-utils'

export async function addVideoProviderTaskId(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const type = isPg ? 'text' : 'TEXT'

  for (const table of ['storyboards', 'ep_video_segments']) {
    if (!(await checkTableExists(ds, table, isPg))) {
      console.log(`[add-video-provider-task-id] ${table} 不存在，跳过`)
      continue
    }
    await ensureColumn(
      ds,
      isPg,
      table,
      'provider_task_id',
      `provider_task_id ${type}`,
      'add-video-provider-task-id',
    )
  }
}
