import sqlite3, json

db = r'C:\Users\daoge\the-bot\the_bot.db'
con = sqlite3.connect(db)
cur = con.cursor()

def dump_columns(table):
    cur.execute(f'PRAGMA table_info("{table}")')
    return [r[1] for r in cur.fetchall()]

print('== workflow_definitions 列 ==')
print(dump_columns('workflow_definitions'))

print('\n== workflow_definitions 全部 ==')
cur.execute("SELECT * FROM workflow_definitions ORDER BY created_at")
cols = [d[0] for d in cur.description]
for r in cur.fetchall():
    d = dict(zip(cols, r))
    keep = {k: v for k, v in d.items() if v is not None}
    print(json.dumps(keep, ensure_ascii=False, default=str))

print('\n== 内置应用相关 ==')
tcols = dump_columns('apps')
print('apps cols:', tcols)
cur.execute("SELECT * FROM apps WHERE name LIKE '%脚本%' OR app_id LIKE '%script%' OR name LIKE '%视频%'")
cols = [d[0] for d in cur.description]
for r in cur.fetchall():
    print(json.dumps(dict(zip(cols, r)), ensure_ascii=False, default=str))

print('\n== 音色 ==')
for t in ('designed_voices', 'cloned_voices'):
    try:
        c = dump_columns(t)
        cur.execute(f'SELECT * FROM "{t}" LIMIT 30')
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        print(f'--- {t} ({len(rows)}) cols={c} ---')
        for r in rows:
            d = dict(zip(cols, r))
            keep = {k: v for k, v in d.items() if v not in (None, '')}
            print(json.dumps(keep, ensure_ascii=False, default=str))
    except Exception as e:
        print(f'  err {t}: {e}')

con.close()
