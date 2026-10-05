/**
 * export:* IPC 通道 Web 端封堵单测（review H1 回归）
 *
 * 背景：export:to-obsidian / get-vault-* 的 vaultPath/subPath/appendFile 均客户端
 * 可控，Web 端（多租户 HTTP）若放行即意味着任意登录用户可枚举服务器目录、在任意
 * 路径建目录/写 .md 文件。修复：Obsidian 四通道 handler 入口 isElectron 守卫
 * （Web 端返回"仅桌面端可用"）+ ipc-router ADMIN_CHANNELS 路由门禁兜底。
 *
 * 本测试在模拟的非 Electron 环境（delete process.versions.electron）下加载
 * export.handler，验证四通道全部拒绝且不触碰文件系统、双端安全的 message-word
 * 不受影响；再在 Electron 环境下验证桌面端功能无损。
 */
import { describe, it, expect, afterAll } from 'vitest'

// 模块级 isElectron 在加载时求值：必须先清掉 versions.electron 再 resetModules
// 重新动态加载，才能让 export.handler 走 Web 分支。
const hadElectron = !!(process.versions as Record<string, string | undefined>).electron
const savedElectron = (process.versions as Record<string, string | undefined>).electron
delete (process.versions as Record<string, string | undefined>).electron

afterAll(() => {
  if (hadElectron) {
    try {
      ;(process.versions as Record<string, string | undefined>).electron = savedElectron
    } catch {
      /* Electron-as-Node 下可能只读；进程隔离的测试环境无需恢复 */
    }
  }
})

const OBSIDIAN_CHANNELS = [
  'export:to-obsidian',
  'export:get-vault-directories',
  'export:get-vault-files',
  'export:get-obsidian-vaults'
]

describe('export 通道 Web 端封堵（H1）', () => {
  it('非 Electron 环境：Obsidian 四通道拒绝执行，message-word 正常注册', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    const { registerExportHandlers } = await import('@electron/ipc/handlers/export.handler')
    const { invokeIpc: invoke } = await import('@core/ipc/ipc-bridge')
    registerExportHandlers()

    for (const channel of OBSIDIAN_CHANNELS) {
      // 传一个真实存在的目录作为 vaultPath：若守卫缺失，get-vault-* 会真的
      // readdir 服务器目录并返回 success:true（to-obsidian 则走到存在性检查通过）
      const r = (await invoke(channel, [process.cwd()])) as {
        success: boolean
        error?: string
      }
      expect(r.success, `${channel} 在 Web 端必须拒绝`).toBe(false)
      expect(r.error).toContain('桌面端')
    }

    // 双端安全通道不受影响：message-word 只产字节流不落盘，空内容返回业务错误
    // 即证明 handler 已注册且正常执行。
    const r = (await invoke('export:message-word', [{ content: '' }])) as {
      success: boolean
      error?: string
    }
    expect(r.success).toBe(false)
    expect(r.error).toContain('消息内容为空')
  })

  it('Electron 环境：Obsidian 通道正常执行（桌面端功能无损）', async () => {
    ;(process.versions as Record<string, string | undefined>).electron = savedElectron || '44.0.0'
    const { vi } = await import('vitest')
    vi.resetModules()
    const { registerExportHandlers } = await import('@electron/ipc/handlers/export.handler')
    const { invokeIpc: invoke } = await import('@core/ipc/ipc-bridge')
    registerExportHandlers()

    // getVaultDirectories 对读不到的目录吞错返回空列表，能拿到业务结果即证明
    // 守卫没有误伤桌面端。
    const r = (await invoke('export:get-vault-directories', ['/nonexistent-vault-xyz'])) as {
      success: boolean
      data?: unknown
    }
    expect(r).toBeDefined()
    expect(r.success).toBe(true)
    expect(Array.isArray(r.data)).toBe(true)
  })
})

// ipc-router 的 ADMIN_CHANNELS 兜底门禁（与 handler 守卫互为独立防线）
describe('ipc-router 对 export Obsidian 通道的 admin 门禁（H1 兜底）', () => {
  it('ADMIN_CHANNELS 含四个 Obsidian 通道（防未来守卫移除后复发）', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    // ipc-router 顶层 import 了 express 等 web 依赖，直接读源码断言名单，
    // 避免在单测环境拉起整个 web server 模块图。
    const fs = await import('node:fs')
    const source = fs.readFileSync('src/web/server/api/ipc-router.ts', 'utf-8')
    for (const channel of OBSIDIAN_CHANNELS) {
      expect(source, `${channel} 应在 ADMIN_CHANNELS 名单中`).toContain(`'${channel}'`)
    }
  })
})
