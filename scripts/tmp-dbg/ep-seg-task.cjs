const db = require('better-sqlite3')(process.env.HOME + '/.config/the_bot/the_bot.db', {readonly: true})
const seg = db.prepare('SELECT id, seq, status, provider_task_id, video_path, error FROM ep_video_segments WHERE id=?').get('evs_1789957188701_evch4utab')
console.log(JSON.stringify(seg))
