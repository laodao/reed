import sqlite3, json

db = r'C:\Users\daoge\the-bot\the_bot.db'
con = sqlite3.connect(db)
cur = con.cursor()

cur.execute("PRAGMA table_info('workflow_node_runs')")
print('cols:', [r[1] for r in cur.fetchall()])

cur.execute("SELECT node_id, status, error, input_json, output_json, duration_ms FROM workflow_node_runs WHERE run_id='wfrun_1788565249114_ita19l5qc' ORDER BY rowid")
cols = [d[0] for d in cur.description]
for r in cur.fetchall():
    d = dict(zip(cols, r))
    print('='*70)
    print('node:', d['node_id'], '| status:', d['status'], '| err:', (d['error'] or '')[:200])
    print('-- input_json --')
    if d['input_json']:
        print(str(d['input_json'])[:1500])
    print('-- output_json --')
    if d['output_json']:
        print(str(d['output_json'])[:1500])

con.close()
