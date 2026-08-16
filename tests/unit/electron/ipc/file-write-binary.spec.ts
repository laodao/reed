/**
 * file:write-binary IPC 通道单测
 *
 * 背景 bug：PC 端"导出为图片"报
 *   "electronAPI.file.writeBinaryFile 未暴露（PC 端版本过旧）"
 * 原因是渲染端 file-saver 调用了 api.writeBinaryFile，但 preload 从未暴露、
 * 主进程也没有对应 handler，整条链路缺失。
 *
 * 本测试验证：
 * 1. handler 注册了 file:write-binary 通道（ipc-bridge 注册表）
 * 2. 纯 base64 / 带 data URI 前缀的 base64 都能正确写盘
 * 3. 写入内容与原始二进制逐字节一致（PNG 头等）
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// registerIpc 注册表在模块内部，通过 invokeIpc 取回 handler
// 注：bridge-adapter 会自动注入 fakeEvent 作为第一个参数，调用时只传业务参数
import { invokeIpc } from '@core/ipc/ipc-bridge'
import { registerFileHandlers } from '@electron/ipc/handlers/file.handler'

describe('file:write-binary', () => {
  beforeAll(() => {
    registerFileHandlers()
  })

  it('通道已注册到 ipc-bridge（修复 writeBinaryFile 未暴露 bug 的回归）', async () => {
    // invokeIpc 对未注册通道会抛错；调用一个非法参数让 handler 返回错误而非抛"未注册"
    const tmp = path.join(os.tmpdir(), `wb-test-${Date.now()}.png`)
    const result = await invokeIpc('file:write-binary', [
      { filePath: tmp, base64: Buffer.from('hello').toString('base64') },
    ])
    expect(result).toBeDefined()
    expect((result as { success: boolean }).success).toBe(true)
    fs.unlinkSync(tmp)
  })

  it('纯 base64 内容逐字节写盘', async () => {
    // 模拟 PNG 头字节
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    const tmp = path.join(os.tmpdir(), `wb-test-${Date.now()}.png`)

    const result = (await invokeIpc('file:write-binary', [
      { filePath: tmp, base64: bytes.toString('base64') },
    ])) as { success: boolean; error?: string }

    expect(result.success).toBe(true)
    const written = fs.readFileSync(tmp)
    expect(Buffer.compare(written, bytes)).toBe(0)
    fs.unlinkSync(tmp)
  })

  it('兼容带 data URI 前缀的 base64（data:image/png;base64,...）', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])
    const dataUri = `data:image/png;base64,${bytes.toString('base64')}`
    const tmp = path.join(os.tmpdir(), `wb-test-${Date.now()}.png`)

    const result = (await invokeIpc('file:write-binary', [
      { filePath: tmp, base64: dataUri },
    ])) as { success: boolean; error?: string }

    expect(result.success).toBe(true)
    const written = fs.readFileSync(tmp)
    expect(Buffer.compare(written, bytes)).toBe(0)
    fs.unlinkSync(tmp)
  })

  it('非法路径返回错误而非抛异常', async () => {
    const result = (await invokeIpc('file:write-binary', [
      { filePath: 'Z:\\不存在的目录\\x.png', base64: Buffer.from('x').toString('base64') },
    ])) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('file-saver 渲染端契约', () => {
  it('channel-map 中 file.writeBinaryFile 映射与 preload 参数形态一致', async () => {
    const { CHANNEL_OVERRIDES } = await import('@web-client/channel-map')
    const entry = CHANNEL_OVERRIDES['file.writeBinaryFile']
    expect(entry, 'web channel-map 缺少 file.writeBinaryFile').toBeDefined()
    expect(entry!.channel).toBe('file:write-binary')
    // wrap 需把 (filePath, base64) 组装成 handler 期望的单对象参数
    const wrapped = entry!.wrap!('/tmp/a.png', 'QUJD')
    expect(wrapped).toEqual([{ filePath: '/tmp/a.png', base64: 'QUJD' }])
  })
})
