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
