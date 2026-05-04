/**
 * panorama 文件上传 client（双端抽象）
 * @module renderer/api/panorama-upload
 *
 * Web：multipart/form-data POST /api/upload/panorama（cookie 鉴权，与现有 /api/ipc 同会话）
 * PC（Electron）：electronAPI.episodeProduction.asset.panorama.uploadFile({ buffer (base64), fileName })
 *                 走 IPC，由主进程读字节落到 dataPath/panoramas/。
 *
 * 两端均最终调到 core PanoramaUploadService.upload，业务逻辑（校验 / 落表）一致。
 */

import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

export interface PanoramaUploadParams {
  file: File
  locationBindingId: string
  label?: string | null
}

declare global {
  interface Window {
    electronAPI?: any
    __APP_PLATFORM__?: 'electron' | 'web'
  }
}

function isElectronRenderer(): boolean {
  if (typeof window === 'undefined') return false
  if (window.__APP_PLATFORM__ === 'web') return false
  return !!window.electronAPI
}

/**
 * 上传 360 全景图。
 * @throws Error 失败时携带后端返回的错误信息
 */
export async function uploadPanoramaFile(
  params: PanoramaUploadParams,
): Promise<AssetImageEntity> {
  if (isElectronRenderer()) {
    return await uploadViaIpc(params)
  }
  return await uploadViaHttp(params)
}

async function uploadViaHttp(
  params: PanoramaUploadParams,
): Promise<AssetImageEntity> {
  const fd = new FormData()
  fd.append('file', params.file, params.file.name)
  fd.append('locationBindingId', params.locationBindingId)
  if (params.label) fd.append('label', params.label)

  const resp = await fetch('/api/upload/panorama', {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  let body: any
  try {
    body = await resp.json()
  } catch {
    throw new Error(`上传失败：非 JSON 响应（status=${resp.status}）`)
  }
  if (!resp.ok || !body?.ok) {
    throw new Error(body?.error || `上传失败 (${resp.status})`)
  }
  return body.data as AssetImageEntity
}

async function uploadViaIpc(
  params: PanoramaUploadParams,
): Promise<AssetImageEntity> {
  const buffer = await params.file.arrayBuffer()
  const base64 = arrayBufferToBase64(buffer)
  const api = window.electronAPI?.episodeProduction?.asset?.panorama
  if (!api?.uploadFile) {
    throw new Error('panorama.uploadFile IPC 未暴露（PC 端版本过旧）')
  }
  const resp = await api.uploadFile({
    fileName: params.file.name,
    base64,
    locationBindingId: params.locationBindingId,
    label: params.label ?? null,
  })
  if (!resp?.success) {
    throw new Error(resp?.error || 'IPC 上传失败')
  }
  return resp.data as AssetImageEntity
}

/** 浏览器端 ArrayBuffer → base64（不依赖 Buffer） */
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
