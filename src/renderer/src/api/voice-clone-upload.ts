/**
 * 声音复刻样本上传 client（Web 端）
 * @module renderer/api/voice-clone-upload
 *
 * Web 端通过 FormData POST /api/upload/voice-clone-sample 上传音频样本。
 * Electron 端使用原有 IPC 方式（VoiceCloneDialog.vue 中处理）。
 */

import type { ClonedVoice } from '@shared/types/voice.types'

/** 上传超时时间（毫秒）- 10MB 文件上传预留足够时间 */
const UPLOAD_TIMEOUT_MS = 60000

export interface VoiceCloneUploadParams {
  file: File
  name: string
  prefix: string
  language: string
  durationSec: number
  providerId?: string
}

/**
 * Web 端上传声音复刻样本。
 * @throws Error 失败时携带后端返回的错误信息
 */
export async function uploadVoiceCloneSample(
  params: VoiceCloneUploadParams,
): Promise<ClonedVoice> {
  const fd = new FormData()
  fd.append('file', params.file, params.file.name)
  fd.append('name', params.name)
  fd.append('prefix', params.prefix)
  fd.append('language', params.language)
  fd.append('durationSec', String(params.durationSec))
  if (params.providerId) {
    fd.append('providerId', params.providerId)
  }

  // 使用 AbortController 实现超时控制
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)

  try {
    const resp = await fetch('/api/upload/voice-clone-sample', {
      method: 'POST',
      credentials: 'include',
      body: fd,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    let body: any
    try {
      body = await resp.json()
    } catch {
      throw new Error(`上传失败：非 JSON 响应（status=${resp.status}）`)
    }

    if (!resp.ok || !body?.ok) {
      throw new Error(body?.error || `上传失败 (${resp.status})`)
    }

    // 与 /api/ipc/<channel> 对齐的双层 envelope：外层 { ok, data } 是 HTTP；
    // 内层 data 是 IpcResponse<T> = { success, data?, error? }
    const inner = body.data as {
      success: boolean
      data?: ClonedVoice
      error?: string
    }

    if (!inner?.success) {
      throw new Error(inner?.error || '上传失败')
    }

    return inner.data as ClonedVoice
  } catch (err: any) {
    clearTimeout(timeoutId)
    // 处理超时错误
    if (err.name === 'AbortError') {
      throw new Error('上传超时，请检查网络连接或尝试较小的文件')
    }
    throw err
  }
}