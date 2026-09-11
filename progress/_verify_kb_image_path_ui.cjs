// UI 验证：分片内容里图片引用只显示 dataPath 相对路径（不出现 Temp/盘符绝对路径）
// 运行：node progress/_verify_kb_image_path_ui.cjs
const http = require('http')
const WebSocket = require('ws')

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = ''
      res.on('data', c => (d += c))
      res.on('end', () => resolve(JSON.parse(d)))
    }).on('error', reject)
  })
}
function send(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = raw => {
      const m = JSON.parse(raw.toString())
      if (m.id === id) {
        ws.off('message', onMsg)
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
      }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const targets = await getJson('http://127.0.0.1:9222/json/list')
  const page = targets.find(t => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise(r => ws.on('open', r))
  let id = 0
  const call = (m, p = {}) => send(ws, ++id, m, p)
  await call('Runtime.enable')
  const ev = async expr => {
    const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception?.description))
    return r.result?.value
  }

  await ev(`location.hash = '#/knowledge-base'`)
  await sleep(1500)
  await ev(`document.querySelectorAll('.el-dialog__headerbtn').forEach(b => b.click())`)
  await sleep(600)

  const found = await ev(`(async () => {
    const items = [...document.querySelectorAll('.kb-item')]
    for (let i = 0; i < items.length; i++) {
      items[i].click()
      await new Promise(r => setTimeout(r, 700))
      const rows = [...document.querySelectorAll('.el-table__row')]
      const hit = rows.find(r => r.textContent.includes('深度学习'))
      if (hit) return hit.innerText.split('\\n')[0]
    }
    return null
  })()`)
  console.log('[1] 找到文档行:', found)

  await ev(`(() => {
    const rows = [...document.querySelectorAll('.el-table__row')]
    const hit = rows.find(r => r.textContent.includes('深度学习'))
    const btn = [...hit.querySelectorAll('button')].find(b => b.innerText.trim() === '查看')
    btn.click()
    return true
  })()`)
  await sleep(2500)

  // 找含图片引用的切片：逐页翻找，先看第一页
  const clicked = await ev(`(async () => {
    const dialog = document.querySelector('.el-dialog')
    const list = dialog.querySelector('.chunks-list')
    const btns = [...list.querySelectorAll('button')].filter(b => b.innerText.includes('查看内容'))
    if (!btns.length) return null
    btns[0].click()
    await new Promise(r => setTimeout(r, 1200))
    return btns.length
  })()`)
  await sleep(1200)

  const content = await ev(`(() => {
    const dialogs = [...document.querySelectorAll('.el-dialog')]
    const last = dialogs.find(d => d.innerText.includes('切片内容'))
    return last ? (last.querySelector('.chunk-content-text')?.innerText || '') : ''
  })()`)

  console.log(`[2] 切片按钮数 ${clicked}，切片内容前 200 字：`)
  console.log('   ', String(content).replace(/\s+/g, ' ').slice(0, 200))
  console.log('[3] 断言：')
  console.log('   含 knowledge-base/ 相对路径:', String(content).includes('knowledge-base/'))
  console.log('   含 ![]( 图片引用:', String(content).includes('!['))
  console.log('   含 Temp 临时目录:', /Temp/i.test(String(content)))
  console.log('   含盘符绝对路径:', /[A-Za-z]:[\\/]/.test(String(content)))

  ws.close()
  process.exit(0)
}
main().catch(e => {
  console.error('验证失败:', e.message)
  process.exit(1)
})
