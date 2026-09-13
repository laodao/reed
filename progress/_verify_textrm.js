/* 验证两行文字删除（临时脚本） */
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
  const info = await page.evaluate(`(() => {
    const t = document.body.innerText
    return JSON.stringify({
      noGoal: !t.includes('跟进大模型研究前沿：从规模定律到推理扩展'),
      noFeedbackHint: !t.includes('这个知识点看懂了吗'),
      hasButtons: t.includes('懂了') && t.includes('没懂，拆细一点'),
      hasTitle: t.includes('大模型前沿')
    })
  })()`)
  console.log('CHECK=' + info)
  const buf = await page.screenshot({ path: 'progress/_text_removed.png' })
  console.log('SHOT=' + buf.length)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
