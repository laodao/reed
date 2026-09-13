import sqlite3
con = sqlite3.connect('file:C:/Users/daoge/the-bot/the_bot.db?mode=ro', uri=True)
con.text_factory = lambda b: b.decode('utf-8', 'replace')
cur = con.cursor()
docs = [
    ('5bf8f597-2042-4966-989e-ce6505851353', '深度学习 epub'),
    ('4bf87762-a1e3-424f-8f3f-441dfcd9f341', 'numpy-user.pdf'),
    ('48c7b99f-e63f-42b9-82fb-891f5cf828f7', '公司法 docx'),
]
for did, label in docs:
    cur.execute("SELECT COUNT(*) FROM kb_chapters WHERE document_id=?", (did,))
    chapters = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM kb_chunks WHERE document_id=?", (did,))
    chunks = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM kb_chunks WHERE document_id=? AND section_path IS NOT NULL AND section_path NOT IN ('', '[]')", (did,))
    with_path = cur.fetchone()[0]
    print(f'{label:16} 章节数={chapters:4}  切片数={chunks:5}  带sectionPath={with_path:5}')

print('\n==== 深度学习 epub 章节样本（若有）====')
cur.execute("SELECT level, title FROM kb_chapters WHERE document_id='5bf8f597-2042-4966-989e-ce6505851353' ORDER BY ordering LIMIT 8")
rows = cur.fetchall()
print(rows if rows else '（无章节数据）')

print('\n==== numpy pdf 章节样本（若有）====')
cur.execute("SELECT level, title FROM kb_chapters WHERE document_id='4bf87762-a1e3-424f-8f3f-441dfcd9f341' ORDER BY ordering LIMIT 8")
rows = cur.fetchall()
print(rows if rows else '（无章节数据）')
con.close()