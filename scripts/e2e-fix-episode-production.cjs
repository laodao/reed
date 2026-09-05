/**
 * E2E 修复验证：episode-production 三个存量 bug（B1 SQLite NOT NULL 迁移缺口 /
 * B2 createProject 缺 config 默认值 / B3 EP 读章节正文不认一级 chapter 直挂正文）
 *
 * 验证路径：
 *   a. EP standalone 角色创建（不传 lwCharId，longWritingCharacterId=NULL 落库）成功
 *   b. uploaded 模式建集（outline_id=NULL）成功 + uploaded 剧本生成（episode_scripts.outline_id=NULL）成功
 *   c. ep:createProject 不传 config 成功
 *   d. 一级 chapter 直挂正文（无 section）的长文项目 → EP 建集 → generateScript 读到正文
 *      （剧本 synopsis / scriptContent 应含正文元素"苏晚"/"灰大衣"）
 * 另附真实库 PRAGMA table_info 证据（三列 notnull=0）。
 *
 * 前置：electron . --remote-debugging-port=9333 已启动（应用刚重启，迁移已跑）
 * 测试数据用 "E2E修复-" 前缀，测完软删清理。
 * 输出 FIX_RESULT=...
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const path = require('path')
const os = require('os')

const DB = path.join(os.homedir(), '.config/the_bot/the_bot.db')
const PC_TEXT = 'pc_mtee10tz_ijz2yq1ro'
const MODEL_TEXT = 'deepseek-v4-flash-0731'

const CHAPTER_CONTENT = `深夜的旧书修复工作室里，苏晚独自伏案。台灯下，那本焦黑的古书突然无风自动，翻到一页空白。空白处缓缓浮现一行字："不要把它交给穿灰大衣的人。"窗外巷口，恰好立着一个穿灰大衣的身影。苏晚屏住呼吸，轻轻合上了书。`
const UPLOADED_CONTENT = `暴雨夜，外卖员阿杰敲开山顶别墅的门。开门的女人脸色惨白："我没点过外卖。"订单备注栏写着一行小字：别出声，屋里还有别人。阿杰抬头，看见女人身后的楼梯上，一双男人的鞋尖正缓缓缩回黑暗里。`

function pragma() {
  const fs = require('fs')
  const sqlFile = path.join(os.tmpdir(), 'e2e-fix-pragma.sql')
  fs.writeFileSync(sqlFile, `SELECT 'cb' AS t, "notnull" FROM pragma_table_info('character_bindings') WHERE name='long_writing_character_id';
SELECT 've' AS t, "notnull" FROM pragma_table_info('video_episodes') WHERE name='outline_id';
SELECT 'es' AS t, "notnull" FROM pragma_table_info('episode_scripts') WHERE name='outline_id';`)
  try {
    return execSync(`sqlite3 -json "${DB}" ".read ${sqlFile}"`, { encoding: 'utf8' }).trim()
  } catch (e) { return `PRAGMA 读取失败: ${e.message}` }
}

;(async () => {
  const results = {}
  const cleanup = { charIds: [], epProjects: [], epEpisodes: [], lwProjects: [] }
  const fail = (stage, r) => {
    console.error(`❌ ${stage}:`, typeof r === 'string' ? r : JSON.stringify(r?.error ?? r).slice(0, 400))
    results[stage] = { ok: false, error: String(r?.error ?? r).slice(0, 300) }
    throw new Error(stage)
  }

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  const ev = (fn, arg) => page.evaluate(fn, arg)

  try {
    // 0. PRAGMA 证据：三列 notnull=0
    const p = pragma()
    console.log('PRAGMA table_info（迁移后真实库）:', p)
    results.pragma = p

    // c. createProject 不传 config（B2）
    const projC = await ev(() => window.electronAPI.episodeProduction.createProject('E2E修复-B2-不传config'))
    if (!projC.success) fail('c.createProject无config', projC)
    cleanup.epProjects.push(projC.data.id)
    console.log('✅ c. createProject 不传 config 成功:', projC.data.id, 'config=', JSON.stringify(projC.data.config))
    results.c = { ok: true, id: projC.data.id }

    // a. standalone 角色创建（B1: character_bindings.long_writing_character_id NULL）
    const chr = await ev((pid) => window.electronAPI.episodeProduction.asset.character.createStandalone({
      projectId: pid, name: 'E2E修复-独立角色', description: 'standalone 回归验证',
    }), projC.data.id)
    if (!chr.success) fail('a.standalone角色', chr)
    cleanup.charIds.push(chr.data.id)
    console.log('✅ a. standalone 角色创建成功:', chr.data.id, 'lwCharId=', chr.data.longWritingCharacterId)
    results.a = { ok: true, id: chr.data.id }

    // b. uploaded 模式建集（B1: video_episodes.outline_id NULL）
    // 注意：浏览器侧函数引不到 node 侧常量，UPLOADED_CONTENT 必须作为 evaluate 参数传入
    const epB = await ev(({ pid, content }) => window.electronAPI.episodeProduction.createEpisode(pid, {
      sourceType: 'uploaded', uploadedContent: content, episodeNumber: 1, title: 'E2E修复-uploaded建集',
    }).catch(e => ({ success: false, error: 'evaluate 抛出: ' + String(e && e.message || e) })),
      { pid: projC.data.id, content: UPLOADED_CONTENT })
    if (!epB.success) fail('b.uploaded建集', epB)
    cleanup.epEpisodes.push(epB.data.id)
    console.log('✅ b. uploaded 建集成功:', epB.data.id, 'outlineId=', epB.data.outlineId)

    // b2. uploaded 剧集生成剧本（B1: episode_scripts.outline_id NULL + AI 链路）
    // AI 网关偶发 "Request timed out."，最多重试 2 次
    const genScript = (eid) => (async () => {
      for (let i = 0; i < 2; i++) {
        const t = Date.now()
        const r = await ev(({ eid, pc, m }) => window.electronAPI.episodeProduction.generateScript(eid, pc, m)
          .catch(e => ({ success: false, error: String(e && e.message || e) })),
          { eid, pc: PC_TEXT, m: MODEL_TEXT })
        if (r.success) {
          console.log(`  generateScript 成功(${(Date.now() - t) / 1000 | 0}s, 第${i + 1}次)`)
          return r
        }
        console.warn(`  generateScript 第${i + 1}次失败:`, JSON.stringify(r?.error ?? r).slice(0, 200))
      }
      return { success: false, error: '重试 2 次仍失败' }
    })()

    const scriptB = await genScript(epB.data.id)
    if (!scriptB.success) fail('b2.uploaded剧本生成', scriptB)
    console.log('✅ b2. uploaded 剧本生成成功，outlineId=NULL 落库')
    results.b = { ok: true, episodeId: epB.data.id, script: !!scriptB.data }

    // d. 一级 chapter 直挂正文（B3）：长文项目 → chapter（无 section）→ 正文直挂
    const lwProj = await ev((d) => window.electronAPI.longwriting.createProject(d), { name: 'E2E修复-B3-chapter直挂正文', type: 'story' })
    if (!lwProj.success) fail('d.建长文项目', lwProj)
    cleanup.lwProjects.push(lwProj.data.id)
    const chNode = await ev((d) => window.electronAPI.longwriting.createOutline(d), {
      projectId: lwProj.data.id, parentId: null, name: '第1章 深夜古书', level: 1, nodeType: 'chapter',
      summary: '', estimatedWords: 300, involvedCharacters: [], involvedLocations: [], status: 'pending', orderIndex: 0,
    })
    if (!chNode.success) fail('d.建chapter', chNode)
    const chapterId = chNode.data.id
    const sc = await ev(({ oid, c }) => window.electronAPI.longwriting.saveChapter(oid, c), { oid: chapterId, c: CHAPTER_CONTENT })
    if (!sc.success) fail('d.chapter正文', sc)
    console.log('长文 chapter 直挂正文已挂载（无 section）:', chapterId)

    const projD = await ev((lwPid) => window.electronAPI.episodeProduction.createProject('E2E修复-B3-EP项目', lwPid), lwProj.data.id)
    if (!projD.success) fail('d.建EP项目', projD)
    cleanup.epProjects.push(projD.data.id)
    const epD = await ev(({ pid, oid }) => window.electronAPI.episodeProduction.createEpisode(pid, {
      sourceType: 'outline', outlineId: oid, episodeNumber: 1, title: 'E2E修复-第1集',
    }), { pid: projD.data.id, oid: chapterId })
    if (!epD.success) fail('d.建集', epD)
    cleanup.epEpisodes.push(epD.data.id)

    const tD = Date.now()
    const scriptD = await genScript(epD.data.id)
    if (!scriptD.success) fail('d.generateScript', scriptD)
    const sd = scriptD.data?.script || scriptD.data || {}
    const text = `${sd.synopsis || ''}\n${sd.scriptContent || ''}`
    const hit = ['苏晚', '灰大衣', '古书'].filter(k => text.includes(k))
    console.log(`✅ d. generateScript 成功(${(Date.now() - tD) / 1000 | 0}s)，正文元素命中: ${hit.join(',') || '无'}`)
    if (hit.length === 0) fail('d.剧本未含正文元素', `synopsis=${(sd.synopsis || '').slice(0, 120)}`)
    results.d = { ok: true, hit }
  } catch (e) {
    console.error('主流程异常（继续清理）:', String(e && e.message || e).slice(0, 400))
    if (!results.__error) results.__error = String(e && e.message || e).slice(0, 300)
  } finally {
    // 清理（软删）：剧集 → 项目 → 角色 → 长文项目
    for (const id of cleanup.epEpisodes) {
      const r = await ev((id) => window.electronAPI.episodeProduction.deleteEpisode(id), id)
      console.log('清理 episode', id, r?.success ? 'ok' : JSON.stringify(r))
    }
    for (const id of cleanup.epProjects) {
      const r = await ev((id) => window.electronAPI.episodeProduction.deleteProject(id), id)
      console.log('清理 epProject', id, r?.success ? 'ok' : JSON.stringify(r))
    }
    for (const id of cleanup.charIds) {
      const r = await ev((id) => window.electronAPI.episodeProduction.asset.character.delete(id), id)
      console.log('清理 character', id, r?.success ? 'ok' : JSON.stringify(r))
    }
    for (const id of cleanup.lwProjects) {
      const r = await ev((id) => window.electronAPI.longwriting.deleteProject(id), id)
      console.log('清理 lwProject', id, r?.success ? 'ok' : JSON.stringify(r))
    }
    // 兜底清扫：删掉所有 'E2E修复-' 前缀的残留（含探针/历史中断遗留），软删即可
    const sweep = await ev(() => window.electronAPI.episodeProduction.listProjects())
    if (sweep?.success) {
      for (const p of sweep.data.filter(x => String(x.name).startsWith('E2E修复-'))) {
        const eps = await ev((pid) => window.electronAPI.episodeProduction.listEpisodes(pid), p.id)
        for (const e of (eps?.data || [])) {
          await ev((id) => window.electronAPI.episodeProduction.deleteEpisode(id), e.id)
        }
        await ev((id) => window.electronAPI.episodeProduction.deleteProject(id), p.id)
        console.log('兜底清扫 epProject', p.name, p.id)
      }
    }
    const lwSweep = await ev(() => window.electronAPI.longwriting.getProjects())
    if (lwSweep?.success) {
      for (const p of (lwSweep.data || []).filter(x => String(x.name).startsWith('E2E修复-'))) {
        await ev((id) => window.electronAPI.longwriting.deleteProject(id), p.id)
        console.log('兜底清扫 lwProject', p.name, p.id)
      }
    }
    await browser.close()
  }

  const ok = ['a', 'b', 'c', 'd'].every(k => results[k]?.ok)
  console.log(ok ? '✅ 四条修复路径全部通过' : '❌ 存在失败路径')
  console.log('FIX_RESULT=' + JSON.stringify({ ok, ...results }))
  process.exit(ok ? 0 : 1)
})().catch(e => { console.error('脚本失败:', e.message); console.log('FIX_RESULT=' + JSON.stringify({ ok: false, error: e.message })); process.exit(1) })
