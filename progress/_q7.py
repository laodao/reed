import sqlite3, json
db = r'C:\Users\daoge\the-bot\the_bot.db'
con = sqlite3.connect(db)
cur = con.cursor()
cur.execute("SELECT draft_graph, published_graph FROM workflow_definitions WHERE id='builtin_def_script-to-video'")
row = cur.fetchone()
draft, pub = json.loads(row[0]), json.loads(row[1])
print('draft code inputs 数组:')
for n in draft['nodes']:
    if n['type'] == 'code':
        print(' ', n['id'], isinstance(n['config']['inputs'], list))
print('draft vid1.image:', next(n['config']['image'] for n in draft['nodes'] if n['id'] == 'vid1'))
print('pub vid1.image:', next(n['config']['image'] for n in pub['nodes'] if n['id'] == 'vid1'))
con.close()
