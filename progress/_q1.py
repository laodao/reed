import sqlite3, json

db = r'C:\Users\daoge\the-bot\the_bot.db'
con = sqlite3.connect(db)
cur = con.cursor()

print('== 所有表 ==')
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print(tables)

print('\n== provider 配置表 ==')
for t in tables:
    if 'provider' in t.lower():
        try:
            cur.execute(f'SELECT * FROM "{t}" LIMIT 50')
            cols = [d[0] for d in cur.description]
            rows = cur.fetchall()
            print(f'--- {t} ---')
            for r in rows:
                d = dict(zip(cols, r))
                print(json.dumps(d, ensure_ascii=False, default=str))
        except Exception as e:
            print(f'  err {t}: {e}')

con.close()
