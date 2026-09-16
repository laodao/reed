# 数据操作：删除深度学习空间「张量」「自动微分与反向传播」的讲义

日期：2026-09-13
指令：「删除张量和自动微分与反向传播的知识内容」；范围经确认 = **只删讲义卡**（推荐项）。

## 删除前的家底（只读取证：`progress/_dl_concept_assets.cjs`）

| 知识点 | 讲义卡 | 答疑 | 笔记 | 掌握度记录 | 关系边 |
| --- | --- | --- | --- | --- | --- |
| 张量（mastered） | v1 draft、v2 published 共 **2 张** | 3 | 0 | 2 | 5（出边） |
| 自动微分与反向传播 | v1/v2/v3 draft 共 **3 张** | 0 | 0 | 0 | 8（3 进 5 出） |

## 执行（`progress/_dl_purge_lessons.cjs`，默认 dry-run，`--apply` 才写库）

1. **先备份**：`VACUUM INTO` 在线一致快照 → `C:\Users\daoge\the-bot\the_bot.db.bak-purgeLessons-2026-09-13-15-07-07`（626.1 MB，回滚用）；
2. **事务内删除**：
   - `DELETE FROM dl_card WHERE concept_id IN (张量, 自动微分与反向传播)` → **5 行**；
   - `UPDATE dl_concept SET card_id=NULL, research_state='unresearched'`（`mastery` 不动）→ **2 行**；
3. **保留不动**（脚本里做了数量断言）：关系边 12 条、答疑 3 条、掌握度记录 2 条、笔记 0 条。

## 复核（独立只读脚本，非同一脚本自证）

- `progress/_dl_concept_assets.cjs`：两个知识点 `讲义卡 0 张`、`card_id=null`、`research_state=unresearched`；关系边 5 / 8 条、答疑 3 条、掌握度 2 条**仍在**；
- `progress/_dl_lesson_shape_summary.cjs`：深度学习空间已不出现在"有讲义的空间"列表里（本空间讲义合计 **0 张**）。

## 删除后的界面表现与重新生成

- 中栏对这两个知识点显示「讲义待研究」+「**研究此概念**」按钮（`DomainLearningSpace.vue:338`），也可点顶部「继续学习 →」（`:16`，走 `dl:pick-next` 推荐顺序）；
- 本研究空间的自动推进**未开启**（`dl_project.pace_settings=null`），所以不会自己偷偷重新生成；重新研究时会按新的讲义区集契约产出统一的区集与独立 `answers` 区；
- 界面若还显示旧讲义，切换一次空间或刷新页面即可（讲义是按需读库，没有常驻缓存）。

## 顺带记下的产品缺口（未做，等指令）

应用里**没有"删除/重新生成讲义"的入口**（IPC 层只有删笔记与删空间，`DlCardRepository` 也没有 delete 方法），所以这次是数据层一次性清理。
若要常态化，建议补：`DlCardRepository.deleteByConcept` + `dl:delete-card` IPC + 中栏「重新生成讲义」按钮（删草稿或全部版本可选），并配套单测。
