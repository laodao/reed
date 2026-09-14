import sqlite3, json

db = r'C:\Users\daoge\the-bot\the_bot.db'
con = sqlite3.connect(db)
cur = con.cursor()

cur.execute("SELECT id, template_version, draft_graph, published_graph FROM workflow_definitions WHERE id='builtin_def_script-to-video'")
row = cur.fetchone()
if not row:
    print('NOT FOUND')
    raise SystemExit
def_id, tv, draft, pub = row
print('template_version:', tv)
print('draft has .url ref:', 'img1.images.0.url' in draft)
print('pub has .url ref:', 'img1.images.0.url' in pub)

new_draft = draft.replace('img1.images.0.url', 'img1.images.0.localUrl')
new_pub = pub.replace('img1.images.0.url', 'img1.images.0.localUrl')
print('after replace draft has .url:', 'img1.images.0.url' in new_draft)
print('after replace pub has .url:', 'img1.images.0.url' in new_pub)

cur.execute("UPDATE workflow_definitions SET draft_graph=?, published_graph=?, updated_at=? WHERE id=?",
            (new_draft, new_pub, '2026-09-04T23:35:00.000Z', def_id))
con.commit()
print('UPDATED')

# 校验 json 合法
json.loads(new_pub)
print('published_graph valid JSON')
con.close()
