# 领域共学空间 M2-B 进度记录:研究宿主采集扩展 + 未解问题自动开子研究

日期:2026-09-08 · 分支 feat/domain-learning · 依据 m2-implementation-plan.md §2 M2-B

## 完成内容

1. **绑定组装纯模块** `services/dl-agent-bindings.ts`(新增,纯函数 TDD):
   - research 模式 bindings = dl_* 动作(带 maxCalls)+ 读工具 + 系统透出;tutor 模式保持 M1(只动作+透出,防工具滥用);
   - 常备读工具:`wf_kb_retrieve`(KB 检索)/ `wf_web_extract`(网页正文)/ `http_get`(API/原文,含 arXiv);`web_search` 仅在「配置了默认联网搜索源」时 bind(无源不假装可搜索);
   - 读工具频控 `DL_READ_TOOL_MAX_CALLS`(kb4/web3/http4/search3);registry 缺失工具名按可用集过滤(buildToolDefs 对未注册仅 warn,这里显式交集更可控)。
2. **宿主 doSend 装配**(dl-agent-harness.service.ts):每轮按模式查 registry 可用工具 + `searchEngineConfigs.getDefault()` 判 web_search 可用性;快照文本追加 `researchSourceHint`;`focusQuestionId` 聚焦未解问题 → 加载问题写入 `【待研究问题】` 聚焦块并注入 runtimeContext.questionId。
3. **动作层兜底**(dl-agent-actions.ts / dl-agent-tools.ts / types):`DlAgentExecutionContext.questionId`;模型调 dl_answer_question 可省 questionId,宿主聚焦问题 id 自动回填(开子研究可靠落答案到原问题)。
4. **研究提示词升级**(dl-agent-deps.ts):采集纪律(先用 source-collector 规划;知识库优先;arXiv 用 http_get 打 export.arxiv.org/api/query;无 web_search 不得假装搜索;evidence 必须来自实读资料);未解问题研究路径(找到答案必 dl_answer_question 存档并把支撑沉淀卡片,仍无据保持 open 说明缺口);新三研究 skill(source-collector/question-generator/relation-miner)纳入技能调用面。
5. **IPC/前端接线**:dl:agent-send 增可选 `focusQuestionId`(handler/preload/store 类型同步;channel-map 无需动)。

## 测试与回归

- 新增 `dl-agent-bindings.spec.ts`(5:research 全读工具/web 可用、无源不 bind web_search、缺失工具过滤、缺省不过滤、tutor 无读工具)+ `dl-agent-deps.spec.ts`(3:提示词纪律 token、source hint 两分支、聚焦块)+ actions 增 1(questionId 兜底回填 answered)→ 13 passed;
- 回归:dl 全套 8 文件 44 passed;tests/unit/packs 46 passed(1 失败为 workflow-pack 前缀断言存量问题,与本次无关;pack.service postgres 套件需 SKIP_PG);
- 定向 tsc:本次改动文件零新增类型错误(存量错误为 preload 其它行 arity 与 renderer vue 模块解析,均非本 M2-B 引入)。

## 变更文件

- 新增:`services/dl-agent-bindings.ts`、`tests/unit/core/packs/domain-learning/dl-agent-bindings.spec.ts`、`dl-agent-deps.spec.ts`
- 修改:`dl-agent.types.ts`/`dl-agent-deps.ts`/`dl-agent-tools.ts`/`dl-agent-actions.ts`/`dl-agent-harness.service.ts`/`handlers/domain-learning.handler.ts`/`src/preload/index.ts`/`stores/domain-learning.ts`/`tests/.../dl-agent-actions.spec.ts`

## 说明(ABI 基建)

better-sqlite3 当前为 Electron ABI;本里程碑及后续单测统一用工作区既有的 `node scripts/vitest-electron.cjs`(ELECTRON_RUN_AS_NODE=1)运行,无需切换重建。该基建改动(scripts/vitest-electron.cjs + package.json scripts + code-nodes 门禁 + 两个 spec 适配)仍为未提交工作区状态,待用户决定是否作为独立基建提交。

## 下一步

- M2-C:周期推进调度器 DlSchedulerService(dl_project pace_settings + 包内单例 + 注入 timer + 节流/busy 互斥)。
