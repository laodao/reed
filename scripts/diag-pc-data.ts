/**
 * PC 端数据可见性诊断脚本
 *
 * 用途：模拟 PC 端启动顺序，验证 user_id 列、ALS 默认 userId、scoped 查询命中。
 * 不依赖 Electron / DataPathService，直接用 typeorm + 真实 sqlite 文件。
 *
 * 用法：
 *   1. 先 `npm run rebuild:node`（让 better-sqlite3 按 host Node ABI 编译）
 *   2. `npx tsx -r tsconfig-paths/register scripts/diag-pc-data.ts`
 *      可选 DB_PATH=/path/to/the_bot.db（默认 ~/Documents/data/the-bot/the_bot.db）
 *   3. 跑完执行 `npm run rebuild:electron` 切回 PC 端可用 ABI
 *
 * 输出三种场景下 dialogs / images 的命中数量：
 *   场景 1：无 ALS userId、无 defaultUserId
 *           → BaseRepository 退化为 WHERE user_id IS NULL，应返回 0
 *   场景 2：setDefaultUser('local-default-user')
 *           → 命中所有迁移后的 PC 数据
 *   场景 3：runWithUserAsync('somebody-else', …)
 *           → 验证隔离，应返回 0
 */

import 'reflect-metadata'
import { DataSource } from 'typeorm'
import * as os from 'os'
import * as path from 'path'

import * as entities from '@core/database/entities'

async function main(): Promise<void> {
  const dbPath =
    process.env.DB_PATH ||
    path.join(os.homedir(), 'Documents/data/the-bot/the_bot.db')

  const ds = new DataSource({
    type: 'better-sqlite3',
    database: dbPath,
    entities: Object.values(entities).filter(v => typeof v === 'function') as any,
    synchronize: false,
    logging: false,
  })
  await ds.initialize()
  console.log('[diag] dataSource initialized:', dbPath)

  const {
    setDefaultUser,
    getCurrentUserId,
    runWithUserAsync,
    LOCAL_DEFAULT_USER_ID,
  } = await import('@core/context/user-context')

  const { registerCoreDatabaseManager } = await import(
    '@core/database/database-manager.interface'
  )
  registerCoreDatabaseManager(() => ({ getDataSource: () => ds }) as any)

  const { DialogRepository } = await import(
    '@core/database/repositories/dialog.repository'
  )
  const { ImageRepository } = await import(
    '@core/database/repositories/image.repository'
  )

  const dialogRepo = new DialogRepository(ds)
  const imageRepo = new ImageRepository(ds)

  console.log('--- 场景 1: ALS 空 + defaultUserId 空 ---')
  console.log('[currentUserId]', getCurrentUserId())
  let dlg = await dialogRepo.getAll()
  console.log('dialogs.getAll() →', dlg.length)
  let img = await imageRepo.getList(1, 100)
  console.log('images.getList().images →', img.images?.length ?? '?')

  console.log('--- 场景 2: setDefaultUser(LOCAL_DEFAULT_USER_ID) ---')
  setDefaultUser(LOCAL_DEFAULT_USER_ID)
  console.log('[currentUserId]', getCurrentUserId())
  dlg = await dialogRepo.getAll()
  console.log('dialogs.getAll() →', dlg.length)
  img = await imageRepo.getList(1, 100)
  console.log('images.getList().images →', img.images?.length ?? '?')

  console.log('--- 场景 3: runWithUserAsync(somebody-else) ---')
  await runWithUserAsync('somebody-else', async () => {
    console.log('[currentUserId]', getCurrentUserId())
    const d = await dialogRepo.getAll()
    console.log('dialogs.getAll() →', d.length)
    const i = await imageRepo.getList(1, 100)
    console.log('images.getList().images →', i.images?.length ?? '?')
  })

  await ds.destroy()
  console.log('[diag] done')
}

main().catch(e => {
  console.error('[diag] failed:', e)
  process.exit(1)
})
