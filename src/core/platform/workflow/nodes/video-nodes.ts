/**
 * 视频节点（脚本→视频工作流）
 * @module core/platform/workflow/nodes/video-nodes
 * @description
 *  - video-gen：AI 视频生成（文生视频 / 图生视频），复用 video-generation.service；
 *    异步任务监听 video:generation-event 等完成后返回 videoPath。
 *  - video-compose：ffmpeg 合成（图/视频段 → 按时长拼接 + 烧录字幕 + 配音 + BGM）。
 *    节点 handler 运行于主进程（非 vm 沙箱），可调用 ffmpeg（@ffmpeg-installer）。
 */

import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { getPathProvider } from '@core/interfaces/path.interface'
import { resolveAssetPath } from '@core/utils/asset-path'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { VideoGenerationService } from '@core/platform/episode-production/render/video/video-generation.service'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { submitWithTransientRetry } from './retry-submit'
import { getVideoPreset, assembleVideoPresetPrompt, VIDEO_TYPE_PRESETS } from '@shared/types/video-presets'

/** 主进程 ffmpeg 可执行路径（@ffmpeg-installer 缓存了与平台匹配的二进制） */
function ffmpegBin(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const inst = require('@ffmpeg-installer/ffmpeg') as { path?: string }
    return inst.path || 'ffmpeg'
  } catch {
    return 'ffmpeg'
  }
}

/** 同步执行 ffmpeg（失败抛错） */
function runFfmpeg(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegBin()
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], ...(cwd ? { cwd } : {}) })
    let err = ''
    proc.stderr.on('data', d => (err += d.toString()))
    proc.on('error', e => reject(new Error('ffmpeg 启动失败: ' + e.message)))
    proc.on('close', code => {
      if (code === 0) resolve(err)
      else reject(new Error('ffmpeg 失败(exit ' + code + '): ' + err.slice(-600)))
    })
  })
}

/** 图片可分辨率的类似宽高比目标：按 scale/crop 到目标尺寸 */
function coverFilter(outW: number, outH: number): string {
  return `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`
}

/** 解析 ffmpeg -i 输出，探测视频参数（分辨率/帧率/时长） */
interface ProbedVideoInfo {
  width: number
  height: number
  fps: number
  durationSec: number
}
function probeVideoInfo(bin: string, file: string): Promise<ProbedVideoInfo | null> {
  return new Promise<ProbedVideoInfo | null>(resolve => {
    const proc = spawn(bin, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', d => (err += d.toString()))
    proc.on('close', () => {
      // 示例：  Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 720x1280, 2849 kb/s, 24 fps
      // 示例：  Duration: 00:00:05.04, start: 0.000000, bitrate: 2887 kb/s
      const stream = err.match(/Video:.*?(\d{2,5})x(\d{2,5})[^,]*,\s*[\d.]+\s*(?:kb\/s|Mb\/s)?[^,]*,?\s*([\d.]+)\s*fps/)
      const dur = err.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
      if (!stream) return resolve(null)
      const width = Number(stream[1])
      const height = Number(stream[2])
      const fps = Number(stream[3]) || 30
      const durationSec = dur
        ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])
        : 0
      resolve({ width, height, fps, durationSec })
    })
    proc.on('error', () => resolve(null))
  })
}

/**
 * 解析可能带自定义协议的本地资源路径（local-file:// / local-video:// / local-image:// 等）。
 * 这些协议 URL 由 toAssetUrl 生成；这里去掉协议前缀后按 dataPath 拼接成真实绝对路径，
 * 便于 existsSync / ffmpeg 读取。若已是绝对路径或无协议则按 resolveAssetPath 处理。
 */
function resolveMediaPath(p: string): string {
  const trimmed = (p ?? '').trim()
  if (!trimmed) return trimmed
  // 去掉自定义协议前缀（local-*://...）
  const stripped = trimmed.replace(/^local-[a-z]+:\/\//i, '').replace(/^\//, '')
  // 去掉协议后仍可能是相对路径（如 voice/tts/x.wav）→ 拼 dataPath；绝对路径原样
  return resolveAssetPath(stripped)
}

const videoGenNode: WorkflowNodeHandler = {
  type: 'video-gen',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'videoPath', type: 'string', desc: '生成的视频本地路径' },
    { key: 'videoUrl', type: 'string', desc: '视频可访问 URL' },
    { key: 'taskId', type: 'string', desc: '异步生成任务 ID（同步模式为空）' },
  ],
  validateConfig(config) {
    const cfg = config as { providerConfigId?: string; model?: string; prompt?: string; image?: string }
    const errors: string[] = []
    if (!cfg.providerConfigId) errors.push('必须指定视频 Provider')
    if (!cfg.model) errors.push('必须指定视频模型')
    if (stringifyValue(cfg.prompt).trim() === '' && stringifyValue(cfg.image).trim() === '') {
      errors.push('需提供提示词(prompt)或输入图(image)')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      providerConfigId: string
      model: string
      prompt?: string
      negativePrompt?: string
      image?: string
      duration?: number
      width?: number
      height?: number
      aspectRatio?: string
      motion?: string
      /** ComfyUI H3：high=704x1248 | low=480x864（评审 #105，默认 high） */
      quality?: 'high' | 'low'
      /** ComfyUI H3：20=全质量 | 4=turbo（评审 #105，默认 20） */
      steps?: number
    }
    const rawImage = stringifyValue(cfg.image)
    let imageInput: string | undefined
    if (rawImage) {
      if (rawImage.startsWith('local-')) {
        // local-image://... → 解析为本地文件再转 base64（图生视频 provider 需要可访问图）
        const p = resolveAssetPath(rawImage.replace(/^local-[a-z]+:\/\//i, '').replace(/^\//, ''))
        imageInput = existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : rawImage
      } else if (existsSync(rawImage)) {
        imageInput = `data:image/png;base64,${readFileSync(rawImage).toString('base64')}`
      } else {
        imageInput = rawImage
      }
    }
    const submit = async () =>
      VideoGenerationService.generateVideo({
        providerConfigId: cfg.providerConfigId,
        model: cfg.model,
        prompt: stringifyValue(cfg.prompt),
        negativePrompt: cfg.negativePrompt ? stringifyValue(cfg.negativePrompt) : undefined,
        image: imageInput,
        duration: cfg.duration,
        width: cfg.width,
        height: cfg.height,
        aspectRatio: cfg.aspectRatio,
        motion: cfg.motion,
        quality: cfg.quality,
        steps: cfg.steps,
        skipHistory: true,
      })
    // 评审 #105：提交阶段的瞬时网络失败（fetch/连接/网关 5xx/超时）内部重试一次，
    // 避免偶发抖动直接让整场长视频失败（与 image-gen 共用 retry-submit）
    const resp = await submitWithTransientRetry(submit, { label: '视频', logger: ctx.logger })
    if (!resp.success) return { status: 'failed', error: `视频生成失败: ${resp.error ?? '未知错误'}` }
    if (resp.video?.localPath) {
      return {
        status: 'succeeded',
        output: { videoPath: resp.video.localPath, videoUrl: ((resp.video as unknown as { url?: string }).url ?? ''), taskId: '' },
      }
    }
    const taskId = resp.taskId
    if (!taskId) return { status: 'failed', error: '未返回任务 ID 或视频结果' }
    // 异步：等待 generation-completed 事件
    const videoPath = await new Promise<string | null>(resolve => {
      let unsub: (() => void) | undefined
      try {
        unsub = getEventEmitter().tapEvents?.((channel, data) => {
          if (channel === 'video:generation-event') {
            const ev = data as { taskId?: string; type?: string; video?: { localPath?: string } }
            if (ev?.taskId === taskId && ev?.type === 'generation-completed' && ev?.video?.localPath) {
              unsub?.()
              resolve(ev.video.localPath as string)
            }
          }
        })
      } catch { /* tapEvents 缺失则等待后超时失败 */ }
      // 评审 #103/#105：局域网 ComfyUI 网关 H3 单镜实测 5~40 分钟（视帧数/排队），
      // 等待上限提至 70 分钟（< VideoService 轮询上限 75 分钟）；低画质/turbo 档显著更快。
      setTimeout(() => resolve(null), 70 * 60 * 1000)
    })
    if (!videoPath) return { status: 'failed', error: '视频生成等待超时（70 分钟，可用「断点续跑」继续）' }
    return { status: 'succeeded', output: { videoPath, videoUrl: '', taskId } }
  },
}

const videoComposeNode: WorkflowNodeHandler = {
  type: 'video-compose',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'videoPath', type: 'string', desc: '合成的视频本地路径' },
    { key: 'duration', type: 'number', desc: '成片时长（秒）' },
  ],
  validateConfig(config) {
    const cfg = config as { segments?: unknown; width?: number; height?: number }
    const errors: string[] = []
    // 模板表达式（如 {{code1.result.segments}}）由引擎运行时解析为数组，校验阶段放行；
    // 解析后若为空数组/非数组，execute 内已有明确报错兜底
    const segs = cfg.segments
    const isTemplate = typeof segs === 'string' && /{{\s*[A-Za-z0-9_.]+\s*}}/.test(segs)
    if (!isTemplate && (!Array.isArray(segs) || segs.length === 0)) errors.push('至少提供一个镜头段(segments)')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      segments: Array<{ source: string; kind: 'image' | 'video'; duration: number; caption?: string }>
      audioPath?: string
      bgmPath?: string
      width?: number
      height?: number
      outputName?: string
    }
    // 解析可能带 local-*:// 协议的本地路径（tts 返回 local-file://、vid1 返回文件路径）
    const segs = (cfg.segments ?? []).map(s => ({
      source: resolveMediaPath(stringifyValue(s.source)),
      kind: (stringifyValue(s.kind) === 'video' ? 'video' : 'image') as 'image' | 'video',
      duration: Number(s.duration) > 0 ? Number(s.duration) : 3,
      caption: stringifyValue(s.caption),
    }))
    // 无镜头段时直接报错，避免 ffmpeg 读空 concat 列表给出难懂的配置信息
    if (segs.length === 0) {
      return { status: 'failed', error: '没有可合成的镜头段（segments 为空，请检查上游 loop 输出的 results 结构）' }
    }
    for (const s of segs) if (!existsSync(s.source)) return { status: 'failed', error: `镜头段文件不存在: ${s.source}` }
    const audioPath = resolveMediaPath(cfg.audioPath ? stringifyValue(cfg.audioPath) : '')
    if (audioPath && !existsSync(audioPath)) return { status: 'failed', error: `音频文件不存在: ${audioPath}` }
    const bgmPath = resolveMediaPath(cfg.bgmPath ? stringifyValue(cfg.bgmPath) : '')
    if (bgmPath && !existsSync(bgmPath)) return { status: 'failed', error: `BGM 文件不存在: ${bgmPath}` }

    // 输出规格：默认跟随第一个镜头段的实际分辨率与帧率（同源生成的各段一致），
    // 避免把源分辨率二次降采样/重采样导致画质劣化；探测失败再退回配置值
    const bin = ffmpegBin()
    const probed = segs[0] ? await probeVideoInfo(bin, segs[0].source) : null
    const width = probed?.width || (cfg.width && cfg.width > 0 ? cfg.width : 1080)
    const height = probed?.height || (cfg.height && cfg.height > 0 ? cfg.height : 1920)
    const fps = probed?.fps || 30
    const dataPath = getPathProvider().getDataPath()
    const outDir = join(dataPath, 'videos')
    mkdirSync(outDir, { recursive: true })
    const name = (cfg.outputName ? stringifyValue(cfg.outputName) : 'video') + '_' + Date.now().toString(36)
    const tmpDir = join(outDir, name + '_parts')
    mkdirSync(tmpDir, { recursive: true })

    try {
      // 1) 逐段生成统一分辨率 mp4（保持源帧率，不重采样）
      const partFiles: string[] = []
      let t = 0
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]
        const part = join(tmpDir, `seg_${String(i).padStart(3, '0')}.mp4`)
        const dur = Math.max(0.2, s.duration)
        const vf = `${coverFilter(width, height)},fps=${fps}`
        await runFfmpeg([
          '-y',
          ...(s.kind === 'image' ? ['-loop', '1', '-i', s.source] : ['-i', s.source]),
          '-t', String(dur),
          '-vf', vf,
          '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
          '-an', part,
        ])
        partFiles.push(part)
        t += dur
      }

      // 2) 烧录字幕（拼接段按时间轴生成 ASS：带样式/位置/描边，中文字体可控）
      const hasCaptions = segs.some(s => s.caption)
      let subtitleFilter = ''
      if (hasCaptions) {
        const assPath = join(tmpDir, 'sub.ass')
        const fmtAss = (sec: number): string => {
          const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), ms = Math.round((sec % 1) * 1000)
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
        }
        // PlayRes 用成片分辨率：字号按分辨率缩放（16:9/9:16 通用底部安全区）
        const fontSize = Math.max(28, Math.round(height / 48))
        let ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Microsoft YaHei,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H28000000,0,0,0,0,100,100,0,0,1,3,1,2,40,40,60,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`
        let cur = 0
        segs.forEach(s => {
          const end = Math.min(t, cur + Math.max(0.2, s.duration))
          const text = (s.caption || '').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\r?\n/g, ' ')
          if (text) {
            // 简单替换 ASS 控制字符（{...} 会被当作覆盖标签）
            const safe = text.replace(/\\N/g, ' ').replace(/\{\\[^}]*\}/g, '')
            ass += `Dialogue: 0,${fmtAss(cur)},${fmtAss(end)},Default,,0,0,0,,${safe}\n`
          }
          cur = end
        })
        writeFileSync(assPath, ass, 'utf-8')
        // 字幕用相对文件名：规避 Windows 盘符冒号/中文目录的滤镜参数转义问题（滤镜以 tmpDir 为 cwd）
        subtitleFilter = 'subtitles=sub.ass'
      }

      // 3) concat 拼接
      const concatList = join(tmpDir, 'list.txt')
      writeFileSync(concatList, partFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n') + '\n', 'utf-8')
      const concated = join(tmpDir, 'concat.mp4')
      await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', concated])

      // 4) 成片：视频 + 字幕烧录 +（配音/BGM 混音或纯音轨）
      const final = join(outDir, name + '.mp4')
      if (audioPath || bgmPath) {
        // 视频链：烧字幕（若有字幕）；音频链：配音 +（可选）BGM 混音（BGM 压低避人声）
        const videoPart = hasCaptions ? `[0:v]${subtitleFilter}[v]` : `[0:v]null[v]`
        const audioPart = bgmPath
          ? `[1:a]volume=1.0[a1];[2:a]volume=0.16[a2];[a1][a2]amix=inputs=2:duration=first:normalize=0[a]`
          : `[1:a]anull[a]`
        await runFfmpeg([
          '-y', '-i', concated, '-i', audioPath, ...(bgmPath ? ['-i', bgmPath] : []),
          '-filter_complex', `${videoPart};${audioPart}`,
          '-map', '[v]', '-map', '[a]',
          '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
          '-t', String(t), final,
        ], tmpDir)
      } else {
        await runFfmpeg([
          '-y', '-i', concated,
          ...(hasCaptions ? ['-vf', subtitleFilter] : []),
          '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-an', final,
        ], tmpDir)
      }
      return { status: 'succeeded', output: { videoPath: final, duration: t } }
    } catch (e) {
      return { status: 'failed', error: '视频合成失败: ' + ((e as Error).message ?? String(e)) }
    } finally {
      try { rmSyncSafe(tmpDir) } catch { /* 清理失败忽略 */ }
    }
  },
}

function rmSyncSafe(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

/**
 * 视频类型预设装配节点（V2：短视频脚本生成视频）
 * 输入 videoType（预设 id）+ 可选 freeStyle（自由风格叠加），输出：
 *  - promptBlock：完整规范 markdown（定位/结构/画面/运镜/音乐/字幕/口吻），注入大纲与素材 LLM；
 *  - styleText：紧凑画面风格句（供 image-gen / video-gen 提示词）；
 *  - preset：原始预设 JSON（结构化取用）。
 * videoType 为空且 freeStyle 为空 → 校验失败；仅 freeStyle → 走自定义（无内置规范）。
 */
const videoPresetNode: WorkflowNodeHandler = {
  type: 'video-preset',
  controlKind: 'control',
  cancellable: false,
  outputSchema: [
    { key: 'type', type: 'string', desc: '预设 id（自定义时为空）' },
    { key: 'label', type: 'string', desc: '预设名（自定义时为空）' },
    { key: 'styleText', type: 'string', desc: '紧凑画面风格句（图/视频提示词用）' },
    { key: 'promptBlock', type: 'string', desc: '完整规范 markdown（大纲/素材 LLM 用）' },
    { key: 'preset', type: 'json', desc: '原始预设 JSON（无预设=null）' },
  ],
  validateConfig(config) {
    const cfg = config as { videoType?: string; freeStyle?: string }
    const errors: string[] = []
    const t = stringifyValue(cfg.videoType).trim()
    if (!t && stringifyValue(cfg.freeStyle).trim() === '') {
      errors.push('请选择视频类型预设或填写自由风格（至少一项）')
    }
    // 模板占位（{{start.videoType}} 等）在图校验阶段无法定值 → 放行，运行时解析后再校验
    if (t && !t.includes('{{') && !VIDEO_TYPE_PRESETS.some(p => p.id === t)) {
      errors.push(`未知的视频类型预设: ${t}`)
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { videoType?: string; freeStyle?: string }
    const type = stringifyValue(cfg.videoType).trim()
    const freeStyle = stringifyValue(cfg.freeStyle).trim()
    const preset = getVideoPreset(type)
    const styleText = preset
      ? `${preset.visualStyle}${freeStyle ? `；用户自定义叠加：${freeStyle}` : ''}`
      : freeStyle
    return {
      status: 'succeeded',
      output: {
        type,
        label: preset?.label ?? '',
        styleText,
        promptBlock: assembleVideoPresetPrompt(type, freeStyle),
        preset: preset ?? null,
      },
    }
  },
}

export const VIDEO_NODE_HANDLERS = [videoGenNode, videoComposeNode, videoPresetNode]
