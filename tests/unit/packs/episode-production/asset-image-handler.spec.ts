/**
 * asset-image handler 入口剥离 userId 单测（review M3 回归）
 *
 * 背景：AddImageInput.userId 客户端可控——Web 端显式传他人 ID 会冒名写入他人
 * 租户、传 null 会写入全租户共享行（跨租户内容注入）。修复：IPC 入口
 * handleAddImage 一律以 userId: undefined 调服务，由服务侧回退当前登录用户
 * 上下文；预置 seed 等内部调用方不走本通道、保留显式 userId 语义。
 *
 * 纯 mock 测试（不依赖 better-sqlite3，规避本机 ABI 不匹配）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const addImageMock = vi.fn()

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({ dataSource: {} }),
}))

vi.mock('@core/platform/episode-production/assets/services/asset-image.service', () => ({
  AssetImageService: class {
    addImage = addImageMock
  },
}))

vi.mock('@core/ipc/bridge-adapter', () => ({
  ipcBridge: { handle: vi.fn(), removeHandler: vi.fn() },
}))

// handler 顶部还 import 了实体/类型与其他 service，桩掉有副作用的依赖
vi.mock('@core/platform/episode-production/assets/services/main-image-generator.service', () => ({ MainImageGeneratorService: class {} }))

describe('ep:asset:image:add 入口剥离 userId（M3）', () => {
  beforeEach(() => {
    addImageMock.mockReset()
    addImageMock.mockResolvedValue({ id: 'ai_x' })
  })

  it('客户端传他人 userId / null 均被剥离，服务收到 undefined', async () => {
    const { registerAssetImageHandlers } = await import(
      '@core/packs/episode-production/handlers/asset/asset-image.handler'
    )
    registerAssetImageHandlers()

    // handleAddImage 未导出，经 ipcBridge.handle 捕获注册的 handler 调用。
    // 上面桩的 ipcBridge.handle 是 vi.fn()——重新 import 会拿到同一个 mock 模块，
    // 从其调用记录里取 'ep:asset:image:add' 的 handler。
    const { ipcBridge } = await import('@core/ipc/bridge-adapter')
    const calls = (ipcBridge.handle as ReturnType<typeof vi.fn>).mock.calls as Array<
      [string, (...args: unknown[]) => Promise<unknown>]
    >
    const entry = calls.find(([ch]) => ch === 'ep:asset:image:add')
    expect(entry, 'ep:asset:image:add 应已注册').toBeTruthy()

    for (const userId of ['user-other-tenant', null]) {
      const res = (await entry![1]({}, {
        assetType: 'character',
        assetId: 'cb1',
        category: 'main',
        imagePath: '/img/a.png',
        userId,
      })) as { success: boolean }
      expect(res.success).toBe(true)
      // 关键断言：服务侧收到的 userId 恒为 undefined（由 getCurrentUserId 回退），
      // 客户端传入的 'user-other-tenant' / null 不再透传
      expect(addImageMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ userId: undefined })
      )
      expect(
        (addImageMock.mock.calls.at(-1)![0] as { userId?: unknown }).userId
      ).toBeUndefined()
    }
  })
})
