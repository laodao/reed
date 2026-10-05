const db = require('better-sqlite3')(process.env.HOME + '/.config/the_bot/the_bot.db', {readonly: true})
console.log(db.prepare('SELECT video_path FROM ep_video_segments WHERE id=?').get('evs_1789957188699_wjrv1ywu0').video_path)
