# 「短视频脚本生成视频」写作层技能化（Writer-Skills）设计

日期：2026-09-07
分支：feat/workflow-engine
文档目录：tasks/2026-09-07-script-to-video-writer-skills/
前置：V3 通用视觉策略（tasks/2026-09-06-script-to-video-v3/design.md，已落地 builtin_def_script-to-video-v3）；
      工作流技能体系（progress/2026-08-29-workflow-skill.md，skill-call 节点 + SKILL.md 技能包 + 技能库已落地）

---

## 0. 背景与问题

V3 跑通后用户反馈：**成片能出，但"脚本"质量差——只是简单复述报告内容**。期望：

- 模仿**新闻调查**：有态度、有自己的看法；对负面新闻要适当**提出质疑**；
- 不同体裁应各写各的：新闻调查 / 产品介绍 / 科普…；
- 追问：能否用 **skill** 解决（新闻调查类→调查技能、产品类→种草技能、科普类→科普技能），让工作流更通用？是否还需要定义**角色**提示词？

根因（已在交流中确认）：

1. 输入侧：60s 文案由人/助手把报告压缩成"编年史"，无角度/态度/质疑 → 输入决定输出上限；
2. 预设侧：financial-deep 的 tone 是"客观中立、不煽情不站队"，叙事姿态压制调查体；
3. 提示词侧：outlineGen 只要求"结构+来源口径"，不要求报道主线/质疑点/观点句/金句；
4. 缺"锐度闸门"：大纲审核无自动提醒"是否复述腔"。

## 1. 方向与结论（P0 已验证）

采用**写作层技能化**：把"写脚本（大纲+口播）"从工作流内置提示词中抽离为**体裁技能包**，
工作流按 视频类型/用户选择 **动态调用对应技能**。质量、角色、态度全部沉淀为技能内容资产，
工作流本体收敛为通用流水线（新体裁 = 新增一个技能包，不改代码不改工作流）。

**P0 真机验证（2026-09-07）**：最小工作流 `start → pickSkill(code) → skill-call(skillId={{pickSkill.result.skillId}}) → end`，
跑两例：financial-deep → `short-video-script`、knowledge → `deep-analysis`，均 succeeded 且输出 skillId 正确。
结论：**skill-call 的 skillId 支持 {{工作流变量}}（引擎对节点 config 做 resolveConfigDeep），动态选技能无需改引擎**。

## 2. 目标与验收

| # | 能力 | 验收口径 |
|---|------|---------|
| G1 | 写作层按体裁调技能 | videoType=financial-deep → 调查技能；其余先回落标准技能；用户可手动覆盖 |
| G2 | 调查技能产出"有态度/质疑/观点"的新闻调查体脚本 | 星宇 60s 同文案重跑：口播含连环质疑/观点句/金句，非编年史复述；事实仍带口径、可归因 |
| G3 | 角色与态度可预设可切换 | 技能 frontmatter 内嵌 persona（角色）；start 提供 态度档 select（冷静调查/犀利质疑/共情叙事）与 自由角度描述 |
| G4 | 技能=内容资产，用户可维护 | 内置只读 + 技能库可"复制为自定义"编辑（沿用现有 skill.service 语义）；不新增平台代码面 |
| G5 | 不破坏 V3 视觉策略与审核闸 | imagery/asset 分流、素材板审核、逐镜审核、两级 reject→end 语义全部保留 |
| G6 | 质量兜底 | 保留大纲人审闸；新增技能带 60s few-shot 示例；M1 真机对照评审 |

## 3. 概念模型

### 3.1 体裁写作技能 = 角色 + 文体 + 纪律 + 示例 的创作包

沿用 SKILL.md（frontmatter + markdown 正文 + {{param.*}} 占位）：

```yaml
---
name: video-writer-investigative      # kebab-case，稳定 id
title: 视频脚本·新闻调查（财经深度）
description: 以新闻调查笔法把财经事件素材写成短视频大纲与口播：有态度、连环质疑、观点可归因
when_to_use: 需要给财经/企业负面或争议事件脚本注入调查感与态度时
category: 视频写作
inputs:
  - key: material      # 素材/文案全文（scriptSource=asset/text 的文本；topic 模式可为空）
  - key: context       # 知识库/背景参考文本（可空）
  - key: topic         # 选题主题（string）
  - key: keyPoints     # 要点（string）
  - key: attitude      # select: auto/冷静调查/犀利质疑/共情叙事
  - key: angle         # 自由描述：报道主线/立场/想强调的质疑（可空，空则技能默认）
system_prompt: |-
  角色：你是一名深度财经调查记者…（立场纪律：质疑必须指向素材中可查事实；
  观点与事实分离、可归因；禁止编造"知情人士"；口播正文绝不插入【来源】括注）
output_desc: 输出 markdown：大纲（title/定位/结构/总时长目标）→ 口播全文（| 分句）→ 分段说明；口径只进字幕层
---
正文：按 role → attitude 档位展开文体法则（钩子/反差/质疑组/观点/金句/引导）+ few-shot 60s 示例。
```

设计要点：

1. **角色内嵌技能**（不做独立角色注册表）：persona 放 frontmatter `system_prompt` + 正文"角色设定与话术"；
   理由：角色与文体强耦合，独立体系带来双轨维护。预留 frontmatter `role` 元字段（仅展示），未来如出现
   "同一文体×多人设×跨工作流复用"再抽独立角色资产。
2. **态度档=技能内参数**：正文按 `{{param.attitude}}` 分支给三档写法（冷静证据链 / 犀利连环质问 / 共情叙事视角），
   这就是"预设角色提示词"的落点，用户在 start 表单选择。
3. **质疑纪律（负闻硬性）**：对 官方口径 / 公司动作 / 数据 做三组质问模板；质疑必引素材可查项；
   禁止无中生有、禁止把质疑写成结论（用"为什么…/是否…"句式）。
4. **输出契约统一**（所有写作技能共用，保证下游 outlineReview/shotsGen 兼容）：

   ```
   ## 标题
   **定位** / **结构** / **总时长目标**
   ## 口播全文
   一句一段，以 | 分句（整片唯一口播文本；不得含任何念读括注/来源标记）
   ## 分段
   - **段落n** 作用｜要点｜口播：…
   ```

### 3.2 技能与视频类型映射（M1 起步，后续可扩充）

| videoType | 默认写作技能 | 说明 |
|---|---|---|
| financial-deep | video-writer-investigative | 新闻调查·财经（本 M1 重点，支持态度档） |
| news-talk / knowledge / travel / ecommerce / brand | video-writer-standard | 通用标准（行为 ≈ 旧 V3 大纲，保行为不回退） |
| 自定义 videoStyle | video-writer-standard | 兜底 |

用户可手动覆盖：start 新增 `writerSkill` select（auto=按上表；其余=直接选技能 id）。

### 3.3 角色（Persona）形态（回答"是否还需要定义角色"）

- **需要**，但以"技能包内嵌 persona + 技能内态度档"承载，见 3.1；
- 技能库管理页天然成为"角色提示词"的编辑入口（复制为自定义后改 system_prompt/正文即可换人设）；
- 不做独立的角色实体/注册表（避免与技能双轨），预留 `role` 元字段供将来升级。

## 4. 架构改造（V3 写作层替换，图内其余不动）

### 4.1 现状（V3 图链）

```
… scriptSrc → preset → strategy → outlineGen(llm-chat,写大纲+口播JSON) → outlineMd(code→md)
  → outlineReview(大纲人审闸, payload.md) → baseList → shotsGen(拆镜/意象) → splitShots → …
```

问题：写作提示词写死在 outlineGen systemPrompt 里 → 换不了文体、塞不进态度/质疑、用户不可维护。

### 4.2 改造后（写作层换成 动态 skill-call）

```
start 新增 writerSkill/writerAttitude/writerAngle 输入
… scriptSrc → preset → strategy → writerPick(code：videoType+writerSkill → skillId) 
  → writerCall(skill-call：skillId={{writerPick.result.skillId}}，
              inputs: material={{scriptSrc.result.text}} context={{kbText.result.text}}
                      topic={{start.topic}} keyPoints={{start.keyPoints}}
                      attitude={{start.writerAttitude}} angle={{start.writerAngle}})
  → writerMd(code：content → md 规整/去代码围栏)
  → outlineReview(大纲人审闸不变, payload.md={{writerMd.result.md}}) → baseList → shotsGen → …(全不变)
```

说明：
- 删除 outlineGen/outlineMd 两个节点；preset 保留（shotsGen/imgShot/vidShot 仍用 promptBlock/styleText/意象纪律）；
- strategy 保留（imagery/asset 分流与意象纪律只与拆镜/画面有关）；
- outlineReview / baseList→shotsGen / splitShots 及下游（素材板/逐镜/合成/保存/通知）**零改动**；
- 大纲审核闸仍在 → 仍可 approve_with_changes 注入净化版大纲（9/7 星宇运行已验证此机制）；
- KB/脚本三源文本都注入 writerCall：asset/text 模式 material=脚本全文、context=KB；topic 模式 material 空 + topic/keyPoints/context 齐备，技能自行起稿。

### 4.3 start 新增输入（video-preset 之上叠加，不改后端类型）

| key | 类型 | 说明 |
|---|---|---|
| writerSkill | select，默认 auto | auto=按 videoType 映射；否则直接选技能（M1 选项：auto/视频脚本·新闻调查/视频脚本·通用标准） |
| writerAttitude | select，默认 auto | auto/冷静调查/犀利质疑/共情叙事（仅调查类技能生效） |
| writerAngle | textarea 可空 | 自由补充：报道主线/立场/想质疑的点（空=技能默认角度） |

## 5. 内容资产：内置技能清单（builtin-skills.ts 增量）

M1 新增 2 个内置技能（source=builtin，只读，可复制为自定义）：

1. `video-writer-standard`（视频脚本·通用标准）：角色=资深短视频策划；规则=旧 V3 outlineGen 的定位/结构/口吻；
   用于非调查类与自定义类型，**保证行为不回退**；
2. `video-writer-investigative`（视频脚本·新闻调查·财经）：角色=深度财经调查记者；
   - 结构：冲突钩子 → 反差事实链（带口径） → 三组连环质疑（口径/决策/数据） → 观点与金句 → 引导；
   - 态度档三套写法（见 3.1）；正文含 1 条 60s 调查体 few-shot（星宇事件为样例骨架，可复用）；
   - 纪律：质疑可归因、观点与事实分离、口播零括注、不编造。

技能正文内嵌 few-shot（内置技能无独立 references 文件，示例直接写在正文"示例段落"），
用户复制为自定义后可自行扩展 references/。

## 6. 改动面清单

### 代码/数据
1. `src/core/platform/workflow/skills/builtin-skills.ts`：+2 技能（investigative / standard）。
2. `src/core/database/migrations/builtin-apps/script-to-video-v3.json`：
   - start.inputs + writerSkill/writerAttitude/writerAngle；
   - 删 outlineGen/outlineMd；+ writerPick(code)/writerCall(skill-call)/writerMd(code)；
   - 边：strategy→writerPick→writerCall→writerMd→outlineReview（替代 e19/e20）；outlineReview 下游不变；
   - outlineReview.payload.md 引用改为 {{writerMd.result.md}}。
3. 其余代码零改动（skill-call / skill 服务 / 引擎 / preset 均不动）。
   → boot 时 create-builtin-apps 会按 JSON 覆盖同步内置定义（INSERT/UPDATE 幂等），重启即生效。

### 测试（TDD，先改红再变绿）
1. `tests/unit/core/platform/workflow/script-to-video-v3-graph.spec.ts`：适配新节点/边数；新增断言：
   writerPick 映射 financial-deep→investigative、其余→standard；writerCall.skillId={{writerPick.result.skillId}}；
   outlineReview.md 绑定 writerMd；start 新输入存在。
2. skill.service 相关 spec：内置技能数 6→8 的断言同步（若断言了精确清单）。
3. 一致性：node-registry-consistency / builtin-app-templates 观察（无新节点类型应不受影响）。
4. writer 技能正文无单元断言（内容资产）；以 P2 真机对照为质量验收。

## 7. 阶段拆分与验收

- **M1（本轮）**：standard+investigative 两技能落地 + V3 JSON 写作层改造 + spec 更新全绿 + 重启 dev 同步；
  真机：星宇 60s 同文案、同参数（financial-deep→investigative，attitude=犀利质疑）重跑，
  大纲环节人工审核口播是否含质疑/观点/金句、是否零括注 → 素材板意象复核 → 跑到终态 → 与 9/6 复述版对比汇报。
- **M2（后续）**：news-talk/knowledge/ecommerce/brand/travel 五个体裁技能（各含角色+法则+示例）；
  start 表单体验（技能说明/态度档帮助文案）；必要时 attitude 对 standard 的透传。
- **M3（可选）**：角色独立资产评估；写作技能市场/共享。

## 8. 风险与边界

- 技能=提示词工程，质量不稳 → 大纲人审闸保留；few-shot 与纪律决定上限，先写准调查技能再扩散；
- 动态 skillId 已 P0 真机验证；若用户自选技能不满足"输出契约"，大纲审核仍可人工批改/替换；
- 口播零括注是硬纪律（9/7 已踩坑：outlineGen 塞【来源】括注会进 TTS）→ 技能正文 + 审核双保险；
- 内置定义每次 boot 从 JSON 同步覆盖 → 改 JSON 需重启才生效，DB 内对内置定义的手工修改会被覆盖（沿用既有语义）。
