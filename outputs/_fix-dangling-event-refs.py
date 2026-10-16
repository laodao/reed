#!/usr/bin/env python3
"""
存量悬空引用一次性修复（P0，设计文档 §7-P0.3）
清理 lw_events.involved_entities JSON 中指向已删除实体的残留引用。

用法：
  python3 outputs/_fix-dangling-event-refs.cjs --db <path> --project <projectId> --dry-run
  python3 outputs/_fix-dangling-event-refs.cjs --db <path> --project <projectId> --apply

只删引用，不动任何实体/事件主行；--apply 前先 --dry-run 核对清单。
WAL 模式下与运行中的应用并发安全；建议在应用关闭时执行。
"""
import argparse
import json
import sqlite3
import sys

ROSTER_TABLES = {
    'character': 'lw_story_characters',
    'location': 'lw_story_locations',
    'item': 'lw_story_items',
    'faction': 'lw_project_factions',
    'skill': 'lw_story_skills',
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', required=True)
    ap.add_argument('--project', required=True)
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row

    # 1. 收集各名册现存实体 id
    roster = set()
    for typ, table in ROSTER_TABLES.items():
        try:
            for r in db.execute(f'SELECT id FROM {table} WHERE project_id=?', (args.project,)):
                roster.add((typ, r['id']))
        except sqlite3.OperationalError as e:
            print(f'  [warn] {table} 不可用: {e}', file=sys.stderr)

    # 2. 扫描事件挂载引用
    events = db.execute(
        'SELECT id, name, chapter_number, involved_entities FROM lw_events WHERE project_id=?',
        (args.project,),
    ).fetchall()

    changed = 0
    removed_refs = 0
    for ev in events:
        raw = ev['involved_entities']
        if not raw:
            continue
        try:
            ents = json.loads(raw)
        except Exception:
            continue
        if not isinstance(ents, list):
            continue
        live = [e for e in ents if isinstance(e, dict) and (e.get('type'), e.get('id')) in roster]
        dead = [e for e in ents if isinstance(e, dict) and (e.get('type'), e.get('id')) not in roster]
        if not dead:
            continue
        print(f"  事件 ch{ev['chapter_number']}「{ev['name']}」移除 {len(dead)} 个悬空引用: "
              + ', '.join(f"{e.get('type')}:{e.get('name') or e.get('id')}" for e in dead))
        removed_refs += len(dead)
        if args.apply:
            db.execute(
                'UPDATE lw_events SET involved_entities=?, updated_at=updated_at WHERE id=?',
                (json.dumps(live, ensure_ascii=False) if live else None, ev['id']),
            )
            changed += 1

    print(f"\n扫描事件 {len(events)}：悬空引用 {removed_refs} 处" + (f"，改写事件 {changed} 行" if args.apply else "（dry-run，未写入）"))
    if args.apply:
        db.commit()
        print('已提交。')
    db.close()


if __name__ == '__main__':
    main()
