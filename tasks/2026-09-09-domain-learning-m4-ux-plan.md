# M4-UX 需求落地清单(领域共学空间 阅读与答疑体验)

用户 2026-09 提出 8 条 UX 需求(在 M4 范围内作为独立子里程碑,先于 M4-A 剩余平台项执行;真伪核验与 PPT 范围经用户拍板)。

## 子里程碑与口径

### M4-UX1 讲义正文选区交互 + 右侧答疑面板
1. **选中即提问**:讲义正文选区浮出「提问」icon → 点击把选中文本填入右侧答疑输入框(触发 tutor 追问,问题带上文/出处);
3. **选中做笔记**:同浮层提供「做笔记」→ 弹小输入框(预置选区原文),存概念级笔记(选区锚:原文快照+可带起止偏移);
4. **气泡不溢出**:答疑气泡 `overflow-wrap:anywhere/word-break` + 长消息折叠;
5. **答疑面板加宽**:右侧窗格加宽(预设比例+必要时可拖拽);
6. **收藏回答**:答疑气泡「收藏为笔记」把该 Q&A 存为笔记(引用 questionId/conceptId,source='qna');
数据:新增 `dl_note`(project/concept 归属、source selection|qna、anchorText、questionId、content_md、created_at;3NF,多租户 ALS)。

### M4-UX2 后端自动内容核验(用户拍板:不向用户展示验证过程)
- 目标:提升讲义质量、减少出错;验证只由 **AI 交叉检查 + KB/联网权威内容对质**,后端执行;
- 数据:dl_card 增 `verification` json(内部):{status: 'unverified'|'verifying'|'verified'|'needs_review', issues:[{claim, verdict, reason, sourceRef}], checkedAt};默认 null=未核验;
- 执行:讲义卡落库(draft 生成)后异步触发核验(基于 agent-harness 的独立核验会话:读卡内容 → KB(wf_kb_retrieve,按空间 kbId)→ 联网(http_get/extract/arxiv;web_search 有默认源)→ 交叉检查逐条存疑点 → 写 verification;存在高危错误时回写 draft 并标注内部 needs_review,不向用户展示细节);
- 环境:离线时核验退化为「KB 交叉+模型自检并如实标注 unverified/needs_review」,联网自动增强;
- 不做用户侧"查证按钮/可信度告知"UI。

### M4-UX3 图文并茂 + HTML 幻灯片在线浏览
- 讲义渲染已支持图/表/KaTeX/代码块,保证布局;
- 新增「生成 PPT」:取概念集/分支讲义 → 服务端或前端按讲义 md/区集分页为 HTML 幻灯片(每页:标题+要点+图/公式/表),在线浏览/全屏;不新增 .pptx 导出(用户拍板 HTML 在线优先)。

### M4-UX4 文案收敛(第 8 条)
- 收敛界面描述性长文案:图例/空态/提示条/向导文案精简为必要信息,保留最少必要提示;多语言/文案集中以 domain-learning-ui 与 shared 为准(不逐页散写)。

## 顺序
UX1 → UX2 → UX3 → UX4(各自 TDD/回归+提交汇报),随后回到 M4-A 剩余(P1-2 registry 别名、P1-5 通知、P1-6 拆组件、其余 P2)。真机离线环境按各子里程碑记录复验面。
