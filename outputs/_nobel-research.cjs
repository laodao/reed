/**
 * 驱动内置应用「主题深度研究」(builtin_app_topic_research) 实机跑 2026 诺贝尔生理学或医学奖
 * 前置：dev 实例 9222；运行：node outputs/_nobel-research.cjs
 * 流程：create→start→(clarify 表单挂起→approve+editedValues)→多轮研究→(final1 审核→approve)→报告卡落盘
 */
const fs = require('fs')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

const APP_ID = 'builtin_app_topic_research'
const RESEARCHER = { providerConfigId: 'pc_muuwsf3q_kzesid6qr', modelId: 'qwen3.8-max' }       // 阿里百炼 qwen3.8-max
const EVALUATOR = { providerConfigId: 'pc_mmyd3u5b_hkf5odex3', modelId: 'deepseek-v4-pro' }    // DeepSeek 独立评审
const OUT_MD = 'outputs/诺贝尔生理学或医学奖研究报告-2026-10-09.md'

const START_INPUTS = {
  topic: '2026年诺贝尔生理学或医学奖（光遗传学）：获奖成果、发现历程、原理、应用与争议',
  purpose: 'article-writing',
  focus: ['背景与来龙去脉', '关键人物与组织', '运作机制与手法', '关键数据与规模', '时间线与关键事件', '各方说法与争议', '影响与后续'],
  depth: 'deep',
  maxRounds: 6,
  outputSpecs: ['timeline', 'key-data', 'actors', 'cases', 'quotes', 'matrix', 'counterpoint', 'cited-links'],
  outputRequirements: [
    '- 用途=写深度长文的素材库：优先可入文的具体事实、案例经过、直接引语（中英文报道都要）',
    '- 必须覆盖：三位获奖人（Karl Deisseroth / Peter Hegemann / Georg Nagel）各自贡献与分工；光遗传学原理（微生物视蛋白→ChR1/ChR2→神经元光控）；2005 年前后的关键技术突破与关键论文；应用版图（神经环路研究、视网膜疾病临床试验、帕金森、精神医学）与产业转化；争议线（专利与优先权纠纷、华人科学家潘卓华的落选争议、Ernst Bamberg 未获奖的讨论、此前多年诺贝尔奖预测榜）；技术从发现到获奖的时间跨度与诺贝尔奖「延迟认可」现象',
    '- 中国视角：中国媒体报道角度、国内光遗传学研究团队与进展要有',
    '- 数据带口径：临床试验期数与人数、论文引用量级、产业金额、获奖时间线等',
    '- 时效：今天 2026-10-09，公告 2026-10-05，收集获奖后反应（获奖人访谈、学界评论、颁奖仪式安排）',
  ].join('\n'),
  referenceSample: [
    '〔仅对标结构与密度，不作事实来源、不照抄结论〕目标报告形态：',
    '1 执行摘要（核心发现编号+总体可信度）；2 来龙去脉（背景叙述）；3 完整时间线表格（日期|事件|数据|来源层级）；',
    '4 人物与组织名录表（角色|贡献|现状|来源层级）；5 运作机制拆解（条目式带来源标注）；6 关键数据表（指标|数据|口径|来源层级）；',
    '7 各方说法与争议对照；8 案例与细节素材库（编号案例+直接引语+出处层级）；9 局限与待核验（缺口逐项）；',
    '10 参考来源（官方机构/官方媒体/互联网媒体/互联网搜索分层，带链接与采集时间）。',
    '密度标准：每节都有具体时间/人名/数字/引语，无空泛概括；来源四级标注逐条落实。',
  ].join('\n'),
  researcherModel: RESEARCHER,
  evaluatorModel: EVALUATOR,
}

const CLARIFY = {
  goal: '为撰写一篇深度长文收集素材：向大众读者讲清楚 2026 年诺贝尔生理学或医学奖——光遗传学是什么、谁做的、怎么发现的、有什么用、为什么等了这么多年、有什么争议',
  audience: '写作者本人用作文章素材库；最终读者是公众号深度读者（非专业背景，但理解力强）',
  angle: '以本年度获奖成果「光遗传学」为核心：发现历程（谁在何时做了什么）→ 原理（为什么光能控制神经元）→ 应用与临床转化 → 奖项背后的竞争、争议与「延迟认可」',
  mustCover: '三位获奖人背景与分工；微生物视蛋白到 ChR1/ChR2 的发现链；2005 年技术突破与关键论文；临床应用进展（视网膜疾病/帕金森/精神疾病）与产业转化；争议（专利与优先权纠纷、潘卓华落选争议、Bamberg 未获奖、多年预测落空史）；从发现到获奖的时间跨度；中国研究现状',
  scope: '聚焦 2026 年奖项本身；技术史回溯至 1970 年代微生物视蛋白研究；临床与产业进展覆盖至 2026 年 10 月',
  context: '运行时间 2026-10-09，获奖公告 2026-10-05，注意时效；奖项正式名称是「诺贝尔生理学或医学奖」，不存在「诺贝尔生物学奖」，报告中应说明这一点',
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  const created = await page.evaluate(async (appId) => {
    const r = await window.electronAPI.appSession.create({ appId })
    return r.success ? r.data.id : { error: r.error }
  }, APP_ID)
  assert(typeof created === 'string', `建会话失败: ${JSON.stringify(created)}`)
  log(`会话 ${created}`)

  const started = await page.evaluate(async (args) => {
    const r = await window.electronAPI.appSession.start({ sessionId: args.sid, inputs: args.inputs })
    return r.success !== false ? { ok: true } : { error: r.error }
  }, { sid: created, inputs: START_INPUTS })
  assert(started.ok, `启动失败 ${started.error}`)
  log('运行已启动，等待 clarify 表单…')

  const acted = new Set()
  let reportMd = null
  let reportTitle = ''
  const t0 = Date.now()
  const seenNodes = new Set()

  while (Date.now() - t0 < 150 * 60 * 1000) {
    await sleep(5000)
    const cards = await page.evaluate(async (sid) => {
      const m = await window.electronAPI.appSession.messages(sid)
      return (m.data ?? []).filter(x => x.metadata?.sessionCard).map(x => ({ id: x.id, ...x.metadata.sessionCard }))
    }, created)

    for (const c of cards) {
      if (c.card === 'nodeStatus' && !seenNodes.has(`${c.nodeId}:${c.status}`)) {
        seenNodes.add(`${c.nodeId}:${c.status}`)
        log(`节点 ${c.nodeId} → ${c.status}`)
      }
      if (c.card === 'review' && !acted.has(c.id)) {
        acted.add(c.id)
        if (c.kind === 'form') {
          log(`表单卡 ${c.nodeId}，提交澄清契约`)
          const r = await page.evaluate(async (a) => window.electronAPI.appSession.review({ sessionId: a.sid, nodeId: a.nodeId, decision: 'approve', editedValues: a.values }),
            { sid: created, nodeId: c.nodeId, values: CLARIFY })
          log(`表单提交 ${r.success !== false ? '成功' : '失败: ' + r.error}`)
        } else if (c.kind === 'choose' || c.kind === 'input' || c.kind === 'approve') {
          log(`审核卡 ${c.nodeId}（kind=${c.kind}），approve`)
          const r = await page.evaluate(async (a) => window.electronAPI.appSession.review({ sessionId: a.sid, nodeId: a.nodeId, decision: 'approve' }),
            { sid: created, nodeId: c.nodeId })
          log(`审核 ${r.success !== false ? '成功' : '失败: ' + r.error}`)
        }
      }
      if (c.card === 'report') { reportMd = String(c.markdown ?? ''); reportTitle = String(c.title ?? '') }
      if (c.card === 'message' && /运行(failed|timed_out|cancelled|interrupted)/.test(String(c.content ?? ''))) {
        throw new Error('运行失败: ' + c.content)
      }
    }
    if (reportMd) break
  }
  assert(reportMd, '150 分钟内未拿到报告卡')

  fs.writeFileSync(OUT_MD, reportMd, 'utf-8')
  log(`✅ 报告已落盘 ${OUT_MD}（${reportMd.length} 字符，标题: ${reportTitle}）`)
  fs.writeFileSync('outputs/_nobel-research-session.txt', created, 'utf-8')
})().catch(e => { console.error('❌', e.message); process.exit(1) })
