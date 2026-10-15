/**
 * 播客音频时间轴（纯函数）
 * @module core/packs/podcast-video/slides/audio-timeline
 * @description 幻灯片图组 + 逐页配音 → 页序配对与时间轴计算：
 *              每页停留时长 = 该页配音时长 + 页间停顿（gapMs），
 *              整条配音轨由 ffmpeg filter_complex 逐段 apad 后 concat（见 podcast-nodes），
 *              两边按同一公式计算，保证音画严格对齐。
 */

/** 一页的图 + 配音配对 */
export interface SlidePair {
  image: string
  audio: string
}

/** 时间轴单项（1-based index 便于人工核对） */
export interface TimelineEntry {
  index: number
  image: string
  audio: string
  audioDurationSec: number
  slideDurationSec: number
  startSec: number
}

/**
 * 从工作流模板解析结果中归一化出配对数组：
 * - 图片项：字符串路径 或 { path | image | imageUrl }
 * - 音频项：字符串路径 或 { audioPath | path | file }
 * 非数组/为空/两数组长度不一致 → 抛错（handler 转为节点失败，信息面向用户）。
 */
export function normalizePairs(slideImages: unknown, audioFiles: unknown): SlidePair[] {
  const images = toStringArray(slideImages, '幻灯片图组')
  const audios = toStringArray(audioFiles, '逐页配音组')
  if (images.length === 0) throw new Error('幻灯片图组为空：请检查上游幻灯片渲染节点的输出')
  if (audios.length === 0) throw new Error('逐页配音组为空：请检查上游配音循环的输出')
  if (images.length !== audios.length) {
    throw new Error(`幻灯片与配音数量不一致：图 ${images.length} 张 vs 音频 ${audios.length} 段，请检查两路上游输出`)
  }
  return images.map((image, i) => ({ image, audio: audios[i] }))
}

/** 宽松地把模板解析结果转成路径字符串数组（字符串 / 对象承载字段都接受） */
function toStringArray(value: unknown, label: string): string[] {
  let arr: unknown[] = []
  if (Array.isArray(value)) {
    arr = value
  } else if (typeof value === 'string' && value.trim()) {
    // 字符串形态：JSON 数组或逗号分隔路径
    const s = value.trim()
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s)
        if (Array.isArray(parsed)) arr = parsed
      } catch {
        arr = []
      }
    } else {
      arr = s.split(',')
    }
  }
  const out: string[] = []
  for (const item of arr) {
    const p = pickPath(item)
    if (p) out.push(p)
  }
  if (arr.length > 0 && out.length === 0) {
    throw new Error(`${label}格式无法识别：需要路径字符串数组或 [{ audioPath | path | image }] 对象数组`)
  }
  return out
}

function pickPath(item: unknown): string {
  if (typeof item === 'string') return item.trim()
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    for (const key of ['audioPath', 'path', 'image', 'imageUrl', 'file', 'localPath']) {
      const v = o[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  return ''
}

/**
 * 按配音时长 + 页间停顿展开时间轴（与配音 concat 的 apad 公式严格一致）：
 * slideDuration = audioDuration + gap；末页同样追加 gap（成片结尾留白呼吸）。
 */
export function buildTimeline(
  pairs: SlidePair[],
  audioDurationsSec: number[],
  gapSec: number,
): { entries: TimelineEntry[]; totalSec: number } {
  const entries: TimelineEntry[] = []
  let start = 0
  pairs.forEach((p, i) => {
    const audioDurationSec = Math.max(0.1, audioDurationsSec[i] ?? 0)
    const slideDurationSec = audioDurationSec + gapSec
    entries.push({
      index: i + 1,
      image: p.image,
      audio: p.audio,
      audioDurationSec: round2(audioDurationSec),
      slideDurationSec: round2(slideDurationSec),
      startSec: round2(start),
    })
    start += slideDurationSec
  })
  return { entries, totalSec: round2(start) }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
