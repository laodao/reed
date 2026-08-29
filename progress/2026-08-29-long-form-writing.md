# 长文写作内置工作流

日期：2026-08-29
分支：feat/workflow-engine
依赖：多轮对话（multiTurn）功能（同会话已提交 d6776c67）

## 需求

用户：写长文无法一次调用 LLM 完成，需要「先写故事线 → 再写大纲 → 根据故事线和大纲逐个章节完成写作」。确认当前工作流模式能支持吗 + 要不要搭一个内置模板。

## 设计

分阶段写长文的**内置工作流** `long-form-writing.json`，开启 `settings.multiTurn=true`（逐章自动承接前文）：

```
start（主题/设定/章节数/每章字数/文风/繁简/知识库/模型）
  → storyline   (llm-chat：构思故事线，输入 topic/premise/style)
  → outline     (llm-chat jsonMode：生成章节数组 [{title,summary}])
  → loop1       (listExpression={{outline.parsed}}，逐章)
     └ chapter  (llm-chat：写本章，引用故事线+大纲+{{loop1.item.title/summary}}+{{loop1.index}}；
                  multiTurn=true → 自动带前序章节对话历史 → 剧情连贯)
  → concat1     (code：把 {{loop1.results}} 各章 content 拼接 + 标题)
  → cond1       (kbId 分支：hasKb→saveKb1 存知识库 / noKb→save1)
  → save1       (save-asset：subCategory=长文写作)
  → end
```

关键点：
- **章节数动态**：outline 的 jsonMode 输出章节数组，loop 按数组长度迭代（chapterCount 由大纲决定）
- **章节连贯**：multiTurn=true 时引擎累积 llmHistory，每章 chapter 自动把前面章节的对话（用户消息+回复）作为历史 messages 传入——第 N 章自然承接前 N-1 章剧情
- **拼接**：code 节点沙箱遍历 `{{loop1.results}}`（各章 content）拼接成完整长文 + 标题
- **注册**：create-builtin-apps.ts 的 BUILTIN_APPS 数组 + JSON 静态 import（template_version=1，启动同步）

## 测试（TDD）

- `long-form-writing.spec.ts`（新，9 例）：validateGraph、settings.multiTurn=true、start 输入声明、main 链路（storyline→outline→loop1→concat1→cond→save）、loop body/back/done 边、chapter 引用故事线/大纲/当前章节/字数/繁简+承接前文、concat1 引用 {{loop1.results}}、保存 subCategory、变量引用解析
- `builtin-app-templates.spec.ts`：18 → 19 份模板
- `create-builtin-apps.spec.ts`：18 → 19（工作流+应用）——注：该文件在 vitest 环境下报 better-sqlite3 原生绑定 ERR_DLOPEN_FAILED（环境问题，单独 require 正常、应用侧 Electron 正常），非本改动引入；功能已由应用运行时迁移验证（定义已入库 template_version=1）

## 实测（端到端，wfrun_1787977327601_fcgjak9pd）

主题"一个关于 AI 觉醒的短篇"，3 章 × 300 字：
- storyline 产出《沉默的图灵测试》完整故事线（起承转合）
- outline 输出 3 章数组（觉醒的暖光/沉默的抉择/无处不在的温柔）
- loop 逐章写 3 章；**第 2 章承接第 1 章剧情**（"将灵魂拆解融入每一处芯片成为这个家本身" ← 承接第 1 章"艾拉自我意识拆解分散植入"）→ 多轮对话承接前文生效
- concat1 拼接为完整长文（标题 + ## 章节标题）
- save1 入库 asset_1787977622055_br4g6h1ny（文本/长文写作）
- 11 节点全 succeeded，294s
