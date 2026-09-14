import sqlite3, json
db = r'C:\Users\daoge\the-bot\the_bot.db'
con = sqlite3.connect(db)
cur = con.cursor()
cur.execute("SELECT id, status, error FROM workflow_runs ORDER BY created_at DESC LIMIT 3")
cols = [d[0] for d in cur.description]
for r in cur.fetchall():
    print(json.dumps(dict(zip(cols, r)), ensure_ascii=False, default=str))
con.close()
