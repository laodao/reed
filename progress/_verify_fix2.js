/* 验证副文案删除与本质区空行（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  await page.reload({ waitUntil: 'load' })
  await wait(4000)
  await page.evaluate('window.location.hash = "#/domain-learning/llmfrontier"')
  await wait(3500)
  await page.evaluate(`(() => { const l=[...document.querySelectorAll('.tree-leaf')].find(x=>x.textContent.includes('混合专家')); if(l)l.click() })()`)
  await wait(1300)

  const info = await page.evaluate(`(() => {
    const noSub = !document.body.innerText.includes('不懂就问')
    const intro = document.querySelector('.sec-intro')
    const headInIntro = intro ? intro.querySelector('.sec-head') : null
    const firstMarkdown = intro ? intro.querySelector('.sec-body .markdown-viewer, .sec-body') : null
    // 测量本质区顶部到首个文字的距离
    const introTop = intro ? intro.getBoundingClientRect().top : 0
    let bodyTop = 0
    if (intro) {
      const p = intro.querySelector('p, .katex, h1, h2, h3, li')
      if (p) bodyTop = p.getBoundingClientRect().top
    }
    return JSON.stringify({
      noSub,
      introHasHead: !!headInIntro,
      gapTopPx: Math.round(bodyTop - introTop)
    })
  })()`)
  console.log('CHECK=' + info)
  const buf = await page.screenshot({ path: 'progress/_qa_fix2.png' })
  console.log('SHOT=' + buf.length)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
