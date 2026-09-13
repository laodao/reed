// M2-F 探测 8：未解问题自动开子研究 → 轮询至回填/停止
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const QID = 'q_1788878259712_7ddk5v' // 「分母 P(B) 全概率展开」——讲义可离线回答
const CONCEPT = '03f19637-d36a-4f8b-b0ba-c06799acc642'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.waitForLoadState('domcontentloaded')

  const trig = await page.evaluate(async (a) => {
    const dl = window.electronAPI?.domainLearning
    window.__m2fQ = null
    const rows = (await dl.listQuestions(a.spaceId))?.data ?? []
    const q = rows.find((r) => r.id === a.qid)
    const p = dl
      .agentSend({
        mode: 'research',
        spaceId: a.spaceId,
        conceptId: a.concept,
        focusQuestionId: a.qid,
        message: `（M2-F 验收·未解问题开子研究）请研究下面的问题并给出有据答案：${q ? q.question : ''}。答案可引用当前讲义与概念图（已随快照提供）；找到有据答案请调用 dl_answer_question 以 answerSource='ai_verified' 存档，并把可沉淀的支撑写入卡片草稿；确实无据则如实说明并保持问题 open。`,
      })
      .then((r) => (window.__m2fQ = r))
      .catch((e) => (window.__m2fQ = { error: String(e) }))
    return { qtext: q?.question ?? '', triggered: true }
  }, { spaceId: SPACE, qid: QID, concept: CONCEPT })
  console.log('TRIGGER:', JSON.stringify(trig))

  const started = Date.now()
  while (Date.now() - started < 5 * 60 * 1000) {
    const s = await page.evaluate(async (a) => {
      const dl = window.electronAPI?.domainLearning
      const busy = (await dl.agentBusy({ mode: 'research', spaceId: a.spaceId, conceptId: a.concept }))?.data === true
      const row = (await dl.listQuestions(a.spaceId))?.data?.find((r) => r.id === a.qid) ?? null
      return { busy, status: row?.status ?? null, source: row?.answerSource ?? null, hasAnswer: !!row?.answerMd }
    }, { spaceId: SPACE, concept: CONCEPT })
    if (!s.busy) {
      const fin = await page.evaluate(async () => window.__m2fQ ?? null)
      const row = await page.evaluate(
        async (a) => (await window.electronAPI.domainLearning.listQuestions(a.spaceId))?.data?.find((r) => r.id === a.qid) ?? null,
        { spaceId: SPACE },
      )
      console.log(
        'DONE:',
        JSON.stringify({
          ...s,
          waitedSec: Math.round((Date.now() - started) / 1000),
          answerHead: (row?.answerMd ?? '').slice(0, 160),
          result: fin,
        }, null, 2),
      )
      await browser.close()
      return
    }
    await page.waitForTimeout(12000)
  }
  console.log('POLL_TIMEOUT')
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
