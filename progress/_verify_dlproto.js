/* 原型验证：领域学习页是否注册路由、可导航、三栏渲染（临时脚本不入库） */
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) {
    console.log('NO_PAGE')
    return
  }
  // 1. 收集路由表 + 菜单项
  const routeInfo = await page.evaluate('JSON.stringify(Array.from(document.querySelectorAll(".nav-item")).map(n => n.textContent.trim()).filter(Boolean).slice(0, 30))')
  console.log('NAV_ITEMS=' + routeInfo)

  // 2. 直接导航到 /domain-learning
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()) })

  await page.evaluate('window.location.hash = "#/domain-learning"')
  await new Promise(r => setTimeout(r, 3500))

  const title = await page.evaluate('document.title')
  const bodyLen = await page.evaluate('document.body.innerText.length')
  console.log('TITLE=' + title)
  console.log('BODY_LEN=' + bodyLen)

  // 3. 检查三栏关键元素
  const checks = await page.evaluate(`(() => {
    const t = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      hasSpaceTitle: t('检索增强生成'),
      hasMapGroup: t('基础概念') || t('检索链路') || t('生成与评估'),
      hasLesson: t('为什么不能整篇喂进去') || t('Vector Search') || t('向量嵌入'),
      hasQa: t('为什么按段落切分') || t('追问') ,
      hasMasteredDot: !!document.querySelector('.dot-mastered'),
      hasLearningDot: !!document.querySelector('.dot-learning')
    })
  })()`)
  console.log('CHECKS=' + checks)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}

main().catch(e => { console.error('FAIL', e); process.exit(1) })
