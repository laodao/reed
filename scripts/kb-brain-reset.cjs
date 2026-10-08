/**
 * 知识大脑·环境修复 + 数据重置脚本（一次性维护，用 electron 运行以匹配原生模块 ABI：
 *   KB_ID=<kbId> VLLM_KEY=<明文key> electron --no-sandbox scripts/kb-brain-reset.cjs
 *
 * 做三件事：
 * 1. 把「本地vLLM」提供商密钥从 safeStorage 密文（v11，依赖桌面密钥环，无密钥环环境
 *    必炸——两本书 brain_status=failed 的根因）重加密为 master-key AES-256-GCM 密文
 *    （iv:tag:data，任何环境可解）。明文从调用方 env 传入，不落脚本。
 * 2. 清空指定库的全部大脑产物：论断/实体/关系边/场面事件/消化台账/知识卡（含复习记录）/
 *    倒排索引 brain 命名空间/LanceDB brain 向量命名空间/章节摘要。
 * 3. 文档状态重置：指定文档 → pending（重新提炼），其余文档 → skipped（暂不让自动化
 *    入队，验证通过后人工放回 pending），库 brain_state 记账清零。
 */
const Database = require('better-sqlite3')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const DB_PATH = process.env.KB_DB_PATH || path.join(require('os').homedir(), '.config/the_bot/the_bot.db')
const LANCE_DIR = process.env.KB_LANCE_DIR || path.join(require('os').homedir(), '.config/the_bot/lancedb')
const SECURE_KEY_PATH = process.env.KB_SECURE_KEY || path.join(require('os').homedir(), '.config/the_bot/secure-key')
const KB_ID = process.env.KB_ID
const DIGEST_DOC_NAME = process.env.KB_DIGEST_DOC_NAME || '诛仙'
const VLLM_KEY = process.env.VLLM_KEY

function assert(cond, msg) {
  if (!cond) {
    console.error('[fatal]', msg)
    process.exit(1)
  }
}

/** master-key 格式加密（对齐 SecureStorageService.encryptWithKey：iv:authTag:encrypted，各自 base64） */
function encryptWithMasterKey(masterKey, plaintext) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv)
  let enc = cipher.update(plaintext, 'utf8', 'base64')
  enc += cipher.final('base64')
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc}`
}

async function main() {
  assert(KB_ID, '缺 KB_ID 环境变量')

  // ---------- 1. 重加密 vLLM 提供商密钥 ----------
  if (VLLM_KEY) {
    assert(fs.existsSync(SECURE_KEY_PATH), `master-key 文件不存在: ${SECURE_KEY_PATH}`)
    const masterKey = Buffer.from(fs.readFileSync(SECURE_KEY_PATH, 'utf8').trim(), 'base64')
    assert(masterKey.length === 32, 'master-key 不是 32 字节')
    const db = new Database(DB_PATH)
    db.pragma('busy_timeout = 15000')
    const row = db
      .prepare("SELECT id, name, api_key_encrypted FROM provider_configs WHERE name LIKE '%vLLM%'")
      .all()
    console.log('[key] vLLM providers found:', row.map(r => r.id).join(', ') || '(none)')
    for (const r of row) {
      const enc = encryptWithMasterKey(masterKey, VLLM_KEY)
      // 回读自验：解密必须还原明文
      const parts = enc.split(':')
      const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(parts[0], 'base64'))
      decipher.setAuthTag(Buffer.from(parts[1], 'base64'))
      const dec = decipher.update(parts[2], 'base64', 'utf8') + decipher.final('utf8')
      assert(dec === VLLM_KEY, '重加密自验失败，放弃写入')
      db.prepare('UPDATE provider_configs SET api_key_encrypted = ?, updated_at = updated_at WHERE id = ?').run(enc, r.id)
      console.log(`[key] re-encrypted provider ${r.id} (${r.name}) → master-key AES-GCM`)
    }
    db.close()
  } else {
    console.log('[key] 未提供 VLLM_KEY，跳过重加密')
  }

  // ---------- 2. 清空大脑产物 ----------
  const db = new Database(DB_PATH)
  db.pragma('busy_timeout = 30000')

  const kb = db.prepare('SELECT id, name FROM knowledge_bases WHERE id = ?').get(KB_ID)
  assert(kb, `知识库不存在: ${KB_ID}`)
  console.log(`[reset] 目标库: ${kb.name} (${kb.id})`)

  // 目标文档查找前置（review M8）：第 2 步事务会把全库文档置 pending——若此时才
  // 发现目标文档不存在就退出，automation 会把全部文档重新消化，违背脚本设计
  const docs = db.prepare('SELECT id, name FROM kb_documents WHERE knowledge_base_id = ?').all(KB_ID)
  const target = docs.find(d => d.name.includes(DIGEST_DOC_NAME))
  assert(target, `找不到名称含「${DIGEST_DOC_NAME}」的文档`)

  const before = {}
  for (const t of ['kb_atoms', 'kb_entities', 'kb_knowledge_edges', 'kb_events', 'kb_digest_passes', 'kb_notes', 'kb_note_reviews']) {
    before[t] = db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${t === 'kb_note_reviews' ? 'kb_id' : 'knowledge_base_id'} = ?`).get(KB_ID).n
  }
  // 自动化动作日志（P4 起）：detail 记产物 noteIds——卡片删除后残留悬空引用，一并清
  const hasAutoLog = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kb_automation_log'").get()
  if (hasAutoLog) {
    before['kb_automation_log'] = db.prepare('SELECT COUNT(*) n FROM kb_automation_log WHERE kb_id = ?').get(KB_ID).n
  }
  before['inv_brain_ns'] = db
    .prepare(
      "SELECT COUNT(*) n FROM kb_inverted_index WHERE knowledge_base_id = ? AND (chunk_id LIKE 'atom:%' OR chunk_id LIKE 'note:%' OR chunk_id LIKE 'ent:%' OR chunk_id LIKE 'event:%')"
    )
    .get(KB_ID).n
  before['chapters_pending_summary'] = db
    .prepare("SELECT COUNT(*) n FROM kb_chapters WHERE knowledge_base_id = ?")
    .get(KB_ID).n
  console.log('[reset] before:', JSON.stringify(before))

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM kb_note_reviews WHERE kb_id = ?').run(KB_ID)
    db.prepare('DELETE FROM kb_notes WHERE knowledge_base_id = ?').run(KB_ID)
    db.prepare('DELETE FROM kb_knowledge_edges WHERE knowledge_base_id = ?').run(KB_ID)
    db.prepare('DELETE FROM kb_events WHERE knowledge_base_id = ?').run(KB_ID)
    db.prepare('DELETE FROM kb_atoms WHERE knowledge_base_id = ?').run(KB_ID)
    db.prepare('DELETE FROM kb_entities WHERE knowledge_base_id = ?').run(KB_ID)
    db.prepare('DELETE FROM kb_digest_passes WHERE knowledge_base_id = ?').run(KB_ID)
    if (hasAutoLog) {
      db.prepare('DELETE FROM kb_automation_log WHERE kb_id = ?').run(KB_ID)
    }
    db.prepare(
      "DELETE FROM kb_inverted_index WHERE knowledge_base_id = ? AND (chunk_id LIKE 'atom:%' OR chunk_id LIKE 'note:%' OR chunk_id LIKE 'ent:%' OR chunk_id LIKE 'event:%')"
    ).run(KB_ID)
    db.prepare(
      "UPDATE kb_chapters SET summary = NULL, summary_status = 'pending', summary_error = NULL WHERE knowledge_base_id = ?"
    ).run(KB_ID)
    db.prepare(
      "UPDATE kb_documents SET brain_status = 'pending', brain_progress = NULL, brain_error = NULL WHERE knowledge_base_id = ?"
    ).run(KB_ID)
  })
  tx()
  console.log('[reset] sqlite brain artifacts cleared')

  // ---------- 3. 文档状态分流 + brain_state 清零（目标文档已在上方前置校验） ----------
  const setPending = db.prepare("UPDATE kb_documents SET brain_status = 'pending' WHERE id = ?")
  const setSkipped = db.prepare("UPDATE kb_documents SET brain_status = 'skipped' WHERE id = ?")
  setPending.run(target.id)
  for (const d of docs) if (d.id !== target.id) setSkipped.run(d.id)
  db.prepare(
    "UPDATE knowledge_bases SET brain_state = ?, updated_at = updated_at WHERE id = ?"
  ).run(JSON.stringify({ importance: 0, lastDistillAt: null, automation: {} }), KB_ID)
  console.log(`[reset] ${target.name.slice(0, 30)}… → pending（先跑）`)
  for (const d of docs) if (d.id !== target.id) console.log(`[reset] ${d.name.slice(0, 30)}… → skipped（暂缓）`)
  db.close()

  // ---------- 4. LanceDB brain 命名空间向量 ----------
  let lancedb
  try {
    lancedb = require('@lancedb/lancedb')
  } catch {
    lancedb = require('lancedb')
  }
  const conn = await lancedb.connect(LANCE_DIR)
  const names = await conn.tableNames()
  if (!names.includes('vectors')) {
    console.log('[lance] 无 vectors 表，跳过')
  } else {
    const table = await conn.openTable('vectors')
    const total = await table.countRows()
    // 先统计该库 brain 命名空间行数（lancedb delete 不返回影响数）
    let brainRows = -1
    try {
      brainRows = await table
        .query()
        .where(
          `knowledgeBaseId = '${KB_ID}' AND (chunkId LIKE 'atom:%' OR chunkId LIKE 'note:%' OR chunkId LIKE 'ent:%' OR chunkId LIKE 'event:%')`
        )
        .countRows()
    } catch (e) {
      console.log('[lance] brain 行数统计失败（继续删除）:', e.message)
    }
    await table.delete(
      `knowledgeBaseId = '${KB_ID}' AND (chunkId LIKE 'atom:%' OR chunkId LIKE 'note:%' OR chunkId LIKE 'ent:%' OR chunkId LIKE 'event:%')`
    )
    const after = await table.countRows()
    console.log(`[lance] total=${total} → ${after}（brain 命名空间删除 ${brainRows >= 0 ? brainRows : '?'} 行）`)
  }

  console.log('[done] 环境修复 + 数据重置完成')
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('[fatal]', e)
    process.exit(1)
  })
