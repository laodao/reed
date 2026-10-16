/**
 * V2 场景音频目录解析（生成侧写入 / 视频合成侧扫描共用同一基准）。
 * @module core/packs/episode-production/handlers/render/scene-audio-dir
 *
 * 用 getDataPath()（而非 getUserDataPath()）：自定义数据目录时产物必须落在数据
 * 根下——生成侧写 dataPath、扫描侧看 userData 的写读分裂会让场景视频无声（X4 同类）。
 */

import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'

/** story-to-video/<projectId>/audio 的绝对路径（相对数据根解析） */
export function resolveStoryToVideoAudioDir(projectId: string): string {
  return path.join(getPathProvider().getDataPath(), 'story-to-video', projectId, 'audio')
}
