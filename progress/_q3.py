import sqlite3, json

db = r'C:\Users\daoge\the-bot\the_bot.db'
con = sqlite3.connect(db)
cur = con.cursor()

print('== apps：视频/脚本相关 ==')
cur.execute("SELECT id, name, source_kind, source_id, source_version, category, tags, enabled, is_builtin FROM apps WHERE name LIKE '%视频%' OR name LIKE '%脚本%' OR source_id LIKE '%script%' OR name LIKE '%短视频%'")
cols = [d[0] for d in cur.description]
for r in cur.fetchall():
    print(json.dumps(dict(zip(cols, r)), ensure_ascii=False, default=str))

print('\n== designed_voices 音色 ==')
cur.execute("PRAGMA table_info('designed_voices')")
print('cols:', [r[1] for r in cur.fetchall()])
cur.execute("SELECT * FROM designed_voices LIMIT 40")
cols = [d[0] for d in cur.description]
for r in cur.fetchall():
    d = dict(zip(cols, r))
    keep = {k: v for k, v in d.items() if v not in (None, '')}
    print(json.dumps(keep, ensure_ascii=False, default=str))

print('\n== cloned_voices 音色 ==')
cur.execute("PRAGMA table_info('cloned_voices')")
print('cols:', [r[1] for r in cur.fetchall()])
cur.execute("SELECT * FROM cloned_voices LIMIT 40")
cols = [d[0] for d in cur.description]
for r in cur.fetchall():
    d = dict(zip(cols, r))
    keep = {k: v for k, v in d.items() if v not in (None, '')}
    print(json.dumps(keep, ensure_ascii=False, default=str))

con.close()
