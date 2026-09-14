/**
 * LwPlot 租户注入回归（2026-09-12 深度 review P1-1）
 *
 * 事务回调内的裸 manager 仓储不走 BaseRepository 的 scoped 注入：
 * batchCreate / reorderPlots / 两个桥表的 replaceAll + migrateFromJson 必须
 * 事务外同步捕获 getCurrentUserId() 显式落列/过滤，否则行 user_id=NULL，
 * 对所有 scoped 读不可见（写读口径割裂）。
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwPlotRepository } from '@core/database/repositories/lw-plot.repository'
import { LwPlotCharacterRepository } from '@core/database/repositories/lw-plot-character.repository'
import { LwPlotEntity } from '@core/database/entities/lw-plot.entity'
import { LwPlotCharacterEntity } from '@core/database/entities/lw-plot-character.entity'
import { runWithUser, runWithoutUser } from '@core/context/user-context'

describe.each(getTestDialects())('LwPlot 租户注入 [%s]', dialect => {
  let tds: TestDataSource
  let plots: LwPlotRepository
  let bridges: LwPlotCharacterRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    plots = new LwPlotRepository(tds.ds)
    bridges = new LwPlotCharacterRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('batchCreate 主行+桥表行注入当前用户（revert 注入即红）', async () => {
    const list = await runWithUser('user-a', () =>
      plots.batchCreate('p1', [{ title: 'A', summary: 's', involvedCharacters: ['char_c1'] }]),
    )
    expect(list).toHaveLength(1)

    const plotRows = await tds.ds.getRepository(LwPlotEntity).find()
    expect(plotRows).toHaveLength(1)
    expect(plotRows[0].userId).toBe('user-a')

    const bridgeRows = await tds.ds.getRepository(LwPlotCharacterEntity).find()
    expect(bridgeRows).toHaveLength(1)
    expect(bridgeRows[0].userId).toBe('user-a')
  })

  it('桥表行跨租户不可见（scoped 读口径）', async () => {
    const list = await runWithUser('user-a', () =>
      plots.batchCreate('p1', [{ title: 'A', summary: 's', involvedCharacters: ['char_c1'] }]),
    )
    expect(await runWithUser('user-a', () => bridges.getCharacterIdsByPlotId(list[0].id))).toEqual(['char_c1'])
    expect(await runWithUser('user-b', () => bridges.getCharacterIdsByPlotId(list[0].id))).toEqual([])
  })

  it('无用户上下文 → 落 NULL 且 NULL 口径读写一致', async () => {
    const list = await runWithoutUser(() =>
      plots.batchCreate('p1', [{ title: 'A', summary: 's', involvedCharacters: ['char_c1'] }]),
    )
    const plotRows = await tds.ds.getRepository(LwPlotEntity).find()
    expect(plotRows[0].userId).toBeNull()
    expect(await runWithoutUser(() => bridges.getCharacterIdsByPlotId(list[0].id))).toEqual(['char_c1'])
  })

  it('replaceAll 注入当前用户且旧集合按租户清理', async () => {
    const list = await runWithUser('user-a', () => plots.batchCreate('p1', [{ title: 'A', summary: 's' }]))
    await runWithUser('user-a', () => bridges.replaceAll(list[0].id, ['char_c1', 'char_c2']))

    const bridgeRows = await tds.ds.getRepository(LwPlotCharacterEntity).find()
    expect(bridgeRows).toHaveLength(2)
    expect(bridgeRows.every(r => r.userId === 'user-a')).toBe(true)

    await runWithUser('user-a', () => bridges.replaceAll(list[0].id, ['char_c3']))
    const after = await tds.ds.getRepository(LwPlotCharacterEntity).find()
    expect(after).toHaveLength(1)
    expect(after[0].characterId).toBe('char_c3')
  })

  it('reorderPlots 不跨租户改序', async () => {
    const list = await runWithUser('user-a', () =>
      plots.batchCreate('p1', [
        { title: 'A', summary: 's' },
        { title: 'B', summary: 's' },
      ]),
    )
    const idA = list[0].id

    // 他租户改序无效
    await runWithUser('user-b', () => plots.reorderPlots('p1', [{ id: idA, order: 9 }]))
    let rows = await tds.ds.getRepository(LwPlotEntity).find()
    expect(rows.find(r => r.id === idA)!.plotOrder).toBe(0)

    // 本租户改序生效
    await runWithUser('user-a', () => plots.reorderPlots('p1', [{ id: idA, order: 9 }]))
    rows = await tds.ds.getRepository(LwPlotEntity).find()
    expect(rows.find(r => r.id === idA)!.plotOrder).toBe(9)
  })
})
