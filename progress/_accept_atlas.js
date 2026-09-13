/* Atlas 原型验收（临时脚本不入库） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

  // ==== T5 金融合规 ====
  await page.evaluate('window.location.hash = "#/domain-learning/fincompliance/atlas"')
  await wait(5000)
  const t5 = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    const svg = document.querySelector('.graph-svg')
    return JSON.stringify({
      hash: location.hash,
      title: has('金融合规实务') && has('知识体系全景'),
      profile: has('专业实务 · 法规驱动'),
      emphasis: has('法规/监管') && has('操作规范') && has('案例'),
      legend: has('概念') && has('法规/监管'),
      nodes: svg ? svg.querySelectorAll('.graph-node').length : 0,
      tree: has('法规依据') && has('操作要求'),
      hint: has('本领域侧重')
    })
  })()`)
  console.log('T5=' + t5)

  // 点击一个法规节点 → 档案
  await page.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('.graph-node'))
    const t = nodes.find(n => n.textContent.includes('反洗钱法'))
    if (t) { const r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, clientX: r.x + r.width/2, clientY: r.y + r.height/2})); }
  })()`)
  await wait(600)
  // 无 moved → mouseup 触发 select
  await page.evaluate(`(() => {
    document.querySelectorAll('.graph-node')[0] && (() => {
      const el = document.querySelector('.graph-node')
      el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}))
    })()
  })()`)
  await wait(600)
  const t5Profile = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      profileShown: has('定义 / 要点'),
      attrs: has('效力') && has('法律'),
      relations: has('直接关系')
    })
  })()`)
  console.log('T5_PROFILE=' + t5Profile)

  // ==== T7 大模型前沿 ====
  await page.evaluate('window.location.hash = "#/domain-learning/llmfrontier/atlas"')
  await wait(5000)
  const t7 = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    const svg = document.querySelector('.graph-svg')
    return JSON.stringify({
      hash: location.hash,
      profile: has('前沿交叉 · 论文驱动'),
      emphasis: has('论文/文献') && has('基准/评测') && has('争议/开放问题'),
      nodes: svg ? svg.querySelectorAll('.graph-node').length : 0,
      paperNode: has('o1 技术报告') || has('Scaling Laws'),
      tree: has('训练与对齐') && has('评估与开放问题')
    })
  })()`)
  console.log('T7=' + t7)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
