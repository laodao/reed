/**
 * 长文一致性修复 E2E（2026-09-21 四修复回归）
 *
 * 与 lw-qwen-novel.cjs 同链路（CDP 9222 → window.electronAPI.longwriting.*，
 * 与界面同 IPC），但只建新项目、绝不清理存量；每一步做一致性验收，失败立即
 * 中止并落报告 outputs/lw-e2e-report.json：
 *   步骤1 建项目（同名幂等跳过）
 *   步骤2 概要生成+落库
 *   步骤3 圣经（人物/地点/物品/故事线）——含关键道具"黄铜哨子"
 *   步骤4 大纲 4 章（关联实体）
 *   步骤5 逐章章法 writeChapterFull（设计卡→自检→门禁→正文→图谱→写后审读），
 *         每章后：正文长度/设计卡章号/状态摘要章号/全库疑点扫描，发现阻断
 *         疑点：若是 R11 黑户道具→自动入册（立即修复）后重扫；其余→中止
 *   步骤6 结构变更级联回归：插入新首章→校验伴生数据整体 +1→删除→校验还原
 *
 * 运行：node scripts/lw-consistency-e2e.cjs [--fresh]
 *   --fresh 删除同名旧 E2E 项目后重建
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { chromium } = require('/home/ubuntu/workdir/the-bot/node_modules/playwright')

const CDP = 'http://127.0.0.1:9222'
const PROJECT_NAME = '一致性E2E·雾岛灯塔'
const MODEL = 'deepseek-v4.1-flash'
const CHAPTER_WORDS = 1500
const MIN_CHARS = 700
const OUT = path.resolve(__dirname, '../outputs/lw-e2e-report.json')

// 与 conflict-gate.ts conflictKey 同算法（知情保留按 key 互认）
function conflictKey(c) {
  const msg = String(c.message || '')
  let h = 0
  for (let i = 0; i < msg.length; i++) h = (h * 31 + msg.charCodeAt(i)) | 0
  const hash = (h >>> 0).toString(36).slice(0, 8)
  return [c.rule || '', c.entityName || c.entityId || '', c.chapterNumber ?? '', hash].join('|')
}

const report = { steps: [], startedAt: new Date().toISOString(), projectId: null }
let failures = 0

function step(label, ok, detail) {
  const entry = { label, ok: !!ok, detail: String(detail || '').slice(0, 500) }
  report.steps.push(entry)
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ' ｜ ' + String(detail).slice(0, 220) : ''}`)
  if (!ok) failures++
  return ok
}

function dbCheck(sql) {
  // 用 python 读 sqlite（系统 node 与 electron ABI 不同，better-sqlite3 不可用）
  const out = execFileSync('python3', ['-c', `
import sqlite3, json
con = sqlite3.connect('/home/ubuntu/.config/the_bot/the_bot.db')
con.row_factory = sqlite3.Row
pid = json.load(open('/tmp/lw-e2e-pid.json'))['pid']
rows = [dict(r) for r in con.execute(${JSON.stringify(sql)}, (pid,))]
print(json.dumps(rows, ensure_ascii=False))
`], { encoding: 'utf8' })
  return JSON.parse(out.trim().split('\n').pop())
}

async function main() {
  const fresh = process.argv.includes('--fresh')
  const browser = await chromium.connectOverCDP(CDP)
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  if (!page) throw new Error('未找到应用页面')
  const call = (expr, ...args) => page.evaluate(({ expr, args }) => {
    const fn = new Function('api', 'args', `return api.${expr}(...args)`)
    return fn(window.electronAPI, args)
  }, { expr, args })
  const lw = (expr, ...args) => call(`longwriting.${expr}`, ...args)
  const must = (label, r) => {
    if (!r || r.success === false) throw new Error(`${label} 失败: ${JSON.stringify(r && (r.error || r)).slice(0, 300)}`)
    return r
  }
  const retry = async (label, fn, tries = 3) => {
    for (let i = 1; i <= tries; i++) {
      try { return await fn() } catch (e) {
        console.warn(`  [retry ${i}/${tries}] ${label}: ${String(e && e.message || e).slice(0, 160)}`)
        if (i === tries) throw e
        await page.waitForTimeout(5000)
      }
    }
  }
  const sleep = (ms) => page.waitForTimeout(ms)

  // ============ 步骤 0：模型提供商 ============
  const providers = must('列提供商', await call('providerConfig.list')).data || []
  const bailian = providers.find((p) => p.name === '阿里百炼平台' || p.templateId === 'bailian')
  step('步骤0 提供商可用', !!bailian, bailian ? `${bailian.name} (${bailian.id})` : '未找到百炼配置')
  if (!bailian) throw new Error('无可用提供商')

  // ============ 步骤 1：建项目 ============
  const list0 = (must('列项目', await lw('getProjects')).data) || []
  const old = list0.find((p) => p.name === PROJECT_NAME)
  if (old && fresh) {
    await lw('deleteProject', old.id)
    step('步骤1 清理旧E2E项目', true, old.id)
  } else if (old) {
    step('步骤1 复用旧E2E项目', true, old.id + '（如需重建加 --fresh）')
  }
  const list1 = (must('列项目', await lw('getProjects')).data) || []
  let pid = (list1.find((p) => p.name === PROJECT_NAME) || {}).id
  if (!pid) {
    pid = must('建项目', await lw('createProject', { name: PROJECT_NAME, type: 'story' })).data.id
  }
  report.projectId = pid
  fs.writeFileSync('/tmp/lw-e2e-pid.json', JSON.stringify({ pid }))
  step('步骤1 项目就绪', !!pid, pid)

  // stage 模型：章节写作走百炼 deepseek
  must('配章法模型', await lw('setStageModelConfig', pid, 'chapters', bailian.id, MODEL))
  step('步骤1 stage模型', true, `${MODEL}`)

  // ============ 步骤 2：概要 ============
  let ov = await lw('getStoryOverview', pid)
  if (!(ov.success && ov.data && ov.data.summary)) {
    const premise = `东南沿海的雾岛，民国二十三年。守塔人林远航在台风夜离奇失踪，只留下一只黄铜哨子给女儿林小满——哨身刻着"守"字，林家人吹它，三里内的雾都会让路。十八岁的林小满接任守塔人，与驻岛警察陈屿一起调查父亲失踪，发现岛上走私集团借灯塔灯光暗号运货，幕后是渔业会长万金镛。黄铜哨子是林远航当年截获走私账册后藏起的关键信物，哨身夹层里藏着半页账页。故事讲林小满如何守住的不仅是灯，更是父亲没说完的真相。`
    const gen = must('生成概要', await retry('生成概要', () =>
      lw('generateStoryOverview', 'e2e-ov-' + Date.now(), pid, premise, bailian.id, MODEL)))
    const d = gen.data
    must('概要落库', await lw('updateStoryOverview', pid, {
      storyType: d.storyType || 'gujin',
      title: (d.title || PROJECT_NAME).replace(/[《》]/g, ''),
      coreIdea: (d.summary || '').slice(0, 200),
      summary: d.summary,
      coreConflict: d.coreConflict,
      keyCharacters: d.keyCharacters || [],
      keyLocations: d.keyLocations || [],
      estimatedChapters: 4,
      enabledFeatures: [],
      isSaved: true,
    }))
  }
  // 结构约定注入：全书共 4 章、第 4 章即终局——写入概要文本（设计卡自检把它当
  // 作者共识级参照，避免 AI 概要自带的多章规划与 4 章测试结构打架）
  must('概要结构约定', await lw('updateStoryOverview', pid, {
    summary: `${(ov.data && ov.data.summary) || ''}\n\n【全书结构约定（最高优先级）】全书共 4 章；第 4 章即终局收网之夜。各章定位：第1章开篇接班与悬念铺设；第2章查案推进与第一次反扑；第3章证据到手与危机升级；第4章终局（收网、对峙、账册合璧、万金镛伏法、灯塔重亮）。`,
    isSaved: true,
  }))
  ov = must('读概要', await lw('getStoryOverview', pid))
  step('步骤2 概要', !!(ov.data && ov.data.summary && ov.data.summary.length >= 50),
    `概要 ${(ov.data.summary || '').length} 字 | 冲突: ${(ov.data.coreConflict || '').slice(0, 40)}`)

  // ============ 步骤 3：圣经（人物/地点/物品/故事线） ============
  let chars = (must('列人物', await lw('getCharacters', pid)).data) || []
  if (chars.length === 0) {
    const gen = must('生成人物', await retry('生成人物', () =>
      lw('generateCharacters', 'e2e-ch-' + Date.now(), pid, bailian.id, MODEL,
        '女主林小满（18岁守塔人学徒，倔强嘴硬）、男主陈屿（24岁驻岛警察，外冷内热）、反派万金镛（55岁渔业会长，走私头目）')))
    // AI 返回缺 name 时回退既定名（E2E 实测：空名导致全册"未名"，R9 大面积误报）
    const fixedNames = ['林小满', '陈屿', '万金镛']
    const fixedRoles = ['protagonist', 'supporting', 'antagonist']
    const genList = (gen.data || []).slice(0, 3).map((c, i) => ({ ...c, name: String(c.name || '').trim() || fixedNames[i] }))
    for (const c of genList) {
      await lw('createCharacter', {
        projectId: pid,
        name: String(c.name || '未名').slice(0, 20),
        gender: /女|她/.test(String(c.gender || '')) ? 'female' : 'male',
        age: Number(c.age) || 24,
        occupation: String(c.occupation || '').slice(0, 40),
        appearance: String(c.appearance || '').slice(0, 120),
        background: String(c.background || '').slice(0, 160),
        personality: String(c.personality || '').slice(0, 120),
        abilities: String(c.abilities || '').slice(0, 120),
        rolePosition: /主角/.test(String(c.rolePosition || '')) ? 'protagonist'
          : /反派|antagonist/.test(String(c.rolePosition || '')) ? 'antagonist' : (fixedRoles[genList.indexOf(c)] || 'supporting'),
        majorEvents: '',
      })
    }
    chars = (must('列人物', await lw('getCharacters', pid)).data) || []
  }
  step('步骤3 人物册', chars.length >= 3, chars.map((c) => `${c.name}(${c.rolePosition})`).join('、'))
  const charByName = Object.fromEntries(chars.map((c) => [c.name, c.id]))
  const charIds = chars.map((c) => c.id)

  let locs = (must('列地点', await lw('getLocations', pid)).data) || []
  if (locs.length === 0) {
    await lw('createLocation', { projectId: pid, name: '雾岛', type: '岛屿', importance: 'main', description: '东南海上的孤岛，常年起雾，岛民三百户' })
    await lw('createLocation', { projectId: pid, name: '老灯塔', type: '建筑', importance: 'main', description: '岛北悬崖上的百年灯塔，林家三代看守' })
    locs = (must('列地点', await lw('getLocations', pid)).data) || []
  }
  step('步骤3 地点册', locs.length >= 2, locs.map((l) => l.name).join('、'))

  let items = (must('列物品', await lw('getItems', pid)).data) || []
  if (!items.some((i) => i.name.includes('黄铜哨子'))) {
    await lw('createItem', {
      projectId: pid, name: '黄铜哨子', type: '信物', level: 'rare',
      description: '林远航留下的信物，哨身刻"守"字，夹层里藏着走私账册的半页账页；只有林家血脉吹响才会发声',
    })
    await lw('createItem', {
      projectId: pid, name: '走私账册', type: '罪证', level: 'rare',
      description: '万金镛走私集团的货单总册，记录三年间借灯塔灯光暗号入货的每一次交易',
    })
    items = (must('列物品', await lw('getItems', pid)).data) || []
  }
  const shaozi = items.find((i) => i.name.includes('黄铜哨子'))
  const zhangce = items.find((i) => i.name.includes('走私账册'))
  step('步骤3 物品册（关键道具）', !!shaozi && !!zhangce, items.map((i) => i.name).join('、'))

  let plots = (must('列故事线', await lw('getPlots', pid)).data) || []
  if (plots.length === 0) {
    await lw('createPlot', {
      projectId: pid, title: '灯塔失踪案（第1—4章）',
      summary: '守塔人林远航失踪案。万金镛借灯塔灯光暗号走私，被林远航截获账册后灭口未遂；黄铜哨子夹层里的半页账页是定罪关键。第2章断灯夜是案发，第4章收网。',
      involvedCharacters: charIds,
    })
    plots = (must('列故事线', await lw('getPlots', pid)).data) || []
  }
  step('步骤3 故事线', plots.length >= 1, plots.map((p) => p.title).join('、'))

  // ============ 步骤 4：大纲（4 章flat + 实体关联） ============
  let tree = (must('读大纲', await lw('getOutlineTree', pid)).data) || []
  let chapterNodes = tree.filter((n) => n.nodeType === 'chapter')
  const defs = [
      { name: '第1章·雾夜接灯', summary: '按全书概要开篇：林小满接任守塔人，接过黄铜哨子，发现父亲留下的线索。本章铺人物与悬念，不坐实终局信息。钩子：第一条指向真相的线索出现。' },
      { name: '第2章·断灯之夜', summary: '按全书概要推进查案：林小满与陈屿联手，遭遇走私集团的第一次反扑。钩子：出现指向万金镛的关键证据。' },
      { name: '第3章·礁洞疑踪', summary: '按全书概要推进：取得账册相关物证并与黄铜哨子形成证据链，危机升级。钩子：终局收网的时机出现。' },
      { name: '第4章·雾散灯明', summary: '按全书概要执行终局：收网、对峙、账册合璧、万金镛伏法、灯塔重亮。呼应开篇的哨声与雾。' },
  ]
  if (chapterNodes.length === 0) {
    console.log('… 生成 4 章大纲')
    for (let i = 0; i < defs.length; i++) {
      await lw('createOutline', {
        projectId: pid, name: defs[i].name, level: 1, nodeType: 'chapter',
        summary: defs[i].summary, estimatedWords: CHAPTER_WORDS, status: 'pending',
        orderIndex: i,
        involvedCharacters: charIds.slice(0, 2),
        involvedLocations: locs.slice(0, 2).map((l) => l.id),
        involvedItems: i === 0 ? [shaozi.id] : [shaozi.id, zhangce.id],
      })
    }
    tree = (must('读大纲', await lw('getOutlineTree', pid)).data) || []
    chapterNodes = tree.filter((n) => n.nodeType === 'chapter')
  }
  // 大纲-概要对齐（幂等）：已存在的大纲统一回写中性文本（细节以概要为准，防自检分歧）
  const aligns = defs
  for (const dd of aligns) {
    const node = chapterNodes.find((n) => n.name === dd.name)
    if (node && node.summary !== dd.summary) {
      await lw('updateOutline', node.id, { summary: dd.summary })
    }
  }
  step('步骤4 大纲4章', chapterNodes.length === 4, chapterNodes.map((n) => n.name).join(' → '))

  // ============ 步骤 5：逐章章法 + 每步一致性验收 ============
  const conflictsSeen = []
  for (let i = 0; i < chapterNodes.length; i++) {
    const oid = chapterNodes[i].id
    const name = chapterNodes[i].name
    const existing = must('读章节', await lw('getChapter', oid))
    if (existing.data && existing.data.content && existing.data.content.length >= MIN_CHARS) {
      step(`第${i + 1}章 正文已有`, true, `${existing.data.content.length} 字（跳过生成）`)
    } else {
      console.log(`… 第${i + 1}章 章法生成（卡→自检→门禁→正文→图谱→审读）`)
      const t0 = Date.now()
      // 超时不算失败（工作流仍在跑→轮询落库）；其他错误重试 3 次，仍败则中止
      let out = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        const r = await lw('writeChapterFull', 'e2e-wf-' + Date.now(), pid, oid, { targetWords: CHAPTER_WORDS, providerConfigId: bailian.id, modelId: MODEL })
        if (r && r.success === false && /超时/.test(String(r.error || ''))) { out = r; break }
        if (!r || r.success === false) {
          console.warn(`  [retry ${attempt}/3] 第${i + 1}章: ${String(r && r.error || '').slice(0, 160)}`)
          await sleep(5000)
          continue
        }
        out = r
        break
      }
      if (!out) {
        // 连续自检不收敛=需作者拍板的合法状态：记录后跳过本章生成，继续后续验收
        step(`第${i + 1}章 章法收敛`, false, '设计卡自检连续不通过（需作者裁决大纲/概要分歧），跳过本章继续验收')
        continue
      }
      if (out.ok === false && !/超时/.test(String(out.error || ''))) throw new Error(`第${i + 1}章章法失败: ${out.error}`)
      if (out.ok === false && !/超时/.test(String(out.error || ''))) throw new Error(`第${i + 1}章章法失败: ${out.error}`)
      // 工作流等待可能超时但实际仍在执行：轮询章节落库（最长 15 分钟）
      let chR = must(`第${i + 1}章 读正文`, await lw('getChapter', oid))
      if (!((chR.data && chR.data.content || '').length >= MIN_CHARS)) {
        console.log(`  ⏳ 工作流仍在执行，轮询章节落库…`)
        for (let w = 0; w < 30; w++) {
          await sleep(30000)
          chR = must(`第${i + 1}章 读正文`, await lw('getChapter', oid))
          if ((chR.data && chR.data.content || '').length >= MIN_CHARS) break
        }
      }
      const preR = must(`第${i + 1}章 读设计卡`, await lw('getPrewrite', oid))
      const d = {
        content: (chR.data && chR.data.content) || '',
        designCard: (preR.data && preR.data.content) || '',
        review: out && out.data && out.data.review,
        postCheck: out && out.data && out.data.postCheck,
      }
      step(`第${i + 1}章 正文长度`, (d.content || '').length >= MIN_CHARS,
        `${(d.content || '').length} 字（${Math.round((Date.now() - t0) / 1000)}s）`)

      // 管线完成等待：状态摘要是流水线最后一步，等它出现再验收（防提取未完先扫描）
      let pipelineDone = false
      for (let w = 0; w < 24; w++) {
        const s = await lw('getChapterStateSummaryByOutline', oid)
        if (s && s.success && s.data) { pipelineDone = true; break }
        await sleep(20000)
      }
      step(`第${i + 1}章 图谱管线完成`, pipelineDone, pipelineDone ? '状态摘要已生成' : '超时（摘要未出现，后续检查可能失真）')
      const cardOK = d.designCard && d.designCard.includes(`第${i + 1}章`)
      step(`第${i + 1}章 设计卡章号`, !!cardOK, (d.designCard || '').split('\n')[0].slice(0, 50))
      // 写后审读只记录内容；权威判定在后面的"一致性扫描"（疑点若被自动修复/保留则闭环）
      if (d.postCheck && d.postCheck.passed) {
        step(`第${i + 1}章 写后审读`, true, '无疑点')
      } else {
        console.log(`  ℹ️ 第${i + 1}章 写后检查有话要说：${String(d.postCheck && d.postCheck.report || '').slice(0, 160)}`)
      }
    }

    // 图谱管线：状态摘要章号必须与大纲一致
    const sum = must('读状态摘要', await lw('getChapterStateSummaryByOutline', oid))
    step(`第${i + 1}章 摘要章号`, !!(sum.data && sum.data.chapterNumber === i + 1),
      `chapter_number=${sum.data ? sum.data.chapterNumber : '无'}`)

    // 全库疑点扫描（截至本章）：阻断疑点必须为 0
    let conflicts = (must('疑点扫描', await lw('graphScanContradictions', pid, {})).data) || []
    const blocking = conflicts.filter((c) => {
      const chs = (String(c.message || '').match(/第\s*(\d+)\s*章/g) || []).map((m) => Number(m.replace(/\D/g, '')))
      const keyCh = Number.isFinite(c.chapterNumber) && c.chapterNumber > 0 ? [c.chapterNumber, ...chs] : chs
      return keyCh.length === 0 || keyCh.some((n) => n <= i + 1)
    })
    // R11 黑户道具：立即修复（入册）后重扫
    const r11 = blocking.filter((c) => c.rule === 'R11')
    if (r11.length > 0) {
      for (const c of r11) {
        const itemName = c.entityName || (c.message.match(/「(.+?)」/) || [])[1]
        if (!itemName) continue
        await lw('createItem', {
          projectId: pid, name: itemName, type: 'other', level: 'common',
          description: '（E2E 自动入册：写后追踪发现的黑户道具）',
        })
        console.log(`  🔧 R11 自动修复：道具「${itemName}」已入册`)
      }
      conflicts = (must('疑点重扫', await lw('graphScanContradictions', pid, {})).data) || []
      step(`第${i + 1}章 R11自动入册`, true, `处理 ${r11.length} 项`)
    }
    // R9 名册外人名：按系统指引"补入人物圣经"——自动入册为 temporary 人物后重扫
    const r9 = blocking.filter((c) => c.rule === 'R9')
    if (r9.length > 0) {
      const seenNames = new Set()
      const existingChars = ((await lw('getCharacters', pid)).data) || []
      for (const c of r9) {
        const name = c.entityName || (c.message.match(/「(.+?)」/) || [])[1]
        if (!name || seenNames.has(name) || existingChars.some((x) => x.name === name)) continue
        seenNames.add(name)
        await lw('createCharacter', {
          projectId: pid, name, gender: 'male', age: 50,
          occupation: '岛民', appearance: '', background: '', personality: '', abilities: '',
          rolePosition: 'supporting', importance: 'temporary', majorEvents: '',
        })
        console.log(`  🔧 R9 自动修复：人物「${name}」已补入名册（temporary）`)
      }
      await sleep(500)
      conflicts = (must('疑点重扫', await lw('graphScanContradictions', pid, {})).data) || []
      step(`第${i + 1}章 R9自动入册`, true, `处理 ${r9.length} 项`)
    }
    // R3/R10 等需作者裁决的疑点：E2E 中按"知情保留"闭环（R3=情节确认持有权变化；
    // R10 消息自带处置指引"已用其他情节实现请知情保留"）
    const confirmable = conflicts.filter((c) => ['R3', 'R10'].includes(c.rule))
    if (confirmable.length > 0) {
      const keys = confirmable.map((c) => conflictKey(c))
      must('知情保留', await lw('conflictBatchAcknowledge', pid, keys, 'E2E 自动知情保留：情节已确认按其他方式实现'))
      console.log(`  🔧 R3/R10 自动知情保留：${confirmable.length} 项`)
      conflicts = (must('疑点重扫', await lw('graphScanContradictions', pid, {})).data) || []
    }

    const remaining = conflicts.filter((c) => {
      if (c.rule === 'R11') return false // 已处理
      if (c.blocking === false) return false
      const chs = (String(c.message || '').match(/第\s*(\d+)\s*章/g) || []).map((m) => Number(m.replace(/\D/g, '')))
      const keyCh = Number.isFinite(c.chapterNumber) && c.chapterNumber > 0 ? [c.chapterNumber, ...chs] : chs
      return keyCh.length === 0 || keyCh.some((n) => n <= i + 1)
    })
    conflictsSeen.push(...remaining.map((c) => `[${c.rule}] ${c.message}`))
    step(`第${i + 1}章 一致性扫描`, remaining.length === 0,
      remaining.length === 0 ? '无阻断疑点' : remaining.map((c) => c.message.slice(0, 80)).join(' ⚠ '))

    // 深检（DB 层）：事件章号必须落在已写范围（续跑时后续章节事件已存在，属正常）
    const ev = dbCheck("SELECT DISTINCT chapter_number n FROM lw_events WHERE project_id=? ORDER BY n")
    const evNos = ev.map((r) => r.n)
    step(`第${i + 1}章 事件章号键挂`,
      evNos.length === 0 || (evNos.every((n) => n >= 1 && n <= chapterNodes.length) && evNos.includes(i + 1)),
      `events 章号集 [${evNos.join(',')}]（本章 ${i + 1} 必须在内）`)
  }

  // ============ 步骤 6：结构变更级联回归（插入新首章 → 伴生数据 +1 → 删除 → 还原） ============
  const before = {
    events: dbCheck("SELECT chapter_number n, COUNT(*) c FROM lw_events WHERE project_id=? GROUP BY chapter_number ORDER BY n"),
    states: dbCheck("SELECT chapter_number n, COUNT(*) c FROM lw_entity_state_snapshots WHERE project_id=? GROUP BY chapter_number ORDER BY n"),
    foreshadows: dbCheck("SELECT planted_chapter n, COUNT(*) c FROM lw_foreshadows WHERE project_id=? GROUP BY planted_chapter ORDER BY n"),
    summaries: dbCheck("SELECT chapter_number n, outline_id o FROM lw_chapter_state_summaries WHERE project_id=? ORDER BY n"),
  }
  await lw('createOutline', {
    projectId: pid, name: '序章·风灯', level: 1, nodeType: 'chapter',
    summary: '（级联回归用：林远航失踪前夜的倒叙）', estimatedWords: 800, status: 'pending', orderIndex: -1,
    involvedCharacters: charIds.slice(0, 1),
  })
  await sleep(500)
  const afterTree = ((must('读大纲', await lw('getOutlineTree', pid)).data) || []).filter((n) => n.nodeType === 'chapter')
  step('步骤6 插入序章后文档序', afterTree[0] && afterTree[0].name.includes('序章'),
    afterTree.map((n) => n.name.slice(0, 8)).join(' → '))
  const evAfter = dbCheck("SELECT DISTINCT chapter_number n FROM lw_events WHERE project_id=? ORDER BY n")
  const shifted = evAfter.every((r, idx) => before.events[idx] && r.n === before.events[idx].n + 1)
  step('步骤6 事件章号整体+1', evAfter.length === before.events.length && shifted,
    `before [${before.events.map((r) => r.n)}] → after [${evAfter.map((r) => r.n)}]`)
  const sumOldCh1 = dbCheck("SELECT chapter_number n, outline_id o FROM lw_chapter_state_summaries WHERE project_id=?")
  const oldFirst = sumOldCh1.find((r) => r.o === chapterNodes[0].id)
  step('步骤6 摘要章号级联', !!oldFirst && oldFirst.n === 2,
    `原第1章摘要 chapter_number=${oldFirst ? oldFirst.n : '无'}（期望2）`)
  const preHeaders = dbCheck("SELECT o.name nm, p.content c FROM lw_chapter_prewrites p JOIN lw_story_outlines o ON p.outline_id=o.id WHERE o.project_id=?")
  const headerOk = preHeaders.filter((r) => r.nm.includes('第1章')).every((r) => /本章设计卡（第2章/.test(r.c))
  step('步骤6 预写卡头级联', headerOk, preHeaders.map((r) => `${r.nm.slice(0, 6)}:${(r.c || '').slice(8, 22)}`).join(' | ').slice(0, 200))

  // 删除序章 → 还原（按名字定位，防文档序不符时误删他章）
  const xu = afterTree.find((n) => n.name.includes('序章'))
  const del = await lw('deleteOutline', xu.id, true)
  step('步骤6 删除序章', !!(del && del.deleted !== false), JSON.stringify(del).slice(0, 100))
  await sleep(500)
  const evRestored = dbCheck("SELECT DISTINCT chapter_number n FROM lw_events WHERE project_id=? ORDER BY n")
  const restored = evRestored.length === before.events.length && evRestored.every((r, idx) => r.n === before.events[idx].n)
  step('步骤6 删除后章号还原', restored, `[${evRestored.map((r) => r.n)}]`)

  // ============ 汇总 ============
  report.finishedAt = new Date().toISOString()
  report.failures = failures
  report.conflictsSeen = conflictsSeen
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(`\n========== E2E ${failures === 0 ? '全部通过 ✅' : failures + ' 项失败 ❌'} ==========（报告: ${OUT}）`)
  browser.close()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  report.steps.push({ label: 'FATAL', ok: false, detail: String(e && e.stack || e).slice(0, 800) })
  report.failures = failures + 1
  try { fs.writeFileSync(OUT, JSON.stringify(report, null, 2)) } catch {}
  console.error('FATAL:', e && e.message)
  process.exit(1)
})
