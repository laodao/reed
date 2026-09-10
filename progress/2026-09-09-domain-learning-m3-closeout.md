# 领域共学空间 M3 收口:真机纵线复核(2026-09-09)

分支 feat/domain-learning;M3 里程碑 A/B/C 均提交(11b9f2e2 / e67c00bc / 2fd9fea6),本记录汇总收口复核。

## 里程碑回放(每项均已单测+真机)
- M3-A 遗留修复:discover keyword 命中面/匹配总数、invoke_skill 必填参数契约(结构化报错自纠)+渲染缺失告警、研究快照「目录分组」归属引导、agent-harness 冒号缺口书面交接。system-agent-tools 20 passed。
- M3-B 间隔复习:review_settings 列/规则/服务(listReviewDue/reviewDone/markReview)、dl:* IPC、空间设置复习组+到期队列(开始复习=agent tutor/完成/标需复习)。rules+graph 新增 5、dl 47→48 passed;真机队列/完成/刷新/持久化通过。
- M3-C 统计与导出:dl:get-space-stats + buildLessonDigest(讲义合集 md)、统计 popover、导出讲义(md 下载)、导出 PNG(svg 样式内联→canvas 2x)。view TDD 2、dl 全套 48 passed;真机 stats/digest 通过。

## 收口真机复核(本记录,CDP)
- Atlas 顶栏按钮齐全:全图 / 空间设置 / **统计** / **导出讲义** / **导出 PNG** / 回到讲义空间;
- 「统计」popover 5 行快照:概念 6(已掌握 2 · 未开始 4)/讲义 7(草稿 7)/关系 5(前置 5)/问答 10(已答 8 · 未解 2)/复习到期 1 —— 数据与库一致;
- 「导出 PNG」下载捕获成功:`图谱-验收·贝叶斯入门.png`(download 无失败)——svg 克隆+样式内联+canvas 路径可用;
- 「空间设置」弹层含三组:领域画像(侧重 chips)/自动推进(M2-C)/间隔复习(M3-B),复习到期队列 1 项展示正常。

## 遗留与后续
- 联网自动出卡 legs(M2-F 记录)待可出网环境复验;PDF 导出评估与模板可视化编辑另立 M4;
- 复习/统计等新列对既有库的 ensureColumn 升级在各次重启 boot 均无报错。

## 变更
- 仅收口验收脚本于 progress/(不入库):_m3_close_probe.js、_m3c_probe_stats.js、_m3b_probe_review.js 等。

## 结论
M3 三里程碑实现与真机复核全部达成;push 待用户指令。
