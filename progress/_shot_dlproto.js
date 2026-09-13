/* 原型页面截图（临时脚本不入库） */
const { chromium } = require('playwright-core')
const fs = require('fs')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  await page.evaluate('window.location.hash = "#/domain-learning"')
  await new Promise(r => setTimeout(r, 3000))
  // 截图整页
  const buf = await page.screenshot({ path: 'progress/_dlproto_1.png' })
  console.log('SHOT1 bytes=' + buf.length)
  // 检查 mermaid 是否渲染（选择器含 svg）
  const mermaidSvg = await page.evaluate(`(() => {
    const svgs = document.querySelectorAll('.markdown-body svg, .lesson-body svg')
    return JSON.stringify({ svgCount: svgs.length, hasMermaidText: document.body.innerText.includes('向量库') })
  })()`)
  console.log('MERMAID=' + mermaidSvg)
  // 检查点击交互：点"向量检索"概念 → 讲义切换（当前 lesson 无讲义 → empty）
  const click1 = await page.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('.map-node'))
    const target = nodes.find(n => n.textContent.includes('向量检索'))
    if (!target) return 'NOT_FOUND'
    target.click()
    return 'CLICKED'
  })()`)
  console.log('CLICK=' + click1)
  await new Promise(r => setTimeout(r, 800))
  const after = await page.evaluate('document.body.innerText.includes("讲义生成中")')
  console.log('EMPTY_LESSON_SHOWN=' + after)
  const buf2 = await page.screenshot({ path: 'progress/_dlproto_2.png' })
  console.log('SHOT2 bytes=' + buf2.length)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
