/**
 * 渲染端资源 URL 转换
 * @module renderer/utils/asset-url
 *
 * 后端 service 返回的 filePath 已经是当前端可加载的 URL（Electron 走
 * local-image:// 协议，Web 走 /assets/...）。本 helper 只在以下场景使用：
 *   1. 旧数据：filePath 仅为相对路径（无协议、无 /assets 前缀）
 *   2. 组件直接拿到 entity 字段（如 image_records.file_path）未经 service 包装
 *
 * 不要在所有 <img :src> 上无条件包一层，那样会破坏后端已包好的 URL。
 */

declare global {
  interface Window {
    electronAPI?: any
    __APP_PLATFORM__?: 'electron' | 'web'
  }
}

/**
 * 是否运行在 Electron 渲染端。Web 模式下虽然 main-web.ts 注入了 window.electronAPI
 * 桥接代理，但同时设置了 __APP_PLATFORM__='web'，必须按这个判断而不是看 electronAPI。
 */
export function isElectronRenderer(): boolean {
  if (typeof window === 'undefined') return false
  if (window.__APP_PLATFORM__ === 'web') return false
  return !!window.electronAPI
}

/**
 * 把相对路径或完整 URL 转为当前端可加载的图像 URL。
 * 已含协议或 /assets/ 前缀：原样返回。
 */
export function toImageUrl(pathOrUrl: string | undefined | null): string {
  if (!pathOrUrl) return ''
  if (isAlreadyUsable(pathOrUrl)) return pathOrUrl
  return prefixForCurrentPlatform(pathOrUrl, 'image')
}

/**
 * 视频版（Electron 用 local-video://）
 */
export function toVideoUrl(pathOrUrl: string | undefined | null): string {
  if (!pathOrUrl) return ''
  if (isAlreadyUsable(pathOrUrl)) return pathOrUrl
  return prefixForCurrentPlatform(pathOrUrl, 'video')
}

/**
 * 通用文件版（Electron 用 local-file://）
 */
export function toFileUrl(pathOrUrl: string | undefined | null): string {
  if (!pathOrUrl) return ''
  if (isAlreadyUsable(pathOrUrl)) return pathOrUrl
  return prefixForCurrentPlatform(pathOrUrl, 'file')
}

function isAlreadyUsable(s: string): boolean {
  return (
    s.startsWith('local-image://') ||
    s.startsWith('local-video://') ||
    s.startsWith('local-file://') ||
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('data:') ||
    s.startsWith('blob:') ||
    s.startsWith('/assets/')
  )
}

function prefixForCurrentPlatform(rel: string, scheme: 'image' | 'video' | 'file'): string {
  if (isElectronRenderer()) {
    return `local-${scheme}://${rel.replace(/^\/+/, '')}`
  }
  // Web：HTTP /assets 路由（按 cookie userId 隔离，scheme 无意义）
  // 绝对路径（含 /home/.../data-web-mt/users/<uid>/voice/...）需要剥到用户目录之后部分
  // 让后端 /assets 能按相对路径找到文件
  let normalized = rel.replace(/^\/+/, '')
  // 已是某个 user 目录下的子路径：截取该用户目录后的部分
  const usersIdx = normalized.indexOf('users/')
  if (usersIdx >= 0) {
    const tail = normalized.slice(usersIdx + 'users/'.length)
    const slash = tail.indexOf('/')
    if (slash >= 0) {
      normalized = tail.slice(slash + 1) // <userId>/<rest> → <rest>
    }
  }
  return '/assets/' + normalized
}
