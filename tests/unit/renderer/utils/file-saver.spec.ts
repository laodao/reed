// @vitest-environment happy-dom
/**
 * file-saver 单测
 *
 * 背景 bug：PC 端"导出为图片/导出为 Word"报
 *   "electronAPI.file.writeBinaryFile 未暴露（PC 端版本过旧）"
 * Word 导出与图片导出在 saveBlobAs 的 Blob 分支汇合，都依赖 writeBinaryFile。
 *
 * 本测试用 mock 的 electronAPI 验证 saveViaIpc 的分支逻辑：
 * - string 输入 → writeTextFile
 * - Blob 输入 → base64 → writeBinaryFile（要求 mock 提供）
 * - 用户取消（filePath 为 null）→ canceled: true，不调写文件
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// happy-dom 环境提供 window/Blob/btoa/atob

let ipcCalls: Array<{ channel: string; args: unknown[] }> = []
let mockFileApi: Record<string, (...args: any[]) => unknown> = {}

async function loadModule() {
  // 每个用例重新 import，避免模块级缓存携带上一个用例的环境
  vi.resetModules()
  return await import('../../../../src/renderer/src/utils/file-saver')
}

function installElectronApi() {
  ipcCalls = []
  mockFileApi = {
    saveFile: async (options: unknown) => {
      ipcCalls.push({ channel: 'saveFile', args: [options] })
      return { success: true, filePath: 'C:\\tmp\\out.png' }
    },
    writeTextFile: async (filePath: string, content: string) => {
      ipcCalls.push({ channel: 'writeTextFile', args: [filePath, content] })
      return { success: true }
    },
    writeBinaryFile: async (filePath: string, base64: string) => {
      ipcCalls.push({ channel: 'writeBinaryFile', args: [filePath, base64] })
      return { success: true }
    },
  }
  ;(window as any).__APP_PLATFORM__ = undefined
  ;(window as any).electronAPI = { file: mockFileApi }
}

function uninstallElectronApi() {
  delete (window as any).electronAPI
  ;(window as any).__APP_PLATFORM__ = 'web'
}

describe('saveBlobAs（PC 端 IPC 分支）', () => {
  beforeEach(() => {
    uninstallElectronApi()
  })

  it('Blob 输入走 writeBinaryFile，base64 内容正确', async () => {
    installElectronApi()
    const { saveBlobAs } = await loadModule()

    // 构造已知字节的 Blob（PNG 魔数头）
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])
    const blob = new Blob([bytes])

    const result = await saveBlobAs(blob, {
      defaultName: 'AI回答.png',
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    })

    expect(result.success).toBe(true)
    expect(result.canceled).toBeFalsy()

    // 保存对话框被调用，且带默认名
    expect(ipcCalls[0].channel).toBe('saveFile')
    expect((ipcCalls[0].args[0] as any).defaultPath).toBe('AI回答.png')

    // 二进制写入被调用，base64 可还原出原字节
    const writeCall = ipcCalls.find(c => c.channel === 'writeBinaryFile')
    expect(writeCall, '必须调用 writeBinaryFile 而不是报"未暴露"').toBeDefined()
    const b64 = writeCall!.args[1] as string
    const restored = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))
    expect(Array.from(restored)).toEqual(Array.from(bytes))
  })

  it('string 输入走 writeTextFile', async () => {
    installElectronApi()
    const { saveBlobAs } = await loadModule()

    const result = await saveBlobAs('# markdown', { defaultName: 'a.md' })

    expect(result.success).toBe(true)
    const writeCall = ipcCalls.find(c => c.channel === 'writeTextFile')
    expect(writeCall).toBeDefined()
    expect(writeCall!.args[1]).toBe('# markdown')
    expect(ipcCalls.find(c => c.channel === 'writeBinaryFile')).toBeUndefined()
  })

  it('用户取消保存对话框时返回 canceled 且不写文件', async () => {
    installElectronApi()
    mockFileApi.saveFile = async () => ({ success: true, filePath: null })
    const { saveBlobAs } = await loadModule()

    const result = await saveBlobAs(new Blob(['x']), { defaultName: 'a.png' })

    expect(result.success).toBe(true)
    expect(result.canceled).toBe(true)
    expect(ipcCalls.find(c => c.channel === 'writeBinaryFile')).toBeUndefined()
  })

  it('PC 端未暴露 writeBinaryFile 时给出明确错误（旧版本回归提示）', async () => {
    installElectronApi()
    delete (mockFileApi as any).writeBinaryFile
    const { saveBlobAs } = await loadModule()

    const result = await saveBlobAs(new Blob(['x']), { defaultName: 'a.png' })

    // 这条防御分支依然有效：明确报错而不是静默失败
    expect(result.success).toBe(false)
    expect(result.error).toContain('writeBinaryFile')
  })

  it('Web 端（无 electronAPI）走浏览器下载分支', async () => {
    uninstallElectronApi()
    const { saveBlobAs } = await loadModule()

    // anchor.click 被 happy-dom 拦截不会真下载
    const result = await saveBlobAs('hello', { defaultName: 'a.txt' })
    expect(result.success).toBe(true)
  })
})
