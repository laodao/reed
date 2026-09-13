// M2-F 探测 4：触发无卡概念自动研究（fire-and-forget，结果存 window.__m2fR 供轮询）
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.waitForLoadState('domcontentloaded')

  const out = await page.evaluate(async (spaceId) => {
    const dl = window.electronAPI?.domainLearning
    const v = (await dl.getSpaceView(spaceId))?.data
    const concept = v?.concepts?.find((c) => c.nodeType !== 'group' && !c.hasCard) ?? null
    if (!concept) return { triggered: false, reason: '无无卡概念' }
    const start = Date.now()
    window.__m2fStart = start
    window.__m2fR = null
    const p = dl
      .agentSend({
        mode: 'research',
        spaceId,
        conceptId: concept.id,
        message: `（M2-F 验收·自动研究）请研究概念「${concept.name}」并产出讲义草稿。采集纪律：资料不足先用 learning-source-collector 规划；知识库(wf_kb_retrieve)/网页正文(wf_web_extract)/http_get(含 arXiv export.arxiv.org)取真实资料；dl_save_card 的 evidenceSources 至少一条、必须真实有出处，先验内容标 needs_verification；完成后用一段话总结。`,
      })
      .then((r) => {
        window.__m2fR = r
        return r
      })
      .catch((e) => {
        window.__m2fR = { error: String(e) }
      })
    return { triggered: true, conceptId: concept.id, conceptName: concept.name, started: Date.now() }
  }, SPACE)

  console.log('TRIGGER:', JSON.stringify(out))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
