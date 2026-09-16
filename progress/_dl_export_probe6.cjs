/**
 * 根因确认 v2：捕获真实 UI 点击经过 store 出站口的参数，并核对组件持有的 store 是否同一实例。
 * 用法：node progress/_dl_export_probe6.cjs <wsUrl>
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
    logs.push(`[${m.params.type}] ${text.slice(0, 200)}`)
  }
})
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) return { __exception: r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails) }
  return r.result.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

ws.on('open', async () => {
  try {
    await send('Runtime.enable')

    console.log('=== 1. 组件持有的 store 是否同一实例 + 装探针 ===')
    console.log(await ev(`(async () => {
      const mod = await import('/src/stores/domain-learning.ts')
      const myStore = mod.useDomainLearningStore()
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('导出'))
      let inst = btn.__vueParentComponent
      let comp = null
      while (inst) {
        if (inst.setupState && Object.keys(inst.setupState).includes('handleExportLesson')) { comp = inst; break }
        inst = inst.parent
      }
      if (!comp) return '未找到组件'
      const compStore = comp.setupState.store
      const record = { sameStore: compStore === myStore, compStoreType: typeof compStore }
      window.__origExport2 = (compStore || myStore).exportLessonOf
      window.__probe2 = null
      const spy = function (input) {
        const rec = {}
        for (const k of ['spaceId', 'conceptId', 'format', 'cardId']) {
          const v = input ? input[k] : undefined
          rec[k + 'Type'] = typeof v
          rec[k + 'Ctor'] = (v && typeof v === 'object') ? (v.constructor && v.constructor.name) : null
          rec[k + 'Keys'] = (v && typeof v === 'object') ? Object.keys(v).slice(0, 8).join(',') : String(v)
        }
        try { structuredClone(input); rec.clone = 'OK' } catch (e) { rec.clone = 'FAIL: ' + e.message }
        window.__probe2 = rec
        return null
      }
      ;(compStore || myStore).exportLessonOf = spy
      if (compStore && compStore !== myStore) myStore.exportLessonOf = spy
      record.spyOnCompStore = !!compStore && compStore.exportLessonOf === spy
      record.spyOnMyStore = myStore.exportLessonOf === spy
      return JSON.stringify(record)
    })()`))

    console.log('\n=== 2. 真点「导出 → Markdown」 ===')
    console.log(await ev(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('导出'))
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return 'trigger clicked'
    })()`))
    await sleep(700)
    console.log('菜单项可见性:', await ev(`JSON.stringify([...document.querySelectorAll('.el-dropdown-menu__item')].map(i => ({ t: i.textContent.trim(), visible: !!(i.offsetParent) })))`))
    console.log(await ev(`(() => {
      const item = [...document.querySelectorAll('.el-dropdown-menu__item')].find(i => i.textContent.includes('Markdown'))
      if (!item) return 'no item'
      item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return 'item clicked'
    })()`))
    await sleep(700)

    console.log('\n=== 3. 捕获的出站参数 ===')
    console.log(await ev(`JSON.stringify(window.__probe2, null, 1)`))
    console.log('\n=== 4. 期间控制台日志 ===')
    for (const l of logs) console.log(l)
    if (!logs.length) console.log('（无）')

    console.log('\n=== 5. 还原 ===')
    console.log(await ev(`(async () => {
      const mod = await import('/src/stores/domain-learning.ts')
      const s = mod.useDomainLearningStore()
      s.exportLessonOf = window.__origExport2
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('导出'))
      let inst = btn.__vueParentComponent
      while (inst) {
        if (inst.setupState && inst.setupState.store && inst.setupState.store !== s) inst.setupState.store.exportLessonOf = window.__origExport2
        inst = inst.parent
      }
      return 'restored'
    })()`))

    ws.close()
  } catch (e) { console.error('探针失败:', e.message); ws.close() }
})
ws.on('error', (e) => console.error('WS error:', e.message))
