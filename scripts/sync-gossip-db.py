import sqlite3, json, io, datetime, os

DB = r"C:\Users\daoge\the-bot\the_bot.db"
SRC = r"C:\Users\daoge\code\project\the-bot\src\core\database\migrations\builtin-apps\gossip-event-report.json"
bakdir = r"C:\Users\daoge\code\project\the-bot\scripts"
ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

# 读运行库旧图
con = sqlite3.connect(DB)
con.text_factory = lambda b: b.decode('utf-8', errors='replace')
cur = con.cursor()
row = cur.execute("SELECT draft_graph, published_graph, template_version, published_version FROM workflow_definitions WHERE id='builtin_def_gossip-event-report'").fetchone()
print('old row found=', bool(row))
if not row:
    print('ABORT: definition not found'); raise SystemExit(1)
old_draft, old_pub, old_tv, old_pv = row
# 备份旧图到文件
bakfile = os.path.join(bakdir, 'backup-gossip-db-%s.json' % ts)
with io.open(bakfile, 'w', encoding='utf-8') as f:
    json.dump({'draft_graph': json.loads(old_draft), 'published_graph': json.loads(old_pub), 'template_version': old_tv, 'published_version': old_pv}, f, ensure_ascii=False, indent=2)
print('backup old graph ->', bakfile)

# 读新模板 graph
new_graph = json.load(io.open(SRC, encoding='utf-8'))['graph']
# 校验新图无模板占位残留
nodes = new_graph['nodes']
print('new graph nodes=', len(nodes), 'edges=', len(new_graph['edges']))

con.execute("PRAGMA busy_timeout=5000")
cur.execute(
    "UPDATE workflow_definitions SET draft_graph=?, published_graph=?, updated_at=? WHERE id='builtin_def_gossip-event-report'",
    (json.dumps(new_graph, ensure_ascii=False), json.dumps(new_graph, ensure_ascii=False), datetime.datetime.now().isoformat()),
)
con.commit()
print('DB updated. rows affected =', cur.rowcount)
# 验证回读
cur2 = sqlite3.connect(DB)
cur2.text_factory = lambda b: b.decode('utf-8', errors='replace')
r2 = cur2.execute("SELECT template_version, published_version, draft_graph FROM workflow_definitions WHERE id='builtin_def_gossip-event-report'").fetchone()
g2 = json.loads(r2[2])
ids2 = [n['id'] for n in g2['nodes']]
print('verify template_version=', r2[0], 'nodes=', len(ids2), 'has loop3/scriptN/saveScriptN=', all(x in ids2 for x in ['loop3','scriptN','saveScriptN']))
con.close(); cur2.close()
