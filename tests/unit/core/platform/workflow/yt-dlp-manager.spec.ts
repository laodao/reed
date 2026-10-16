/**
 * yt-dlp 管理器测试：二进制探测/下载（mock fetch）/提取音频（mock spawn）/不可用降级提示
 * @module tests/workflow/yt-dlp-manager
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'

// ---- mock 数据目录 ----
vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({ getDataPath: () => 'C:/mock-data' }),
}))

import { YtDlpManager, binaryFileName } from '@core/platform/workflow/tools/yt-dlp-manager'

const BIN = join('C:/mock-data', 'bin', binaryFileName())

function freshManager(): YtDlpManager {
  YtDlpManager.resetForTest()
  return YtDlpManager.getInstance()
}

describe('yt-dlp manager', () => {
  beforeEach(() => { YtDlpManager.resetForTest() })
  afterEach(() => vi.unstubAllGlobals())

  it('binaryFileName 平台化（Windows 为 .exe）', () => {
    expect(binaryFileName()).toMatch(/(yt-dlp|yt-dlp\.exe)/)
  })

  it('ensureBinary：已安装直接返回路径（不触发下载）', async () => {
    vi.spyOn(fsModule(), 'existsSync').mockImplementation((p: string) => p === BIN)
    const mgr = freshManager()
    const p = await mgr.ensureBinary()
    expect(p).toBe(BIN)
  })

  it('ensureBinary：未安装且下载失败 → null（不抛错，上层降级）', async () => {
    vi.spyOn(fsModule(), 'existsSync').mockReturnValue(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')))
    const mgr = freshManager()
    const p = await mgr.ensureBinary()
    expect(p).toBeNull()
  })

  it('ensureBinary：下载成功 → 返回路径', async () => {
    vi.spyOn(fsModule(), 'existsSync').mockReturnValue(false)
    const buf = Buffer.alloc(2_000_000, 7) // 2MB（>1MB 最小校验）
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => buf } as never))
    const writeSpy = vi.spyOn(fsModule(), 'writeFileSync').mockImplementation(() => {})
    // 下载后 ensureBinary 再次 existsSync → true
    vi.spyOn(fsModule(), 'existsSync')
      .mockReturnValueOnce(false)  // 首次探测
      .mockReturnValueOnce(true)   // 下载后复查
    const mgr = freshManager()
    const p = await mgr.ensureBinary()
    expect(p).toBe(BIN)
    expect(writeSpy).toHaveBeenCalledWith(BIN, buf)
  })

  it('extractAudioFromUrl：二进制不可用 → 返回明确降级提示', async () => {
    vi.spyOn(fsModule(), 'existsSync').mockReturnValue(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')))
    const mgr = freshManager()
    const r = await mgr.extractAudioFromUrl('https://youtube.com/watch?v=x', 'C:/out/audio')
    expect('error' in r).toBe(true)
    expect(r.error).toContain('yt-dlp')
  })
})

describe('yt-dlp extractAudioFromUrl 成功分支（mock child_process.spawn）', () => {
  beforeEach(() => {
    YtDlpManager.resetForTest()
    vi.resetModules()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('二进制可用 + spawn 成功 + 输出 wav 生成 → 返回路径', async () => {
    const { EventEmitter } = await import('events')
    const BIN = join('C:/mock-data', 'bin', binaryFileName())
    // 数据目录 mock 保持；existsSync：bin 与输出 wav 均存在
    vi.spyOn(fsModule(), 'existsSync').mockImplementation((p: string) => p === BIN || p === 'C:/out/audio.wav')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('not called')))
    // mock child_process：spawn 返回可触发 close 的假进程
    vi.mock('child_process', () => ({
      spawn: vi.fn(() => {
        const proc = new EventEmitter() as any
        proc.stderr = new EventEmitter()
        proc.on = proc.on.bind(proc)
        setImmediate(() => proc.emit('close', 0))
        return proc
      }),
    }))
    const { YtDlpManager: Mgr } = await import('@core/platform/workflow/tools/yt-dlp-manager')
    const mgr = Mgr.getInstance()
    const r = await mgr.extractAudioFromUrl('https://youtube.com/watch?v=x', 'C:/out/audio')
    expect('path' in r).toBe(true)
    if ('path' in r) expect(r.path).toBe('C:/out/audio.wav')
  })
})

function fsModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('fs') as typeof import('fs')
}
void existsSync
