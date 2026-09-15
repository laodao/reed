const WebSocket = require('ws')
const ws = new WebSocket('ws://127.0.0.1:9223/devtools/page/FE103A42694A9AF415196122BB28E64E')
let id = 1
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = id++
    ws.send(JSON.stringify({ id: i, method, params }))
    const h = d => {
      const m = JSON.parse(d.toString())
      if (m.id === i) { ws.off('message', h); m.error ? rej(JSON.stringify(m.error)) : res(m.result) }
    }
    ws.on('message', h)
  })
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}
ws.on('open', async () => {
  try {
    // 1. 测试 saveFile dialog
    console.log('=== 1. saveFile dialog ===')
    const r1 = await ev(`(async () => {
      try {
        const r = await window.electronAPI.file.saveFile({ defaultPath: 'test.md', filters: [{ name: 'Markdown', extensions: ['md'] }] })
        return JSON.stringify(r)
      } catch (e) { return JSON.stringify({ error: e.message, stack: e.stack ? e.stack.split('\\n').slice(0, 5).join(' | ') : '' }) }
    })()`)
    console.log('saveFile:', r1)

    // 2. 测试 writeTextFile
    console.log('\\n=== 2. writeTextFile ===')
    const r2 = await ev(`(async () => {
      try {
        const r = await window.electronAPI.file.writeTextFile('C:/Users/daoge/Downloads/dl-export-test.md', '# test export')
        return JSON.stringify(r)
      } catch (e) { return JSON.stringify({ error: e.message }) }
    })()`)
    console.log('writeTextFile:', r2)

    // 3. 测试完整 md 导出 + saveBlobAs
    console.log('\\n=== 3. 完整 md 导出 + saveBlobAs ===')
    const r3 = await ev(`(async () => {
      try {
        const { saveBlobAs } = await import('/src/utils/file-saver.ts')
        const r = await window.electronAPI.domainLearning.exportLesson({
          id: '5d586839-607f-4d57-b8d5-a0b51b276586',
          conceptId: '2024d27f-b7c0-4755-badf-7cf6df11622f',
          format: 'md'
        })
        if (!r || !r.success) return JSON.stringify({ error: 'export failed', detail: r })
        const d = r.data
        await saveBlobAs(d.markdown, { defaultName: d.filename, mimeType: d.mime })
        return JSON.stringify({ ok: true, filename: d.filename, markdownLen: d.markdown.length })
      } catch (e) { return JSON.stringify({ error: e.message, stack: e.stack ? e.stack.split('\\n').slice(0, 8).join(' | ') : '' }) }
    })()`)
    console.log('完整 md:', r3)

    // 4. 测试 pdf 导出 + saveBlobAs
    console.log('\\n=== 4. 完整 pdf 导出 + saveBlobAs ===')
    const r4 = await ev(`(async () => {
      try {
        const { saveBlobAs, base64ToBlob } = await import('/src/utils/file-saver.ts')
        const r = await window.electronAPI.domainLearning.exportLesson({
          id: '5d586839-607f-4d57-b8d5-a0b51b276586',
          conceptId: '2024d27f-b7c0-4755-badf-7cf6df11622f',
          format: 'pdf'
        })
        if (!r || !r.success) return JSON.stringify({ error: 'export failed', detail: r })
        const d = r.data
        if (d.contentBase64) {
          const blob = base64ToBlob(d.contentBase64, d.mime)
          await saveBlobAs(blob, { defaultName: d.filename, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
          return JSON.stringify({ ok: true, filename: d.filename, base64Len: d.contentBase64.length, blobSize: blob.size })
        }
        return JSON.stringify({ format: d.format, noBase64: true, htmlLen: d.html ? d.html.length : 0 })
      } catch (e) { return JSON.stringify({ error: e.message, stack: e.stack ? e.stack.split('\\n').slice(0, 8).join(' | ') : '' }) }
    })()`)
    console.log('完整 pdf:', r4)

    ws.close()
  } catch (e) { console.error('失败:', e.message); ws.close() }
})
ws.on('error', e => console.error('WS:', e.message))