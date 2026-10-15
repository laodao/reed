/**
 * resolveStoryToVideoAudioDir 单测（X4 修复轮 1）
 *
 * V2 音频生成侧（audio.handler）与场景视频合成扫描侧（video.handler）共用
 * 同一目录基准；断言基准是 getDataPath() 而非 getUserDataPath()——自定义数据
 * 目录（userData ≠ dataPath）时写读分裂会让扫描侧看不到生成产物，场景视频无声。
 */

import { describe, expect, it } from 'vitest'
import * as path from 'path'
import { resolveStoryToVideoAudioDir } from '@core/packs/episode-production/handlers/render/scene-audio-dir'
import { registerPathProvider, type IPathProvider } from '@core/interfaces/path.interface'

/** userData ≠ dataPath 的 stub：模拟 Electron 自定义数据目录 */
class CustomDataPathProvider implements IPathProvider {
  getUserDataPath(): string { return '/home/u/.config/the-bot' }
  getAppDataPath(): string { return '/home/u/.config' }
  getTempPath(): string { return '/tmp' }
  getDataPath(): string { return '/mnt/bigdisk/the-bot-data' }
  getSubDirectories(): never { throw new Error('not used') }
  getSubDirectoryPath(): never { throw new Error('not used') }
  toAssetUrl(rel: string): string { return `/assets/${rel}` }
}

describe('resolveStoryToVideoAudioDir（X4：生成/扫描同一基准）', () => {
  it('自定义数据目录下解析到 dataPath（而非 userData）', () => {
    registerPathProvider(() => new CustomDataPathProvider())

    const dir = resolveStoryToVideoAudioDir('p1')

    expect(dir).toBe(path.join('/mnt/bigdisk/the-bot-data', 'story-to-video', 'p1', 'audio'))
    // 回归守卫：误用 getUserDataPath() 时会拼到 userData 下
    expect(dir.startsWith('/home/u/.config/the-bot')).toBe(false)
  })
})
