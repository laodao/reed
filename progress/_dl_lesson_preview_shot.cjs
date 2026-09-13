#!/usr/bin/env node
/**
 * 讲义排版截图（临时诊断脚本）：把 progress/_dl_lesson_preview.html 截图成 png，
 * 供人工/视觉核对（章节层级、表格边框、段落首行缩进、列表缩进、公式渲染、注记面板、
 * 自测答案默认折叠）。
 *
 * 用法：node progress/_dl_lesson_preview_shot.cjs [html] [png]
 */
'use strict'

const path = require('node:path')
const { chromium } = require('playwright')

async function main() {
  const html = process.argv[2] || path.join(process.cwd(), 'progress', '_dl_lesson_preview.html')
  const png = process.argv[3] || path.join(process.cwd(), 'progress', '_dl_lesson_preview.png')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1020, height: 1400 }, deviceScaleFactor: 1.5 })
  await page.goto('file:///' + html.replace(/\\/g, '/'))
  await page.waitForTimeout(600)

  const katexCount = await page.locator('.katex').count()
  const tableCount = await page.locator('.markdown-body table').count()
  /** 取首个匹配元素的计算样式（无匹配返回 null，夹具可能没有表格/列表） */
  const styleOf = async (selector, prop) => {
    const loc = page.locator(selector).first()
    if ((await loc.count()) === 0) return null
    return loc.evaluate((el, p) => getComputedStyle(el)[p], prop)
  }
  const indent = await styleOf('.markdown-body p', 'textIndent')
  const listPad = await styleOf('.markdown-body ol', 'paddingLeft')
  const cellBorder =
    (await styleOf('.markdown-body td', 'borderTopWidth')) === null
      ? null
      : `${await styleOf('.markdown-body td', 'borderTopWidth')} ${await styleOf('.markdown-body td', 'borderTopStyle')}`

  const headActions = await page.locator('.sec-head .sec-actions').count()

  // 自测答案折叠（2026-09-12 用户需求：默认折叠）：预览页用原生 <details> 等价呈现
  const answerPanels = await page.locator('.selfcheck-answers').count()
  const answersState =
    answerPanels === 0
      ? null
      : await page.locator('.selfcheck-answers details').first().evaluate((el) => {
          const body = el.querySelector('.answers-body')
          const rect = body ? body.getBoundingClientRect() : null
          return { open: el.open, bodyHeight: rect ? Math.round(rect.height) : null }
        })

  // 区级动作几何检查（用户反馈「展开全文 与 这块没懂 重叠」）：
  // 对每个标题行，测量两个动作的矩形是否相交；同时确认没有被容器右边界裁掉。
  const overlapReport = await page.$$eval('.sec-head', (heads) =>
    heads.map((head) => {
      const confuse = head.querySelector('.sec-confuse')
      const fold = head.querySelector('.fold-hint')
      const r1 = confuse ? confuse.getBoundingClientRect() : null
      const r2 = fold ? fold.getBoundingClientRect() : null
      const intersect =
        r1 && r2 ? !(r1.right <= r2.left || r2.right <= r1.left || r1.bottom <= r2.top || r2.bottom <= r1.top) : false
      const headRect = head.getBoundingClientRect()
      return {
        title: head.querySelector('.sec-title')?.textContent ?? '(无标题)',
        hasConfuse: !!confuse,
        hasFold: !!fold,
        intersect,
        confuseRightGap: r1 ? Math.round(headRect.right - r1.right) : null,
        insideHead: r1 ? r1.right <= headRect.right + 1 : null,
      }
    }),
  )

  await page.screenshot({ path: png, fullPage: true })
  await browser.close()
  console.log(
    JSON.stringify(
      { png, katexCount, tableCount, indent, listPad, cellBorder, headActions, answerPanels, answersState, overlapReport },
      null,
      1,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
