/**
 * 抓取页面历史控制台消息（带时间戳），判断「An object could not be cloned.」发生在何时。
 * 用法：node progress/_dl_export_probe3.cjs <wsUrl>
 */
const WebSocket = require('ws')
const ws = new WebSocket(process.argv[2])
let id = 1
const bags = []
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
ws.on('message', (d) => {
  let m
  try { m = JSON.parse(d.toString()) } catch { return }
  if (m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown' || m.method === 'Log.entryAdded') {
    bags.push(m)
  }
})
function ts(t) {
  return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '?'
}
ws.on('open', async () => {
  await send('Runtime.enable')
  await send('Log.enable')
  await new Promise((r) => setTimeout(r, 1500))
  console.log(`共 ${bags.length} 条（时间升序）：`)
  const rows = bags.map((m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ').split('\n')[0]
      return { t: ts(m.params.timestamp), kind: 'console:' + m.params.type, text: text.slice(0, 160) }
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const e = m.params.exceptionDetails
      return { t: ts(m.params.timestamp), kind: 'exception', text: (e.exception?.description || e.text || '').split('\n')[0].slice(0, 160) }
    }
    return { t: ts(m.params.entry.timestamp), kind: 'log:' + m.params.entry.level, text: String(m.params.entry.text || '').slice(0, 160) }
  }).sort((a, b) => String(a.t).localeCompare(String(b.t)))
  for (const r of rows) console.log(`${r.t} [${r.kind}] ${r.text}`)
  ws.close()
})
ws.on('error', (e) => console.error('WS error:', e.message))
