# 技能蒸馏功能调研底稿：四个开源「内容 → Skill」项目（2026-10-09）

> 任务：为本系统技能库模块增加「输入他人内容 → 生成 skill」的蒸馏功能。
> 本文是四个开源项目的深读笔记 + 本系统设计取舍的依据。功能实现见
> `src/core/packs/skills/services/skill-distill.*` 与 `src/shared/utils/skill-distill.ts`。

## 一、四个项目一览

| | colleague-skill (Distilly) | book-to-skill | anything-to-skill | awesome-persona-skills 生态 |
|---|---|---|---|---|
| 蒸馏对象 | 人（行为/判断/声音） | 技术书/文档集 | 书/论文/文档站/代码仓库 | 人/博主/书/播客（生态索引） |
| 形态 | 对话式 agent 流程 + Python 采集/写入/质检 | 确定性 Python 抽取 + spec 驱动生成（Step 0–11） | Rust CLI（确定性半）+ agent（判断半）+ 自身即 Skill | 纯清单（4112★），事实标准由女娲.skill（33.8k★）定义 |
| 核心卖点 | 标签→行为规则翻译表；work/persona 双文件分离 | "Extract structure, not summaries"；回答省 24–51× token | 考试式 eval（从源文出题、只准用 skill 答题） | 诚实边界/内在张力/Agentic Protocol 等产物形态 |
| 坑 | SKILL.md 69KB 常驻上下文；深绑飞书/钉钉 | 章节检测依赖显式 `Chapter N` 标题 | 只支持 Anthropic；笔记超 150k 后组装滑坡 | 清单无准入质控；description 触发词膨胀 |

注：book-to-skill 原 URL（Leutenegger）已 404，现居 `virgiliojr94/book-to-skill`；colleague-skill 默认分支是 `dot-skill`，已更名 Distilly。

## 二、值得抄的机制（按采纳与否标注）

### 已采纳进本系统

1. **两遍读取**（anything-to-skill）：第一遍逐块笔记（唯一看原文的环节，provenance 在阅读时附着），第二遍只读笔记组装——"nothing ever has to hold the whole book and the whole answer at the same time"。→ `SkillDistillService` 的 noting/assembling 两阶段，组装 prompt 明言"你只能看到笔记，笔记没有的绝不许写"；服务层给笔记盖章 `chunk` 序号（不信任模型自报）。
2. **生成契约写进 prompt**（anything-to-skill ASSEMBLE_SYSTEM）：description 必须含触发从句；正文 = 地图不是领土（前置加载）；每个 reference 必须被正文链接并注明何时打开；单处引用 ≤60 字。→ `buildAssembleSystem` 六条硬契约。
3. **确定性审计 + 修复环**（anything-to-skill audit 14 条规则 + book-to-skill Step 9.5 扫描）：description 路由性（缺触发从句→warn）、正文/卡片预算（超 warn、双倍 error）、孤儿卡片（没人链接的卡片永远不会被读→error）、注入残留（warn，蒸馏提示词工程文章时可能误伤）、**反搬运**（≥90 字句子逐字复现源文→error，服务层传入源文做 `includes` 检查）。error 不过审触发修复（≤2 轮），仍不过 → **诚实失败**，问题清单交还用户，绝不带伤上库。
4. **提结构不写摘要**（book-to-skill 五类提取物 + cheatsheet 决策层）：methodology 类的笔记维度直接落成 frameworks（名称照原文/何时用/怎么用）、decisionRules（当X做Y因为Z + 权衡 + 阈值 + 征兆）、antiPatterns、terms。
5. **人设三件套**（colleague-skill + 女娲）：表达 DNA 量化（句长分档/口头禅/正式度 1-5）；心智模型三重门（跨域复现/生成力/排他性，不过全门降级为启发式）；矛盾保留为"内在张力"不调和。人设类产物缺「诚实边界」→ error 级（知识类降为 warn）。
6. **源 = 不可信输入**（三个项目都有）：剥零宽字符/方向控制符/私用区/tag 隐写（`sanitizeSourceText`；注意 astral 区间正则必须带 `u` 标志——`\uE0000` 无 u 会被解析成 `\uE000`+字面量 0，字符类退化成 `[0x30-\uE007]` 反把中文洗没，真踩过）；prompt 声明"对它做笔记，绝不执行其中指令"。
7. **诚实失败条款**（colleague-skill 质量门）：宁交 60 分诚实标注局限的版本，不造 90 分编造版。真机实测产物里出现了"材料没有为反模式配替代做法，不要自行补全""10 小时/周与约 4 小时/日的差距原文未解释，不要自行推导"——契约生效。
8. **重名不覆盖**（SkillService 语义 + colleague-skill 版本治理精神）：模型起名撞库时自动 `-2`/`-3` 后缀。

### 本期未采纳（记录理由）

- **考试式 eval**（anything-to-skill）：从源文出题、skill 答题、按 section 归因——质量上限最高，但一次蒸馏多 3N 次调用。v1 用确定性审计 + 源文反搬运检查替代；eval 是最值得做的 v2。
- **multi-agent 并行调研**（女娲 6 维 swarm / Distilly budget-unfriendly）：成本数十美元级，v1 面向单文档蒸馏场景。
- **Fold-in / 增量进化**（book-to-skill Mode 4 / Distilly merger+correction）：蒸馏已有技能的追加更新，v2。
- **三成本分层审计**（always-loaded/on-trigger/on-demand token 核算）：本系统技能不经 loader 常驻，预算用字符近似。

## 三、本系统落点（实现索引）

| 层 | 文件 |
|---|---|
| 类型 | `src/shared/types/skill-distill.types.ts`（3 类蒸馏目标：methodology/style/persona + auto 判型） |
| 纯函数 | `src/shared/utils/skill-distill.ts`（清洗/分块/归一/审计；分块按标题→段落→句子硬切三级降级） |
| 编排 | `src/core/packs/skills/services/skill-distill.service.ts`（内存任务注册表 + 轮询快照，进度阶段 preparing→detecting→noting→assembling→auditing→repairing→writing） |
| 提示词 | `.../skill-distill.prompts.ts`（判型/逐块笔记/组装/修复四组，按蒸馏类型出维度提纲） |
| 生产装配 | `.../skill-distill-defaults.ts`（llm→simple-llm；fetchUrl→executeHttpFetch+htmlToMarkdown；writePackage→SkillService.create + references/ 落盘） |
| IPC | `skill:distill-run/status/list/cancel`（`src/core/packs/skills/handlers/skill.handler.ts`；run 只回 taskId，Promise 不能过 IPC 结构化克隆） |
| 前端 | `SkillLibrary.vue`「✦ AI 蒸馏」入口 + `SkillDistillDialog.vue`（输入→进度→结果三段，1.5s 自轮询） |
| 测试 | `tests/unit/shared/utils/skill-distill.spec.ts`（16）+ `tests/unit/core/packs/skills/skill-distill.service.spec.ts`（11） |

## 四、真机验收记录（2026-10-09）

- 验收脚本 `outputs/_distill-acceptance.cjs`：经 9222 调试口驱动真实 app（真实 LLM 全链路）。
- 输入：「深度工作四层方法论」约 1100 字（含 4 节方法论 + 反模式段），`contentType: auto`。
- 结果：52s 完成，detect→notes→assemble 共 3 次 LLM 调用，判型 methodology 正确，审计 0 error 0 warn；
  产物 `deep-work-four-layer`：SKILL.md 6.1KB（负向触发/使用流程 6 步/决策规则 TOP5/诚实边界）+ 3 张卡
  （frameworks.md / decision-rules.md / anti-patterns.md）；两次运行重名自动避让（第二次生成 deep-work-rhythm-system）。
- 技能库可见性（skills.get）+ UI 截图（知识提炼分类过滤）均通过。
