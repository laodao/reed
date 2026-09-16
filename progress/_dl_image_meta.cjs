/**
 * 只取元信息（不把 base64 拉过 CDP）：确认长图导出在应用里真的产出了 PNG。
 * 用法：node progress/_dl_image_meta.cjs <appPageWsUrl> [spaceId] [conceptId]
 */
const WebSocket = require('ws')
const ws = new WebSocket(process.argv[2])
const SPACE = process.argv[3] || '5d586839-607f-4d57-b8d5-a0b51b276586'
const CONCEPT = process.argv[4] || '2024d27f-b7c0-4755-badf-7cf6df11622f'
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
ws.on('open', async () => {
  try {
    await send('Runtime.enable')
    const r = await send('Runtime.evaluate', {
      expression: `(async () => {
        const r = await window.electronAPI.domainLearning.exportLesson({ id: ${JSON.stringify(SPACE)}, conceptId: ${JSON.stringify(CONCEPT)}, format: 'image' })
        const d = r.data || {}
        return JSON.stringify({
          success: r.success, error: r.error,
          format: d.format, filename: d.filename, mime: d.mime,
          base64Len: (d.contentBase64 || '').length,
          base64Head: (d.contentBase64 || '').slice(0, 12),
          htmlLen: (d.html || '').length,
        })
      })()`,
      awaitPromise: true,
      returnByValue: true,
      timeout: 180000,
    })
    console.log('image 元信息:', r.result.value)
    ws.close()
  } catch (e) { console.error('失败:', e.message); ws.close() }
})
ws.on('error', (e) => console.error('WS error:', e.message))
