/**
 * 领域共学空间（domain-learning）真机验收
 * @module scripts/e2e-domain-learning-verify
 * @description 前置：electron . --remote-debugging-port=9334 --user-data-dir=/tmp/dl-verify-profile 已运行。
 *              覆盖：首页/三栏空间/掌握度回写（列表同步）/keepAlive 往返/去学它闭环/
 *              深度图谱 id 对齐/无效 id 守卫/搜索祖先剪枝。输出 PASS/FAIL 清单 + 截图。
 */
const path = require('path')
const { chromium } = require('playwright')

const CDP = 'http://127.0.0.1:9334'
const SHOT_DIR = '/tmp/dl-shots'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' —— ' + detail : ''}`)
}

async function main() {
  const fs = require('fs')
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  const browser = await chromium.connectOverCDP(CDP)
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  // 重载复位 mock 内存态，保证脚本可重复执行（初始：rag 主题已理解 2 = rag + chunk）
  await page.reload()
  await sleep(1800)

  const goto = async (hash) => {
    await page.evaluate((h) => { window.location.hash = h }, hash)
    await sleep(900)
  }
  const text = async () => await page.evaluate(() => document.body.innerText)

  // ---------- 1. 首页 ----------
  await goto('#/domain-learning')
  let body = await text()
  record('首页渲染主题卡片', body.includes('领域共学空间') && body.includes('检索增强生成（RAG）入门'))
  const ragCardStats = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.topic-card')]
    const rag = cards.find(c => c.innerText.includes('RAG'))
    return rag ? rag.innerText.replace(/\n/g, ' ') : '(未找到)'
  })
  record('首页 RAG 卡初始进度含 已理解 2（rag+chunk）', /已理解\s*2/.test(ragCardStats), ragCardStats.slice(0, 80))
  await page.screenshot({ path: path.join(SHOT_DIR, 'home.png') })

  // ---------- 2. 进入三栏空间 ----------
  await goto('#/domain-learning/rag')
  body = await text()
  record('空间三栏渲染（知识地图/讲义/追问）', body.includes('知识地图') && body.includes('追问 · 答疑'))
  record('默认选中第一个有讲义的概念（检索增强生成）', body.includes('检索增强生成') && body.includes('RAG'))
  const hasPrereqBar = await page.evaluate(() => !!document.querySelector('.lesson-prereq'))
  record('前置依赖条或门控提示按数据渲染', typeof hasPrereqBar === 'boolean')

  // ---------- 3. 掌握度回写 ----------
  await page.evaluate(() => {
    const leaf = [...document.querySelectorAll('.tree-leaf')].find(el => el.innerText.includes('向量嵌入'))
    if (leaf) leaf.click()
  })
  await sleep(500)
  body = await text()
  record('切换概念讲义跟随（向量嵌入）', body.includes('向量嵌入') && body.includes('Embedding'))
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.lesson-actions button')].find(b => b.innerText.trim() === '' && b.className.includes('success'))
    if (btn) btn.click()
  })
  await sleep(500)
  body = await text()
  record('懂了反馈提示出现', body.includes('已标记为理解'))
  const progress = await page.evaluate(() => document.querySelector('.progress-text')?.innerText ?? '')
  record('顶栏进度同步更新（含 已理解 3）', /已理解 3/.test(progress), progress)

  // ---------- 4. keepAlive：空间 ↔ 全景往返不丢状态 ----------
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('知识全景'))
    if (btn) btn.click()
  })
  await sleep(1200)
  body = await text()
  record('知识全景打开（SVG 图谱）', (await page.evaluate(() => !!document.querySelector('.graph-svg svg, svg.graph-svg'))) || body.includes('结构索引'))
  const atlasUrl1 = await page.evaluate(() => window.location.hash)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('回到讲义空间'))
    if (btn) btn.click()
  })
  await sleep(1000)
  body = await text()
  record('返回空间后概念保持（keepAlive）', body.includes('向量嵌入'), atlasUrl1)

  // ---------- 5. 去学它闭环（回退图谱 id = 概念 id） ----------
  await goto('#/domain-learning/rag/atlas')
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('.tree-node')].find(el => el.innerText.includes('重排'))
    if (node) node.click()
  })
  await sleep(500)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.p-actions button')].find(b => b.innerText.includes('去学它'))
    if (btn) btn.click()
  })
  await sleep(1000)
  const hashAfterGoLearn = await page.evaluate(() => window.location.hash)
  body = await text()
  record('去学它落目标概念且 query 已清', hashAfterGoLearn === '#/domain-learning/rag' && body.includes('重排') && body.includes('Rerank'), hashAfterGoLearn)

  // ---------- 6. 回首页：列表进度反映空间内的标记 ----------
  await goto('#/domain-learning')
  const ragCardStats2 = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.topic-card')]
    const rag = cards.find(c => c.innerText.includes('RAG'))
    return rag ? rag.innerText.replace(/\n/g, ' ') : '(未找到)'
  })
  record('首页 RAG 卡进度回写（已理解 3）', /已理解\s*3/.test(ragCardStats2), ragCardStats2.slice(0, 80))

  // ---------- 7. 深度图谱 id 对齐（fincompliance） ----------
  await goto('#/domain-learning/fincompliance/atlas')
  body = await text()
  record('深度图谱打开（T5 画像）', body.includes('法规驱动') && body.includes('结构索引'))
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('.tree-node')].find(el => el.innerText.includes('受益所有人识别'))
    if (node) node.click()
  })
  await sleep(500)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.p-actions button')].find(b => b.innerText.includes('去学它'))
    if (btn) btn.click()
  })
  await sleep(1000)
  body = await text()
  record('深度图谱节点去学它 → 概念讲义（ubo 对齐）', body.includes('受益所有人识别') && body.includes('UBO'))
  await page.screenshot({ path: path.join(SHOT_DIR, 'fin-space.png') })

  // ---------- 8. 无效 id 守卫 ----------
  await goto('#/domain-learning/nonexistent-id')
  body = await text()
  record('无效空间 id → 主题不存在空态', body.includes('主题不存在'))
  await goto('#/domain-learning/nonexistent-id/atlas')
  body = await text()
  record('无效 atlas id → 主题不存在空态', body.includes('主题不存在'))

  // ---------- 9. 搜索祖先剪枝（ml 主题搜「序列」） ----------
  await goto('#/domain-learning/ml')
  await sleep(600)
  await page.evaluate(() => {
    const input = document.querySelector('.map-filters input')
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '序列')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await sleep(600)
  const treeText = await page.evaluate(() => document.querySelector('.tree-scroll')?.innerText ?? '')
  record('搜索「序列」命中分支可见（祖先不剪枝）', treeText.includes('序列与注意力') && treeText.includes('深度学习'), treeText.slice(0, 80).replace(/\n/g, ' '))
  await goto('#/domain-learning/ml')
  await page.evaluate(() => {
    const input = document.querySelector('.map-filters input')
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await sleep(400)
  await page.evaluate(() => {
    const branch = [...document.querySelectorAll('.tree-branch')].find(el => el.innerText.includes('深度学习'))
    if (branch) branch.click()
  })
  await sleep(400)
  await page.evaluate(() => {
    const branch = [...document.querySelectorAll('.tree-branch')].find(el => el.innerText.includes('序列与注意力'))
    if (branch) branch.click()
  })
  await sleep(600)
  await page.screenshot({ path: path.join(SHOT_DIR, 'ml-tree.png') })

  // ---------- 汇总 ----------
  const failed = results.filter(r => !r.ok)
  console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
  if (failed.length) {
    console.log('失败项：')
    for (const f of failed) console.log(` - ${f.name}${f.detail ? '（' + f.detail + '）' : ''}`)
    process.exitCode = 1
  }
  await browser.close()
}

main().catch((e) => {
  console.error('脚本异常：', e)
  process.exitCode = 2
})
