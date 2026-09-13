/* 右栏头部与输入框调整验证（临时脚本） */
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
  // 进 MoE 让中栏有标题栏
  await page.evaluate(`(() => { const l=[...document.querySelectorAll('.tree-leaf')].find(x=>x.textContent.includes('混合专家')); if(l)l.click() })()`)
  await wait(1200)

  const info = await page.evaluate(`(() => {
    const qaHead = document.querySelector('.qa-head')
    const qaTitle = document.querySelector('.qa-title h3')
    const lessonHead = document.querySelector('.lesson-head')
    const ta = document.querySelector('.qa-input .el-textarea__inner')
    const qh = qaHead ? qaHead.getBoundingClientRect() : null
    const lh = lessonHead ? lessonHead.getBoundingClientRect() : null
    return JSON.stringify({
      qaHeadFound: !!qaHead,
      qaTitleText: qaTitle ? qaTitle.textContent : '',
      headYAlign: qh && lh ? Math.abs(qh.top - lh.top) : -1,
      textareaHeight: ta ? Math.round(ta.getBoundingClientRect().height) : 0,
      sendBtn: !!document.querySelector('.qa-send'),
      hasSub: document.body.innerText.includes('不懂就问')
    })
  })()`)
  console.log('QA=' + info)
  const buf = await page.screenshot({ path: 'progress/_qa_head_input.png' })
  console.log('SHOT=' + buf.length)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
