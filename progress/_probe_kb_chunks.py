# 列出知识库中所有 pdf 文档及其所在库、大小、chunk 情况
import sqlite3
con = sqlite3.connect('file:C:/Users/daoge/the-bot/the_bot.db?mode=ro', uri=True)
con.text_factory = lambda b: b.decode('utf-8', 'replace')
cur = con.cursor()
cur.execute("""
  SELECT d.name, d.file_path, d.file_size, d.status, d.chunk_count, kb.name
  FROM kb_documents d
  LEFT JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id
  WHERE d.file_type='pdf' AND d.deleted_at IS NULL
""")
rows = cur.fetchall()
if not rows:
    print('（无 pdf 文档）')
for r in rows:
    print(' | '.join(str(x) if x is not None else '' for x in r))
con.close()