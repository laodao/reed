/* 诊断列表页渲染（临时脚本） */
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const msgs = []
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') msgs.push(m.type() + ' ' + m.text().slice(0, 300)) })
  page.on('pageerror', e => msgs.push('PAGEERROR ' + e.message))

  await page.evaluate('window.location.hash = "#/domain-learning"')
  await new Promise(r => setTimeout(r, 4000))

  const info = await page.evaluate(`(() => {
    const app = document.querySelector('#app')
    return JSON.stringify({
      hash: location.hash,
      appHtmlHead: (app ? app.innerHTML : '').slice(0, 600),
      bodyText: (document.body.innerText || '').slice(0, 300),
      hasHome: !!document.querySelector('.domain-learning-home')
    })
  })()`)
  console.log('INFO=' + info)
  console.log('MSGS=' + JSON.stringify(msgs))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
