// M2-F 探测 3：Atlas UI —— ForceGraph 渲染 / 增强视图切换 / 空间设置弹层
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const OUT_PNG = require('path').join(__dirname, '_m2f_atlas_flow.png')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.goto(`http://localhost:5173/#/domain-learning/${SPACE}/atlas`)
  await page.waitForTimeout(2200)

  const snapshot = await page.evaluate(() => {
    const q = (s) => document.querySelectorAll(s).length
    const text = (s) => document.querySelector(s)?.textContent?.trim() ?? ''
    return {
      url: location.hash,
      svg: q('svg.force-graph-svg'),
      nodes: q('g.force-node'),
      edges: q('line.force-edge'),
      chips: [...document.querySelectorAll('.view-chip')].map((c) => c.textContent.trim()),
      headerTitle: text('.atlas-title h2'),
      profileKind: text('.profile-tag .el-tag') || null,
    }
  })
  console.log('SNAP:', JSON.stringify(snapshot, null, 2))

  // 切到「流程」增强视图
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll('.view-chip')].find((c) => c.textContent.trim() === '流程')
    if (chip) chip.click()
  })
  await page.waitForTimeout(600)
  const flow = await page.evaluate(() => {
    return {
      stageCount: document.querySelectorAll('.flow-stage').length,
      tip: document.querySelector('.views-tip')?.textContent?.trim() ?? null,
      empty: document.querySelector('.views-empty')?.textContent?.trim() ?? null,
    }
  })
  console.log('FLOW_VIEW:', JSON.stringify(flow, null, 2))
  await page.screenshot({ path: OUT_PNG })

  // 打开「空间设置」弹层（画像 chips + 自动推进开关）
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.atlas-actions button')].find((b) => b.textContent.includes('空间设置'))
    if (btn) btn.click()
  })
  await page.waitForTimeout(700)
  const settings = await page.evaluate(() => {
    const body = document.querySelector('.settings-body')
    return {
      open: !!body,
      emChips: body ? [...body.querySelectorAll('.em-chip')].map((c) => ({ t: c.textContent.trim(), on: c.className.includes('on') })) : [],
      switches: body ? document.querySelectorAll('.set-block .el-switch').length : 0,
    }
  })
  console.log('SETTINGS:', JSON.stringify(settings, null, 2))

  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
