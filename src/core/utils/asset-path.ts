/**
 * 资源路径工具
 * @module core/utils/asset-path
 * @description 数据库统一存"相对路径"（相对于 dataPath），运行时拼接为绝对路径。
 *              旧数据可能是绝对路径（如 Windows 上的 'C:\Users\daoge\the-bot\images\...'），
 *              本工具同时兼容两种格式：写入时强制转相对，读取时识别 absolute 直接返回。
 */

import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'

/**
 * 判断给定路径是否是绝对路径（兼容 Windows 盘符）
 */
export function isAbsoluteAssetPath(p: string): boolean {
  if (!p) return false
  // POSIX 绝对路径
  if (p.startsWith('/')) return true
  // Windows 盘符：'C:' 或 'C:/' 或 'C:\'
  if (/^[A-Za-z]:[\\/]/.test(p)) return true
  // 自定义协议 URL（local-image:// 等）也按"已是 URL"对待，不要再处理
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return true
  return false
}

/**
 * 把绝对路径转为相对于 dataPath 的相对路径。
 * - 如果 abs 在 dataPath 内：返回 forward-slash 形式相对路径（如 'images/2026/03/file.png'）
 * - 如果 abs 不在 dataPath 内：原样返回（绝对路径外置文件不强制移动）
 * - 如果 abs 已是相对路径：原样返回（已规范化场景）
 *
 * 写入数据库前应当调用此函数。
 */
export function toRelativeAssetPath(absOrRel: string): string {
  if (!absOrRel) return absOrRel
  if (!isAbsoluteAssetPath(absOrRel)) {
    // 已经是相对路径，归一化分隔符即可
    return absOrRel.replace(/\\/g, '/')
  }
  const dataPath = safeGetDataPath()
  if (!dataPath) return absOrRel.replace(/\\/g, '/')
  const rel = path.relative(dataPath, absOrRel)
  // path.relative 在路径不在 dataPath 下时返回包含 '../' 的路径——这种情况保留绝对路径
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return absOrRel.replace(/\\/g, '/')
  }
  return rel.replace(/\\/g, '/')
}

/**
 * 把相对路径解析为绝对路径。
 * - 如果输入已是绝对路径：原样返回（兼容旧数据）
 * - 否则：dataPath + 相对路径
 *
 * 读取文件 / 渲染前应当调用此函数。
 */
export function resolveAssetPath(relOrAbs: string): string {
  if (!relOrAbs) return relOrAbs
  if (isAbsoluteAssetPath(relOrAbs)) return relOrAbs
  const dataPath = safeGetDataPath()
  if (!dataPath) return relOrAbs
  return path.join(dataPath, relOrAbs)
}

/**
 * 构造可在渲染端使用的 asset URL。委托给当前注册的 PathProvider，
 * 由各运行环境（Electron / Web）决定 protocol：
 *   - Electron：'local-image://...'（自定义 protocol handler）
 *   - Web：'/assets/...'（HTTP 路由，按 cookie userId 隔离）
 *
 * 调用方一律传相对路径（业务库存的形式），不要自己拼协议。
 */
export function toAssetUrl(
  relOrAbs: string,
  scheme: 'image' | 'file' | 'video' = 'image',
): string {
  if (!relOrAbs) return ''
  return getPathProvider().toAssetUrl(relOrAbs, scheme)
}

function safeGetDataPath(): string | null {
  try {
    return getPathProvider().getDataPath()
  } catch {
    return null
  }
}
