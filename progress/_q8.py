import sqlite3, json
db = r'C:\Users\daoge\the-bot\the_bot.db'
con = sqlite3.connect(db)
cur = con.cursor()
cur.execute("SELECT id, status, definition_id, created_at, error FROM workflow_runs ORDER BY created_at DESC LIMIT 6")
cols = [d[0] for d in cur.description]
for r in cur.fetchall():
    d = dict(zip(cols, r))
    print(json.dumps(d, ensure_ascii=False, default=str))
con.close()
