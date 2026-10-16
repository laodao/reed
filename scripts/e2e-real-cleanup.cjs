/**
 * E2E 真实测试清理：删除所有 "E2E真实-" 前缀测试数据 + 本次生成的媒体文件/记录
 * （代表性样本已拷贝到 docs/screenshot/，/tmp/e2e-real-kb-doc.txt 保留供核验）
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const DB = path.join(os.homedir(), '.config/the_bot/the_bot.db')
const DATA_PATH = path.join(os.homedir(), '.config/the_bot')
const q = (sql) => {
  const out = execSync(`sqlite3 -json "${DB}" "${sql.replace(/"/g, "'")}"`, { encoding: 'utf8' }).trim()
  return out ? JSON.parse(out) : []
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  const log = []

  // 1. 人像项目
  const pps = q(`SELECT id FROM portrait_projects WHERE name LIKE 'E2E真实-%'`)
  for (const p of pps) {
    // 收集 variant 图片文件路径（删库后手动删文件）
    const files = q(`SELECT image_path FROM portrait_variants WHERE character_id IN (SELECT id FROM portrait_characters WHERE project_id='${p.id}')`)
    const r = await page.evaluate((id) => window.electronAPI.portrait.deleteProject(id), p.id)
    for (const f of files) {
      const abs = path.isAbsolute(f.image_path) ? f.image_path : path.join(DATA_PATH, f.image_path)
      if (fs.existsSync(abs)) { fs.unlinkSync(abs); log.push('删文件 ' + abs) }
    }
    log.push(`人像项目 ${p.id} delete=${r.success}`)
  }

  // 2. 长文项目
  const lws = q(`SELECT id FROM lw_projects WHERE name LIKE 'E2E真实-%'`)
  for (const p of lws) {
    const r = await page.evaluate((id) => window.electronAPI.longwriting.deleteProject(id), p.id)
    log.push(`长文项目 ${p.id} delete=${r.success}`)
  }

  // 3. 剧集项目
  const eps = q(`SELECT id FROM video_projects WHERE name LIKE 'E2E真实-%'`)
  for (const p of eps) {
    const r = await page.evaluate((id) => window.electronAPI.episodeProduction.deleteProject(id), p.id)
    log.push(`剧集项目 ${p.id} delete=${r.success}`)
  }

  // 4. 工作流 + 资产
  const wfs = await page.evaluate(async () => {
    const wf = window.electronAPI.workflow
    const a = window.electronAPI.assets
    const out = []
    const lw = await wf.listDefinitions({ keyword: 'E2E真实', page: 1, pageSize: 50 })
    for (const d of (lw.success ? lw.data.items : [])) {
      const r = await wf.deleteDefinition(d.id)
      out.push(`工作流 ${d.id} delete=${r.success}`)
    }
    const la = await a.list({ keyword: 'E2E真实', page: 1, pageSize: 50 })
    for (const it of (la.success ? la.data.items : [])) {
      const r = await a.delete(it.id)
      out.push(`资产 ${it.id} delete=${r.success}`)
    }
    return out
  })
  log.push(...wfs)

  // 5. 知识库
  const kbs = q(`SELECT id FROM knowledge_bases WHERE name LIKE 'E2E真实-%'`)
  for (const k of kbs) {
    const r = await page.evaluate((id) => window.electronAPI.knowledgeBase.delete(id), k.id)
    log.push(`知识库 ${k.id} delete=${r.success}`)
    // 文档目录
    const dir = path.join(DATA_PATH, 'knowledge-base', k.id)
    if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); log.push('删目录 ' + dir) }
  }

  // 6. 图像生成记录 + 文件（images 表，task sync_1788103812817）
  const imgs = q(`SELECT id, file_path FROM images WHERE task_id='sync_1788103812817' OR prompt LIKE '%橘猫坐%'`)
  for (const im of imgs) {
    const r = await page.evaluate((id) => window.electronAPI.image.delete(id), im.id)
    if (im.file_path) {
      const abs = path.join(DATA_PATH, im.file_path)
      if (fs.existsSync(abs)) { fs.unlinkSync(abs); log.push('删文件 ' + abs) }
    }
    log.push(`图像记录 ${im.id} delete=${r.success}`)
  }

  // 7. settings 探针键（set null 不删行，直接删）
  execSync(`sqlite3 "${DB}" "DELETE FROM settings WHERE key='e2e_real_probe'"`)
  log.push('settings.e2e_real_probe 已删')

  await browser.close()

  // 8. 残留核查
  const leftovers = {
    portrait: q(`SELECT COUNT(*) c FROM portrait_projects WHERE name LIKE 'E2E真实-%'`)[0].c,
    lw: q(`SELECT COUNT(*) c FROM lw_projects WHERE name LIKE 'E2E真实-%'`)[0].c,
    ep: q(`SELECT COUNT(*) c FROM video_projects WHERE name LIKE 'E2E真实-%'`)[0].c,
    kb: q(`SELECT COUNT(*) c FROM knowledge_bases WHERE name LIKE 'E2E真实-%'`)[0].c,
    assets: q(`SELECT COUNT(*) c FROM assets WHERE name LIKE 'E2E真实-%'`)[0].c,
    wf: q(`SELECT COUNT(*) c FROM workflow_definitions WHERE name LIKE 'E2E真实-%'`)[0].c,
    // 级联检查
    epScenes: q(`SELECT COUNT(*) c FROM scene_scripts WHERE episode_script_id IN (SELECT id FROM episode_scripts WHERE project_id NOT IN (SELECT id FROM video_projects))`)[0]?.c ?? 0,
    orphanBindings: q(`SELECT COUNT(*) c FROM character_bindings WHERE project_id NOT IN (SELECT id FROM video_projects)`)[0]?.c ?? 0,
    orphanOutlines: q(`SELECT COUNT(*) c FROM lw_story_outlines WHERE project_id NOT IN (SELECT id FROM lw_projects)`)[0]?.c ?? 0,
    orphanChapters: q(`SELECT COUNT(*) c FROM lw_story_chapters WHERE outline_id NOT IN (SELECT id FROM lw_story_outlines)`)[0]?.c ?? 0,
    orphanChars: q(`SELECT COUNT(*) c FROM lw_story_characters WHERE project_id NOT IN (SELECT id FROM lw_projects)`)[0]?.c ?? 0,
  }
  console.log(log.join('\n'))
  console.log('\n残留核查:', JSON.stringify(leftovers))
  const clean = ['portrait', 'lw', 'ep', 'kb', 'assets', 'wf'].every(k => leftovers[k] === 0)
  console.log(clean ? '\n✅ 清理完成，无 E2E真实- 残留' : '\n⚠️ 仍有残留')
})().catch(e => { console.error('清理脚本失败:', e.message); process.exit(1) })
