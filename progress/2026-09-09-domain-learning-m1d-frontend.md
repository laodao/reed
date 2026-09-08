# 领域学习 M1-D：前端接线真实数据（2026-09-09）

## 上下文
承接 M1-C（a0c91a07）。分支 feat/domain-learning。前端由 mock 全量切到后端 dl: IPC（后端已就绪）。

## 本轮完成（子代理执行 + 主代理基线对比验收）
1. `src/preload/index.ts`：新增 domainLearning 命名空间（15 个 dl:* invoke 方法 + onAgentEvent/onStream 订阅返回取消函数）。
2. `src/web/client/channel-map.ts`：补全 domainLearning.* → dl:* 覆盖（Web 端防 kebab fallback 404）。
3. 新建 `src/renderer/src/stores/domain-learning.ts`：Pinia store（spaces/currentSpaceView + fetchSpaces/fetchSpaceView/createSpace/pickNext/ackMastered/ackConfused/fetchAtlasGraph/fetchNodeProfile/sendAgent/cancelAgent/agentBusyOf + 事件订阅生命周期 unsubscribeAll；局部 api() 判空降级）。
4. 视图去 mock：DomainLearningHome / DomainLearningSpace（三栏+门控+右栏 tutor 流式追问+研究按钮）/ DomainAtlas（图+档案）+ SectionLesson/AtlasGraph 类型接共享契约；新建 domain-learning-ui.ts（纯 UI 图例映射）；**删除 mock-data.ts 与 atlas-data.ts**。
5. pack description 去「原型」+ version 0.1.0。

## 验收
- vue-tsc：domain-learning 相关零错误（剩余 MarkdownViewer bytemd css/Viewer 为既有豁免项）；preload/channel-map 各 3/2 处错误经 stash 基线对比为**改动前既有存量**（仅行号漂移）。
- vitest：renderer/packs-registry（12）+ domain-learning-pack（2）+ builtin-packs（5）全绿。renderer 全量 3 个失败文件（app-list / StageHeaderBar / StageHeaderBar-merged）经 stash 基线确认是 agent-harness 合并存量，与本次无关。
- mock 全仓无残留 import。

## 数据源事实（后续 M1-E 关注）
- dl:list-spaces 不填 stats（Home 卡片条件显示进度条）；如需常显可后端补聚合。
- Atlas 页结构索引用空间视图 tree（group 有名称），图本体走 get-atlas-graph（group 无名称）。
- dl:list-questions 已接线但界面经 DlSpaceView.turns/openQuestionCount 消费。

## 状态
M1-D 完成并提交 a7055e06。M1-E 待办：真机纵线验收（需切 better-sqlite3 回 Electron ABI + 重启 dev + 用户 provider key）。未 push。
