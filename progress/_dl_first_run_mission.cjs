// 探针：打印深度学习空间第一轮起步研究时，注入到会话里的「领域起步研究」任务指令全文
const Database = require('better-sqlite3')
const db = new Database('C:/Users/daoge/the-bot/the_bot.db', { readonly: true })

const SPACE = 'a13eb877-bf6d-4546-bc43-d08fc010367a'
const row = db
  .prepare(
    `select payload_json, created_at from agent_trajectories
     where scope_key like ? and kind = 'decision' and payload_json like '%systemPrompt%'
     order by rowid limit 1`
  )
  .get(`%${SPACE}%`)

const p = JSON.parse(row.payload_json)
const prompt = p.systemPrompt
console.log('时间：', row.created_at, '| 长度：', prompt.length)
console.log('\n===== 快照/任务段（从第一个 [ 开始） =====\n')
const idx = prompt.indexOf('\n[')
console.log(idx >= 0 ? prompt.slice(idx) : prompt.slice(2000))
