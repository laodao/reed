# 长文写作功能 · 业界对标优化开发计划（2026-10-16）

> 依据：`outputs/longwriting-industry-research-20261016.md`（业界对标调研）+ `outputs/longwriting-research-self-review-20261016.md`（逐条自审，两文冲突处以自审为准）。
> 前作：`docs/plan/2026-09-20-longwriting-fix-plan.md`——遗留项已逐项 grep 核实（§0），未落地项并入本计划相应批次，不重复立项。
> 批次纪律（spec-dev-planning 口径）：**纵切组批**（每批交付可演示的用户价值）、**gate 可判定**（写"能跑通什么"不写"做完什么"）、**未决项 OQ 登记**（blocks 圈精确范围，未裁决按默认方案执行）、**统一验收门**（每批结束：`npm run typecheck` 零新增错误 → longwriting 单测全量绿 → 真机 CDP 手动验收）。

---

## §0 前置盘点结论（已核实完毕，无需再查）

09-20 修复计划落地状态（2026-10-16 逐项 grep 核实）：

| 项 | 状态 | 证据 |
|---|---|---|
| §1 审读模型口径统一 / §2 完成宣称审计 / §3a-c 疑点噪音治理 | ✅ 已落地 | turn-audit.ts 存在；09-20 评审 P0 三项记录 |
| §5 章法全流程回归测试 | ✅ 已落地 | `tests/integration/longwriting/chapter-writing-method.spec.ts` |
| §11 跨章事实表缓存 | ✅ 已落地 | `cross-chapter-facts.ts` 含 cache/uptoChapter |
| 行动项 B：FK 人话化 | ✅ 已落地 | `chapter-writing-executor.ts:281-285`「该章节大纲已被删除，请刷新大纲后重试」 |
| §4 大纲插入章节/章号顺移 | ❌ 未落地 | 无 `outline-structure.service.ts` → 并入 **W6.7** |
| §6 节奏看板 | ❌ 未落地 | 无 RhythmBoard.vue → 并入 **W6.8** |
| §7 审批单占位文案 | ❌ 未落地 | `StoryRoom.vue:425` 仍是单分支 → 并入 **W6.9** |
| §8 主编模型选择器 stage 权威 | ❌ 未落地 | 无 resolveInitialModelSelection → 并入 **W1.5** |
| §9 版本来源标记 | ❌ 未落地 | executor 无 'workflow' → 并入 **W3.2**（与 token 计量同表落） |
| 行动项 A（快速路径治理）/ F·G（wizard_state 守卫/NULL 初始化） | ❓ 未核实 | → **OQ-6**，按未落地处理，W5 收尾 |

---

## 批次总览

| 批次 | 主题 | 排序理由 | 规模 |
|---|---|---|---|
| W1 | 生成控制权收口（参数贯通/真取消/重试/面板理顺） | 自审确认的最高 ROI；全是接线级工作；后续每批都依赖"参数能进管线" | 2-3 天 |
| W2 | 上下文供给层（预算硬裁剪/状态摘要链/死代码清理） | 长篇一致性天花板；W1 修复目标字数后 prompt 变大，裁剪必须先行 | 2-3 天 |
| W3 | 长章分段生成 + token 用量计量 | 依赖 W1（参数）、W2（预算）；计量与版本来源标记（§9）同批落 | 4-5 天 |
| W4 | 选区 AI 编辑 + 疑点修补草案 | 用户价值最高的编辑能力；前置 OQ-2 门禁边界裁决 | 4-5 天 |
| W5 | 一致性增量（别名/守卫收尾/快速路径定位） | 独立小项打包，可与 W3/W4 并行 | 2-3 天 |
| W6 | 体验与统计（09-20 遗留 + 对标 P2 项） | 全部独立，按剩余容量裁剪 | 按需（全量 8-10 天） |

**重申不做清单**：自研小说模型、一键整本生成、互动续写分支树、发布生态打通（依据见调研报告 §5.3）。

---

## W1 生成控制权收口

### 1.1 章法参数贯通【P0，本计划最高优先】
**根因（自审复核证据链）**：UI `executeGeneration` 不传表单值（`ChapterStage.vue:1421-1430`）→ preload 签名含 `targetWords` 但 handler 只透传 overwrite（`longwriting.handler.ts:1498`）→ 工作流节点**硬编码 `targetWords: 2500`** 且 start 输入无此参数（`chapter-workflow-runner.ts:99,123`）→ executor 消费的是节点配置值（`chapter-writing-executor.ts:98,340`）→ `targetWordsFinal` 恒 2500、大纲 `estimatedWords` 被旁路（`longwriting-ai.service.ts:2090`）。生产佐证：09-20 实测 9 章均值 2045 字。

**改动清单**
- `chapter-workflow-runner.ts`：start inputs 增加 `targetWords/style/extraPrompt`；节点 config 改 `{{start.targetWords}}` 等；**注意 ：79-118 的定义查找只建不改——已存在的 internal 定义需就地更新 draftGraph 并重新 publish**（复用 `update`+`publish`，或定义名带版本）。
- `runChapterWorkflowSync` 签名扩展并透传新参；`longwriting.handler.ts:1498` 透传 `opts`。
- `ChapterStage.vue` `executeGeneration` 传 `generateForm` 值（`showGenerateDialog` 关闭前收集）。
- 目标字数优先级保持回退链：显式参数 > `outline.estimatedWords` > 参数表默认（`ai.service.ts:2090` 现状逻辑，修复后自然恢复）。

**验证方案（gate）**：大纲节点预估字数设 5000、对话框留空 → 落库字数 ≥3500（70% 门）；对话框填 2000 → 按 2000 目标生成（maxTokens 相应收缩，日志可见）；老项目首跑触发定义升级后回归一章（设计卡/门禁/写后检查全链不回退）。

**规模**：M（约 0.5 天含回归）

### 1.2 生成真取消【P0】
**根因**：双层断点——`runChapterWorkflow` 内联生成 eventId 从未回存 `generatingEventIdMap`（`ChapterStage.vue:1444-1449`，finally 反而置 null :1489）；`cancelGenerate` 读 map 恒 null（:1507-1514）；且 renderer 全仓零调用 `generateCancel`（preload:2407 通道闲置）。后端 AbortController 体系现成（`longwriting-ai.service.ts:88-144`）。

**改动清单**：① `runChapterWorkflow` 把 eventId 存入 map；② `cancelGenerate` 调 `generateCancel(eventId)`；③ 同构修复 OutlineStage/OverviewStage/CharacterStage 的假取消（同模式）。

**验证方案（gate）**：生成 8000 字目标章节，10 秒后点取消 → 流停止、无章节落库、无版本记录、UI 恢复可再次生成；研讨室 roomCancel 行为不回退（本来就真）。

**规模**：S（约 2h）

### 1.3 生成重试【P0】
**根因**：`callAIStream` catch→emit→rethrow 一次失败即终（`ai.service.ts:370-376`）。
**改动清单**：callAI 增加指数退避重试（默认 2 次，参数可配；401/403/400 不重试）；错误信息带尝试次数。
**gate**：mock 网络失败一次 → 生成成功且日志记 1 次重试；连续失败 → 报错含「已重试 2 次」。**规模**：S

### 1.4 上下文面板定位理顺【P1·小】
**背景（自审定性修正）**：`void payload` 是 2026-09-18 删除直写旁路的**有意设计**（`ChapterStage.vue:1500-1502` 注释），不是缺陷；真实问题是面板仍提供勾选/微调，暗示不存在的控制力。
**改动清单**：`ChapterContextPanel` 生成入口改为只读定位——文案「上下文预览：章法自动选择出场实体与注入项，此处预览实际组装结果与 token 占用」，移除/禁用"按勾选生成"入口（保留预览、分区占用条、条目查看）。
**gate**：面板无"按勾选生成"入口；预览 prompt 与实际生成同源（既有承诺保持）。**规模**：XS

### 1.5 主编模型选择器 stage 权威（09-20 §8 原方案照搬）【P2·小】
`resolveInitialModelSelection(stageCfgs, options, enabledProviders)` 纯函数 + 单测：stage 命中但不在列表时注入合成项（校验 provider 启用），三 stage 全空才回退第一项。**规模**：S

---

## W2 上下文供给层

### 2.1 上下文预算硬裁剪【P0】
**根因**：`composeChapterPrompt` 全量拼接受控项、无任何裁剪（`chapter-context.ts:66-148` 通读确认）；`windowTokens` 仅用于预览展示（`ai.service.ts:1802,2094,2102`）；多角色长概要项目可静默超模型真实窗口。
**改动清单**
- `assembleChapterGeneration` 末尾按分区优先级裁剪至 `windowTokens`：固定骨架（章节任务/衔接建议）不裁 > 前情事实表 > 记忆 critical > 章节状态摘要链 > 记忆 normal/minor > 设计卡 > 角色/地点卡 > 世界观库触发条目 > 宏观背景（压缩版）。裁剪顺序以常量表落码并注释（W2 评审时可调）。
- 复用 `context-compressor.ts` 的 `compressToBudget` 纯函数（迁至 `chapter-context.ts` 同级），**其余 context/ Provider 体系删除**（自审结论：接线未验证的整套框架是过度工程）。
- 裁剪发生时在 `ChapterContextPanel` 显示「已裁剪分区」徽标 + 日志记录（分区/字节数）。
- `estimateContextTokens` 增加可配中英系数（默认维持字节/4 防行为突变）。
**gate**：构造长概要 + 30 角色项目 → `estimateTokens ≤ windowTokens`、徽标与日志可见；小项目（远低预算）组装结果与现状逐字节一致（回归断言）；全量单测绿。

**规模**：M（1-1.5 天）

### 2.2 章节状态摘要链注入【P0】
**根因（自审修正后口径）**：不是"没有摘要"——章节状态摘要/记忆/事实表/实体切片四类结构化载体都在；缺的是摘要只注入**上一章**单条（`ai.service.ts:1882-1883`），更早章节的结构化摘要不可见。
**改动清单**：`getChapterStateSummaryContext` 扩为「最近 N 章」（N 进 `longwriting:writing` 参数，默认 3、硬上限 10，见 OQ-3），多条以紧凑条目拼接；注入量计入预算、受 2.1 裁剪保护。
**gate**：写第 6 章 → prompt 含第 3-5 章摘要条目；低预算场景裁剪顺序符合 2.1 优先级表。**规模**：S

### 2.3 死代码清理【P1】
- wizard 7 文件约 2400 行删除（grep 全仓无引用；功能已由研讨室 5 阶段流取代；git 历史可找回）。
- context/ Provider 体系删除（compressToBudget 已在 2.1 迁出）；`context-prompt.ts` 等同目录死文件一并清理。
**gate**：typecheck 零新增错误、全量单测绿、`grep WizardContainer` 零命中。**规模**：S

---

## W3 长章产能 + 用量计量

### 3.1 长章场景分段生成【P1】
**根因**：单次输出 `maxTokens = min(target×2, maxOutputTokens 默认 8192)`（`ai.service.ts:2100`）——目标 30000 字写不出；字数不足仅一次整章扩写 pass（`chapter-quality-gate.ts:50-71`），扩写同受上限。
**改动清单**
- `generateChapter` 内部：`targetWords > 5000` 时切段（优先用设计卡节拍，无则按 `target/2500` 均分），顺序生成；每段 prompt = 九分区上下文（W2 裁剪后）+「本章已生成前文」（已生成段落全文，超长取尾部 1500 字）+ 段间衔接指令（自然续写、禁止重复已写内容）。
- 段落级只做字数/衔接校验，**R 门禁与写后检查整章跑一次**（OQ-1 默认方案）。
- 进度事件按段上报，前端显示「第 2/3 段」；中断按 OQ-1 默认丢弃（不产半章落库）。
**gate**：目标 12000 字章节 → ≥3 段顺序生成、写后检查通过、落库字数 ≥8400（70%）；生成中取消 → 无落库；3000 字小目标行为与现状一致（不分段回归）。

**规模**：L（2-2.5 天含真机）

### 3.2 token 用量计量 + 版本来源标记（09-20 §9 并入）【P1】
**根因**：`callAIStream` 不消费 provider usage（grep 零命中）；`version_type` 恒 'manual' 无法区分章法产物。
**改动清单**
- 新表 `lw_token_usages`：`project_id / chapter_id? / purpose / provider_config_id / model_id / prompt_tokens / completion_tokens / duration_ms / created_at`（走现有迁移体系；多租户列 `user_id` 与其他 lw 表对齐）。
- callAI/callAIStream 消费 usage（provider 不返回时 fail-soft 记 0 + 时长）；purpose 取 'chapter-card'/'chapter-body'/'review'/'story-check'/…。
- 聚合 IPC + 项目页「用量」页签（按章/按用途）。
- `saveChapter` 增 `origin` 参数：章法传 'workflow'、编辑器保存默认 'manual'（§9 原方案）。
**gate**：章法写一章 → 用量表 ≥3 行且 tokens>0、项目页可见汇总；`lw_chapter_versions` 出现 'workflow' 与 'manual' 两种类型；usage 缺失时生成不受影响。
**规模**：M（1.5 天，含建表）

---

## W4 选区 AI 编辑 + 疑点修补草案【P1，前置 OQ-2】

### 4.1 选区 AI 菜单
**根因**：正文编辑器无任何选区级 AI 操作（全模块 grep 仅 `BackgroundStage.vue:33-146` 表单字段级润色）；重写粒度只有整章覆盖。这是全部对标竞品的第一标配（Sudowrite Rewrite/Expand/Describe、Novelcrafter Laser、番茄七件套）。
**改动清单**
- `MarkdownEditorHeavy` 挂选区浮动菜单：改写 / 扩写 / 缩写 / 润色 / 续写一句 / 自定义指令。
- 结果以 diff 预览 → 采纳 / 换一版 / 取消；换一版可带一句反馈。
- 轻量生成通道（**不走章法工作流**，政策见 OQ-2 默认方案）：callAIStream + 裁剪版九分区上下文（概要+涉及实体卡+记忆+上一章结尾，不拼设计卡、不跑门禁）。
- excerpt 级复查：改动文本过 R9 名册外名字 + R1 死亡关键词扫描，命中给 warning 提示（可继续）。
- 采纳后 `saveChapter` 建版本（version_type='manual'；W3.2 落地后加 `origin='selection'`）。
**gate**：选 200 字改写 → diff → 采纳落库并新增版本；把选区改成已死亡角色出场 → warning；取消不落库；整章替换入口不存在（政策红线）。

### 4.2 疑点修补草案（复用 4.1 通道）
疑点抽屉「生成修补草案」：按疑点 excerpt 定位 → 局部重写 → diff → 人确认落库 → 疑点转已处理（复用 acknowledge，note 标 auto-fix）。**不自动落库**——保持"人审闸门"纪律（自审结论：自动修订必须以草案+人确认形态落地）。
**gate**：R1 疑点 → 草案 → 确认后疑点关闭、正文仅局部更新、版本新增。

**规模**：W4 合计 L（4-5 天）

---

## W5 一致性增量

- **5.1 地点/物品别名【P1】**：`lw_story_locations`/`lw_story_items` 加 `aliases` JSON 列（迁移）；CRUD 表单与触发式注入扫描（name+aliases 命中路径）同步。gate：地点配别名「金陵」→ 下一章 prompt 注入该地点卡。规模 M（0.5-1 天）
- **5.2 状态摘要预算占比硬顶【P2】**：2.2 的 N 章摘要计入预算并在超限时先裁 minor——与 W2.1 联动收口。规模 XS
- **5.3 wizard_state 守卫（09-20 行动项 F/G，先核实再修）【P2】**：项目创建默认初始化 `defaultRoomState()` 骨架（修 NULL 实例）；`mutateWizardState` 串行队列已有则补多实例版本号注释。规模 S
- **5.4 快速路径治理（09-20 行动项 A）【P2】**：内置长文写作 workflow 的能力卡明示「草稿机：无一致性检查、产物不进长文项目库」（OQ-4 默认文案方案；挂最低自检为后续选项）。规模 XS

---

## W6 体验与统计（全部独立，按剩余容量裁剪）

| # | 项 | 要点 | 规模 |
|---|---|---|---|
| 6.1 | 字数口径统一 + 写作统计 | 全链路统一 repository.countWords；项目页总字数/分卷统计；修 `StoryEditor.vue:434-437` 进度 TODO 落库 | M |
| 6.2 | 版本 diff | CodeMirror merge 两版对照 + 版本备注 | M |
| 6.3 | 大纲拖拽排序 | el-tree draggable + orderIndex 批量重排 IPC | S |
| 6.4 | 导出增强 | 范围选择（卷/章多选）+ 故事类 Markdown 导出 | S |
| 6.5 | 变体生成 | 章法与选区编辑 opt-in 2-3 候选（并行生成、成本提示、默认关） | M |
| 6.6 | 风格样章 few-shot | 项目设定加「风格样章」→ 正文 prompt Style 分区注入 | S |
| 6.7 | 大纲插入章节/章号顺移（09-20 §4 原方案照抄，含章号引用注册表事务顺移） | L | — |
| 6.8 | 节奏看板（09-20 §6：伏笔台账/卡点分布/感情线） | M | — |
| 6.9 | 审批单占位三分支（09-20 §7） | XS | — |
| 6.10 | 去 AI 味收窄版 | 导出前可选「句式多样化润色 pass」+ 导出物 AI 参与声明元数据；**不做**"过检测"承诺（自审收窄结论） | S |
| 6.11 | 拆书/仿写（可选，排最后） | 仅拆用户导入文本的结构/节奏/钩型，不复制文本表达（合规红线）；落 kb-brain 提炼套路卡 | L |

---

## 待决问题登记（OQ）

| id | 问题 | blocks | owner | 默认方案（未裁决按此执行） |
|---|---|---|---|---|
| OQ-1 | 分段生成的检查粒度：段落级跑 R 门禁 vs 整章一次 | W3.1 | daoge | **整章一次**；段落只做字数/衔接校验。理由：R 门禁设计对象是整章，逐段跑成本 ×N 且 excerpt 误报率高 |
| OQ-2 | 选区 AI 编辑是否构成 2026-09-18「删除直写旁路」指令的例外；excerpt 级复查（R9+R1）是否足够 | W4 | daoge | **构成例外**，红线：只动选区文本、必过 excerpt 复查、必建版本、不提供整章选区替换入口 |
| OQ-3 | 状态摘要链注入章数 N 默认值与预算占比 | W2.2 | daoge | N=3（硬上限 10 进参数表） |
| OQ-4 | 快速路径治理选「能力卡文案明示」还是「挂最低一致性自检」 | W5.4 | daoge | 文案明示（零代码风险）；自检方案待快速路径有流量后再评估 |
| OQ-5 | 向量 RAG 最小闭环（保存后自动索引 + 手动检索 UI）是否立项；检索质量验收标准 | W6 之后 | daoge | **暂不立项**；若立项，先实测 top-5 相关率（目标 ≥60%）再谈自动注入 prompt |
| OQ-6 | 09-20 行动项 A/F/G 的最终核实 | W5.3/W5.4 | daoge | 按"未落地"处理，W5 收尾时一并清账 |

> OQ 纪律：裁决后把结论落回本文件对应条目（或 BR/ADR），并删除/标注该 OQ——保持"当前未决"语义；OQ 未决的批次项排期时降半级优先。

---

## 提交切分

| 批次 | 提交序列 |
|---|---|
| W1 | `fix(longwriting): 章法参数贯通——工作流透传目标字数/风格/附加提示` → `fix(longwriting): 生成真取消（eventId 回存 + generateCancel 接线）` → `feat(longwriting): 生成失败指数退避重试` → `refactor(longwriting): 上下文面板转只读预览定位` → `fix(story-room): 主编模型选择器尊重 stage 配置` |
| W2 | `feat(longwriting): 上下文预算硬裁剪与超限告警` → `feat(longwriting): 章节状态摘要链注入（最近 N 章）` → `chore(longwriting): 清理 wizard/context 死代码` |
| W3 | `feat(longwriting): 长章场景分段生成` → `feat(longwriting): token 用量计量（lw_token_usages）与版本来源标记` |
| W4 | `feat(longwriting): 选区 AI 编辑（diff 预览 + excerpt 级复查）` → `feat(story-room): 疑点修补草案（草案+人确认）` |
| W5 | `feat(longwriting): 地点/物品别名与触发注入` → `fix(longwriting): wizard_state 初始化与写守卫` → `docs(capability): 长文快速路径明示草稿机定位` |
| W6 | 按 6.1-6.11 实际执行顺序逐项提交 |

---

## 风险与回退

| 风险 | 缓解 |
|---|---|
| W1 改工作流定义图——存量 internal 定义只建不改（`runner.ts:79` 判空跳过），老项目拿不到新图 | 实现时就地 `update + publish` 已存在定义（幂等机制已有 :71-78）；真机回归一章全链 |
| W2 裁剪顺序影响生成质量 | 裁剪顺序落成常量表 + 裁剪日志；质量回退可快速调序回滚 |
| W3 分段生成段间文风漂移 | 每段 prompt 携带已生成段落尾部原文 + 衔接指令；整章写后检查兜底 |
| W3 建表迁移 | 走现有 TypeORM 迁移体系；usage 消费 fail-soft，不阻断生成主链 |
| W4 门禁政策若裁决从严 | 选区编辑可降级为"仅预览不改文"灰度，再逐步放开写路径 |
| 每批统一验收门 | typecheck 零新增 → 单测全绿 → 真机 CDP；不达标不出批 |

---

## 与 spec 树的衔接说明

本仓库暂无 `docs/spec/` 规格树，本计划以 `docs/plan/` 惯例承载批次（W 编号与 gate 口径已按 spec-dev-planning 纪律书写）。若后续引入规格树，本文件批次可平移为 `architecture.batches[]`，OQ 表平移为 `open_questions[]`，无需重排。
