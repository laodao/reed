// 深入测试 image 导出的实际返回值
const WebSocket = require('ws')
const cdpUrl = process.argv[2]
const ws = new WebSocket(cdpUrl)
let msgId = 1
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++
    ws.send(JSON.stringify({ id, method, params }))
    const handler = (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.id === id) { ws.off('message', handler); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result) }
    }
    ws.on('message', handler)
  })
}
async function evalInPage(expr) {
  const result = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails, null, 2))
  return result.result.value
}
ws.on('open', async () => {
  try {
    const spaceId = '5d586839-607f-4d57-b8d5-a0b51b276586'
    const conceptId = '2024d27f-b7c0-4755-badf-7cf6df11622f'

    console.log('=== image 导出完整返回值 ===')
    const imgResult = await evalInPage(`(async () => {
      try {
        const r = await window.electronAPI.domainLearning.exportLesson({ id: '${spaceId}', conceptId: '${conceptId}', format: 'image' })
        // 不 stringify 整个对象（contentBase64 可能很大），只看结构
        const d = r?.data
        return JSON.stringify({
          success: r?.success,
          error: r?.error,
          dataKeys: d ? Object.keys(d) : null,
          format: d?.format,
          filename: d?.filename,
          mime: d?.mime,
          conceptName: d?.conceptName,
          version: d?.version,
          markdownLen: d?.markdown?.length,
          htmlLen: d?.html?.length,
          contentBase64Len: d?.contentBase64?.length,
          contentBase64Preview: d?.contentBase64?.slice(0, 50),
        })
      } catch (e) { return JSON.stringify({ error: e.message, stack: e.stack?.split('\\n').slice(0,5).join(' | ') }) }
    })()`)
    console.log(imgResult)

    // 也测一下 image 用另一个有 v3 版本的概念（可能有更多数据）
    console.log('\n=== image 导出 v3 概念 ===')
    const img2 = await evalInPage(`(async () => {
      try {
        const r = await window.electronAPI.domainLearning.exportLesson({ id: '${spaceId}', conceptId: 'a9539697-e36f-437a-8cd6-df2a246d9afd', format: 'image' })
        const d = r?.data
        return JSON.stringify({ success: r?.success, error: r?.error, format: d?.format, contentBase64Len: d?.contentBase64?.length, htmlLen: d?.html?.length })
      } catch (e) { return JSON.stringify({ error: e.message }) }
    })()`)
    console.log(img2)

    ws.close()
  } catch (e) { console.error('失败:', e.message); ws.close() }
})
ws.on('error', (e) => console.error('WS error:', e.message))