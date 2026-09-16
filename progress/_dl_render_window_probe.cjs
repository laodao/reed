/**
 * 抓「应用自己的隐藏渲染窗口」：一边触发导出，一边轮询 CDP 目标列表，
 * 一旦渲染窗口出现就接上去看 mermaid 状态与控制台报错。
 *
 * 用法：node progress/_dl_render_window_probe.cjs <appPageWsUrl> [spaceId] [conceptId]
 */
const WebSocket = require('ws')

const APP_WS = process.argv[2]
const SPACE = process.argv[3] || '5d586839-607f-4d57-b8d5-a0b51b276586'
const CONCEPT = process.argv[4] || '2024d27f-b7c0-4755-badf-7cf6df11622f'
const LIST_URL = 'http://127.0.0.1:9223/json/list'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function makeClient(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 1
  const events = []
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = id++
      ws.send(JSON.stringify({ id: i, method, params }))
      const h = (d) => {
        const m = JSON.parse(d.toString())
        if (m.id === i) { ws.off('message', h); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) }
      }
      ws.on('message', h)
    })
  ws.on('message', (d) => {
    let m
    try { m = JSON.parse(d.toString()) } catch { return }
    if (m.method === 'Runtime.consoleAPICalled') {
      events.push(`[${m.params.type}] ` + (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 300))
    } else if (m.method === 'Runtime.exceptionThrown') {
      events.push('[exception] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 300))
    }
  })
  const ready = new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  return { ws, send, events, ready }
}

async function main() {
  // 1. 触发导出（不 await 完成，边跑边抓）
  const app = makeClient(APP_WS)
  await app.ready
  await app.send('Runtime.enable')
  console.log('=== 触发应用内导出（image，长图走同一渲染窗口） ===')
  const exportPromise = app.send('Runtime.evaluate', {
    expression: `window.electronAPI.domainLearning.exportLesson({ id: ${JSON.stringify(SPACE)}, conceptId: ${JSON.stringify(CONCEPT)}, format: 'image' }).then(r => r.success ? 'ok:' + (r.data.contentBase64 || '').length : 'err:' + r.error)`,
    awaitPromise: true,
    returnByValue: true,
    timeout: 120000,
  })

  // 2. 轮询目标列表，抓隐藏渲染窗口
  let attached = null
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline && !attached) {
    let list
    try {
      list = await (await fetch(LIST_URL)).json()
    } catch (e) { await sleep(150); continue }
    const others = list.filter((t) => t.webSocketDebuggerUrl !== APP_WS && t.type === 'page')
    if (others.length) {
      console.log('发现新目标:', others.map((t) => `${t.title} | ${t.url.slice(0, 80)}`).join(' ;; '))
      const c = makeClient(others[0].webSocketDebuggerUrl)
      try {
        await c.ready
        await c.send('Runtime.enable')
        await sleep(300)
        const state = await c.send('Runtime.evaluate', {
          expression: `({
            url: location.href.slice(0, 60),
            mermaidGlobal: typeof window.mermaid,
            containers: document.querySelectorAll('.mermaid').length,
            svgs: document.querySelectorAll('.mermaid svg').length,
            done: window.__docRenderDone,
            scripts: document.querySelectorAll('script').length,
            textStart: (document.querySelector('.mermaid') || {}).textContent ? document.querySelector('.mermaid').textContent.slice(0, 100) : null
          })`,
          returnByValue: true,
        })
        console.log('渲染窗口状态:', JSON.stringify(state.result.value))
        attached = c
      } catch (e) {
        console.log('接入渲染窗口失败:', e.message)
      }
    }
    await sleep(120)
  }

  if (attached) {
    await sleep(1500)
    const later = await attached.send('Runtime.evaluate', {
      expression: `({ svgs: document.querySelectorAll('.mermaid svg').length, done: window.__docRenderDone })`,
      returnByValue: true,
    }).catch((e) => ({ error: e.message }))
    console.log('稍后状态:', JSON.stringify(later.result ? later.result.value : later))
    console.log('渲染窗口控制台:')
    for (const e of attached.events) console.log('  ' + e)
    if (!attached.events.length) console.log('  （无）')
  } else {
    console.log('未抓到隐藏渲染窗口（可能已完成或未创建）')
  }

  const exportResult = await exportPromise.catch((e) => ({ error: e.message }))
  console.log('\n导出结果:', JSON.stringify(exportResult.result ? exportResult.result.value : exportResult))
  app.ws.close()
  if (attached) attached.ws.close()
  process.exit(0)
}

main().catch((e) => { console.error('探针失败:', e.message); process.exit(1) })
