// CDP 帮助：连接 9222 取第一个页面；evaluate 一律用字符串表达式形式
const { chromium } = require('playwright-core')

async function connect() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().startsWith('http://localhost:5173')) || ctx.pages()[0]
  await page.waitForLoadState('domcontentloaded')
  return { browser, page }
}

// 字符串表达式 evaluate：把表达式与 JSON 参数拼接后求值
function evalExpr(page, expr, arg) {
  return page.evaluate(`(${expr})(${JSON.stringify(arg)})`)
}

module.exports = { connect, evalExpr }
