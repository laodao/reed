/**
 * 修复复验 v2：先整页 reload（pinia store 不会随 HMR 重建，必须刷新），再验真实 UI 路径。
 * 用法：node progress/_dl_export_verify2.cjs <wsUrl>
 */
const WebSocket = require('ws')
const ws = new WebSocket(process.argv[2])
let id = 1
const logs = []
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
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ').split('\n')[0]
    if (!/vite|Security Warning|mermaid|DevTools/.test(text)) logs.push(`[${m.params.type}] ${text.slice(0, 220)}`)
  }
})
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) return { __exception: r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails) }
  return r.result.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SPACE = '5d586839-607f-4d57-b8d5-a0b51b276586'
const CONCEPT = '2024d27f-b7c0-4755-badf-7cf6df11622f'

ws.on('open', async () => {
  try {
    await send('Runtime.enable')
    await send('Page.enable')
    console.log('=== 整页 reload（清掉 HMR 残留的旧 store 实例） ===')
    await send('Page.reload', { ignoreCache: true })
    await sleep(6000)

    console.log('页面:', await ev('document.title'), '| hash:', await ev('location.hash'))

    console.log('\n=== 0. store 是否为新代码（守卫生效） ===')
    console.log(await ev(`(async () => {
      const mod = await import('/src/stores/domain-learning.ts')
      const store = mod.useDomainLearningStore()
      const src = await (await fetch('/src/stores/domain-learning.ts')).text()
      return JSON.stringify({ servedHasGuard: src.includes('parseLessonExportFormat'), fnSource: String(store.exportLessonOf).slice(0, 120) })
    })()`))

    console.log('\n=== 1. 选中一个「有讲义」的知识点（保证导出按钮存在） ===')
    console.log(await ev(`(async () => {
      const btn0 = [...document.querySelectorAll('button')].find(b => b.textContent.includes('导出'))
      if (btn0) return '已有导出按钮'
      // 从空间视图找有讲义的概念名，再在结构树里点它
      const api = window.electronAPI.domainLearning
      const v = await api.getSpaceView(${JSON.stringify(SPACE)})
      const withCard = (v.data.concepts || []).filter(c => c.hasCard || (c.card && c.card.id))
      const names = withCard.slice(0, 5).map(c => c.name)
      for (const c of withCard) {
        const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === c.name)
        if (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); return '已点击概念：' + c.name }
      }
      return JSON.stringify({ triedNames: names, clicked: null })
    })()`))
    await sleep(1500)
    console.log('导出按钮存在:', await ev(`!![...document.querySelectorAll('button')].find(b => b.textContent.includes('导出'))`))
    console.log('当前概念:', await ev(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('导出'))
      if (!btn) return null
      let inst = btn.__vueParentComponent
      while (inst) { if (inst.setupState && inst.setupState.currentConcept) { const c = inst.setupState.currentConcept; const cv = c.__v_isRef ? c.value : c; return cv ? cv.name : null } inst = inst.parent }
      return null
    })()`))

    console.log('\n=== 2. 真点「导出 → Markdown」：捕获 store 出站参数 ===')
    console.log(await ev(`(async () => {
      const mod = await import('/src/stores/domain-learning.ts')
      const store = mod.useDomainLearningStore()
      window.__orig = store.exportLessonOf
      window.__cap = null
      store.exportLessonOf = function (input) {
        let clone = 'OK'
        try { structuredClone(input) } catch (e) { clone = 'FAIL: ' + e.message }
        window.__cap = { spaceId: input.spaceId, conceptId: input.conceptId, format: input.format, cardId: input.cardId, cardIdType: typeof input.cardId, clone }
        return Promise.resolve(null)
      }
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('导出'))
      if (!btn) return '无导出按钮'
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return 'trigger clicked'
    })()`))
    await sleep(700)
    console.log('菜单:', await ev(`JSON.stringify([...document.querySelectorAll('.el-dropdown-menu__item')].map(i => i.textContent.trim()))`))
    await ev(`(() => {
      const item = [...document.querySelectorAll('.el-dropdown-menu__item')].find(i => i.textContent.includes('Markdown'))
      if (item) item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return !!item
    })()`)
    await sleep(700)
    console.log('捕获:', await ev(`JSON.stringify(window.__cap)`))
    await ev(`(async () => { const m = await import('/src/stores/domain-learning.ts'); m.useDomainLearningStore().exportLessonOf = window.__orig; return 'restored' })()`)

    console.log('\n=== 3. 老故障载荷（组件实例当 cardId）走 store + 真 IPC ===')
    console.log(await ev(`(async () => {
      const mod = await import('/src/stores/domain-learning.ts')
      const store = mod.useDomainLearningStore()
      const inst = { uid: 42, type: { name: 'ElDropdownItem' }, render: () => null }; inst.parent = inst
      const r = await store.exportLessonOf({ spaceId: ${JSON.stringify(SPACE)}, conceptId: ${JSON.stringify(CONCEPT)}, format: 'md', cardId: inst })
      return JSON.stringify({ got: !!r, filename: r && r.filename, format: r && r.format, mdLen: r && r.markdown && r.markdown.length, error: store.error })
    })()`))

    console.log('\n=== 4. 三种格式直连 IPC（含指定版本） ===')
    for (const fmt of ['md', 'pdf', 'image']) {
      console.log(fmt, await ev(`(async () => {
        const r = await window.electronAPI.domainLearning.exportLesson({ id: ${JSON.stringify(SPACE)}, conceptId: ${JSON.stringify(CONCEPT)}, format: '${fmt}' })
        const d = r.data || {}
        return JSON.stringify({ ok: r.success, error: r.error, format: d.format, mdLen: d.markdown && d.markdown.length, b64Len: d.contentBase64 && d.contentBase64.length })
      })()`))
    }

    console.log('\n=== 5. 本次会话新产生的控制台消息 ===')
    for (const l of logs) console.log(l)
    if (!logs.length) console.log('（无）')

    ws.close()
  } catch (e) { console.error('复验失败:', e.message); ws.close() }
})
ws.on('error', (e) => console.error('WS error:', e.message))
