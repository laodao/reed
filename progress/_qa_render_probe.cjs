/**
 * 右栏追问答疑渲染真机探针（CDP）
 * @description 在运行中的应用里检查：assistant 回答是否走 QaAnswerView（渲染 markdown）、
 *              「源码」切换是否真的切到原始 markdown 并能切回。
 *              只读 + 点击切换按钮，不改动任何数据。
 */
const WebSocket = require('ws')

const PORT = process.env.CDP_PORT || 9223

async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  const targets = await res.json()
  const page = targets.find((t) => t.type === 'page' && t.url.includes('domain-learning'))
  if (!page) throw new Error('未找到 domain-learning 页面：' + JSON.stringify(targets.map((t) => t.url)))
  console.log('target:', page.title, page.url)

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

  const PROBE = `(() => {
    const pane = document.querySelector('.pane-qa')
    if (!pane) return { error: '未找到右栏 .pane-qa' }
    const turns = [...pane.querySelectorAll('.qa-turn')]
    const answers = [...pane.querySelectorAll('.qa-answer')]
    return {
      activeTab: pane.querySelector('.head-tab.active')?.textContent.trim() ?? '',
      turns: turns.length,
      assistantTurns: turns.filter((t) => t.classList.contains('assistant')).length,
      answers: answers.length,
      renderedBodies: pane.querySelectorAll('.markdown-body').length,
      srcBlocks: pane.querySelectorAll('.qa-src').length,
      toggleLabels: [...pane.querySelectorAll('.qa-mode-toggle')].map((b) => b.textContent.trim()),
      firstAnswerClass: answers[0]?.className ?? '',
      firstAnswerText: (answers[0]?.textContent ?? '').slice(0, 120),
      firstAnswerHtml: (answers[0]?.innerHTML ?? '').slice(0, 400),
      emptyHint: pane.querySelector('.qa-empty')?.textContent.trim() ?? '',
    }
  })()`

  console.log('\n=== 1. 当前右栏状态 ===')
  const before = await ev(PROBE)
  console.log(JSON.stringify(before, null, 2))

  if (before.answers > 0) {
    console.log('\n=== 2. 点「源码」切换 ===')
    const clicked = await ev(`(() => {
      const b = document.querySelector('.pane-qa .qa-mode-toggle')
      if (!b) return 'no-toggle'
      b.click()
      return b.textContent.trim()
    })()`)
    await new Promise((r) => setTimeout(r, 250))
    const src = await ev(PROBE)
    console.log('点击后按钮:', clicked)
    console.log(JSON.stringify(src, null, 2))
    const rawText = await ev(`(document.querySelector('.pane-qa .qa-src')?.textContent ?? '').slice(0, 200)`)
    console.log('源码态文本片段:\n' + rawText)

    console.log('\n=== 3. 切回渲染 ===')
    await ev(`document.querySelector('.pane-qa .qa-mode-toggle').click()`)
    await new Promise((r) => setTimeout(r, 250))
    const back = await ev(PROBE)
    console.log(JSON.stringify({ renderedBodies: back.renderedBodies, srcBlocks: back.srcBlocks, toggleLabels: back.toggleLabels }, null, 2))
  } else {
    console.log('\n（当前概念无答疑历史，跳过切换验证——空态契约已由单测覆盖）')
  }

  ws.close()
}

main().catch((e) => {
  console.error('探针失败:', e.message)
  process.exit(1)
})
