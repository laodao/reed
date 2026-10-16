/**
 * 回退保留 · 导出 outputPath 守卫 · handler 单测（纯 mock，不触真实 ffmpeg/库）
 * @module tests/unit/episode-production/compose/compose-output-path-guard
 *
 * 覆盖 resolveOutputPath 双保险守卫（经 ep:export-mp4 通道验证）：
 * - 留空（自动命名）：resolvedDir 恰为导出目录本身，守卫必须放行——
 *   原实现 `!resolvedDir.startsWith(defaultDir + path.sep)` 会把
 *   dirname(resolved) === defaultDir 的合法情形误判为越界（既有缺陷）；
 * - 越界仍拒绝：绝对路径 / `..` 穿越维持既有拒绝口径。
 *
 * 注：自升级回退保留手工摘取（源自 a73f6db7 的守卫放行修复），不含 ZIP 导出等内容。
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-compose-guard-'))
const DEFAULT_EXPORT_DIR = path.join(TMP_ROOT, 'episode-production', 'exports')

vi.mock('@core/ipc/bridge-adapter', () => ({
  ipcBridge: { handle: vi.fn(), removeHandler: vi.fn() },
}))

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    dataSource: {
      getRepository: () => ({
        findOne: async () => ({ id: 'eps_1' }),
      }),
    },
  }),
}))

vi.mock('@core/context/user-context', () => ({
  getCurrentUserId: () => 'user_1',
}))

vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getUserDataPath: () => TMP_ROOT,
    getDataPath: () => TMP_ROOT,
  }),
}))

vi.mock('@electron/ipc/handlers/_platform', () => ({
  isElectron: false,
  loadElectronModules: () => ({}),
}))

vi.mock('./episode-mp4-exporter.runner', () => ({
  FluentFfmpegRunner: class {},
  NodeFileWriter: class {},
}))

vi.mock(
  '@core/platform/episode-production/compose/episode-mp4-exporter.service',
  () => ({
    EpisodeMp4ExporterService: class {
      async exportEpisodeToMp4(input: any) {
        return { ok: true, outputPath: input.outputPath }
      }
    },
  }),
)

async function getExportMp4Handler(): Promise<(...args: any[]) => Promise<any>> {
  await import('@core/packs/episode-production/handlers/compose.handler')
  const { registerComposeHandlers } = await import(
    '@core/packs/episode-production/handlers/compose.handler'
  )
  registerComposeHandlers()
  const { ipcBridge } = await import('@core/ipc/bridge-adapter')
  const calls = (ipcBridge.handle as ReturnType<typeof vi.fn>).mock
    .calls as Array<[string, (...args: any[]) => Promise<any>]>
  const entry = calls.find(([ch]) => ch === 'ep:export-mp4')
  expect(entry, 'ep:export-mp4 应已注册').toBeTruthy()
  return entry![1]
}

afterAll(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true })
})

describe('ep:export-mp4 outputPath 守卫（回退保留）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('留空路径放行：自动命名落导出目录本身（原守卫误判越界的既有缺陷）', async () => {
    const handler = await getExportMp4Handler()
    const res = await handler({}, 'eps_1', '')
    expect(res.success).toBe(true)
    expect(res.data.outputPath).toContain(DEFAULT_EXPORT_DIR)
    expect(res.data.outputPath).toMatch(/eps_1-.*\.mp4$/)
  })

  it('纯文件名（含子目录）放行且自动建目录', async () => {
    const handler = await getExportMp4Handler()
    const res = await handler({}, 'eps_1', 'sub/out.mp4')
    expect(res.success).toBe(true)
    expect(res.data.outputPath).toContain(DEFAULT_EXPORT_DIR)
    expect(res.data.outputPath.endsWith('sub/out.mp4')).toBe(true)
  })

  it('绝对路径仍拒绝（越界守卫不放松）', async () => {
    const handler = await getExportMp4Handler()
    const res = await handler({}, 'eps_1', '/etc/passwd.mp4')
    expect(res.success).toBe(false)
    expect(res.error).toContain('outputPath 只接受文件名')
  })

  it('`..` 目录穿越仍拒绝（越界守卫不放松）', async () => {
    const handler = await getExportMp4Handler()
    const res = await handler({}, 'eps_1', '../escape.mp4')
    expect(res.success).toBe(false)
    expect(res.error).toContain('..')
  })
})
