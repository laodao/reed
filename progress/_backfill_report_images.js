// 存量纯文本报告补图：把 workflow-reports 中对应 run 渲染好的 PNG 导入为图片资产
// 命名/子分类与工作流 saveImg 产物一致；sourceType=workflow/sourceRef=原 runId 可跳执行历史；同名跳过防重复
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const WR = 'C:/Users/daoge/the-bot/workflow-reports'
const JOB = { early: [], weekly: [], gossip: [] } // 由盘点动态获取

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  // 1) 全量图片资产 → 已有 runId(sourceRef) 集合（防重复补录：同一 run 只补一张）
  const existingRunIds = new Set()
  {
    let pageNo = 1
    while (true) {
      const r = await page.evaluate(pp => window.electronAPI.assets.list({ category: 'image', page: pp, pageSize: 200 }).then(x => (x.success ? x.data : { error: x.error })), pageNo)
      const items = (r && r.items) || []
      for (const a of items) if (a.sourceRef) existingRunIds.add(a.sourceRef)
      if (!r || !r.items || pageNo * 200 >= (r.total || 0) || items.length === 0) break
      pageNo++
    }
  }
  console.log('已有 image 资产来源 run 数:', existingRunIds.size)

  // 2) 逐子分类盘点缺图文本资产 + 匹配现成 PNG
  const jobs = []
  const pngFiles = fs.readdirSync(WR).filter(f => f.endsWith('.png')).map(f => f.replace(/\.png$/, ''))
  for (const [cat, textSub, imgSub, nameFn] of [
    ['text', '早报', '早报长图', n => n.replace('早报', '早报长图')],
    ['text', '行业周报', '行业周报长图', n => n.replace(/周报/, '周报长图')],
    ['text', '吃瓜报告', '吃瓜长图', n => n.replace('吃瓜报告', '吃瓜长图')],
  ]) {
    let pageNo = 1
    while (true) {
      const r = await page.evaluate(([c, s, p]) => window.electronAPI.assets.list({ category: c, subCategory: s, page: p, pageSize: 200 }).then(x => (x.success ? x.data : { error: x.error })), [cat, textSub, pageNo])
      const items = (r && r.items) || []
      for (const a of items) {
        if (!a.sourceRef) continue
        const rid = a.sourceRef
        if (existingRunIds.has(rid)) continue // 该 run 已补过图
        const pngHit = pngFiles.find(f => f.startsWith(rid + '_'))
        if (!pngHit) continue // 无现成 PNG（该 run 未渲染或渲染失败）
        const imgName = nameFn(a.name)
        jobs.push({ textAssetId: a.id, textName: a.name, runId: rid, imgSub, imgName, pngPath: path.join(WR, pngHit + '.png') })
      }
      if (!r || !r.items || pageNo * 200 >= (r.total || 0) || items.length === 0) break
      pageNo++
    }
  }
  console.log('待补图数量:', jobs.length)
  for (const j of jobs) console.log('  ->', j.textName, '| run', j.runId)

  // 3) 导入（源文件存在性预检）
  let ok = 0, fail = 0, missingFile = 0
  for (const j of jobs) {
    if (!fs.existsSync(j.pngPath)) { console.log('MISSING FILE:', j.pngPath); missingFile++; continue }
    const resp = await page.evaluate(([sub, name, pth, src]) => window.electronAPI.assets.create({
      category: 'image', subCategory: sub, name, tags: ['报告长图'],
      sourceType: 'workflow', sourceRef: src,
      content: { kind: 'file', path: pth },
    }).then(x => x), [j.imgSub, j.imgName, j.pngPath, j.runId])
    if (resp && resp.success) { ok++; console.log('OK:', j.imgName, resp.data && resp.data.id) }
    else { fail++; console.log('FAIL:', j.imgName, '|', resp && resp.error) }
  }
  console.log(`\n完成：新增 ${ok}，失败 ${fail}，源文件缺失 ${missingFile}`)
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
