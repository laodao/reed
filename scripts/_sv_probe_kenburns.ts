/**
 * 一次性真机探针：验证 video-compose 的图片段运镜滤镜（Ken Burns）在真实 ffmpeg 下可用。
 * 直接调用生产代码 segmentMotionFilter，避免"探针里另写一份表达式"造成验的不是同一份。
 * 用法：npx tsx -r tsconfig-paths/register scripts/_sv_probe_kenburns.ts
 */
import { spawn } from 'child_process'
import { mkdtempSync, rmSync, statSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SEGMENT_MOTIONS, segmentMotionFilter } from '@core/platform/workflow/nodes/video-nodes'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpeg = (require('@ffmpeg-installer/ffmpeg') as { path: string }).path

const W = 1080
const H = 1920
const FPS = 30
const DUR = 3

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => (err += d.toString()))
    p.on('close', c => (c === 0 ? resolve(err) : reject(new Error(`exit ${c}: ${err.slice(-500)}`))))
  })
}

/** 从 ffmpeg -i 输出取时长与分辨率（验证产物真的对） */
function probe(file: string): Promise<{ duration: number; size: string }> {
  return new Promise(resolve => {
    const p = spawn(ffmpeg, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => (err += d.toString()))
    p.on('close', () => {
      const d = err.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
      const s = err.match(/Video:.*?(\d{2,5})x(\d{2,5})/)
      resolve({
        duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : -1,
        size: s ? `${s[1]}x${s[2]}` : '?',
      })
    })
  })
}

;(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kenburns-'))
  const img = join(dir, 'src.png')
  // 造一张竖屏测试图（模拟真实素材图）
  await run(['-y', '-f', 'lavfi', '-i', `testsrc=size=1600x2400:rate=1`, '-frames:v', '1', img])
  console.log('测试图：', img, existsSync(img) ? '已生成' : '生成失败')

  for (const motion of SEGMENT_MOTIONS) {
    const out = join(dir, `${motion}.mp4`)
    const t0 = Date.now()
    try {
      if (motion === 'none') {
        // 静态基线：与 compose 未开运镜时一致
        await run(['-y', '-loop', '1', '-framerate', String(FPS), '-i', img, '-t', String(DUR),
          '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS}`,
          '-c:v', 'libx264', '-crf', '18', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', out])
      } else {
        await run(['-y', '-loop', '1', '-framerate', String(FPS), '-i', img, '-t', String(DUR),
          '-vf', segmentMotionFilter(motion, W, H, FPS),
          '-c:v', 'libx264', '-crf', '18', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', out])
      }
      const info = await probe(out)
      const kb = (statSync(out).size / 1024).toFixed(0)
      // 逐帧差异：确认画面真的在动（否则运镜失效）
      const frameDelta = await measureMotion(dir, out, FPS)
      console.log(`[${motion}] 时长=${info.duration.toFixed(2)}s 分辨率=${info.size} 体积=${kb}KB 耗时=${Date.now() - t0}ms 帧间差异=${frameDelta}`)
    } catch (e) {
      console.log(`[${motion}] 失败：${e instanceof Error ? e.message : e}`)
    }
  }
  rmSync(dir, { recursive: true, force: true })
})().catch(e => {
  console.error('探针失败：', e)
  process.exit(1)
})

/** 取首帧与中间帧做像素差（signalstats 之外最简做法：抽两帧比字节数不同的比例） */
async function measureMotion(dir: string, video: string, fps: number): Promise<string> {
  const f1 = join(dir, 'f1.png')
  const f2 = join(dir, 'f2.png')
  await run(['-y', '-ss', '0.1', '-i', video, '-frames:v', '1', f1])
  await run(['-y', '-ss', String(2.5), '-i', video, '-frames:v', '1', f2])
  const a = statSync(f1).size
  const b = statSync(f2).size
  void fps
  return a === b ? `相同(${a}B,疑似静态)` : `不同(${a}B vs ${b}B)`
}