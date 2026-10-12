/**
 * 对抗性测试：严格模式能否拦住「裸 repo + 手工注入 null」的写入？
 *
 * 这是对本次修复边界的诚实验证：
 *   修复只覆盖 scoped.save/saveMany/insert（经 scopeEntity）。
 *   若某 Repository 用 this.repo（裸）并手工 entity.userId = getCurrentUserId()，
 *   严格模式**拦不住**——调用方拿不到 userId 时仍会落 NULL 孤儿行。
 *
 * 期望结果（诚实记录）：
 *   该路径不被拦截 → 记为「已知边界」，需后续收敛（把手工注入也纳入校验）。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { setStrictTenantWrites } from '@core/database/base-repository'
import { AgentToolCallRepository } from '@core/database/repositories/agent-tool-call.repository'
import {
  createTestDataSource,
  type TestDataSource,
} from '../helpers/create-test-data-source'

describe('严格模式覆盖边界（诚实记录）', () => {
  let testDs: TestDataSource
  let repo: AgentToolCallRepository

  beforeAll(async () => {
    testDs = await createTestDataSource('sqlite')
    repo = new AgentToolCallRepository(testDs.ds)
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

  it('scoped 写入受严格模式保护（fail-closed）', async () => {
    setStrictTenantWrites(true)
    // 用 scoped 路径（其它仓库的常规写法）应被拦
    // 这里直接验证机制：无上下文时 getCurrentUserIdStrict 会抛
    const { getCurrentUserIdStrict } = await import('@core/context/user-context')
    expect(() => getCurrentUserIdStrict()).toThrow()
  })

  it('【已记录的边界】裸 repo + 手工注入路径不受严格模式保护（待后续收敛）', async () => {
    setStrictTenantWrites(true)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // agent-tool-call.repository.append() 内部是：
    //   entity.userId = getCurrentUserId()   ← 严格模式下**不抛错**（未走写专用入口）
    //   await this.repo.insert(entity)       ← 裸 repo，不过 scopeEntity
    //
    // 因此该路径仍会落 user_id=NULL。这是本次修复**已知且已记录**的覆盖边界：
    // 严格校验落在 BaseRepository.scoped（save/saveMany/insert），
    // 全项目约 140 处手工注入点未纳入（批量替换风险高，见 user-context 注释）。
    // 本用例把边界固化为断言，避免将来误以为"已全覆盖"。
    await repo.append({
      runId: 'run-1',
      toolName: 'test-tool',
      dangerLevel: 'read',
      approval: 'auto',
      status: 'ok',
    })

    const rows = await testDs.ds.query(
      'SELECT user_id FROM agent_tool_calls WHERE run_id = ?',
      ['run-1'],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBeNull() // ← 边界确认：仍为 NULL
    void warn
  })

  it('非严格模式（Electron）行为不变：写入并落 NULL（向后兼容）', async () => {
    setStrictTenantWrites(false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await repo.append({
      runId: 'run-2',
      toolName: 'test-tool',
      dangerLevel: 'read',
      approval: 'auto',
      status: 'ok',
    })

    const rows = await testDs.ds.query(
      'SELECT user_id FROM agent_tool_calls WHERE run_id = ?',
      ['run-2'],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBeNull()
    void warn
  })

  it('getCurrentUserIdForWrite 在严格模式下抛错（供写入路径迁移用）', async () => {
    const { getCurrentUserIdForWrite, getCurrentUserId } = await import(
      '@core/context/user-context'
    )
    setStrictTenantWrites(true)
    // 写专用入口：抛错
    expect(() => getCurrentUserIdForWrite()).toThrow()
    // 通用入口：不抛错（后台调度器依赖它可降级）
    expect(getCurrentUserId()).toBeNull()
  })
})