const { spawnSync } = require('child_process')
const fs = require('fs')

const bin = 'C:/Users/daoge/code/project/the-bot/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'
const tmp = 'C:/Users/daoge/the-bot/videos/_verify_subs'
const v1 = 'C:/Users/daoge/the-bot/videos/2026/09/06/video_1788674010178.mp4'
const audio = 'C:/Users/daoge/the-bot/voice/tts/b6f9d7a9-ea22-4649-be55-9be1a44f2f9a.wav'

// 单镜头 + 字幕 + 配音（模拟成片命令核心：subtitles 相对路径 + charenc）
const out = tmp + '/test_sub.mp4'
const r = spawnSync(bin, [
  '-y', '-i', v1, '-i', audio,
  '-filter_complex', '[0:v]subtitles=sub.srt:charenc=UTF-8[v];[1:a]anull[a]',
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
  '-t', '13', out,
], { encoding: 'utf8', cwd: tmp })
console.log('exit:', r.status)
if (r.status !== 0) {
  console.log('--- stderr tail ---')
  console.log(r.stderr.slice(-1200))
} else {
  console.log('OK size:', fs.statSync(out).size)
}