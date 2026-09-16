/**
 * 右栏答疑气泡排版真机探针（CDP，只读）：核对紧凑排版真的生效、且没有横向溢出把气泡撑破。
 */
const WebSocket = require('ws')

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

  const out = await ev(`(() => {
    const answers = [...document.querySelectorAll('.pane-qa .qa-answer')]
    if (!answers.length) return { error: '右栏没有回答' }
    const report = answers.map((a, i) => {
      const bubble = a.closest('.qa-bubble')
      const body = a.querySelector('.markdown-body')
      if (!body) return { i, mode: a.className, note: '非渲染态（源码/空）' }
      const cs = getComputedStyle(body)
      const p = body.querySelector('p')
      const h = body.querySelector('h1,h2,h3')
      return {
        i,
        mode: a.className,
        bubbleW: bubble.clientWidth,
        bubbleScrollW: bubble.scrollWidth,
        bodyScrollW: body.scrollWidth,
        bodyClientW: body.clientWidth,
        bodyFontSize: cs.fontSize,
        bodyLineHeight: cs.lineHeight,
        pTextIndent: p ? getComputedStyle(p).textIndent : null,
        pMarginBottom: p ? getComputedStyle(p).marginBottom : null,
        headingFontSize: h ? getComputedStyle(h).fontSize : null,
        // 横向溢出元素（自身可滚的表/代码块不算问题，只要不超出气泡宽度）
        overflowing: [...body.querySelectorAll('*')]
          .filter((e) => e.scrollWidth > e.clientWidth + 2)
          .map((e) => e.tagName + (e.className ? '.' + String(e.className).split(' ')[0] : ''))
          .slice(0, 4),
      }
    })
    return { count: answers.length, report }
  })()`)

  console.log(JSON.stringify(out, null, 2))
  ws.close()
}

main().catch((e) => {
  console.error('探针失败:', e.message)
  process.exit(1)
})
