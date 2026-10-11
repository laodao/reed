/**
 * 严格租户写入模式 —— 集成回归测试（sqlite 内存库）
 *
 * 背景（2026-10 深度 review）：
 *   user-context 早已提供 getCurrentUserIdStrict()，注释写明「Repository 在严格
 *   模式下应使用此函数（防止数据越权）」，但**全项目零调用**——机制设计出来却没接线。
 *   Web 多租户下，漏包 runWithUser 的写入会把 user_id 落 NULL（孤儿行）：所有租户
 *   都查不到，数据静默「隐身」，此前只有 console.warn，线上极易忽略。
 *
 * 本测试锁定修复后的语义：
 *   - 默认（Electron 单用户）：无 userId 仍可写，只是告警（行为不变，向后兼容）
 *   - 严格（Web 多租户）：无 userId 写入必须**抛错** fail-closed，不得落库
 *   - 有 userId：两种模式都正常写入并注入 user_id
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { runWithUserAsync } from '@core/context/user-context'
import { setStrictTenantWrites } from '@core/database/base-repository'
import { DialogRepository } from '@core/database/repositories/dialog.repository'
import {
  createTestDataSource,
  type TestDataSource,
} from '../helpers/create-test-data-source'

const USER_A = 'strict-user-A'

/** create 要求 title + modelId，其余可选 */
const baseDialog = (title: string) => ({ title, modelId: 'test-model' })

describe('严格租户写入模式（sqlite）', () => {
  let testDs: TestDataSource
  let repo: DialogRepository

  beforeAll(async () => {
    testDs = await createTestDataSource('sqlite')
    repo = new DialogRepository(testDs.ds)
  })

  afterAll(async () => {
    await testDs.close()
  })

  beforeEach(async () => {
    await testDs.truncateAll()
  })

  afterEach(() => {
    setStrictTenantWrites(false)
    vi.restoreAllMocks()
  })

  it('默认模式（Electron）：无用户上下文仍可写入，只告警不阻断', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setStrictTenantWrites(false)

    // 不应抛错——Electron 单用户场景有无进程默认值都可能，保持向后兼容
    const created = await repo.create(baseDialog('宽松模式写入'))
    expect(created).toBeTruthy()
    // 应当有告警提示暴露调用链
    expect(warn).toHaveBeenCalled()
  })

  it('严格模式（Web 多租户）：无用户上下文写入必须 fail-closed 抛错', async () => {
    setStrictTenantWrites(true)

    // 核心断言：不能静默落 NULL，必须抛错
    await expect(repo.create(baseDialog('严格模式应被拒'))).rejects.toThrow()

    // 且必须真的没落库（不能先写了再抛）
    const rows = await repo.getAll()
    expect(rows).toHaveLength(0)
  })

  it('严格模式：带用户上下文写入正常，且注入正确 user_id', async () => {
    setStrictTenantWrites(true)

    const created = await runWithUserAsync(USER_A, async () =>
      repo.create(baseDialog('严格模式合法写入')),
    )
    expect(created).toBeTruthy()

    // DTO 刻意不暴露 userId，故直接查库确认 user_id 真的被注入
    // （这是多租户隔离的落点：漏注入会让数据对所有租户不可见）
    const rows = await testDs.ds.query('SELECT user_id FROM dialogs WHERE id = ?', [created.id])
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe(USER_A)
  })

  it('严格模式开关可动态切换（Web 启动时开启，测试间互不污染）', async () => {
    setStrictTenantWrites(true)
    await expect(repo.create(baseDialog('x'))).rejects.toThrow()

    setStrictTenantWrites(false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(repo.create(baseDialog('y'))).resolves.toBeTruthy()
    expect(warn).toHaveBeenCalled()
  })
})