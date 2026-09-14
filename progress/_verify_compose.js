const { spawnSync } = require('child_process')
const fs = require('fs')

const bin = 'C:/Users/daoge/code/project/the-bot/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'
const tmp = 'C:/Users/daoge/the-bot/videos/_verify_subs'
const v1 = 'C:/Users/daoge/the-bot/videos/2026/09/06/video_1788674010178.mp4'
const v2 = 'C:/Users/daoge/the-bot/videos/2026/09/06/video_1788674307071.mp4'
const v3 = 'C:/Users/daoge/the-bot/videos/2026/09/06/video_1788674538637.mp4'
const audio = 'C:/Users/daoge/the-bot/voice/tts/b6f9d7a9-ea22-4649-be55-9be1a44f2f9a.wav'

const concatList = tmp + '/list.txt'
fs.writeFileSync(concatList, [v1, v2, v3].map(f => "file '" + f.replace(/\\/g, '/') + "'").join('\n') + '\n', 'utf8')

const r1 = spawnSync(bin, ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', tmp + '/concat.mp4'], { encoding: 'utf8' })
console.log('concat exit:', r1.status)
if (r1.status !== 0) console.log(r1.stderr.slice(-600))

const r2 = spawnSync(bin, [
  '-y', '-i', tmp + '/concat.mp4', '-i', audio,
  '-filter_complex', '[0:v]subtitles=sub.srt:charenc=UTF-8[v];[1:a]anull[a]',
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
  '-t', '38', tmp + '/final.mp4',
], { encoding: 'utf8', cwd: tmp })
console.log('final exit:', r2.status)
if (r2.status !== 0) console.log(r2.stderr.slice(-900))
else console.log('OK final size:', fs.statSync(tmp + '/final.mp4').size)