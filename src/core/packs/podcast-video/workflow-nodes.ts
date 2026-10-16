/**
 * 播客视频业务包贡献的工作流节点 handler（slide-render / podcast-compose）
 * @module core/packs/podcast-video/workflow-nodes
 *
 * 分层归属（2026-10-06 用户纪律：业务只经通用机制调用引擎，业务 handler 不进平台注册表）：
 * 实现放本包，由 podcastVideoPack activate 时经 registerPackNodeHandlers() 注册
 * （boot 序保证先于工作流子系统装配与一致性自检）；目录元数据仍在 shared 的
 * NODE_TYPE_CATALOG（供运行图回放/变量提示/图校验/编辑器面板使用）。
 *
 * @description
 *  - slide-render：幻灯片结构（标题/要点）→ PPT 风格 PNG 组（SVG 版式经 sharp-worker
 *    子进程渲染——libvips 不得进 Electron 主进程，见 sharp-worker.ts 头注释）。
 *  - podcast-compose：幻灯片图组 + 逐页配音 → 按配音时长对齐时间轴（页间停顿 apad）
 *    → 逐页图片段拼接 + 配音/BGM 混流成片。复用平台 ffmpeg-utils 基础工具。
 *
 *    音画对齐公式（唯一事实源在 ./slides/audio-timeline.buildTimeline）：
 *    每页停留 = 该页配音时长 + gapSec；配音轨逐段补 gap 静音后 concat，两边严格一致。
 */

import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { getPathProvider } from '@core/interfaces/path.interface'
import { workerRenderSvg } from '@core/platform/episode-production/common/sharp-worker'
import type { WorkflowNodeContext } from '@core/platform/workflow/engine/node-handler'
import type { WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'
import { stringifyValue } from '@core/platform/workflow/engine/variable-resolver'
import { ffmpegBin, runFfmpeg, coverFilter, probeAudioDurationSec, resolveMediaPath, rmSyncSafe } from '@core/platform/workflow/nodes/ffmpeg-utils'
import { buildSlideSvg, getSlideTheme, SLIDE_THEMES, type SlideInput } from './slides/slide-svg'
import { buildTimeline, normalizePairs } from './slides/audio-timeline'

// ==================== slide-render：幻灯片渲染 ====================

/** 幻灯片结构归一化：模板解析结果（数组/JSON 字符串）→ 校验后的 SlideInput[] */
function normalizeSlides(raw: unknown): SlideInput[] {
  let slides: unknown = raw
  if (typeof slides === 'string') {
    const s = slides.trim()
    if (!s) throw new Error('幻灯片结构为空')
    try {
      slides = JSON.parse(s)
    } catch {
      throw new Error('幻灯片结构不是合法 JSON：请检查上游 LLM 输出或审核改写内容')
    }
  }
  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error('幻灯片结构为空或不是数组：请检查上游输出（需 [{ title, bullets, narration }]）')
  }
  if (slides.length > 40) throw new Error(`幻灯片页数超限（${slides.length} > 40）：请减少页数`)
  const out: SlideInput[] = []
  for (const [i, item] of slides.entries()) {
    if (!item || typeof item !== 'object') throw new Error(`第 ${i + 1} 页结构不是对象`)
    const o = item as Record<string, unknown>
    const title = String(o.title ?? '').trim()
    const bullets = Array.isArray(o.bullets)
      ? o.bullets.map(b => String(b ?? '').trim()).filter(Boolean)
      : typeof o.bullets === 'string' && o.bullets.trim()
        ? [o.bullets.trim()]
        : []
    if (!title && bullets.length === 0) throw new Error(`第 ${i + 1} 页标题与要点均为空`)
    out.push({ kind: String(o.kind ?? 'content').trim() || 'content', title, bullets, narration: String(o.narration ?? '') })
  }
  return out
}

const slideRenderNode: WorkflowNodeHandler = {
  type: 'slide-render',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'slidePaths', type: 'json', desc: '幻灯片 PNG 本地路径数组（按页序）' },
    { key: 'count', type: 'number', desc: '渲染页数' },
    { key: 'dir', type: 'string', desc: '幻灯片输出目录' },
  ],
  validateConfig(config) {
    const cfg = config as { slides?: unknown; theme?: string; width?: number; height?: number }
    const errors: string[] = []
    // 模板表达式（如 {{deckGen.parsed.slides}}）由引擎运行时解析，校验阶段放行；
    // 解析后为空/非法在 execute 内有明确报错
    const slides = cfg.slides
    const isTemplate = typeof slides === 'string' && /{{\s*[A-Za-z0-9_.]+\s*}}/.test(slides)
    if (!isTemplate) {
      if (Array.isArray(slides)) {
        if (slides.length === 0) errors.push('幻灯片结构不能为空数组')
      } else if (typeof slides !== 'string' || slides.trim() === '') {
        errors.push('必须提供幻灯片结构（slides）')
      }
    }
    const theme = stringifyValue(cfg.theme).trim()
    if (theme && !theme.includes('{{') && !SLIDE_THEMES.some(t => t.id === theme)) {
      errors.push(`未知主题: ${theme}（可选：${SLIDE_THEMES.map(t => t.id).join('/')}）`)
    }
    for (const [key, val] of [['width', cfg.width], ['height', cfg.height]] as const) {
      const n = Number(val)
      if (val !== undefined && (!Number.isFinite(n) || n < 320 || n > 4096)) {
        errors.push(`${key} 需在 320-4096 之间`)
      }
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      slides: unknown
      deckTitle?: string
      theme?: string
      width?: number
      height?: number
    }
    try {
      const slides = normalizeSlides(cfg.slides)
      const theme = getSlideTheme(stringifyValue(cfg.theme).trim() || 'light')
      const width = Number(cfg.width) > 0 ? Math.round(Number(cfg.width)) : 1920
      const height = Number(cfg.height) > 0 ? Math.round(Number(cfg.height)) : 1080
      const deckTitle = stringifyValue(cfg.deckTitle ?? '')
      const dir = join(getPathProvider().getDataPath(), 'workflow-media', ctx.runId, 'slides')
      mkdirSync(dir, { recursive: true })

      const slidePaths: string[] = []
      for (const [i, slide] of slides.entries()) {
        const svg = buildSlideSvg({ slide, index: i + 1, total: slides.length, width, height, theme, deckTitle })
        const outPath = join(dir, `slide_${String(i + 1).padStart(2, '0')}.png`)
        await workerRenderSvg({ svg, outPath })
        if (!existsSync(outPath)) {
          return { status: 'failed', error: `第 ${i + 1} 页渲染失败（未产出文件）` }
        }
        slidePaths.push(outPath)
        ctx.emitProgress(Math.round(((i + 1) / slides.length) * 95), `渲染第 ${i + 1}/${slides.length} 页`)
      }
      return { status: 'succeeded', output: { slidePaths, count: slidePaths.length, dir } }
    } catch (e) {
      return { status: 'failed', error: '幻灯片渲染失败: ' + ((e as Error).message ?? String(e)) }
    }
  },
}

// ==================== podcast-compose：播客合成 ====================

const podcastComposeNode: WorkflowNodeHandler = {
  type: 'podcast-compose',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'videoPath', type: 'string', desc: '合成的视频本地路径' },
    { key: 'duration', type: 'number', desc: '成片时长（秒）' },
    { key: 'slideCount', type: 'number', desc: '页数' },
    { key: 'timeline', type: 'json', desc: '每页时间轴 [{ index, image, audio, audioDurationSec, slideDurationSec, startSec }]' },
  ],
  validateConfig(config) {
    const cfg = config as { slideImages?: unknown; audioFiles?: unknown; gapMs?: number; width?: number; height?: number; fps?: number }
    const errors: string[] = []
    // 模板表达式运行时解析（同 video-compose 纪律），这里只拦字面量形态的明显错误
    for (const [label, val] of [['幻灯片图组', cfg.slideImages], ['逐页配音组', cfg.audioFiles]] as const) {
      const isTemplate = typeof val === 'string' && /{{\s*[A-Za-z0-9_.]+\s*}}/.test(val)
      if (!isTemplate && (val === undefined || val === null || (typeof val === 'string' && val.trim() === ''))) {
        errors.push(`必须提供${label}`)
      }
    }
    if (cfg.gapMs !== undefined && (!Number.isFinite(Number(cfg.gapMs)) || Number(cfg.gapMs) < 0 || Number(cfg.gapMs) > 5000)) {
      errors.push('页间停顿(gapMs)需在 0-5000 之间')
    }
    for (const [key, val] of [['width', cfg.width], ['height', cfg.height]] as const) {
      const n = Number(val)
      if (val !== undefined && (!Number.isFinite(n) || n < 320 || n > 4096)) {
        errors.push(`${key} 需在 320-4096 之间`)
      }
    }
    if (cfg.fps !== undefined && (!Number.isFinite(Number(cfg.fps)) || Number(cfg.fps) < 1 || Number(cfg.fps) > 240)) {
      errors.push('fps 需在 1-240 之间')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      slideImages: unknown
      audioFiles: unknown
      gapMs?: number
      bgmPath?: string
      width?: number
      height?: number
      fps?: number
      outputName?: string
    }
    let tmpDir = ''
    try {
      // 1) 配对与存在性校验
      const pairs = normalizePairs(cfg.slideImages, cfg.audioFiles).map(p => ({
        image: resolveMediaPath(p.image),
        audio: resolveMediaPath(p.audio),
      }))
      for (const [i, p] of pairs.entries()) {
        if (!existsSync(p.image)) return { status: 'failed', error: `第 ${i + 1} 页幻灯片文件不存在: ${p.image}` }
        if (!existsSync(p.audio)) return { status: 'failed', error: `第 ${i + 1} 页配音文件不存在: ${p.audio}` }
      }

      // 2) 探测每段配音时长 → 时间轴（音画对齐的唯一事实源）
      const bin = ffmpegBin()
      ctx.emitProgress(5, `探测 ${pairs.length} 段配音时长`)
      const audioDurationsSec: number[] = []
      for (const [i, p] of pairs.entries()) {
        const dur = await probeAudioDurationSec(bin, p.audio)
        if (dur === null) return { status: 'failed', error: `无法读取第 ${i + 1} 页配音时长（文件损坏或非音频）: ${p.audio}` }
        audioDurationsSec.push(dur)
        ctx.emitProgress(5 + Math.round(((i + 1) / pairs.length) * 10), `探测配音时长 ${i + 1}/${pairs.length}`)
      }
      const gapSec = clampGapMs(cfg.gapMs)
      const { entries, totalSec } = buildTimeline(pairs, audioDurationsSec, gapSec)

      // 3) 输出目录（成片在 dataPath/videos，中间件在 <name>_parts，finally 清理）
      const width = Number(cfg.width) > 0 ? Math.round(Number(cfg.width)) : 1920
      const height = Number(cfg.height) > 0 ? Math.round(Number(cfg.height)) : 1080
      const fps = Number(cfg.fps) > 0 ? Math.round(Number(cfg.fps)) : 30
      const dataPath = getPathProvider().getDataPath()
      const outDir = join(dataPath, 'videos')
      mkdirSync(outDir, { recursive: true })
      const name = (cfg.outputName ? stringifyValue(cfg.outputName) : '播客视频') + '_' + Date.now().toString(36)
      tmpDir = join(outDir, name + '_parts')
      mkdirSync(tmpDir, { recursive: true })

      // 4) 整条配音轨：每段音频后接 gap 秒静音再 concat（与 buildTimeline 公式严格一致）。
      //    注：打包的 @ffmpeg-installer 是 4.1 世代（无 apad pad_dur），静音用
      //    anullsrc+asplit+atrim 老滤镜组合，版本兼容。
      const narrationPath = join(tmpDir, 'narration.wav')
      const n = pairs.length
      const filterParts = pairs.map((_, i) => `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`)
      // 静音源已在输入侧声明（-f lavfi -i anullsrc），这里直接对其输出流分裂 n 路，各裁 gapSec
      filterParts.push(`[${n}:a]asplit=${n}${pairs.map((_, i) => `[s${i}]`).join('')}`)
      pairs.forEach((_, i) => filterParts.push(`[s${i}]atrim=duration=${gapSec}[p${i}]`))
      const concatIn = pairs.map((_, i) => `[a${i}][p${i}]`).join('')
      filterParts.push(`${concatIn}concat=n=${n * 2}:v=0:a=1[cat]`)
      await runFfmpeg([
        '-y',
        ...pairs.flatMap(p => ['-i', p.audio]),
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-filter_complex', filterParts.join(';'),
        '-map', '[cat]',
        '-c:a', 'pcm_s16le',
        narrationPath,
      ])
      ctx.emitProgress(30, '配音轨已拼接')

      // 5) 逐页图片段（静态幻灯片，无运镜）→ 统一分辨率 mp4
      const partFiles: string[] = []
      for (const [i, e] of entries.entries()) {
        const part = join(tmpDir, `seg_${String(i).padStart(3, '0')}.mp4`)
        await runFfmpeg([
          '-y',
          '-loop', '1', '-framerate', String(fps), '-i', e.image,
          '-t', String(Math.max(0.2, e.slideDurationSec)),
          '-vf', `${coverFilter(width, height)},fps=${fps}`,
          '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
          '-an', part,
        ])
        partFiles.push(part)
        ctx.emitProgress(30 + Math.round(((i + 1) / entries.length) * 55), `合成第 ${i + 1}/${entries.length} 页画面`)
      }

      // 6) concat 拼接
      const concatList = join(tmpDir, 'list.txt')
      writeFileSync(concatList, partFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n') + '\n', 'utf-8')
      const concated = join(tmpDir, 'concat.mp4')
      await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', concated])
      ctx.emitProgress(92, '画面已拼接')

      // 7) 成片混流：视频 + 配音（+ 可选 BGM 压低混音；视频流直接 copy 不重编码）
      const final = join(outDir, name + '.mp4')
      const bgmPath = resolveMediaPath(cfg.bgmPath ? stringifyValue(cfg.bgmPath) : '')
      if (bgmPath && !existsSync(bgmPath)) return { status: 'failed', error: `BGM 文件不存在: ${bgmPath}` }
      if (bgmPath) {
        await runFfmpeg([
          '-y', '-i', concated, '-i', narrationPath, '-i', bgmPath,
          '-filter_complex', `[0:v]null[v];[1:a]volume=1.0[a1];[2:a]volume=0.16[a2];[a1][a2]amix=inputs=2:duration=first:normalize=0[a]`,
          '-map', '[v]', '-map', '[a]',
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
          '-t', String(totalSec), final,
        ])
      } else {
        await runFfmpeg([
          '-y', '-i', concated, '-i', narrationPath,
          '-map', '0:v', '-map', '1:a',
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
          '-t', String(totalSec), final,
        ])
      }
      ctx.emitProgress(100, '成片完成')
      return {
        status: 'succeeded',
        output: {
          videoPath: final,
          duration: totalSec,
          slideCount: pairs.length,
          timeline: entries,
        },
      }
    } catch (e) {
      return { status: 'failed', error: '播客合成失败: ' + ((e as Error).message ?? String(e)) }
    } finally {
      if (tmpDir) {
        try { rmSyncSafe(tmpDir) } catch { /* 清理失败忽略 */ }
      }
    }
  },
}

/** 页间停顿毫秒 → 秒（0-5s；缺省 0.6） */
function clampGapMs(gapMs?: number): number {
  const n = Number(gapMs)
  if (!Number.isFinite(n) || n <= 0) return 0.6
  return Math.min(5, Math.max(0, n / 1000))
}

export const PODCAST_WORKFLOW_NODE_HANDLERS = [slideRenderNode, podcastComposeNode]
