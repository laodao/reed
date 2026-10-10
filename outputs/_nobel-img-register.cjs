/** 三张配图登记入系统资产表（asset:create, kind=file） */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const M = 'C:/Users/daoge/code/project/the-bot/materials/image'
const IMGS = [
  { path: `${M}/gen-opto-cover.jpg`, name: '光遗传学封面：蓝光激活通道视紫红质（AI生成）', desc: '长文配图 IMG-01。AI 生成（Seedream-4.5），非实拍；蓝光激活 ChR2、离子流入、电脉冲沿轴突传导示意。', tags: ['光遗传学', '封面', 'AI生成'] },
  { path: `${M}/draw-opto-timeline.png`, name: '光遗传学 35 年时间线（自绘）', desc: '长文配图 IMG-02。1991 衣藻感光电流 → 2026 诺奖七节点；来源 OpenAlex/官方公告，非比例时间轴；draw_kit 自绘。', tags: ['光遗传学', '时间线', '自绘'] },
  { path: `${M}/draw-opto-clinical.png`, name: '光遗传视网膜临床入组规模（自绘）', desc: '长文配图 IMG-03。五项试验入组/预计入组对比；来源 ClinicalTrials.gov 与公司披露；监管受理不等同疗效确认。', tags: ['光遗传学', '临床数据', '自绘'] },
]
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('renderer'))
  for (const im of IMGS) {
    const r = await page.evaluate(async (p) => window.electronAPI.assets.create({
      category: 'image', name: p.name, description: p.desc, tags: p.tags,
      content: { kind: 'file', path: p.path },
    }), im)
    assert(r?.success !== false, `登记失败 ${im.name}: ${JSON.stringify(r).slice(0, 150)}`)
    console.log('✅ 已入系统资产:', r.data?.id ?? '(ok)', im.name)
  }
})().catch(e => { console.error('❌', e.message); process.exit(1) })
