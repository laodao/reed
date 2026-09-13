// M5 走查:①Home 新建对话框「关联知识库」下拉;②新主题空态卡/生成入口;③触发生成后观察(如实记录,不强行断言产出)
const { chromium } = require('playwright-core')

async function waitCdp(timeoutMs = 90000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
      await b.close()
      return
    } catch {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  throw new Error('CDP 9222 未就绪')
}

async function main() {
  await waitCdp()
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]

  // ① Home 新建对话框 KB 下拉
  await page.goto('http://localhost:5173/#/domain-learning')
  await page.waitForTimeout(2200)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('新建学习主题'))
    btn?.click()
  })
  await page.waitForTimeout(900)
  const dialog = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.el-dialog .el-form-item__label')].map((l) => l.textContent.trim())
    const kbSel = [...document.querySelectorAll('.el-dialog .el-select')].find((s) => {
      const wrap = s.closest('.el-form-item')
      return wrap?.querySelector('.el-form-item__label')?.textContent?.includes('关联知识库')
    })
    return { labels, kbSelect: !!kbSel }
  })
  // 打开 KB 下拉看选项
  const kbOpts = await page.evaluate(() => {
    const item = [...document.querySelectorAll('.el-dialog .el-form-item')].find((w) => w.querySelector('.el-form-item__label')?.textContent?.includes('关联知识库'))
    const sel = item?.querySelector('.el-select')
    if (!sel) return { opened: false }
    ;(/** @type {HTMLElement} */ (sel)).click()
    return { opened: true }
  })
  await page.waitForTimeout(600)
  const kbList = await page.evaluate(() => [...document.querySelectorAll('.el-select-dropdown__item, .el-select-dropdown .el-option')].map((o) => o.textContent.trim()).slice(0, 12))
  // 关闭弹层与对话框
  await page.evaluate(() => document.body.click())
  await page.waitForTimeout(250)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.el-dialog button')]
    const cancel = btns.find((b) => b.textContent.trim() === '取消')
    cancel?.click()
  })
  await page.waitForTimeout(400)
  console.log(JSON.stringify({ step1: { dialog, kbOpts, kbList } }, null, 2))

  // ② 直接经 API 建新主题(绑定第一个 KB 库 id;验证后端 createSpace kbId 链路),再进 Space 页读空态卡
  const boot = await page.evaluate(async () => {
    const dl = window.electronAPI?.domainLearning
    const kbApi = window.electronAPI?.knowledgeBase
    const kbs = kbApi ? await kbApi.list() : null
    const kb = (kbs?.data ?? [])[0]
    const name = '走查起步主题'
    const r = await dl.createSpace({ name, goal: '入门', tagline: 'M5 空主题启动走查(走查后归档)', kbId: kb?.id ?? null })
    const id = r?.success ? r.data?.id : null
    return { created: !!id, id, boundKb: kb?.name ?? null }
  })
  await page.waitForTimeout(400)
  if (boot.id) {
    await page.goto(`http://localhost:5173/#/domain-learning/${boot.id}`)
    await page.waitForTimeout(2600)
  }
  const space = await page.evaluate(() => {
    const bootCard = document.querySelector('.boot-card')
    const empty = document.querySelector('.pane-lesson .el-empty')
    const tree = document.querySelector('.tree-branch, .tree-leaf')
    return {
      bootCard: !!bootCard,
      bootTitle: bootCard?.querySelector('h3')?.textContent?.trim() ?? '',
      bootTip: !!bootCard?.querySelector('.boot-tip'),
      bootBtn: [...(bootCard?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim()),
      emptyText: empty?.textContent?.trim() ?? '',
      treeRows: !!tree,
    }
  })
  console.log(JSON.stringify({ step2: { boot, space } }, null, 2))

  // ③ 触发生成首批知识并观察(等待会话推进后读最终态;无论产出与否如实记录)
  let clicked = false
  if (space.bootCard) {
    clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.boot-card button')].find((b) => b.textContent.includes('生成首批知识'))
      btn?.click()
      return !!btn
    })
  }
  await page.waitForTimeout(1500)
  const mid = await page.evaluate(() => ({
    loadingBtn: [...document.querySelectorAll('.boot-card button')].map((b) => b.textContent.trim()),
    msg: document.querySelector('.boot-message')?.textContent?.trim() ?? '',
    concepts: document.querySelectorAll('.tree-leaf').length,
  }))
  await page.waitForTimeout(120000)
  const fin = await page.evaluate(() => ({
    loadingBtn: [...document.querySelectorAll('.boot-card button')].map((b) => b.textContent.trim()),
    msg: document.querySelector('.boot-message')?.textContent?.trim() ?? '',
    bootCardStill: !!document.querySelector('.boot-card'),
    treeLeaves: document.querySelectorAll('.tree-leaf').length,
    groups: document.querySelectorAll('.tree-branch').length,
    lesson: !!document.querySelector('.lesson-body .block-body-pad, .lesson-body .empty-body'),
    lessonText: document.querySelector('.pane-lesson')?.textContent?.slice(0, 80) ?? '',
  }))
  console.log(JSON.stringify({ step3: { clicked, mid, fin, spaceId: boot.id } }, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
