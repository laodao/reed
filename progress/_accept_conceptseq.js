/* 知识点主序列 + 依赖门控验收（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  await page.reload({ waitUntil: 'load' })
  await wait(4000)

  // RAG：点「向量检索」(前置=向量嵌入 learning，未就绪)
  await page.evaluate('window.location.hash = "#/domain-learning/rag"')
  await wait(4000)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('检索链路'))
    if (b) b.click()
  })()`)
  await wait(500)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('向量检索'))
    if (l) l.click()
  })()`)
  await wait(800)
  const ragBlocked = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    const lock = document.querySelectorAll('.lesson-prereq .pending').length
    const dis = document.querySelectorAll('.lesson-feedback button:disabled').length
    return JSON.stringify({
      head: has('向量检索'),
      prereqShown: has('前置'),
      locked: lock,
      disabledBtns: dis,
      tip: has('先掌握带锁的前置')
    })
  })()`)
  console.log('RAG_BLOCKED=' + ragBlocked)

  // 点回「文本切分」(已理解) 再点「向量嵌入」(前置 文本切分 已就绪)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('向量嵌入'))
    if (l) l.click()
  })()`)
  await wait(800)
  const embedOk = await page.evaluate(`(() => {
    const ready = document.querySelectorAll('.lesson-prereq .ready').length
    const dis = document.querySelectorAll('.lesson-feedback button:disabled').length
    return JSON.stringify({ readyChips: ready, disabledBtns: dis, hasEmbed: document.body.innerText.includes('向量嵌入') })
  })()`)
  console.log('RAG_EMBED=' + embedOk)

  // ml：逻辑回归（前置 线性回归 mastered？）看门控
  await page.evaluate('window.location.hash = "#/domain-learning/ml"')
  await wait(4000)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('监督学习'))
    if (b) b.click()
  })()`)
  await wait(500)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('逻辑回归'))
    if (l) l.click()
  })()`)
  await wait(900)
  const mlCheck = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      head: has('逻辑回归'),
      mdBody: has('Sigmoid') || has('交叉熵'),
      prereq: has('前置：'),
      ready: has('线性回归'),
      dis: document.querySelectorAll('.lesson-feedback button:disabled').length
    })
  })()`)
  console.log('ML_LOGIT=' + mlCheck)

  // 继续学习（依赖就绪优先：数学基础 mastered，监督学习 线性回归 todo 前置 向量/梯度 descent mastered → 应跳到 线性回归）
  await page.evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('.space-header button'))
    const b = btns.find(x => x.textContent.includes('继续学习'))
    if (b) b.click()
  })()`)
  await wait(900)
  const next = await page.evaluate(`(() => {
    const h = document.querySelector('.lesson-title h3')
    return h ? h.textContent : ''
  })()`)
  console.log('NEXT_LESSON=' + next)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
