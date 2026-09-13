/* 领域学习原型 v2 验收（时序修正版，临时脚本不入库） */
const { chromium } = require('playwright-core')

const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

  // 0. 先回首页清状态，等就绪
  await page.evaluate('window.location.hash = "#/home"')
  await wait(2000)

  // 1. 主题列表页
  await page.evaluate('window.location.hash = "#/domain-learning"')
  await wait(4000)
  const listCheck = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    const cards = Array.from(document.querySelectorAll('.topic-card'))
    return JSON.stringify({
      hash: location.hash,
      title: has('领域共学空间'),
      ragCard: has('检索增强生成（RAG）入门'),
      diffusionCard: has('扩散模型'),
      newCard: has('新建学习主题'),
      cardCount: cards.length
    })
  })()`)
  console.log('LIST=' + listCheck)

  // 2. 点 RAG 卡进入空间
  await page.evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.topic-card'))
    const rag = cards.find(c => c.textContent.includes('检索增强生成'))
    if (rag) rag.click()
  })()`)
  await wait(4000)
  const spaceCheck = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      hash: location.hash,
      backBtn: has('主题列表'),
      spaceTitle: has('检索增强生成（RAG）入门'),
      lesson: has('一张图看懂 RAG'),
      qa: has('为什么按段落切分'),
      mermaid: document.querySelectorAll('.lesson-body svg').length
    })
  })()`)
  console.log('SPACE=' + spaceCheck)

  // 3. 知识全景弹层
  await page.evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('.space-header button'))
    const g = btns.find(b => b.textContent.includes('知识全景'))
    if (g) g.click()
  })()`)
  await wait(4000)
  const graphCheck = await page.evaluate(`(() => {
    const dlg = document.querySelector('.el-dialog')
    const svg = dlg ? dlg.querySelectorAll('svg').length : 0
    return JSON.stringify({
      dialogOpen: !!dlg,
      dialogTitle: dlg ? (dlg.querySelector('.el-dialog__title') || {}).textContent || '' : '',
      svgCount: svg,
      nodeText: dlg ? dlg.textContent.includes('向量检索·Vector Search') : false,
      edgeText: dlg ? dlg.textContent.includes('前置依赖') : false
    })
  })()`)
  console.log('GRAPH=' + graphCheck)

  // 4. 关闭弹层 → 返回列表 → 进扩散模型
  await page.evaluate(`(() => {
    const closeBtn = Array.from(document.querySelectorAll('.el-dialog button')).find(b => b.textContent.trim() === '关闭')
    if (closeBtn) closeBtn.click()
  })()`)
  await wait(800)
  await page.evaluate(`(() => {
    const back = Array.from(document.querySelectorAll('.space-header button')).find(b => b.textContent.includes('主题列表'))
    if (back) back.click()
  })()`)
  await wait(3000)
  await page.evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.topic-card'))
    const dm = cards.find(c => c.textContent.includes('扩散模型'))
    if (dm) dm.click()
  })()`)
  await wait(4000)
  const dmCheck = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      hash: location.hash,
      dmTitle: has('扩散模型（图像生成）原理'),
      dmLesson: has('扩散模型在做什么'),
      dmMap: has('核心思想') && has('网络结构')
    })
  })()`)
  console.log('DM=' + dmCheck)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
