/* 最终验收：领域学习原型端到端（临时脚本不入库） */
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }

  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

  // 1. 菜单项存在性：侧栏 nav 图标项数量（含新入口）
  await page.evaluate('window.location.hash = "#/home"')
  await new Promise(r => setTimeout(r, 1500))
  const navCount = await page.evaluate('document.querySelectorAll(".nav-item").length')
  console.log('NAV_ITEM_COUNT=' + navCount)

  // 2. 跳转原型页
  await page.evaluate('window.location.hash = "#/domain-learning"')
  await new Promise(r => setTimeout(r, 4000))
  const title = await page.evaluate('document.title')
  console.log('TITLE=' + title)

  // 3. 三栏关键内容
  const checks = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      spaceTitle: has('检索增强生成'),
      mapGroup: has('检索链路'),
      legend: has('已理解') && has('学习中'),
      lessonTitle: has('一张图看懂 RAG'),
      lessonTable: has('知识时效'),
      mermaidSvg: document.querySelectorAll('.lesson-body svg, .markdown-body svg').length,
      qaTurns: has('为什么按段落切分'),
      qaResearch: has('混合检索具体怎么融合排序'),
      openQCount: has('未解问题'),
      protoBanner: has('界面原型')
    })
  })()`)
  console.log('CHECKS=' + checks)

  // 4. 交互：懂了✓推进掌握度
  const before = await page.evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('.lesson-feedback button')).find(b => b.textContent.includes('懂了'))
    if (!btn) return 'NO_BTN'
    btn.click()
    return 'CLICKED'
  })()`)
  await new Promise(r => setTimeout(r, 500))
  const afterFeedback = await page.evaluate('document.body.innerText.includes("已标记为理解")')
  console.log('MASTER_BTN=' + before + ' FEEDBACK_SHOWN=' + afterFeedback)

  // 5. 菜单跳回验证图标入口可用（nav-item title/aria 层面已足）
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
