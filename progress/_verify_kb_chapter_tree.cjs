// UI 验证：numpy-user.pdf 的章节树在分片对话框中正确渲染（大树只展开一级 + 标题筛选 + 点击筛选分片）
// 运行：node progress/_verify_kb_chapter_tree.cjs
const http = require('http')
const WebSocket = require('ws')

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
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
  const call = (method, params = {}) => send(ws, ++id, method, params)
  await call('Runtime.enable')
  const ev = async expr => {
    const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails))
    return r.result?.value
  }

  console.log('[1] 打开知识库页')
  await ev(`location.hash = '#/knowledge-base'`)
  await sleep(1500)

  console.log('[2] 逐个点开知识库，找含 numpy-user.pdf 的文档列表')
  const found = await ev(`(async () => {
    const items = [...document.querySelectorAll('.kb-item')]
    for (let i = 0; i < items.length; i++) {
      items[i].click()
      await new Promise(r => setTimeout(r, 700))
      const rows = [...document.querySelectorAll('.el-table__row')]
      const hit = rows.find(r => r.textContent.includes('numpy-user.pdf'))
      if (hit) return { kbIndex: i, kbName: items[i].innerText.split('\\n')[0] }
    }
    return null
  })()`)
  console.log('   找到:', JSON.stringify(found))
  if (!found) throw new Error('未找到 numpy-user.pdf 所在知识库')

  console.log('[3] 点击该文档行的「查看」')
  await ev(`(() => {
    const rows = [...document.querySelectorAll('.el-table__row')]
    const hit = rows.find(r => r.textContent.includes('numpy-user.pdf'))
    const btn = [...hit.querySelectorAll('button')].find(b => b.innerText.trim() === '查看')
    btn.click()
    return true
  })()`)
  await sleep(2500)

  const panel = await ev(`(() => {
    const dialog = document.querySelector('.el-dialog')
    const stats = dialog?.querySelector('.chapter-stats')?.innerText.trim() || ''
    return {
      dialogTitle: dialog?.querySelector('.el-dialog__title')?.innerText.trim() || '',
      hasFilterInput: !!dialog?.querySelector('.chapter-filter-input'),
      stats,
      renderedNodes: dialog?.querySelectorAll('.chapter-panel .el-tree-node').length ?? 0,
      visibleNodes: [...(dialog?.querySelectorAll('.chapter-panel .el-tree-node') || [])].filter(n => n.offsetParent !== null).length,
      firstLevelTitles: [...(dialog?.querySelectorAll('.chapter-panel .el-tree > .el-tree-node') || [])].slice(0, 3).map(n => n.innerText.split('\\n')[0]),
      chunkCount: dialog?.querySelector('.chunks-header')?.innerText.trim() || '',
    }
  })()`)
  console.log('   章节面板:', JSON.stringify(panel, null, 1))

  console.log('[4] 输入筛选关键字 F2PY')
  await ev(`(() => {
    const input = document.querySelector('.chapter-filter-input input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, 'F2PY')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(1200)

  const filtered = await ev(`(() => {
    const nodes = [...document.querySelectorAll('.chapter-panel .el-tree-node')].filter(n => n.offsetParent !== null)
    return { visible: nodes.length, sample: nodes.slice(0, 5).map(n => n.innerText.split('\\n')[0]) }
  })()`)
  console.log('   筛选后:', JSON.stringify(filtered, null, 1))

  console.log('[5] 清空筛选并点击一个章节，验证切片按章节过滤')
  await ev(`(() => {
    const input = document.querySelector('.chapter-filter-input input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(800)
  const clicked = await ev(`(() => {
    const node = [...document.querySelectorAll('.chapter-panel .el-tree-node')].find(n => n.offsetParent !== null && n.innerText.includes('Array creation'))
    if (!node) return null
    const title = node.innerText.split('\\n').filter(Boolean).pop()
    node.querySelector('.el-tree-node__content').click()
    return title
  })()`)
  await sleep(2000)
  const afterClick = await ev(`(() => {
    const dialog = document.querySelector('.el-dialog')
    return {
      filterBar: dialog?.querySelector('.chunks-filter-bar')?.innerText.replace(/\\s+/g, ' ').trim() || '',
      chunkCount: dialog?.querySelector('.chunks-header')?.innerText.trim() || '',
      firstChunkTitle: dialog?.querySelector('.chunks-list .chunk-item, .chunks-list .chunk-card')?.innerText.slice(0, 80) || '',
    }
  })()`)
  console.log('   点击章节:', clicked)
  console.log('   切片视图:', JSON.stringify(afterClick, null, 1))

  ws.close()
  process.exit(0)
}
main().catch(e => {
  console.error('验证失败:', e.message)
  process.exit(1)
})
