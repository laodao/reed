const db = require('better-sqlite3')(process.env.HOME + '/.config/the_bot/the_bot.db', {readonly: true})
const segs = db.prepare('SELECT id, seq, status, shot_count, duration, est_duration, video_path, prompt FROM ep_video_segments WHERE episode_id=? ORDER BY seq').all('ve_1789956422875_8y9ze78pe')
for (const s of segs) console.log(JSON.stringify({id: s.id, seq: s.seq, status: s.status, shots: s.shot_count, dur: s.duration, est: s.est_duration, video: s.video_path}))
