/* 类型化模板讲义验收（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function clickLeaf(page, name) {
  await page.evaluate((nm) => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes(nm))
    if (l) l.click()
  }, name)
  await wait(1100)
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  await page.reload({ waitUntil: 'load' })
  await wait(4000)

  // 1) MoE（K-concept，works 论文 + related 区）
  await page.evaluate('window.location.hash = "#/domain-learning/llmfrontier"')
  await wait(4000)
  await clickLeaf(page, '混合专家')
  const moe = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    const secTitles = Array.from(document.querySelectorAll('.sec-title')).map(t => t.textContent)
    return JSON.stringify({
      sections: secTitles,
      worksShown: has('相关著作'),
      worksMixtral: has('Mixtral of Experts'),
      relatedShown: has('相关知识点'),
      katex: document.querySelectorAll('.katex').length
    })
  })()`)
  console.log('MOE=' + moe)

  // 2) 贝叶斯定理（K-stmt 数学：公式/证明折叠/works）
  await page.evaluate('window.location.hash = "#/domain-learning/ml"')
  await wait(4000)
  await clickLeaf(page, '贝叶斯定理')
  const bayes = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    const katex = document.querySelectorAll('.katex').length
    const katexDisplay = document.querySelectorAll('.katex-display').length
    const foldHint = Array.from(document.querySelectorAll('.fold-hint')).map(f => f.textContent)
    const secTitles = Array.from(document.querySelectorAll('.sec-title')).map(t => t.textContent)
    return JSON.stringify({ katex, katexDisplay, secTitles, foldHint, worksBayes: has('Thomas Bayes') })
  })()`)
  console.log('BAYES=' + bayes)

  // 3) 反洗钱法（K-stmt 法规：条文折叠 + works 法规/FATF）
  await page.evaluate('window.location.hash = "#/domain-learning/fincompliance"')
  await wait(4000)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('法规依据'))
    if (b) b.click()
  })()`)
  await wait(400)
  await clickLeaf(page, '反洗钱法')
  const law = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    const foldHints = document.querySelectorAll('.fold-hint').length
    const worksKinds = Array.from(document.querySelectorAll('.work-kind')).map(w => w.textContent)
    return JSON.stringify({ worksKinds, worksFatf: has('FATF 四十条建议'), foldHints, detailFolded: has('展开全文') })
  })()`)
  console.log('LAW=' + law)

  // 4) related 区跳转：law 点相关知识点（反洗钱）
  await page.evaluate(`(() => {
    const chips = Array.from(document.querySelectorAll('.related-chip'))
    const c = chips.find(x => x.textContent.includes('反洗钱'))
    if (c) c.click()
  })()`)
  await wait(900)
  const jumped = await page.evaluate(`(() => {
    const h = document.querySelector('.lesson-title h3')
    return h ? h.textContent : ''
  })()`)
  console.log('RELATED_JUMP=' + jumped)

  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
