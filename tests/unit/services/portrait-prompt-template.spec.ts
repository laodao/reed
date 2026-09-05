/**
 * PortraitService 提示词模板服务单元测试
 * @see src/core/packs/portrait/services/portrait.service.ts
 *
 * 验证目标（spec 2026-07-24 新版人像设计 §5.2）：
 * 1. listPromptTemplates 透传分类过滤
 * 2. applyTemplate 替换 {name}/{gender}/{age} 占位符；模板不存在返回错误
 * 3. savePromptTemplate：新建走 create；更新走 update 且内置模板拒绝修改
 * 4. deletePromptTemplate：内置模板拒绝删除，自定义可删
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- 模块级 mock：必须在 import service 之前声明 ----
vi.mock('@core/services/image.service', () => ({
  ImageService: { generateImage: vi.fn() },
}))
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => Buffer.from('fake')),
  }
})
vi.mock('@core/interfaces/event.interface', () => ({
  getEventEmitter: () => ({ emit: () => {} }),
}))
vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getDataPath: () => '/tmp',
    toAssetUrl: (p: string) => `local-image:///${p}`,
  }),
}))

import * as dbModule from '@core/database/database-manager.interface'
import { PortraitService } from '@core/packs/portrait/services/portrait.service'
import type { PortraitPromptTemplate } from '@shared/types/portrait.types'

// ====================================================================
// mock 工具
// ====================================================================

function makeTemplate(over: Partial<PortraitPromptTemplate> = {}): PortraitPromptTemplate {
  return {
    id: 't1',
    name: '模板A',
    category: 'face',
    content: '{name}, {gender}, age {age}',
    applyTo: ['face'],
    builtin: true,
    sortOrder: 1,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function installMockDb() {
  const repo = {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }
  vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
    portraitPromptTemplates: repo,
  } as never)
  return repo
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ====================================================================

describe('prompt template service', () => {
  it('listPromptTemplates 透传分类过滤', async () => {
    const repo = installMockDb()
    repo.list.mockResolvedValue([makeTemplate()])

    const r = await PortraitService.listPromptTemplates('face')

    expect(repo.list).toHaveBeenCalledWith('face')
    expect(r.success).toBe(true)
    expect(r.data?.length).toBe(1)
  })

  it('listPromptTemplates 仓库未初始化返回错误', async () => {
    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      portraitPromptTemplates: null,
    } as never)

    const r = await PortraitService.listPromptTemplates()
    expect(r.success).toBe(false)
  })

  it('applyTemplate 替换占位符', async () => {
    const repo = installMockDb()
    repo.getById.mockResolvedValue(makeTemplate())

    const r = await PortraitService.applyTemplate('t1', { name: '张三', gender: 'male', age: 32 })

    expect(r.success).toBe(true)
    expect(r.data).toBe('张三, male, age 32')
  })

  it('applyTemplate 未知占位符保留原文', async () => {
    const repo = installMockDb()
    repo.getById.mockResolvedValue(makeTemplate({ content: '{name}, {unknown_key}' }))

    const r = await PortraitService.applyTemplate('t1', { name: '张三' })

    expect(r.data).toBe('张三, {unknown_key}')
  })

  it('applyTemplate 模板不存在返回错误', async () => {
    const repo = installMockDb()
    repo.getById.mockResolvedValue(null)

    const r = await PortraitService.applyTemplate('nope', {})
    expect(r.success).toBe(false)
  })

  it('savePromptTemplate 新建走 create 且强制非内置', async () => {
    const repo = installMockDb()
    repo.create.mockImplementation(async (x: object) => ({ id: 'new-id', ...x }))

    const r = await PortraitService.savePromptTemplate({
      name: '我的模板',
      category: 'body',
      content: 'content',
      applyTo: ['generate'],
    })

    expect(r.success).toBe(true)
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: '我的模板', builtin: false }),
    )
  })

  it('savePromptTemplate 更新内置模板被拒绝', async () => {
    const repo = installMockDb()
    repo.getById.mockResolvedValue(makeTemplate({ builtin: true }))

    const r = await PortraitService.savePromptTemplate({
      id: 't1',
      name: '改名',
      category: 'face',
      content: 'x',
      applyTo: ['face'],
    })

    expect(r.success).toBe(false)
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('内置模板禁止删除', async () => {
    const repo = installMockDb()
    repo.getById.mockResolvedValue(makeTemplate({ builtin: true }))

    const r = await PortraitService.deletePromptTemplate('t1')

    expect(r.success).toBe(false)
    expect(repo.remove).not.toHaveBeenCalled()
  })

  it('自定义模板可删除', async () => {
    const repo = installMockDb()
    repo.getById.mockResolvedValue(makeTemplate({ id: 't2', builtin: false }))

    const r = await PortraitService.deletePromptTemplate('t2')

    expect(r.success).toBe(true)
    expect(repo.remove).toHaveBeenCalledWith('t2')
  })
})
