# 工作流 A+B 批交付报告（用户离线期间自主推进）

> 日期：2026-08-18 ｜ 分支 feat/workflow-engine ｜ A+B 全部 11 项交付，129/129 全绿

## 交付清单（6 个提交）

| 片 | 提交 | 内容 | TDD 抓出的引擎缺陷 |
|----|------|------|--------------------|
| A1 | c8fa41eb | sys 变量/条件运算符(regex·starts·ends)/maxNodeRuns 护栏/start select 参数 | ① 失败中止被误判用户取消（同步置位 pendingFailureError）② 重试期间被静默收敛误 finalize（pendingRetries） |
| A2 | c1854968 | kb-qa（RAG 一体：检索+context 拼接+生成+sources）/ report（markdown/docx 落盘+前端打印导出） | — |
| A3 | 4c91c72d | 审核三模式：choose（选项路由，复用 branch 边）/ input（文本编辑提交）/ review 不回归；P1 校验器放行 + P2 白名单放行 | ③ 续驱在任务在飞时 finalize → 后续节点被误标 cancelled |
| A4 | (本批) | RunInputForm 运行表单化（5 类型+必填+默认值）/ VariablePicker 变量选择器（sys/start/节点输出，光标插入+兜底） | — |
| B5 | (本批) | 编辑器试运行抽屉（画布节点实时着色）/ LLM 视觉模式（toImageDataUrl 三形态归一化——P6） | — |
| B6 | (本批) | 4 份内置模板（RAG/批量翻译/审核流/定时摘要）+ 从模板创建入口；模板单测（P11） | — |

## 评审修正案落地核对

| 修正项 | 落地片 | 状态 |
|--------|--------|------|
| P1 choose×校验器冲突 | A3 | ✅ 4 用例 |
| P2 input×白名单冲突 | A3 | ✅ 2 用例 |
| P3 report Web 端边界 | A2 | ✅ markdown+前端打印 |
| P4 kbQaContextMaxChars 常量 | A2 | ✅ |
| P5 maxNodeRuns 计数语义 | A1 | ✅ 专测（重试 maxNodeRuns=1 不误杀） |
| P6 imageInput 归一化 | B5 | ✅ |
| P7 sys 保留字/遮蔽 | A1 | ✅ |
| P8 required 类型感知 | A1 | ✅ |
| P9 inputs-list 随 A1 | A1 | ✅ |
| P10 光标插入兜底 | A4 | ✅ |
| P11 模板单测 | B6 | ✅ 4 用例 |
| P12 验收步骤 | 各片提交含验收 | ✅ |

## 引擎缺陷修复汇总（3 项，均为潜伏竞态）

1. 未恢复失败同步置位（失败中止 vs 用户取消区分）——A1
2. 重试等待期间禁止静默收敛（重试后失败误报 succeeded）——A1
3. 续驱等 settled 信号（任务在飞时 finalize 误标后续节点 cancelled）——A3

## 组件总数

24 → 26（kb-qa + report）。一致性自检全绿。

## 待续（任务清单）

C1 成环（先细化设计评审）→ C2 对话集成 → C3 REST API → C4 临时知识库 → C5 OAS → D1 QA 知识库 → D2 rerank → D3 权重暴露


---

# 增量：C1 成环交付（2026-08-18，提交 cc505794 + 9221ffbd + 5824f7f9）

## 深审修复（A+B 批复查，12 项发现中 6 项修复）

- pendingFailureError 类型声明（编译级）/ choose 模式 reject 死锁 / kb threshold 下游虚设
  （KB search 落实 score 过滤）/ vision 多图只取一张且不浪费 IO / provide 数组快照失同步 → ref / toImageDataUrl base64 字符集守卫 / DEBUG 日志清理

评审确认真实完成清单：kb-qa 8 字段、report 3 字段全接线；choose/input 引擎级真驱动；
maxNodeRuns 计数语义实证；试运行抽屉前后端接线一致；架构纪律齐整。

## C1 成环（134/134 全绿）

边激活序号机制（activationSeqs + completedSeq）实现"完成后新激活→重执行"语义；
校验器环检测降为警告；loop 节点豁免（驱动器管理）。TDD 抓出四项交互缺陷（审核决策/fail-recovered
漏记序号、护栏被 fail 边恢复死循环、loop 被旧激活拉回）全部修复。

语义变更（有意）：多入边节点的后续到达触发新一轮（Bisheng '连线即流程图'）。

## 待续

C2 对话集成 → C3 REST API → C4 临时知识库 → C5 OAS → D1 QA 知识库 → D2 rerank → D3 权重

---

# 增量：C3 REST API + override + 免登录分享页（2026-08-18，2 个提交）

## C3a 引擎 override + REST（invoke/stop/SSE）

- `ExecuteRunInput.configOverrides`：launchNode 模板解析**前**浅合并（override 值支持模板引用），不修改定义图
- `POST /api/workflow/invoke/:definitionId`（JWT）：inputs + override 透传，triggerInfo.source=api
- `POST /api/workflow/run/:runId/stop`：租户校验（他人 404 不泄露存在性）
- `GET /api/workflow/run/:runId/events`：SSE——web-event-emitter 新增服务端 `tapEvents`（不依赖 WS 在线），
  ALS userId + runId 双重过滤；连接先推 snapshot（晚订阅不丢终态）；终态推 done 关流；25s 心跳
- 测试 11 个：override 生效/零回归/模板、invoke 透传/401/400、stop 租户、SSE 过滤/终态关流/快照

## C3b 分享令牌 + 免登录独立页

- `workflow_definitions.share_token` 列 + 唯一索引（双语种幂等迁移，双端注册）；256bit hex 令牌不可枚举
- 服务层 enableShare（仅已发布；幂等）/ disableShare（链接立即失效）/ getByShareToken（形态守卫）
- Guest REST（免登录）：GET /share/:token（元信息+输入 schema）、POST invoke（**以定义所有者身份**运行，
  禁 override）、GET SSE（token↔run 配对校验 + 快照脱敏不回传 userId）
- IPC：wf:enable-share / wf:disable-share 三处接线（handler/preload/channel-map）
- 前端：编辑器"分享"按钮（复制链接/停止分享）；`/workflow-run/:token` 免登录页（RunInputForm 复用 +
  EventSource 实时节点状态 + 终态快照取结果）；main-web 访客路由白名单跳过登录门
- 顺带修复：B6 模板导入 `@renderer` 别名错误（构建阻断级）
- 测试：分享服务 5 个 + 路由 share 组 6 个，合计 152 全绿；electron-vite build 通过

## 待续

C4 临时知识库 → C5 OAS → D1 QA → D2 rerank → D3 权重 → C2 对话集成（用户要求最后做）

---

# 增量：C4 临时知识库 + C5 OAS 自定义接口（2026-08-18，2 个提交）

## C4 临时知识库（spec v2 §4）

- 前置：`WorkflowNodeContext.triggerInfo` 暴露（ExecuteRunInput → buildContext；续跑继承源运行 triggerInfo 并加 resumedFrom）
- `dialog-file-retriever`（core）：collectDialogFileTexts（扫对话 document 附件 → extract-text 现场解析，去重/单文件降级）+
  retrieveFromDialogFiles（800/100 分块 + CJK 双字滑窗 TF 打分，score=occ/(occ+1) 与余弦同量纲）
- kb-retrieve / kb-qa：`includeDialogFiles` 开关（默认关，向后兼容）→ 命中带 `source:'dialog-file'` 合并输出/context/sources；
  无 dialogId 警告降级
- 测试 10 个（收集/去重/降级/分词/打分/topK/入口降级/目录契约/triggerInfo 透传）

## C5 OAS 自定义接口（spec v2 §5）

- `@shared/utils/openapi-parser`（纯函数双端共用）：Swagger 2.0（host/basePath）+ OpenAPI 3（servers）；
  listOperations / listParameters / buildRequest（path 替换、query 拼接、header 并入、未声明参数进 JSON body、$ref 拒绝）
- `http-fetch.ts` 抽出共享执行（超时封顶/取消合并/统一输出形状），http-request 改用（去重）
- `oas-tool` handler：校验（spec 合法/operation 存在/必填参数）→ buildRequest → executeHttpFetch；附加 headers（鉴权头）
- 表单：`oas-operations`（本地解析接口下拉）+ `oas-params`（「按接口定义生成」参数行 + 必填提示）
- 测试 10 个（解析合法/非法/组装 GET/POST/Swagger2/覆盖/$ref/handler 校验/执行 mock fetch/目录表单契约）
- 组件总数 27（+oas-tool）；173 全绿；electron-vite build 通过

## 待续

D1 QA 知识库 → D2 rerank → D3 权重 → C2 对话集成（最后）

---

# 增量：D1/D2/D3 知识库模块批次（2026-08-18，3 个提交）

## D1 QA 知识库（spec v2 §8）

- `kb_qa_pairs` 表（双语种幂等迁移）+ KbQaPairRepository（双端数据库管理器接线）
- 服务：addQaPair/updateQaPair/deleteQaPair/listQaPairs/searchQa/importQaPairs(xlsx)/exportQaPairs(xlsx base64)
- 向量化：question+相似问题全部入 IVectorStore（chunkId 命名空间 `qa:<pairId>:<i>`）；
  变更时确定性重建（按旧变体数枚举删除）；searchQa 按 pair 去重取最高分变体
- kb-qa 节点双路径：先 QA 直出（阈值缺省 0.75 比 RAG 更严）→ 未命中走 RAG（Bisheng 双路径）
- 前端：KnowledgeBase 页加 文档/QA tab 切换 + QA 表格 CRUD + xlsx 导入导出（saveBlobAs）
- IPC：kb-qa:* 7 通道三处接线；删 KB 级联 QA 对

## D2 rerank（spec v2 §9）

- `knowledge_bases.rerank_config` 列（JSON {providerConfigId, modelId}；null=关）
- search 后 applyRerank：兼容 Jina/Cohere `results:[{index,relevance_score}]` 与 bailian `output.results`
  两种响应；失败降级原序不阻断；`useRerank:false` 强制关
- getRerankModels + 编辑知识库对话框 rerank 模型下拉；kb-retrieve/kb-qa `useRerank` 开关（默认开）
- 修复：C4 提交时 kb-retrieve 的对话附件合并被编辑器缓冲区回写丢失——本批补回

## D3 混合检索权重（spec v2 §10）

- 调研修正：vectorWeight 此前仅类型存在、从未实现——本批真实现
- BM25 关键词路：复用入库时写的倒排索引（jieba 分词；停用词提取为 INDEX_STOP_WORDS 唯一源，
  建索引与查询同源 tokenizeForIndex）；k1=1.2/b=0.75
- 融合：候选并集，两路各自按最大值归一后 `w*vec + (1-w)*bm25`；w=0 跳过嵌入调用（省 API）；
  索引缺失/无命中降级纯向量
- kb-retrieve/kb-qa 表单 vectorWeight 滑杆（0=纯关键词~1=纯向量，默认 1 向后兼容）

## 测试与验证

- 新增 23 个测试（QA 8 + 双路径 3 + rerank 5 + 混合 5 + 此前批次增量），全量 247 全绿
- electron-vite build 通过；tsc 新改动文件零错误

## 待续

C2 对话集成（最后一片）

---

# 增量：对抗 review 修复批次（2026-08-19）

三个对抗性 review 代理逐条深读调用链后提出 ~40 项发现，按严重度全部修复高危/中危（251 全绿，构建通过）：

## 高危（上线阻断级）
- **H1** kb_qa_pairs 迁移 PG 分支 datetime→timestamp（原样会导致 Web 端启动即崩）
- **H2** bailian rerank 请求体改嵌套 {model,input:{query,documents},parameters}（原扁平体必 400 静默失效）；默认模型 gte-rerank→gte-rerank-v2；回归测试锁定两形态
- **H3** threshold 语义回归：阈值改在原始余弦上过滤（原归一化使 top-1 恒 1.0 拦不住）；回显 score 用原始分
- **H4** QA 向量污染文档检索：召回后剔除 qa: 命名空间 + 补偿多召回
- **H5** 删 KB 时 QA 向量泄漏：按变体枚举逐条删除
- **#1** 分享执行草稿图：StartRunInput.usePublishedGraph，访客只跑 publishedGraph
- **#2** 匿名 invoke 无限流：每 token 滑动窗口（60s/6 次，429）
- **#5** defaultValue 合并值未进引擎：launch 改传 mergedInputs

## 中危
- **#3** SSE 订阅窗口漏终态竞态：订阅后复查 run 状态兜底；顺带抽 streamRunEvents 共享函数消除 authed/guest 重复
- **#7** guest 快照脱敏：nodeRuns 白名单（input 不回传——模板解析后含所有者内部配置）
- **M1** addQaPair 嵌入失败回滚孤儿行
- **M3** BM25 长度归一：tf/avgLen 代理→chunk 真实分词长度（标准公式）
- **M4** getEmbeddingModels/getRerankModels 复制粘贴→listModelsByType
- **M5b** QA 直出阈值与 RAG threshold 解耦（固定常量）
- **F1** dialog 命中合并策略：dialog 优先 + 整体截断 topK（原"同量纲可比"不成立，kb-qa 截断系统性牺牲附件命中）
- **F2** 附件解析 run 级缓存（16 条 LRU；多 kb 节点不重复解析 PDF）
- **F10** OAS path-item 级 parameters 合并（原共享参数写法完全被忽略）
- **F11** 参数按声明类型转换（number/integer/boolean；原 JSON body 全字符串）

## 低危
- F4 扩展名回退 filePath / F6 documentId 用 filePath / F8 'document' 常量 / F5 真实 Message 类型
- F9 path 参数 replaceAll / F12 base URL scheme 校验 / F13 重复 operationId 消歧 / F14 query.size 兼容
- F16 生成参数保留自由参数 / F19 模板值跳过必填校验 / topK 默认值唯一计算点 effectiveTopK
- 'manual' 字面量收敛 WORKFLOW_TRIGGER_TYPES

## 明确不修（记录理由）
- 分享可设总次数/有效期（产品级增强，待用户需求）；M2 vectorCount 并发漂移（单用户桌面场景无并发写）；M5 双嵌入（需 searchQa 返回向量重构，C2 时一并做）；M6 FK CASCADE（应用层级联已闭环，SQLite 迁移加 FK 成本高）；spec 路径回写（实现为 invoke/:id 更 RESTful，spec 文档随 C2 一并更新）
