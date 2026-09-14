/* 深度检查讲义区渲染状态（临时脚本） */
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  await page.evaluate('window.location.hash = "#/domain-learning"')
  await new Promise(r => setTimeout(r, 4000))

  const info = await page.evaluate(`(() => {
    const q = (s) => document.querySelector(s)
    const txt = (el) => el ? (el.innerText || '').slice(0, 400) : ''
    return JSON.stringify({
      bytemdExists: !!q('.markdown-viewer .bytemd'),
      lessonHead: txt(document.querySelector('.lesson-title h3')),
      lessonBodyHead: txt(document.querySelector('.lesson-body')),
      bodyLen: (document.body.innerText || '').length,
      mermaidPre: (() => {
        const pres = Array.from(document.querySelectorAll('.lesson-body pre'))
        return pres.map(p => (p.innerText||'').slice(0,40))
      })(),
      svgCount: document.querySelectorAll('.lesson-body svg').length
    })
  })()`)
  console.log('INFO=' + info)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
