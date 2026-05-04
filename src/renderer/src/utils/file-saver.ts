/**
 * 跨端文件保存 helper
 * @module renderer/utils/file-saver
 *
 * 把 Blob / string 保存到本地，跨 PC（Electron）/ Web 一致 API：
 *   - PC：走 ipc dialog.showSaveDialog → fs.writeFile（用户能选位置）
 *   - Web：用 anchor download 触发浏览器内置下载（保存到浏览器默认下载目录）
 *
 * 调用点不再判断 platform，统一调 saveBlobAs(...)。
 */

function isElectronRenderer(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as {
    __APP_PLATFORM__?: 'electron' | 'web'
    electronAPI?: unknown
  }
  if (w.__APP_PLATFORM__ === 'web') return false
  return !!w.electronAPI
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    )
  }
  return btoa(binary)
}

export interface SaveBlobOptions {
  /** 默认文件名（含扩展名） */
  defaultName: string
  /** 仅 PC dialog 用的过滤器；web 端忽略 */
  filters?: Array<{ name: string; extensions: string[] }>
  /** Blob MIME（仅 string 输入时用作默认） */
  mimeType?: string
}

export interface SaveBlobResult {
  success: boolean
  /** PC 端用户取消时为 true，业务层用此忽略错误提示 */
  canceled?: boolean
  /** PC 端写到的绝对路径；web 端 undefined */
  filePath?: string
  error?: string
}

/**
 * 保存 string 或 Blob 到本地文件。
 *
 * @param input string（按 mimeType 包成 Blob）或 Blob 直传
 * @param opts 默认名 + 过滤器 + MIME
 */
export async function saveBlobAs(
  input: string | Blob,
  opts: SaveBlobOptions,
): Promise<SaveBlobResult> {
  if (isElectronRenderer()) {
    return await saveViaIpc(input, opts)
  }
  return await saveViaBrowser(input, opts)
}

async function saveViaIpc(
  input: string | Blob,
  opts: SaveBlobOptions,
): Promise<SaveBlobResult> {
  const api = (window as any).electronAPI?.file
  if (!api) {
    return { success: false, error: 'electronAPI.file 未暴露' }
  }
  const dialogResp = await api.saveFile({
    defaultPath: opts.defaultName,
    filters: opts.filters,
  })
  if (!dialogResp?.success) {
    return { success: false, error: dialogResp?.error || '保存对话框失败' }
  }
  if (!dialogResp.filePath) {
    return { success: true, canceled: true }
  }

  if (typeof input === 'string') {
    const writeResp = await api.writeTextFile(dialogResp.filePath, input)
    return {
      success: !!writeResp?.success,
      filePath: dialogResp.filePath,
      error: writeResp?.error,
    }
  }

  // Blob 走二进制写入
  const ab = await input.arrayBuffer()
  const base64 = arrayBufferToBase64(ab)
  if (!api.writeBinaryFile) {
    return {
      success: false,
      error: 'electronAPI.file.writeBinaryFile 未暴露（PC 端版本过旧）',
    }
  }
  const writeResp = await api.writeBinaryFile(dialogResp.filePath, base64)
  return {
    success: !!writeResp?.success,
    filePath: dialogResp.filePath,
    error: writeResp?.error,
  }
}

async function saveViaBrowser(
  input: string | Blob,
  opts: SaveBlobOptions,
): Promise<SaveBlobResult> {
  const blob =
    typeof input === 'string'
      ? new Blob([input], {
          type: opts.mimeType ?? 'text/plain;charset=utf-8',
        })
      : input
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = opts.defaultName
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return { success: true }
  } finally {
    // 给浏览器一点时间发起下载
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
