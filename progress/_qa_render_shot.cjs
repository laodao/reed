/**
 * 右栏答疑面板真机截图（CDP）——用于肉眼核对气泡内渲染排版（无数据改动）
 * 产物：progress/_qa_render_pane.png（渲染态） / progress/_qa_render_pane_src.png（源码态）
 */
const WebSocket = require('ws')
const { writeFileSync } = require('node:fs')

const PORT = process.env.CDP_PORT || 9223

async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  const page = (await res.json()).find((t) => t.type === 'page' && t.url.includes('domain-learning'))
  if (!page) throw new Error('未找到 domain-learning 页面')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 1
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = id++
      ws.send(JSON.stringify({ id: i, method, params }))
      const h = (d) => {
        const m = JSON.parse(d.toString())
        if (m.id === i) {
          ws.off('message', h)
          m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
        }
      }
      ws.on('message', h)
    })
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  await new Promise((r) => ws.on('open', r))

  /** 把答疑列表滚到「最新一条回答」处（回答在下方，滚到底更能看到完整排版） */
  const rect = await ev(`(() => {
    const pane = document.querySelector('.pane-qa')
    const list = pane?.querySelector('.qa-list')
    if (!pane || !list) return null
    list.scrollTop = 0
    const r = pane.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
  })()`)
  if (!rect) throw new Error('未找到 .pane-qa / .qa-list')

  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
    })
    writeFileSync(`progress/${name}`, Buffer.from(data, 'base64'))
    console.log('已保存 progress/' + name)
  }

  await new Promise((r) => setTimeout(r, 300))
  await shot('_qa_render_pane.png')

  await ev(`document.querySelector('.pane-qa .qa-mode-toggle')?.click()`)
  await new Promise((r) => setTimeout(r, 300))
  await shot('_qa_render_pane_src.png')

  await ev(`document.querySelector('.pane-qa .qa-mode-toggle')?.click()`) // 还原渲染态
  ws.close()
}

main().catch((e) => {
  console.error('截图失败:', e.message)
  process.exit(1)
})
