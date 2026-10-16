/**
 * 重启后真机验收：在**运行中的应用**里导出含 mermaid 的讲义（PDF/长图），把产物落盘。
 * 用法：node progress/_dl_export_accept.cjs <appPageWsUrl> [spaceId] [conceptId]
 */
const WebSocket = require('ws')
const fs = require('fs')
const path = require('path')

const APP_WS = process.argv[2]
const SPACE = process.argv[3] || '5d586839-607f-4d57-b8d5-a0b51b276586'
const CONCEPT = process.argv[4] || '2024d27f-b7c0-4755-badf-7cf6df11622f'

const ws = new WebSocket(APP_WS)
let id = 1
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = id++
    ws.send(JSON.stringify({ id: i, method, params }))
    const h = (d) => {
      const m = JSON.parse(d.toString())
      if (m.id === i) { ws.off('message', h); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) }
    }
    ws.on('message', h)
  })
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 180000 })
  if (r.exceptionDetails) return { __exception: r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails) }
  return r.result.value
}

ws.on('open', async () => {
  try {
    await send('Runtime.enable')
    console.log('页面:', await ev('document.title'))

    for (const [fmt, file] of [['md', '_accept_lesson.md'], ['pdf', '_accept_lesson.pdf'], ['image', '_accept_lesson.png']]) {
      const out = await ev(`(async () => {
        const r = await window.electronAPI.domainLearning.exportLesson({ id: ${JSON.stringify(SPACE)}, conceptId: ${JSON.stringify(CONCEPT)}, format: '${fmt}' })
        if (!r || !r.success) return { ok: false, error: r && r.error }
        const d = r.data
        return { ok: true, format: d.format, filename: d.filename, markdown: d.markdown || null, b64: d.contentBase64 || null }
      })()`)
      if (out && out.ok) {
        const target = path.join(__dirname, file)
        if (out.markdown) fs.writeFileSync(target, out.markdown, 'utf-8')
        else if (out.b64) fs.writeFileSync(target, Buffer.from(out.b64, 'base64'))
        console.log(`[${fmt}] ok → ${file}（实际格式 ${out.format}，${out.markdown ? out.markdown.length + ' 字符' : Math.round((out.b64 || '').length * 0.75) + ' 字节'}）`)
      } else {
        console.log(`[${fmt}] 失败:`, JSON.stringify(out))
      }
    }
    ws.close()
  } catch (e) { console.error('验收失败:', e.message); ws.close() }
})
ws.on('error', (e) => console.error('WS error:', e.message))
