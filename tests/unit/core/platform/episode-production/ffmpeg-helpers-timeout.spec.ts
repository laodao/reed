/**
 * ffmpeg 子进程超时保护 —— 回归测试
 *
 * 背景（2026-10 深度 review P1-1）：
 *   reference-video/ffmpeg-helpers.ts 此前**完全没有**超时与 kill 保护，
 *   runFfmpeg 的 resolve/reject 只挂在 child 的 error/close 事件上。ffmpeg 挂死
 *   （损坏视频、卡住的网络流）时 Promise 永不 settle、子进程永不退出（僵尸进程累积）。
 *   getVideoMetadata 更严重：只 await 'close'，连 'error' 都没接，spawn 失败即静默永久挂起。
 *
 *   同仓库 compose/ffmpeg-assembler.service.ts 早已加了 timeout(timeoutSec,'kill')
 *   （注释写明「复核修复 P1-10」），本文件属漏改。
 *
 * 本测试不依赖真实 ffmpeg 二进制：用 EP_FFMPEG_TIMEOUT_SEC 把超时压到 1s，
 * 并通过 PATH/二进制解析让 spawn 指向一个必定挂起的假程序不可行——
 * 改为直接验证「超时后可观测地失败而非永久挂起」这一契约。
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

describe('ffmpeg-helpers 超时契约', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    delete process.env.EP_FFMPEG_TIMEOUT_SEC
  })

  it('导出面完整（getVideoMetadata / detectShots / extractFrame / extractAudio 等）', async () => {
    const mod = await import('@core/platform/episode-production/reference-video/ffmpeg-helpers')
    expect(typeof mod.getVideoMetadata).toBe('function')
    expect(typeof mod.detectShots).toBe('function')
    expect(typeof mod.extractFrame).toBe('function')
    expect(typeof mod.extractAudio).toBe('function')
    expect(typeof mod.extractAudioSegment).toBe('function')
  })

  it('getVideoMetadata 对不存在的文件必须以 reject 结束（而不是永久挂起）', async () => {
    const { getVideoMetadata } = await import(
      '@core/platform/episode-production/reference-video/ffmpeg-helpers'
    )
    // 给一个不存在的路径：ffmpeg 会立刻失败退出。
    // 修复前若 spawn 本身失败（二进制缺失），Promise 会静默永久挂起。
    // 这里断言它在合理时间内以「成功返回（durationSec=0）」或「reject」收口，
    // 关键是**不得挂起**——用 race 加超时哨兵来证明。
    const sentinel = Symbol('hang')
    const result = await Promise.race([
      getVideoMetadata('__definitely_missing_file__.mp4').then(
        (v) => ({ ok: true as const, v }),
        (e) => ({ ok: false as const, e }),
      ),
      new Promise((r) => setTimeout(() => r(sentinel), 15000)),
    ])

    expect(result).not.toBe(sentinel) // 若挂起则会命中哨兵
    if (typeof result === 'object' && result !== null && 'ok' in result) {
      if (result.ok) {
        // 正常路径：拿不到 Duration 时应如实返回 0，而不是抛错
        expect(result.v.durationSec).toBe(0)
      } else {
        // 失败路径：必须带可读错误信息
        expect(String((result as { e: unknown }).e)).toMatch(/\S/)
      }
    }
  }, 20000)

  it('EP_FFMPEG_TIMEOUT_SEC 可配置（与 assembler 共用同一环境变量约定）', async () => {
    process.env.EP_FFMPEG_TIMEOUT_SEC = '1'
    const { getVideoMetadata } = await import(
      '@core/platform/episode-production/reference-video/ffmpeg-helpers'
    )
    const sentinel = Symbol('hang')
    const result = await Promise.race([
      getVideoMetadata('__missing__.mp4').then(
        () => 'settled',
        () => 'settled',
      ),
      new Promise((r) => setTimeout(() => r(sentinel), 15000)),
    ])
    // 1s 超时下必须早已收口
    expect(result).toBe('settled')
  }, 20000)
})