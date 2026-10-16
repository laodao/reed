# 长文写作 & 剧集制作 深度 Review 修复登记（2026-09-14）

来源：对 longwriting（1.35 万行）与 episode-production 新版 6-stage（3.05 万行）+ 前端的深度 review。
全部 P0/P1 经逐行复核定位根源（六类结构性根因），本文件登记修复范围与后续项。

## 结构性根因 → 修复映射

| 根因 | 修复 |
|---|---|
| 平台缺"事务内 scoped"原语 | `BaseRepository.scopedTx`；createMany 家族（storyboard/scene-script/storyboard-keyframe/video-episode）+ temp-asset 裸 SQL + voice 列表 + scene-binding-writer 事务内租户条件 |
| 生成任务生命周期无唯一 owner | `VideoGenerationService.generateVideo` 增加终态回调（后台轮询 75min 出片回写 videoPath）；handler 同步等待 5→30min；片段桥接 10→30min（EP_VIDEO_POLL_TIMEOUT_MS 可配）；启动恢复 generating→error |
| fail-soft 吞错 + "没抛错=成功"粗粒度信号 | ChapterGraphProcessor 步骤级 failedSteps 聚合，全部成功才记内容 hash（此前失败一次永久短路）；清理移到提取成功之后（失败不再丢旧数据） |
| 兄弟序 orderIndex 与"章号=文档序"错配 | 新原语 `platform/services/longwriting/outline-order.ts`（DFS 卷→章→节）；calcChapterNumber/R7 集号/R8 writtenMax/persistChapter 统一迁移 |
| 无 FK 伴生表 + 清理函数已写好但删除入口未接线 | 新建 `purge.service.ts`（项目/实体/章节三级 purge），接线 deleteProject、DELETE_{CHARACTER,LOCATION,FACTION,SKILL,ITEM}、DELETE_OUTLINE、EVENT_DELETE |
| 前端"乐观 ack"无回滚 + deep watch 反模式 | ExcerptPanel/SceneListPanel 等回执再退编辑态；ChapterStage 水位仅成功推进；deep watch 加 hasDirty 门禁；stores 请求序号；监听/interval 泄漏清理 |

## 已修复（本次）

### P0
- [x] 项目删除残留图谱/向量/事件/伏笔/自定义实体（清理函数零调用方）
- [x] ChapterGraphProcessor hash 无条件记录（注释与代码语义相反，失败一次永久短路）＋清理先于提取的丢数据窗口
- [x] EP createMany 家族事务内 user_id=NULL；temp-asset 裸 SQL 漏 user_id；声音库零过滤（跨租户生物特征资产）；scene-binding-writer 事务内裸 id 读写；scene-script props 全表扫描
- [x] 视频异步生成 5min 假超时 + 后台完成不落库（超时口径 5/10/75min 三处统一收敛）

### P1
- [x] 多卷/含节大纲章号系统性错位（orderIndex 兄弟序被当全局序）
- [x] 删旧建新非原子（script.handler 生成/重拆、storyboard-character 全量替换、script-append 追加）
- [x] 导出 ffmpeg 假设全部输入有音轨（volcengine generate_audio=false 实锤无音轨）+ fps 未归一 + SRT 临时文件泄漏
- [x] 关键帧先删后生成（失败丢全部旧帧）、旧图不回收、keyframeCount 无锁 RMW、空 patch 死代码
- [x] generating 中间态无崩溃恢复 + ffmpeg 无超时；temp session/目录无清扫（承诺的 cron 从未实现）
- [x] 下载失败把远程 URL 落 videoPath（签名过期后导出必败）
- [x] 前端三处丢稿（ExcerptPanel/SceneListPanel/ChapterStage 自动保存）；deep watch 覆盖未保存取舍
- [x] 固定 matched 字段错位（恒显示"已修复 0 处"）；AI 填充后 dirty 不复位；ShotPromptEditor/PrototypeImageEditor 泄漏；三 store 请求序号

### 新引入问题
- [x] conflict-gate.acknowledgeConflict 队列外裸 RMW wizardState（与研讨室轮次写并发丢更新）→ 写队列下沉 `wizard-state-rmw.ts`，room-state 委托同队列（导出签名不变）

## 登记后续（本次不修）

1. **EP 全量 scoped 收编**：episode-production service 层 40+ 处裸 repo/裸 SQL 仅按 projectId 过滤（asset-setting-enrichment/asset-project-summary/asset-import/user-asset/reference-video/analysis 等），Web 多租户下均为越权读面；建议按长文标准收编。
2. **图时代表建表补 FK（PG）**：sqlite 靠显式 purge 已闭环；PG 侧建表迁移补 ON DELETE CASCADE。
3. **章节删除后的章号重排迁移**：删章后后续章节数据仍按旧章号键挂（purge 只清被删章）。
4. **R4 技能时间线误报治理**（习得前每章都告警）/ R9 共现补链停用词扩充（对照 v2 扫描器强度）。
5. **前端**：asset.store 失败伪装成空列表、分镜进度逐条全量 reload 防抖、TimelineEditor(V1) 按 sceneId 对齐、v-for index key 清理、其余 store 请求序号。
6. **`ep:delete-uploaded-entity` 死通道删除**（与 standalone 链路失配，前端已无调用方）。
7. 实机验证：导出音轨 ffprobe 探测（generate_audio=false 的 mp4）、视频 30min 长任务后台回填、ffmpeg timeout kill 行为。

## 并行会话冲突记录

- 提交 `8e293d92`（统一事件→实体存储）在我进行中时落库，卷入了当时未提交的 chapter-graph.processor 步骤聚合改动（语义兼容，已核对）；遗留两处类型错误（buildEdges 未使用、graph.service create 参数不匹配）属该提交在途工作，未代修。
