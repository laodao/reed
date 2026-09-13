import sqlite3, json

db = r'C:\Users\daoge\the-bot\the_bot.db'
con = sqlite3.connect(db)
cur = con.cursor()

src = json.load(open(r'C:\Users\daoge\code\project\the-bot\src\core\database\migrations\builtin-apps\script-to-video.json', encoding='utf-8'))
g = src['graph']
new_graph = json.dumps(g, ensure_ascii=False)
json.loads(new_graph)  # 校验

# 确认 code inputs 数组、tts 有 providerConfigId
for n in g['nodes']:
    if n['type'] == 'code':
        assert isinstance(n['config']['inputs'], list), f"{n['id']} inputs not array"
    if n['id'] == 'tts1':
        print('tts1 providerConfigId:', n['config'].get('providerConfigId'))

cur.execute("UPDATE workflow_definitions SET draft_graph=?, published_graph=?, updated_at=? WHERE id=?",
            (new_graph, new_graph, '2026-09-04T23:50:00.000Z', 'builtin_def_script-to-video'))
con.commit()
print('DB UPDATED. nodes:', len(g['nodes']), 'edges:', len(g['edges']))
# 校验 start 输入含 voiceProviderConfigId
start = next(n for n in g['nodes'] if n['id'] == 'start')
print('start keys:', [i['key'] for i in start['config']['inputs']])
con.close()
