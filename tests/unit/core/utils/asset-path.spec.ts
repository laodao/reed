/**
 * 资源路径工具 单测（core/utils/asset-path）
 * @description 约定：DB 存「相对 dataPath 的正斜杠路径」，绝对路径仅作兼容输入。
 *              本文件补齐这两条核心函数的用例（写入前转相对 / 读取时解析绝对）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { registerPathProvider, type IPathProvider } from '@core/interfaces/path.interface'
import {
  isAbsoluteAssetPath,
  toRelativeAssetPath,
  resolveAssetPath,
  toAssetUrl,
} from '@core/utils/asset-path'

let dataDir = ''

function registerMockPathProvider(dir: string): void {
  const provider: IPathProvider = {
    getUserDataPath: () => dir,
    getAppDataPath: () => dir,
    getTempPath: () => os.tmpdir(),
    getDataPath: () => dir,
    getSubDirectories: () => ({
      database: 'db',
      images: 'images',
      voice: 'voice',
      translations: 'translations',
      knowledgeBase: 'knowledge-base',
      video: 'video',
      portrait: 'portrait',
      diary: 'diary',
      longwriting: 'longwriting',
      stv: 'stv',
    }),
    getSubDirectoryPath: name => path.join(dir, name),
    toAssetUrl: (p, scheme) => `local-${scheme ?? 'image'}://${p}`,
  }
  registerPathProvider(() => provider)
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-path-test-'))
  registerMockPathProvider(dataDir)
})

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('isAbsoluteAssetPath', () => {
  it('识别 POSIX / Windows 盘符 / 自定义协议', () => {
    expect(isAbsoluteAssetPath('/home/u/data/a.png')).toBe(true)
    expect(isAbsoluteAssetPath('C:\\Users\\daoge\\the-bot\\images\\a.png')).toBe(true)
    expect(isAbsoluteAssetPath('C:/Users/daoge/the-bot/images/a.png')).toBe(true)
    expect(isAbsoluteAssetPath('local-image://knowledge-base/a.png')).toBe(true)
  })

  it('相对路径不算绝对路径', () => {
    expect(isAbsoluteAssetPath('knowledge-base/kb1/documents/a.epub')).toBe(false)
    expect(isAbsoluteAssetPath('images/2026/03/a.png')).toBe(false)
    expect(isAbsoluteAssetPath('')).toBe(false)
  })
})

describe('toRelativeAssetPath：入库前把绝对路径转成 dataPath 相对路径', () => {
  it('dataPath 内的绝对路径 → 正斜杠相对路径', () => {
    const abs = path.join(dataDir, 'knowledge-base', 'kb1', 'documents', 'a.epub')
    expect(toRelativeAssetPath(abs)).toBe('knowledge-base/kb1/documents/a.epub')
  })

  it('图片资源目录（assets/<docId>）同样转为相对路径', () => {
    const abs = path.join(dataDir, 'knowledge-base', 'kb1', 'documents', 'assets', 'doc1', 'x.png')
    expect(toRelativeAssetPath(abs)).toBe('knowledge-base/kb1/documents/assets/doc1/x.png')
  })

  it('已是相对路径：只归一化分隔符', () => {
    expect(toRelativeAssetPath('knowledge-base\\kb1\\documents\\a.epub')).toBe(
      'knowledge-base/kb1/documents/a.epub',
    )
  })

  it('dataPath 之外的绝对路径（用户外置文件）：保留绝对路径，不强行搬迁', () => {
    const outside = path.join(os.tmpdir(), 'outside', 'a.epub')
    expect(toRelativeAssetPath(outside)).toBe(outside.replace(/\\/g, '/'))
  })
})

describe('resolveAssetPath：读取时把相对路径还原为绝对路径', () => {
  it('相对路径按 dataPath 解析（正斜杠也认）', () => {
    expect(resolveAssetPath('knowledge-base/kb1/documents/a.epub')).toBe(
      path.join(dataDir, 'knowledge-base', 'kb1', 'documents', 'a.epub'),
    )
  })

  it('历史绝对路径原样返回', () => {
    const abs = path.join(dataDir, 'images', 'a.png')
    expect(resolveAssetPath(abs)).toBe(abs)
  })

  it('往返一致：toRelativeAssetPath → resolveAssetPath 回到原路径', () => {
    const abs = path.join(dataDir, 'knowledge-base', 'kb1', 'documents', 'assets', 'doc1', 'x.png')
    expect(resolveAssetPath(toRelativeAssetPath(abs))).toBe(abs)
  })
})

describe('toAssetUrl：委托 PathProvider 生成前端可加载 URL', () => {
  it('传入相对路径 → 当前端协议 URL', () => {
    expect(toAssetUrl('knowledge-base/kb1/documents/assets/doc1/x.png', 'image')).toBe(
      'local-image://knowledge-base/kb1/documents/assets/doc1/x.png',
    )
  })

  it('空值返回空串', () => {
    expect(toAssetUrl('')).toBe('')
  })
})
