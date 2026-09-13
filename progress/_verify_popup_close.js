// 验证 v2：右上角通知弹窗点击后自动消失（真实鼠标点击弹窗中心）
// 用真实 V2 运行触发的「待审核」duration=0 弹窗：点击 → 弹窗关闭 + 跳转运行详情
const { chromium } = require('playwright-core')
const RUN_ID = process.argv[2]
const fs = require('fs')
const LOG = 'C:/Users/daoge/code/project/the-bot/progress/_verify_popup_close.log'
function log(msg) {
  const line = '[' + new Date().toLocaleTimeString() + '] ' + msg
  console.log(line)
  fs.appendFileSync(LOG, line + '\n', 'utf-8')
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const ev = (expr) => page.evaluate(expr)

  let popupFound = null
  const t0 = Date.now()
  while (Date.now() - t0 < 180000) {
    const probe = await ev(`(() => {
      const els = Array.from(document.querySelectorAll('.el-notification'))
      return els.map(el => {
        const r = el.getBoundingClientRect()
        return {
          title: (el.querySelector('.el-notification__title') || {}).textContent || '',
          count: els.length,
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
        }
      })
    })()`)
    const pending = (probe || []).find(x => String(x.title).includes('待审核'))
    if (pending) { popupFound = pending; break }
    await new Promise(r => setTimeout(r, 2000))
  }
  if (!popupFound) {
    log('✗ 未等到「待审核」弹窗')
    await browser.close()
    process.exit(1)
  }
  log(`✓ 弹窗已出现 count=${popupFound.count} title=${popupFound.title} 中心=(${popupFound.x},${popupFound.y})`)

  const before = await ev(`document.querySelectorAll('.el-notification').length`)
  await page.mouse.click(popupFound.x, popupFound.y)
  await new Promise(r => setTimeout(r, 1000))
  const remain = await ev(`document.querySelectorAll('.el-notification').length`)
  const path = await ev(`location.pathname`)
  const text = await ev(`document.body.innerText.slice(0, 300).replace(/\\n/g, ' ')`)
  log(`点击前弹窗 ${before} → 1s 后剩余 ${remain}；路径 ${path}`)
  const disappeared = remain < before
  const navigated = path.includes('/workflow/run/')
  log((disappeared ? '✓ 点击后弹窗自动消失' : '✗ 弹窗未消失') + ' | ' + (navigated ? '✓ 已跳转运行详情' : '✗ 未跳转，当前 path=' + path))
  log('页面文本片段: ' + text)

  const c = await ev(`window.electronAPI.workflow.cancelRun(${JSON.stringify(RUN_ID)}).then(x => ({ success: x.success, error: x.error }))`)
  log('取消运行: ' + JSON.stringify(c))
  await browser.close()
  process.exit(disappeared ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
