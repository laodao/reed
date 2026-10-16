/**
 * 播客视频目视验收脚本（临时，不进测试套件）：
 * 1) 经真实 sharp-worker 渲染 4 页样张（cover/content×2/ending，light+dark 主题）
 * 2) 合成 3 段正弦波配音，走 podcastComposeNode.execute 真实 ffmpeg 管线
 * 运行：npx tsx -r tsconfig-paths/register outputs/_podcast-acceptance.ts
 */
import { mkdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { registerPathProvider } from '@core/interfaces/path.interface'
import { buildSlideSvg, getSlideTheme } from '@core/packs/podcast-video/slides/slide-svg'
import { workerRenderSvg } from '@core/platform/episode-production/common/sharp-worker'
import { PODCAST_WORKFLOW_NODE_HANDLERS } from '@core/packs/podcast-video/workflow-nodes'
import { spawnSync } from 'child_process'

// 验收脚本：数据目录指到仓库 .tmp-vitest（未注册 pathProvider 时 compose 节点会抛错）
const DATA_ROOT = 'C:/Users/daoge/code/project/the-bot/.tmp-vitest/podcast-data'
registerPathProvider(() => ({
  getUserDataPath: () => DATA_ROOT,
  getAppDataPath: () => DATA_ROOT,
  getTempPath: () => DATA_ROOT,
  getDataPath: () => DATA_ROOT,
}))

const OUT = 'C:/Users/daoge/code/project/the-bot/.tmp-vitest/podcast-acceptance'
mkdirSync(OUT, { recursive: true })

const deck = [
  { kind: 'cover', title: '大模型时代的知识管理', bullets: ['素材匹配难题的破局思路', '一期讲清楚播客视频'] },
  {
    kind: 'content',
    title: '为什么素材型视频难做完美匹配',
    bullets: [
      '文案与画面是两套语义系统，逐句对齐成本极高',
      '通用素材库命中率有限，生成图又容易假',
      '播客视频用幻灯片承载结论，语音承载细节',
    ],
    narration: '……',
  },
  {
    kind: 'content',
    title: '播客视频的流水线',
    bullets: [
      'LLM 把文案总结归纳成幻灯片结构（每页核心要点）',
      '逐页口播配音承载详细讲解，页时长=配音时长+停顿',
      'ffmpeg 按时间轴对齐音画，天然零错位',
    ],
    narration: '……',
  },
  { kind: 'ending', title: '开始做你的第一期播客视频', bullets: ['准备一篇文案即可', '挑一个主题与音色'] },
]

async function renderDeck(theme: string, suffix: string, width = 1920, height = 1080) {
  const themeObj = getSlideTheme(theme)
  const paths: string[] = []
  for (const [i, slide] of deck.entries()) {
    const svg = buildSlideSvg({
      slide,
      index: i + 1,
      total: deck.length,
      width,
      height,
      theme: themeObj,
      deckTitle: '播客视频工作流验收',
    })
    const p = join(OUT, `slide_${suffix}_${i + 1}.png`)
    await workerRenderSvg({ svg, outPath: p })
    paths.push(p)
  }
  return paths
}

// 合成 T 秒正弦波 wav（模拟配音，频率随页变化便于区分）
function makeTone(path: string, seconds: number, freq: number): void {
  const r = spawnSync(ffmpegBinPath(), [
    '-y', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`,
    '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2', path,
  ])
  if (r.status !== 0) throw new Error('tone 生成失败: ' + r.stderr.toString().slice(-300))
}

function ffmpegBinPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@ffmpeg-installer/ffmpeg') as { path: string }).path
}

async function main() {
  // 1) 样张：light 横屏 4 页 + dark 横屏 2 页 + light 竖屏 1 页
  const light = await renderDeck('light', 'light')
  const dark2 = await renderDeck('dark', 'dark')
  const themeObj = getSlideTheme('warm')
  const verticalSvg = buildSlideSvg({
    slide: deck[1], index: 2, total: 4, width: 1080, height: 1920,
    theme: themeObj, deckTitle: '竖屏验收',
  })
  const verticalPath = join(OUT, 'slide_warm_vertical.png')
  await workerRenderSvg({ svg: verticalSvg, outPath: verticalPath })
  console.log('slides rendered:', [...light, ...dark2, verticalPath].filter(existsSync).length)

  // 2) 合成冒烟：3 页（light 前 3 张）+ 3 段配音（2.8s/4.2s/3.4s，gap 600ms）
  const [, podcastCompose] = PODCAST_WORKFLOW_NODE_HANDLERS
  const images = light.slice(0, 3)
  const audios = [0, 1, 2].map(i => {
    const p = join(OUT, `narr_${i + 1}.wav`)
    makeTone(p, [2.8, 4.2, 3.4][i], 330 + i * 130)
    return p
  })
  const expectTotal = 2.8 + 4.2 + 3.4 + 0.6 * 3
  const result = await podcastCompose.execute({
    runId: 'acceptance-run',
    config: {
      slideImages: images,
      audioFiles: audios.map(p => ({ audioPath: p })),
      gapMs: 600,
      width: 1920,
      height: 1080,
      outputName: '播客验收',
    },
    signal: new AbortController().signal,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    emitProgress: (p, m) => console.log('  progress', p, m),
  } as never)
  console.log('compose status:', result.status)
  if (result.status === 'succeeded') {
    const out = result.output as { videoPath: string; duration: number }
    console.log('video:', out.videoPath, 'duration:', out.duration, 'expect≈', expectTotal.toFixed(1))
    const size = statSync(out.videoPath).size
    console.log('file size:', (size / 1024 / 1024).toFixed(2), 'MB, exists:', existsSync(out.videoPath))
  } else {
    console.log('compose error:', (result as { error: string }).error)
  }
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
