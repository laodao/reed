# 高频 AI 工作流应用设计文档（11 个候选，已移除 2 个）

> 日期：2026-08-23
> 前置：`progress/2026-08-23-ai-high-frequency-workflows-research.md`（两轮调研）
> 原则：全部复用现有工作流引擎节点；无法用现有节点实现的场景单独标注"需扩展能力"；严禁写死/假数据；用户确认后再实施。

## ⏸️ 实施状态（2026-08-23 用户确认）

| 场景 | 状态 |
|---|---|
| 5 💻 代码审查 | **已记录完整方案（git 增量 review + 全量评估 + Rubric），暂缓实施** |
| 6 🌐 翻译本地化 | **移除**——项目已有完整「文档翻译」应用（Translate.vue + 文本/文件翻译 + 翻译历史），重复 |
| 12 🧾 合同审查 | **移除**——用户确认难度大不做 |
| 其余 10 个 | 方案已完成深度审查（见 §七），修订后待用户确认实施 |

## 七、方案深度审查结论（10 场景，2026-08-23）

> 审查维度：流程合理性（节点能否真实连通）、可行性（引擎能力/硬约束/数据转换）、表单易用性（字段类型/互斥/必填/默认值）。
> 引擎硬约束（已核实源码）：**嵌套循环禁止（V1）**；**parallel-merge 仅用于 parallel 分支**；**start 表单不支持"二选一/三选一必填"互斥校验**；模板变量支持数字下标 `{{node.arr.0.url}}`。

### 7.1 共性问题（跨场景）

| # | 问题 | 影响场景 | 修订 |
|---|---|---|---|
| C1 | `(条件?)` 伪代码不可行：引擎无隐式条件执行，必须显式 `condition` 节点 | 会议纪要、学习笔记、播客 | 每处补充 condition 节点与分支边设计 |
| C2 | start 表单无互斥必填校验（"二选一/三选一"） | 会议纪要(audio/text)、学习笔记(text/url/source) | 流程内 condition 兜底 + 前端提示文案 |
| C3 | `parallel-merge` 误用：loop 自带 `results` 聚合，无需 parallel-merge | 行业调研、竞品分析 | 删除 parallel-merge，直接消费 `{{loopN.results}}` |
| C4 | 长文本超限：textarea 输入可能远超单次 llm-chat 上下文 | 数据分析(data)、简历(resume) | validation 加 maxLength 限制 + 提示；或分块设计 |
| C5 | 嵌套循环被禁止（V1） | 竞品分析（原设计双层 loop） | 扁平化为单层 loop + 分组聚合 |
| C6 | 文本→数组转换缺失：textarea 无法直接作为 loop.listExpression | 竞品分析(competitors) | 增加 code 节点或 assign 转换 |
| C7 | select-dynamic 来源不足：无"全部资产"与"音色列表" | 学习笔记(source)、播客(hostVoice/guestVoice) | 需扩展 select-dynamic source 或改表单类型 |

### 7.2 场景级审查结论

| 场景 | 结论 | 关键修订 |
|---|---|---|
| 1 会议纪要 | ⚠️ 可行，需补分支 | audio/text 用 condition 分流；两空兜底报错；加"合并文本"assign 节点 |
| 2 周报 | ✅ 可行 | 无 |
| 3 邮件 | ✅ 可行 | human-review editableFields 输出引用按 `{{review1.<key>}}` |
| 4 简历 | ✅ 可行 | 长简历加 maxLength 提示；三段 llm 复用原文注意 token 成本 |
| 7 知识提炼存日记 | ⚠️ 重定位后可做 | 原学习笔记重定位；需新增 save-diary 节点 + select-dynamic 日记文件夹来源 |
| 8 数据分析 | ⚠️ 可行，需限输入 | data 加 maxLength（如 100KB）+ 提示；第二段洞察输入 = 概览+原始数据子集 |
| 9 行业调研 | ⚠️ 可行，删冗余 | 删 parallel-merge；loop 结果数组直接进综合 llm-chat |
| 10 电商海报 | ⚠️ 依赖扩展 | image-gen 补 referenceImages；save-asset 引用 `{{img1.images.0.url}}` |
| 11 文章转播客 | ❌ 需 redesign | 音色选择 source 缺失；双角色 TTS 需拆两个 loop 或标注音频合并扩展 |
| 13 竞品分析 | ❌ 需 redesign | 嵌套循环不可行 → 扁平单层 loop；competitors 文本→数组；删 parallel-merge |

**已移除**：6 翻译（已有「文档翻译」应用）、12 合同审查（用户确认不做）。

（各场景修订详情见对应小节【审查修订】）

---

## 一、总览

### 1.1 设计约束（引擎能力核对结论）

| 能力 | 现状 | 结论 |
|---|---|---|
| llm-chat（文本生成/JSON 解析） | ✅ 现有 | 直接用 |
| web-search（联网搜索） | ✅ 现有 | 直接用 |
| translate（多语言互译） | ✅ 现有 | 直接用 |
| stt（语音识别，超长分段） | ✅ 现有 | 会议纪要可用 |
| tts（语音合成） | ✅ 现有 | 播客/配音可用 |
| voice-clone（声音克隆） | ✅ 现有 | 播客主播音色 |
| image-gen（图像生成） | ✅ 现有，**但节点 config 无参考图参数** | 电商海报需扩展 |
| report / report-image | ✅ 现有 | 输出报告/长图 |
| save-asset / read-asset | ✅ 现有 | 成果落库 |
| human-review / form-collect | ✅ 现有 | 人工审核/中途填表 |
| loop / condition / parallel | ✅ 现有 | 多轮搜索/分支 |
| web-extract（网页正文） | ✅ 现有 | 网页输入 |
| crawl-news（新闻抓取） | ✅ 现有 | 资讯类 |
| kb-retrieve / kb-qa | ✅ 现有 | 知识库增强 |

**需扩展能力的场景（唯一）**：电商海报/主图生成需要 `image-gen` 节点支持参考图（referenceImages），
否则只能文生图（效果打折）。扩展方案见 §4.2。

### 1.2 候选清单（11 个，2 个已移除）

| # | 名称 | 类别 | 用户场景 | 核心节点 | 需扩展 |
|---|---|---|---|---|---|
| 1 | 📝 会议纪要生成 | 办公 | 会议录音/文字 → 结构化纪要 | stt/llm-chat/report | 否 |
| 2 | 📊 周报生成器 | 办公 | 流水记录 → 结构化周报 | llm-chat/report | 否 |
| 3 | ✉️ 邮件助手 | 办公 | 要点 → 正式邮件 | llm-chat/human-review | 否 |
| 4 | 💼 简历优化 | 求职 | 简历 → 诊断+优化+面试题 | llm-chat/report | 否 |
| 5 | 💻 代码审查助手 | 开发 | **git 增量 review：未评审提交** | git-log/git-diff/loop/llm-chat | **是（git 节点）⏸️ 暂缓** |
| 7 | 🎓 知识提炼存日记 | 学习 | 文章 → 读后感式提炼 → 存日记 | llm-chat/save-diary | **是（save-diary 节点）** |
| 8 | 📈 数据分析洞察 | 办公 | 数据 → 趋势/洞察报告 | llm-chat/report | 否 |
| 9 | 🔍 行业深度调研报告 | 调研 | 主题 → 多轮搜索 → 研报 | loop+web-search+llm-chat | 否 |
| 10 | 🛍️ 电商商品海报/主图 | 电商 | 商品图+卖点 → 海报 | image-gen | **是（参考图）** |
| 11 | 🎙️ 文章转播客 | 内容 | 文章 → 双人对话音频 | llm-chat+tts | **是（二期）** |
| 13 | 📈 竞品分析报告 | 商业 | 竞品 → 多轮搜索 → 对比报告 | loop+web-search+llm-chat | 否（需 redesign） |

**已移除**：6 翻译（已有「文档翻译」应用）、12 合同审查（用户确认不做）。

---

## 二、基础办公四件套（1-4）

### 2.1 📝 会议纪要生成

**目标**：会议录音（或粘贴转写文字）→ AI 结构化纪要：议题、决议、待办（含负责人/截止时间）。

**输入表单（start）**：

| key | label | type | required | 说明 |
|---|---|---|---|---|
| audio | 会议录音（m4a/wav/mp3） | file | 否* | 与 text 二选一 |
| text | 会议文字转写/速记 | textarea | 否* | 与 audio 二选一（任一必填） |
| language | 语音语言 | select | 否 | 自动/中文/英文 |
| focus | 关注重点 | textarea | 否 | 如"只关心预算与排期" |
| model | 纪要模型 | model(text) | 是 | |

**工作流环节**：
```
start → (audio?) stt 转写 → 合并文本 → llm-chat 结构化提取(jsonMode) → human-review 人工校对
      → report 纪要报告 → save-asset 存资产 → end
```

**处理逻辑**：
- 若提供 audio：`stt` 节点（`{{start.audio.path}}`，segmentMinutes=4 超长自动分段）转写。
- 若提供 text：直接用 `{{start.text}}`。
- `llm-chat` jsonMode 提取：`{ topics: [{name, discussion, conclusion}], decisions: [], actionItems: [{task, owner, dueDate}] }`。
- `human-review` 送审纪要草稿，可编辑后批准。
- `report` 模板渲染 markdown 纪要（议题/决议/待办表格）。
- `save-asset` 存 text 资产，分类「会议纪要」。

**【审查修订】**
- **C1 分支显式化**：`(audio?)` 改为显式 `condition` 节点——`{{start.audio.path}}` not_empty → approve 边进 stt；否则 fallback 边直达合并。
- **C2 互斥兜底**：audio/text 均空时，condition 追加校验并走失败路径，报"请提供录音或文字"（前端表单提示二选一）。
- **新增 assign 节点「合并文本」**：stt 输出与 text 二选一合成 `{{merge1.values.transcript}}`，供 llm-chat 引用（stt 分支输出 `{{stt1.text}}`，text 分支输出 `{{start.text}}`，assign 用模板按分支取）。
- 表单其余字段合理；language 默认 auto 即可。

### 2.2 📊 周报生成器

**目标**：零散工作流水 → 结构化周报（本周完成/进行中/下周计划/风险与求助）。

**输入表单**：

| key | label | type | required |
|---|---|---|---|
| workLog | 本周工作流水（每行一件事） | textarea | 是 |
| goals | 本周目标（可选） | textarea | 否 |
| nextWeek | 下周计划要点（可选） | textarea | 否 |
| tone | 风格 | select | 否（务实/向上/简洁） |
| model | 模型 | model | 是 |

**工作流环节**：
```
start → llm-chat 分类整理(结构化输出) → llm-chat 撰写周报正文 → human-review → report → save-asset → end
```

**处理逻辑**：
- 第一段 llm-chat jsonMode：把流水归类到「完成/进行中/下周计划」+ 提炼风险。
- 第二段 llm-chat：按 tone 扩写成正式周报（含量化建议、本周成果亮点、风险求助）。
- report 用模板拼装；save-asset 分类「工作报告」。

**【审查修订】**
- ✅ 流程与表单均合理。两段 llm 职责清晰（结构化归类 → 行文扩写）。
- 建议：第一段输出补 `{risks: []}`（风险字段在第二段引用）；表单 workLog 加 minLength=1 提示；human-review 送审第二段正文。

### 2.3 ✉️ 邮件助手

**目标**：要点 → 结构完整、语气合适的正式邮件（中/英），支持多用途（跟进/致歉/申请/通知）。

**输入表单**：

| key | label | type | required |
|---|---|---|---|
| purpose | 邮件用途 | select | 是（跟进/申请/致歉/通知/推荐/自定义） |
| keyPoints | 核心要点（每行一个） | textarea | 是 |
| recipient | 收件人关系 | select | 否（客户/上级/同事/下属/陌生） |
| tone | 语气 | select | 否（正式/礼貌/亲和/强硬） |
| language | 语言 | select | 否（中文/英文） |
| extraContext | 背景补充 | textarea | 否 |
| model | 模型 | model | 是 |

**工作流环节**：
```
start → llm-chat 生成邮件(jsonMode: {subject, body}) → human-review(editableFields: subject/body)
      → template-transform 拼装完整邮件 → report → save-asset → end
```

**处理逻辑**：
- llm-chat jsonMode 输出 `{ subject, body }`，body 用 markdown 段落。
- human-review 允许修改 subject/body（"修改后批准"）。
- report 模板含称呼、正文、落款占位；save-asset 分类「邮件」。

**【审查修订】**
- ✅ 可行。补充引用细节：human-review `editableFields: [{key:"subject",label:"主题",type:"string"},{key:"body",label:"正文",type:"string"}]`，后续模板引用 `{{review1.subject}}` / `{{review1.body}}`（editableFields key 直接作为审核节点输出字段，与多平台文案 `{{review1.output_result}}` 同机制）。
- 建议：称呼/落款并入 body 由模型生成（避免额外字段）；extraContext 保留。

### 2.4 💼 简历优化

**目标**：简历原文 → 诊断报告 + 逐条优化建议 + 改写后简历 + 面试高频问题预测。

**输入表单**：

| key | label | type | required |
|---|---|---|---|
| resume | 简历全文 | textarea | 是 |
| targetRole | 目标岗位 | string | 是 |
| jd | 岗位 JD（可选） | textarea | 否 |
| model | 模型 | model | 是 |

**工作流环节**：
```
start → llm-chat 简历诊断(jsonMode) → llm-chat 逐条优化(jsonMode) → llm-chat 面试题预测(jsonMode)
      → report 综合报告（诊断+优化+面试题）→ human-review → save-asset → end
```

**处理逻辑**：
- 诊断：结构完整性、量化程度、关键词匹配 JD、亮点突出度，输出 `{score, issues: [{severity, section, problem, suggestion}]}`。
- 优化：对每条 issue 产出改写建议 `{rewritten, reason}`；再输出优化后完整简历 markdown。
- 面试题：基于岗位+简历生成 8-10 个高频问题 + 答题要点。
- report 三合一报告；save-asset 分类「简历」。

**【审查修订】**
- ✅ 可行。C4 长文本：resume 加 `validation.maxLength`（建议 50_000，超限提示分段提交）；jd 选填。
- 建议：三段 llm-chat 的 prompt 均需注入 resume 原文，注意 token 成本——第二段只注入「诊断结果 + resume」，第三段注入「优化结果」，避免全文重复。
- 表单 targetRole 必填合理；补充默认值说明。

---

## 三、个人提升与数据类（5-8）

### 3.1 💻 代码审查助手（git 增量 review 主场景）⏸️ **已记录方案，暂缓实施**

> **状态**：用户 2026-08-23 确认——方案完整记录（增量 review 主场景 + 全量 review 二期评估 + 审查维度 Rubric），**暂不做**，待后续排期。

**目标**：连接本地 git 仓库 → 读取最近提交 → 找出**未评审的提交** → 按提交/文件审查 diff → 分级审查报告 → 记录评审进度。

**场景定位（用户确认的真实场景）**：
1. **增量 review（主场景）**：打开仓库 → 查看最近提交 → 从上次评审点开始，把未评审的提交 diff 全部审查。
2. **全量 review（二期，可行性评估见下）**：整个项目全面审查。

**⚠️ 依赖扩展**：新增 `simple-git` 依赖 + 两个新工作流节点 `git-log` / `git-diff`（调用系统 git CLI，本地操作，不涉及远程凭据）。设计如下：

**新节点 1：`git-log`（读取最近提交）**
```
输入：repoPath, maxCount(默认30), branch(默认当前分支)
输出：commits: [{ hash, shortHash, author, date, subject }]
校验：路径存在且为 git 仓库（git rev-parse），否则节点失败并提示
```

**新节点 2：`git-diff`（计算两引用间 diff，按文件拆分）**
```
输入：repoPath, fromRef, toRef, maxDiffBytes(单文件截断保护)
输出：files: [{ path, status, additions, deletions, diff }], totalStats
校验：fromRef/toRef 必须存在
说明：git diff --unified=3；超长文件截断并标记 truncated，避免 LLM 上下文爆炸
```

**输入表单（start）**：

| key | label | type | required | 说明 |
|---|---|---|---|---|
| repoPath | 本地仓库路径 | string | 是 | 绝对路径（如 D:/work/my-project）；启动时校验 |
| reviewMode | 评审范围 | select | 是 | 增量（上次评审后）/ 指定提交 / 最近N条提交 |
| sinceCommit | 起始提交（指定提交模式） | string | 否 | 如 8f3a2c1 |
| recentCount | 最近N条（最近N条模式） | number | 否 | 默认 10 |
| dimensions | 审查维度 | select multi | 否 | 默认全选（正确性/安全/性能/可维护性/风格） |
| refactor | 是否输出重构建议 | boolean | 否 | 默认 false |
| model | 模型 | model | 是 | |

**评审进度存储**：用现有 `variable` 节点（scope=user，key=`codeReview:lastReviewed:<repoPath>`）持久化"上次评审到的 commit hash"。每次增量评审完成后写入 HEAD，下次运行时从该点开始 diff。

**工作流环节（增量 review）**：
```
start
→ git-log 读取最近提交（展示给用户确认起点）
→ variable get 上次评审点 lastReviewed
→ git-diff（from=lastReviewed 或 sinceCommit，to=HEAD）→ 未评审提交的 diff
→ condition 分支：
    无新提交 → report "无待评审提交" → end
    有新提交 → 继续
→ loop 逐文件审查：llm-chat jsonMode（该文件 diff + 维度要求 → {issues:[{severity,line,dimension,problem,suggestion}]}）
→ parallel-merge 聚合全部文件 issues
→ llm-chat 综合分级报告（去重合并、按 severity 排序、topRisks、summary）
→ (refactor=on) llm-chat 重构建议（针对 critical/warning 项）
→ report 审查报告（提交清单/文件清单/问题分级表/修复建议）
→ human-review 人工确认
→ save-asset 落库（分类「代码审查」，name 含 repo 名+日期）
→ variable set lastReviewed=HEAD（仅增量模式）
→ end
```

**处理逻辑细化**：
- 逐文件审查 prompt 注入：文件路径 + 完整 diff + 语言 + **维度清单（含每个维度的检查点）**；要求行号基于 diff 行号（`@@ -x,y +a,b @@` 上下文），输出 `{issues:[{severity, line, dimension, problem, suggestion}]}`。
- 跨文件问题：聚合阶段 llm-chat 明确要求识别"涉及多文件改动的横切问题"（如接口变更未同步调用方）。
- 误报控制：severity 三级 + human-review 批准才落库；报告中注明"静态审查结果，需人工复核，不能替代测试"。

---

### 3.1c 审查维度体系（Rubric）——review 质量的核心

> 原则：维度**固定且可枚举**（防止模型漏审/乱审），每个维度带**具体检查点**注入 prompt（防止泛泛而谈），输出**强制标注维度**（可统计、可过滤、可审计）。

#### 核心维度（6 个，默认全开，用户可多选裁剪）

| # | dimension | 中文 | 检查点（prompt 注入的 checklist） |
|---|---|---|---|
| 1 | correctness | 正确性 | 边界条件（空集合/0/负数/最大值）、空值/未定义访问、判断逻辑方向、循环终止条件、类型不匹配、异步未 await / 竞态、状态未重置、异常路径返回值错误 |
| 2 | security | 安全（对齐 OWASP Top10） | SQL 注入（字符串拼接查询）、XSS（未转义输出）、命令注入（exec/子进程拼接）、路径遍历、硬编码密钥/敏感信息、缺失认证授权、不安全反序列化、CSRF、已知漏洞依赖 |
| 3 | performance | 性能 | 不必要循环/嵌套循环复杂度、N+1 查询、大集合同步处理、资源泄漏（连接/句柄/事件监听）、重复计算、缺少缓存、大对象频繁复制 |
| 4 | maintainability | 可维护性 | 代码重复（DRY）、过长函数/类、复杂度过高、命名不清、魔法数字、模块耦合过紧、缺抽象、注释与实现不符 |
| 5 | error-handling | 错误处理 | 异常被吞（空 catch）、错误信息无上下文、失败返回错误默认值、部分失败未回滚、缺超时/重试、边界失败未处理 |
| 6 | style | 风格与惯例 | 不符合语言/框架惯例、命名风格不统一、死代码、调试残留（console.log/TODO/注释掉的代码）、格式化问题 |

#### 可选维度（按需开启）

| dimension | 中文 | 检查点 |
|---|---|---|
| test | 测试覆盖 | 新增代码是否配套测试、边界用例缺失、测试断言过弱 |
| compatibility | 兼容性 | 接口变更未同步调用方、破坏性 API 变更、依赖升级影响面 |

#### 语言增强检查点（按 `language` 字段注入对应清单）

- **JS/TS**：原型污染、this 绑定错误、闭包泄漏、Promise rejection 未处理、any 滥用、可选链误用
- **Python**：可变默认参数、异常被吞、全局状态、路径处理不规范、线程安全
- **Java**：空指针、受检异常被吞、流/连接未关闭、equals/hashCode 不一致
- **Go**：error 未检查、goroutine 泄漏、defer 误用、context 未传递
- **C/C++**：内存泄漏、指针悬垂、未定义行为、整数溢出

#### 输出契约（jsonMode 硬约束）

```json
{
  "issues": [{
    "severity": "critical | warning | suggestion",
    "dimension": "correctness | security | performance | maintainability | error-handling | style | test | compatibility",
    "line": 42,
    "problem": "问题描述（说清为什么是问题，不空谈）",
    "suggestion": "修复建议（含示例代码）"
  }]
}
```

**severity 分级语义（写入 prompt，防止滥用）**：
- `critical`：会崩溃 / 数据丢失 / 安全漏洞 / 明确错误的业务逻辑
- `warning`：明显缺陷（边界错误、资源泄漏、异常被吞）但不一定触发
- `suggestion`：可优化项（风格、性能优化、可读性）

#### 质量保障机制

1. **维度强制覆盖**：prompt 要求"对每个选中的维度逐一检查，该维度无问题时输出 `{"dimension":"xxx","status":"ok"}`"，防止模型只盯着最擅长的维度。
2. **问题必须可定位**：`line` 必须落在 diff 行号范围内，无法定位的宁可不报（减少噪音）。
3. **分级收敛**：聚合阶段 llm-chat 做一次"降噪"——合并跨文件重复项、把与 diff 无关的既有问题标记为 `pre-existing`（不算本次变更引入）。
4. **人工兜底**：critical 项聚合后必须逐条展示给 human-review，用户确认后才算数。

**可靠性设计**：
- 单文件 diff 超长 → 截断 + 标记 truncated，报告中提示"该文件 diff 过大已截断，建议人工查看"。
- 空 diff / 无新提交 → 走 condition 直接出"无待评审"报告，不浪费 token。
- 非 git 目录 / ref 不存在 → 节点失败并给出明确中文错误。

---

### 3.1b 💻 全量 review——可行性评估（二期，难度大）⏸️ **随 3.1 一并暂缓**

**目标**：不指定提交，审查整个项目。

**难点拆解**：

| 难点 | 说明 | 可行性 |
|---|---|---|
| 文件量巨大 | 大仓库成千上万文件，token 成本失控 | ⚠️ 需过滤 + 分模块 |
| 跨文件依赖 | 单文件审查看不到调用链（A 调 B，问题在 B） | ❌ 纯 LLM 无法可靠解决 |
| 上下文组织 | 无法把整个项目塞进一次 LLM 调用 | ⚠️ 需分层汇总 |
| 噪音过滤 | node_modules/.git/构建产物必须排除 | ✅ 简单（.gitignore 对齐） |

**可行方案（分层审查，控制成本）**：
```
git-log/git-diff 扩展 → git-ls-files 列文件树（排除 .gitignore + 二进制/锁文件）
→ 按模块（顶层目录）分组 → loop 逐模块：loop 逐文件 llm-chat 审查 → 模块级 llm-chat 汇总
→ 全局 llm-chat 交叉审查（模块摘要 + 公共 API 清单 → 跨模块问题）
→ report 全量审查报告（模块健康度矩阵 + 全局风险 TOP N）
```

**建议**：全量 review 作为**二期独立迭代**，且第一版只做"广度审查"（覆盖性检查：未处理的错误、明显反模式、安全敏感调用），**不做跨文件深度分析**（需要 AST/依赖图，工程量数倍，先不做）。首批确认范围时，增量 review 已满足真实评审诉求。

**可复用**：git-log/git-diff 节点 + 分块审查链路与增量模式共用。

### 3.2 🌐 翻译本地化 ❌ **已移除**

> 2026-08-23 用户确认：项目已有完整「文档翻译」应用（`views/Translate.vue` + TextTranslation/FileTranslation + `translation.service.ts` 文本/文件翻译/长文本分段/历史 + `/translate` 路由），本场景与现有应用重复，**不实施**。
> 备查：原设计为 translate → 本地化润色 → 术语一致性检查 → 双语对照报告，如需"术语表一致性"增强可后续在现有翻译应用中迭代。

### 3.3 🎓 知识提炼存日记（原"学习笔记"重定位）

> 2026-08-23 用户重定位：不做"结构化笔记+复习题+记忆卡"（无阅读器闭环），改为**对一篇或多篇文章做知识提炼（类似读后感/书评），提炼结果保存到日记**。

**目标**：输入一篇或多篇文章（粘贴/网页/知识库）→ AI 提炼知识（观点、脉络、收获、启发，类似读后感/书评）→ **保存为日记条目**（`/diary` 可阅读、可积累）。

**⚠️ 依赖扩展**：工作流引擎目前**无"写日记"节点**。需新增 `save-diary` 节点：
```
输入：folderId（目标文件夹，缺省根目录）、title、content（markdown）
实现：调 DiaryService.createEntry({ folderId, title, content })（现有服务：写 md 文件 + 落库 + 自动解析 [[链接]]）
输出：entryId, title
校验：folderId 存在；content 非空
```

**输入表单**：

| key | label | type | required | 说明 |
|---|---|---|---|---|
| text | 文章内容（一篇或多篇） | textarea | 否* | 与 url/knowledgeBase 至少一个 |
| url | 文章链接 | string | 否* | web-extract 取正文；多篇可换行多个 URL？→ 见修订 |
| knowledgeBase | 知识库来源 | select-dynamic(knowledgeBases) | 否* | kb-retrieve 检索相关段落 |
| style | 提炼风格 | select | 否 | 读后感/书评/要点提炼/批判分析 |
| length | 篇幅 | select | 否（精简/标准/详尽） |
| title | 日记标题（缺省自动生成） | string | 否 | |
| folder | 目标日记文件夹 | select-dynamic(日记文件夹) | 否 | 缺省根目录 |
| model | 模型 | model | 是 | |

**工作流环节**：
```
start
→ condition 分流来源（text / url / knowledgeBase 三路，均空则失败提示）
→ 多篇合并：web-extract 逐篇取正文 / kb-retrieve 检索 → assign 合成 sourceText
→ llm-chat 知识提炼（jsonMode 或纯文本，按 style 输出读后感式文章）
→ report 预览提炼结果 → human-review 人工编辑确认
→ save-diary 保存到日记（folderId=start.folder，title，content=提炼结果）
→ end
```

**处理逻辑**：
- 提炼 prompt（按 style）：提炼核心观点、论证脉络、关键信息、与读者相关的收获/启发，行文像读后感/书评而非要点列表。
- 多篇输入：逐篇 web-extract/kb-retrieve 后，assign 合并为 `sourceText`（含篇目分隔与标题），一次提炼；或 loop 逐篇提炼后综合（二期，视输入规模）。
- human-review 允许编辑提炼结果（editableFields: content）——读后感类内容用户一定想改。
- save-diary 落库后，用户在 `/diary` 直接阅读、编辑、导出（日记已有 HTML/PDF/DOCX 导出）。

**【审查修订】**
- **重定位**：砍掉复习题/记忆卡/概念卡（无阅读器闭环）；新增「提炼+存日记」闭环（日记页面即阅读器）。
- **需新增 save-diary 节点**（唯一依赖扩展，服务层已就绪，仅节点层封装）。
- select-dynamic 需要支持"日记文件夹"来源（现有 source 无此枚举）→ **需扩展** source `'diaryFolders'`（或用 string 手输文件夹名，首版可简化）。
- 多篇 URL 输入：首版建议 text 支持多篇粘贴（`---` 分隔）+ url 单条；多 URL 换行解析列为二期（需 code 节点拆分）。
- 知识库来源用 kb-retrieve（现有节点），不用 read-asset（select-dynamic 无通用资产来源）。

### 3.4 📈 数据分析洞察

**目标**：粘贴数据（CSV/表格/JSON）→ 清洗理解 → 趋势/异常/相关性洞察 → 图表建议 → 报告。

**输入表单**：

| key | label | type | required |
|---|---|---|---|
| data | 数据（CSV 或表格） | textarea | 是 |
| dataFormat | 格式 | select | 是（CSV/TSV/JSON/表格文本） |
| context | 业务背景 | textarea | 否 |
| focus | 分析重点 | textarea | 否 |
| model | 模型 | model | 是 |

**工作流环节**：
```
start → llm-chat 数据理解与清洗建议(jsonMode) → llm-chat 深度洞察(jsonMode)
      → report 洞察报告（含图表建议）→ human-review → save-asset → end
```

**处理逻辑**：
- 第一段：数据概览——列名、行数、类型识别、缺失/异常检测，输出 `{columns, rows, issues: []}`。
- 第二段：基于 focus/context 输出洞察 `{trends: [], anomalies: [], correlations: [], recommendations: [], charts: [{type, columns, reason}]}`。
- report 渲染报告（数据概览/洞察/图表建议 markdown 表格）；save-asset 分类「数据分析」。

**【审查修订】**
- **C4 长文本限制**：data 加 `validation.maxLength`（建议 100_000，约 1.5 万行 CSV），超限提示"请截取关键数据或上传资产"。
- 第二段洞察的输入 = 第一段概览（columns/rows 摘要）+ data 原始数据（若未超限）——prompt 明确注入两者，避免只给概览丢失细节。
- 表单 OK；dataFormat 必填合理。

---

## 四、第二轮拓展场景（9-13）

### 4.1 🔍 行业深度调研报告（Deep Research 形态——2026 最火）

**目标**：主题 → AI 规划子问题 → 多轮联网搜索 → 逐轮积累 → 综合研报（含引用来源）。

**输入表单**：

| key | label | type | required |
|---|---|---|---|
| topic | 调研主题 | textarea | 是 |
| rounds | 搜索轮数 | number | 否（默认 3，范围 1-5） |
| depth | 深度 | select | 否（速览/标准/深度） |
| focus | 关注维度 | select multi | 否（市场/竞争/技术/政策/趋势/风险） |
| model | 模型 | model | 是 |

**工作流环节**：
```
start → llm-chat 研究规划(jsonMode: {subQuestions: []})
      → loop 多轮搜索：web-search(每轮一个问题) → llm-chat 摘要提取(jsonMode)
      → llm-chat 综合研报(结构化，消费 {{loop1.results}})
      → report 研报（含来源列表）→ human-review → save-asset → end
```

**处理逻辑**：
- 研究规划：按 topic+focus 拆 3-8 个子问题。
- `loop`（listExpression=规划的子问题）：每轮 `web-search`（query=子问题）→ `llm-chat` 摘要（保留来源 url），循环输出进 `loop.results`。
- 综合段 llm-chat：汇总 `{{loop1.results}}` 数组 → 按 focus 维度组织 → `{executiveSummary, sections: [{title, content, sources: []}], risks, outlook}`。
- report 渲染研报 + 引用来源附录；save-asset 分类「调研报告」。

**【审查修订】**
- **C3 删除 parallel-merge**：loop 自带 `results`（各迭代输出数组），综合段直接消费 `{{loop1.results}}`，无需 parallel-merge。
- rounds 与 subQuestions 关系需说明：rounds 字段废弃或改为"子问题数量"（建议改名 subQuestionCount，规划段按此生成问题数）。
- 综合段 prompt 需注入 focus 维度；来源去重由综合段处理。

### 4.2 🛍️ 电商商品海报/主图生成 ⚠️ 需扩展能力

**目标**：商品图 + 商品信息/卖点 → AI 生成电商海报/主图 + 配套文案。

**⚠️ 扩展点**：现有 `image-gen` 节点 config 无参考图参数。扩展方案：
- 在 `image-gen` 节点 config 增加 `referenceImages?: string[]`（模板可用，指向 `{{start.productImage.path}}` 等 file 输出路径）。
- handler 执行时读取文件转 base64 data URL，透传 `ImageService.generateImage({ referenceImages })`。
- 服务层已支持 referenceImages（base-image-provider 已实现），**仅节点层透传**，改动小。

**输入表单**：

| key | label | type | required |
|---|---|---|---|
| productImage | 商品图片 | file | 是 |
| productInfo | 商品信息/卖点 | textarea | 是 |
| posterType | 海报类型 | select | 是（主图/促销海报/详情头图/社媒图） |
| style | 风格 | select | 否（简约/高端/活力/国潮/科技感） |
| slogan | 广告语（可选） | string | 否 |
| size | 尺寸 | select | 否（1:1 主图/3:4 社媒/16:9 详情） |
| model | 图像模型 | model(image) | 是 |

**工作流环节**：
```
start → llm-chat 海报设计文案(jsonMode: {headline, subheadline, layoutHint, colorHint})
      → image-gen(参考图+prompt) 生成海报 → report 海报配套文案 → save-asset(图片+文案) → end
```

**处理逻辑**：
- llm-chat 依据商品信息+类型+风格生成海报文案与构图/配色建议。
- `image-gen` prompt = 设计文案 + 构图/配色要求 + 保留商品主体，referenceImages=[商品图]。
- 输出图片 save-asset（category=image）；文案 report 附在报告。

**【审查修订】**
- ⚠️ 依赖扩展已标注（image-gen 补 referenceImages）。
- **save-asset 引用补充**：image-gen 输出 `images` 数组 → save-asset `content: "{{img1.images.0.url}}"`（模板支持数字下标；file 型自动下载落盘）。
- 建议：size 映射为 image-gen width/height（如 1:1 → 1024×1024；3:4 → 1024×1365；16:9 → 1280×720），select 值直接填像素更稳。
- 表单 OK；model(image) 必填合理。

### 4.3 🎙️ 文章转播客（NotebookLM 形态——变现热点）

**目标**：文章/资料 → 双人对话播客脚本 → 逐角色 TTS 合成音频 → 音频资产。

**输入表单**：

| key | label | type | required |
|---|---|---|---|
| source | 文章来源 | select-dynamic | 否（资产/知识库） |
| text | 文章粘贴 | textarea | 否* |
| url | 网页链接 | string | 否*（三选一） |
| duration | 目标时长 | select | 否（3-5 分钟/8-10 分钟/15 分钟+） |
| hostVoice | 主播音色 | select-dynamic | 是（已有音色/克隆音色） |
| guestVoice | 嘉宾音色 | select-dynamic | 是 |
| language | 语言 | select | 否（中文/英文） |
| model | 文案模型 | model | 是 |

**工作流环节**：
```
start → (url?) web-extract → llm-chat 要点提取(jsonMode)
      → llm-chat 双人对话脚本生成(jsonMode: {segments: [{speaker, text}]})
      → loop 逐段 TTS(tts) → 音频资产汇总 → save-asset(脚本+音频) → report 脚本 → end
```

**处理逻辑**：
- 要点提取后生成对话脚本：主持人提问/引导、嘉宾讲解，穿插"嗯/啊"类口语过渡词，控制时长（按字数估算）。
- `loop` 遍历 segments：每段按 speaker 选音色调 `tts`（`{{start.hostVoice}}` / `{{start.guestVoice}}`），输出音频路径。
- 音频落盘 save-asset（category=audio）；脚本 report 一并保存。

**【审查修订】**
- **❌ 需 redesign（C1/C7/C6）**：
  1. **C7 音色选择**：`hostVoice`/`guestVoice` 用 select-dynamic 但**无"音色列表"来源**（现有 source 无 voices）。**方案**：新增 select-dynamic source `'voices'`（复用 VoiceService 音色列表）——需扩展；或首版表单降级为 string 输入 voiceId（体验差，不推荐）。
  2. **C1 来源分支**：`(url?)` 改 condition；来源三选一同学习笔记问题——首版建议只保留「粘贴 text + url」两路，去掉 select-dynamic 资产（避免两处 source 扩展）。
  3. **双角色 TTS**：`loop` 内按 speaker 切换 voiceId **不可行**（tts 节点 config 是模板，无法在循环体内动态换音色）。**方案**：拆两个 loop——脚本生成后按 speaker 分组为 `{hostSegments:[], guestSegments:[]}`（llm-chat 或 assign），host 段 loop 用 `{{start.hostVoice}}`、guest 段 loop 用 `{{start.guestVoice}}`，分别合成后**音频合并需新节点（ffmpeg concat）**——或首版输出分段音频 + 脚本，合并列为二期。
  4. 时长控制：脚本生成按 duration 估算字数，写入 prompt。
- **结论**：本场景依赖扩展较多（voices 来源 + 双 loop + 音频合并节点），**建议降为二期候选**，首批不实施。

### 4.4 🧾 合同审查 ❌ **已移除**

> 2026-08-23 用户确认：合同审查难度大，**不实施**。
> 备查：原设计为条款拆解 → 风险分级审查 → 修改建议意见书；难点为长文本超限与条款原文关联，如需做需先解决分块审查。

### 4.5 📊 竞品分析报告（商业决策）

**目标**：竞品名单 → 多轮搜索 → 产品/定价/营销/口碑对比 → 竞争策略建议。

**输入表单**：

| key | label | type | required |
|---|---|---|---|
| competitors | 竞品名单（每行一个） | textarea | 是 |
| industry | 所属行业 | string | 是 |
| dimensions | 对比维度 | select multi | 否（产品/定价/营销/口碑/融资/技术） |
| rounds | 每竞品搜索轮数 | number | 否（默认 2） |
| model | 模型 | model | 是 |

**工作流环节**：
```
start → llm-chat 搜索问题规划(jsonMode: {plans: [{competitor, queries: []}]})
      → loop 逐竞品（listExpression=plans）：loop 内逐轮搜索(web-search) → llm-chat 竞品档案(jsonMode)
      → llm-chat 对比矩阵(jsonMode，消费 {{loop1.results}})
      → report 竞品分析报告 → human-review → save-asset → end
```

**处理逻辑**：
- 每个竞品一个档案：产品功能/定价/营销动作/用户口碑/融资技术动态。
- 对比矩阵：维度 × 竞品表格 + 定位差异 + 优劣势。
- report 报告（总览/对比矩阵/逐竞品档案/策略建议）；save-asset 分类「竞品分析」。

**【审查修订】**
- **❌ 原设计双层 loop 不可行（C5 嵌套循环禁止）** → 修订为**单层 loop**：
  1. 规划段 llm-chat 输出 `{plans: [{competitor, queries: [多轮查询词]}]}`（competitors 文本由模型解析为数组，**替代 C6 的 code 转换**——模型直接消费 textarea 更省事）。
  2. 单层 loop 遍历 plans：**每轮内部多次 web-search** 如何表达？——loop 单次迭代只走一条 body 链，多轮搜索需**串行多个 web-search 节点**（queries 上限固定为 2-3 个查询词，用 2-3 个 web-search 节点 + assign 合并结果），或退化为"每竞品 1 次综合搜索 + 1 次定向搜索"。
  3. **C3 删 parallel-merge**：对比矩阵直接消费 `{{loop1.results}}`（每轮 = 一个竞品档案）。
- rounds 字段含义改为"每竞品查询词数量"（规划段按此生成 queries 数量），默认 2。
- competitors textarea 必填；industry 必填合理。

---

## 五、实施排期与依赖

### 5.1 依赖关系（审查后修订）

| 工作流 | 前置 | 依赖 |
|---|---|---|
| 1-4, 8-9（基础） | 无 | 无（会议纪要需 condition+assign，数据分析需 maxLength） |
| 5 代码审查 | ⏸️ **暂缓** | simple-git + git-log/git-diff 节点（待排期） |
| 7 知识提炼存日记 | **需新增 save-diary 节点 + select-dynamic 日记文件夹来源** | 服务层已就绪（DiaryService.createEntry），仅节点层封装 |
| 10 电商海报 | **需先扩展 image-gen 参考图** | 服务层已支持，仅节点层改动 |
| 11 文章转播客 | ❌ **降为二期**（voices 来源 + 双 loop + 音频合并节点） | 多处扩展 |
| 13 竞品分析 | 无（需 redesign 单层 loop） | 需确认 web-search 默认引擎已配置 |

**已移除**：6 翻译（已有「文档翻译」应用）、12 合同审查（用户确认不做）。

### 5.2 建议实施顺序（审查后修订）

**第一批（零依赖基础 6 个）**：
- 2 周报 → 3 邮件 → 4 简历 → 8 数据分析（加 maxLength）→ 1 会议纪要（condition+assign）→ 9 行业调研（删 parallel-merge）

**第二批（redesign + 扩展）**：7 知识提炼存日记（新增 save-diary 节点）→ 13 竞品（单层 loop）→ 10 电商海报（先扩 image-gen）
**第三批（二期）**：11 文章转播客（voices 来源 + 双 loop + 音频合并）、代码审查（方案已记录，待排期）
**已移除**：6 翻译（已有应用）、12 合同审查（不做）
**第三批（二期）**：11 文章转播客（voices 来源 + 双 loop + 音频合并）、代码全量 review（§3.1b）

### 5.3 测试要点（TDD）

- 每个工作流 JSON：`graph-validator` 校验通过 + 引擎 dry-run 拓扑合法。
- 新节点单测：`git-log`（提交列表解析、非 git 目录报错）、`git-diff`（diff 按文件拆分、超长截断、ref 不存在报错）。
- 关键节点链路（代码审查增量 loop）单独单测。
- 新增 image-gen 参考图：节点 handler 单测（file→base64→透传 referenceImages）。
- 真机跑通：会议纪要（stt 音频）、行业调研（多轮搜索）、代码审查（真实本地仓库：增量评审 → 进度落库 → 二次运行从新点开始）、电商海报（参考图）各一次真实调用。

## 六、待用户确认（审查后更新）

1. **实施范围**：先做第一批「零依赖基础 6 个」（周报/邮件/简历/数据分析/会议纪要/行业调研）？第二批「知识提炼存日记」需要新增 save-diary 节点，是否一并做？
2. **代码审查**：方案已记录、**暂缓**，等后续单独排期（git 增量 review + 全量评估）。
3. **降级项**：文章转播客因依赖扩展较多（音色来源+双 loop+音频合并）降为二期，是否认可？
4. **电商海报**：是否接受"先扩展 image-gen 参考图"（小改动）？
5. **搜索引擎**：行业调研/竞品分析依赖 web-search 默认引擎，当前是否已配置？
6. **已移除项**：翻译（已有「文档翻译」应用）、合同审查（不做）——确认无误。
7. **知识提炼存日记**：接受新增 save-diary 节点（服务层已就绪）？日记文件夹选择首版用 select-dynamic 扩展还是手输名称？
