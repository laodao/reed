const db = require('better-sqlite3')(process.env.HOME + '/.config/the_bot/the_bot.db', {readonly: true})
const projects = db.prepare('SELECT id, name, status FROM video_projects ORDER BY created_at DESC LIMIT 10').all()
for (const p of projects) {
  const eps = db.prepare('SELECT COUNT(*) c FROM video_episodes WHERE project_id=? AND deleted_at IS NULL').get(p.id).c
  const chars = db.prepare('SELECT COUNT(*) c FROM character_bindings WHERE project_id=?').get(p.id).c
  const imgs = db.prepare("SELECT COUNT(*) c FROM asset_image WHERE is_main=1 AND image_path != '' AND asset_id IN (SELECT id FROM character_bindings WHERE project_id=?)").get(p.id).c
  console.log(`${p.id} | ${p.name} | eps=${eps} chars=${chars} mainImgs=${imgs}`)
}
