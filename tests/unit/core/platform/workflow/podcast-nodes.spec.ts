/**
 * 播客视频节点单元测试（纯函数层 + 配置校验）
 * @module tests/unit/core/platform/workflow/podcast-nodes
 * @description 覆盖：CJK 感知换行 / 时间轴对齐公式 / 配对归一化 / 幻灯片 SVG 结构 /
 *              slide-render 与 podcast-compose 的 validateConfig（ffmpeg/sharp 不落地）。
 */
import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  wrapByUnits,
  textUnits,
  buildSlideSvg,
  getSlideTheme,
  SLIDE_THEMES,
  escapeXml,
} from '@core/packs/podcast-video/slides/slide-svg'
import { buildTimeline, normalizePairs } from '@core/packs/podcast-video/slides/audio-timeline'
import { PODCAST_WORKFLOW_NODE_HANDLERS } from '@core/packs/podcast-video/workflow-nodes'
import { ffmpegBin, probeAudioDurationSec } from '@core/platform/workflow/nodes/ffmpeg-utils'

const slideRender = PODCAST_WORKFLOW_NODE_HANDLERS[0]
const podcastCompose = PODCAST_WORKFLOW_NODE_HANDLERS[1]

describe('wrapByUnits（CJK 感知换行）', () => {
  it('中文按 1 单位、ASCII 按 0.52 单位估宽', () => {
    expect(textUnits('幻灯片')).toBe(3)
    expect(textUnits('abc')).toBeCloseTo(1.56)
  })

  it('超宽即换行，行内不截断字符', () => {
    const lines = wrapByUnits('一二三四五六七', 4)
    expect(lines).toEqual(['一二三四', '五六七'])
  })

  it('显式换行符保留为独立行', () => {
    expect(wrapByUnits('第一行\n第二行', 10)).toEqual(['第一行', '第二行'])
  })

  it('ASCII 长词按 0.52 宽折行', () => {
    const lines = wrapByUnits('abcdefghij', 4)
    // 4 / 0.52 ≈ 7.7 → 首行 7 个字符
    expect(lines[0]).toBe('abcdefg')
    expect(lines.length).toBeGreaterThan(1)
  })
})

describe('escapeXml', () => {
  it('转义 & < >', () => {
    expect(escapeXml('a&b<c>d')).toBe('a&amp;b&lt;c&gt;d')
  })
})

describe('getSlideTheme', () => {
  it('按 id 取主题，未知 id 回退简约白', () => {
    expect(getSlideTheme('dark').id).toBe('dark')
    expect(getSlideTheme('nope').id).toBe('light')
    expect(SLIDE_THEMES.length).toBe(4)
  })
})

describe('buildSlideSvg（版式结构）', () => {
  const base = {
    width: 1920,
    height: 1080,
    theme: getSlideTheme('light'),
    total: 3,
  }

  it('内容页：含标题/要点/页码/转义后的正文', () => {
    const svg = buildSlideSvg({
      ...base,
      index: 2,
      deckTitle: '知识管理<指南>',
      slide: { kind: 'content', title: '核心结论', bullets: ['要点一 & 补充', '要点二'] },
    })
    expect(svg).toContain('<svg')
    expect(svg).toContain('核心结论')
    expect(svg).toContain('要点一 &amp; 补充')
    expect(svg).toContain('02 / 03')
    expect(svg).toContain('知识管理&lt;指南&gt;')
  })

  it('封面页：居中版式无页码，deckTitle 作辅助行', () => {
    const svg = buildSlideSvg({
      ...base,
      index: 1,
      deckTitle: '本周播客',
      slide: { kind: 'cover', title: '大模型时代的工作流', bullets: ['为什么值得听'] },
    })
    expect(svg).toContain('本周播客')
    expect(svg).not.toContain('01 / 03')
    expect(svg).toContain('text-anchor="middle"')
  })

  it('要点超高时整组字号收缩（收缩后字号小于基准）', () => {
    const longBullets = Array.from({ length: 8 }, (_, i) => `第${i}条很长的要点需要换行展示才能装下内容${i}`)
    const normal = buildSlideSvg({ ...base, index: 1, slide: { title: '标题', bullets: ['短要点'] } })
    const shrunk = buildSlideSvg({ ...base, index: 1, slide: { title: '标题', bullets: longBullets } })
    // 取正文区字号（排除 84 标题与 26 页脚：筛 30~70 区间）
    const pickSize = (s: string): number[] =>
      [...s.matchAll(/font-size="([\d.]+)"/g)].map(m => Number(m[1])).filter(v => v > 30 && v < 70)
    const normalSizes = pickSize(normal)
    const shrunkSizes = pickSize(shrunk)
    // 正文基准字号 44*(1080/1080)=44：收缩版正文最大字号应明显小于基准
    expect(normalSizes.some(v => Math.abs(v - 44) < 0.01)).toBe(true)
    expect(Math.max(...shrunkSizes)).toBeLessThan(44)
  })
})

describe('normalizePairs（配对归一化）', () => {
  it('字符串数组直接配对', () => {
    const pairs = normalizePairs(['a.png', 'b.png'], ['a.wav', 'b.wav'])
    expect(pairs).toEqual([
      { image: 'a.png', audio: 'a.wav' },
      { image: 'b.png', audio: 'b.wav' },
    ])
  })

  it('音频为 tts 输出对象数组时取 audioPath', () => {
    const pairs = normalizePairs(['a.png'], [{ audioPath: 'a.wav', durationMs: 0 }])
    expect(pairs).toEqual([{ image: 'a.png', audio: 'a.wav' }])
  })

  it('图片支持 { path } / { image } 形态', () => {
    const pairs = normalizePairs([{ path: 'a.png' }], [{ file: 'a.wav' }])
    expect(pairs).toEqual([{ image: 'a.png', audio: 'a.wav' }])
  })

  it('JSON 字符串形态可解析', () => {
    const pairs = normalizePairs(JSON.stringify(['a.png']), JSON.stringify(['a.wav']))
    expect(pairs).toEqual([{ image: 'a.png', audio: 'a.wav' }])
  })

  it('空数组/数量不一致/格式不明 → 明确报错', () => {
    expect(() => normalizePairs([], ['a.wav'])).toThrow(/幻灯片图组为空/)
    expect(() => normalizePairs(['a.png'], [])).toThrow(/逐页配音组为空/)
    expect(() => normalizePairs(['a.png'], ['a.wav', 'b.wav'])).toThrow(/数量不一致/)
    expect(() => normalizePairs([42], ['a.wav'])).toThrow(/格式无法识别/)
  })
})

describe('buildTimeline（音画对齐公式）', () => {
  it('每页停留=配音时长+页间停顿，startSec 累积', () => {
    const pairs = [
      { image: 'a.png', audio: 'a.wav' },
      { image: 'b.png', audio: 'b.wav' },
    ]
    const { entries, totalSec } = buildTimeline(pairs, [3, 5], 0.6)
    expect(entries[0]).toMatchObject({ index: 1, audioDurationSec: 3, slideDurationSec: 3.6, startSec: 0 })
    expect(entries[1]).toMatchObject({ index: 2, audioDurationSec: 5, slideDurationSec: 5.6, startSec: 3.6 })
    expect(totalSec).toBeCloseTo(9.2)
  })

  it('末页同样追加停顿（成片结尾留白）', () => {
    const { entries, totalSec } = buildTimeline([{ image: 'a.png', audio: 'a.wav' }], [4], 1)
    expect(entries[0].slideDurationSec).toBe(5)
    expect(totalSec).toBe(5)
  })

  it('异常短时长按 0.1s 下限兜底', () => {
    const { entries } = buildTimeline([{ image: 'a.png', audio: 'a.wav' }], [0], 0)
    expect(entries[0].audioDurationSec).toBe(0.1)
  })
})

describe('slide-render validateConfig', () => {
  it('模板透传放行，缺 slides 报错', () => {
    expect(slideRender.validateConfig({ slides: '{{deckGen.parsed.slides}}' })).toEqual([])
    expect(slideRender.validateConfig({ slides: '' }).length).toBeGreaterThan(0)
    expect(slideRender.validateConfig({ slides: [] }).length).toBeGreaterThan(0)
  })

  it('未知主题/宽高越界报错', () => {
    expect(slideRender.validateConfig({ slides: '[1]', theme: 'nope' }).join()).toContain('未知主题')
    expect(slideRender.validateConfig({ slides: '[1]', theme: '{{start.theme}}' })).toEqual([])
    expect(slideRender.validateConfig({ slides: '[1]', width: 100 }).join()).toContain('width')
    expect(slideRender.validateConfig({ slides: '[1]', height: 9999 }).join()).toContain('height')
    expect(slideRender.validateConfig({ slides: '[1]', theme: 'dark', width: 1920, height: 1080 })).toEqual([])
  })
})

describe('podcast-compose validateConfig', () => {
  it('缺图组/配音组报错，模板透传放行', () => {
    expect(podcastCompose.validateConfig({ slideImages: '{{a.b}}', audioFiles: '{{c.d}}' })).toEqual([])
    expect(podcastCompose.validateConfig({ slideImages: '', audioFiles: '{{c.d}}' }).length).toBeGreaterThan(0)
    expect(podcastCompose.validateConfig({ slideImages: '{{a.b}}', audioFiles: '' }).length).toBeGreaterThan(0)
  })

  it('gapMs/宽高/fps 越界报错', () => {
    expect(podcastCompose.validateConfig({ slideImages: 'x', audioFiles: 'y', gapMs: 6001 }).join()).toContain('gapMs')
    expect(podcastCompose.validateConfig({ slideImages: 'x', audioFiles: 'y', width: 100 }).join()).toContain('width')
    expect(podcastCompose.validateConfig({ slideImages: 'x', audioFiles: 'y', fps: 0 }).join()).toContain('fps')
    expect(podcastCompose.validateConfig({ slideImages: 'x', audioFiles: 'y', gapMs: 600, fps: 30 })).toEqual([])
  })
})

describe('probeAudioDurationSec（真实 wav 探测）', () => {
  it('对 ffmpeg -i 的 stderr Duration 解析出秒数（以合成用正弦波 wav 验证）', async () => {
    const bin = ffmpegBin()
    const tmp = joinTmp('probe_dur.wav')
    // 1 秒 440Hz 正弦波
    await new Promise<void>((resolve, reject) => {
      const p = spawn(bin, [
        '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
        '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2', tmp,
      ])
      p.on('close', code => (code === 0 ? resolve() : reject(new Error('ffmpeg sine 生成失败 ' + code))))
      p.on('error', reject)
    })
    const dur = await probeAudioDurationSec(bin, tmp)
    expect(dur).not.toBeNull()
    expect(dur!).toBeGreaterThan(0.9)
    expect(dur!).toBeLessThan(1.2)
  }, 30_000)
})

let tmpRoot: string | null = null
function joinTmp(name: string): string {
  if (!tmpRoot) tmpRoot = mkdtempSync(join(tmpdir(), 'podcast-node-spec-'))
  return join(tmpRoot, name)
}
