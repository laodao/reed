# 内置「主题实操研究」工作流模板 落地记录（2026-09-09）

分支：feat/domain-learning。设计文档：tasks/2026-09-09-topic-research-workflow/design.md。

## 需求
用户要一个"研究某个主题"的工作流：例如了解跨境电商做法、在 TikTok 上开店怎么做，产出要含
详细步骤、注意事项、运营方法等。已确认形态 = the-bot **内置工作流模板**；示例验收主题 = 「在 TikTok 上开店怎么做」。

## 裁决（详见 design.md §0-§2）
- 形态 = 新增 1 份内置模板 JSON + `BUILTIN_APPS` 注册，**引擎/节点/技能/前端零改动**
  （复用 industry-research.json 同款节点组合：llm-chat jsonMode/loop/web-search/report/human-review/save-asset）。
- 产出 = Markdown 实操指南文本资产；human-review 人工确认后才落资产；不做知识库落库（属
  tasks/2026-09-07-domain-research-workflow 另一条未评审设计线，不抢跑）。
- 通用模板：章节由"规划节点"按主题与勾选维度拆解；提示词强制覆盖做法型骨架（步骤/注意/运营方法），
  防幻觉纪律（来源只取搜索结果、禁编造 URL、需核实、以官方最新为准）写进摘要/成稿两处提示词。

## 改动
1. `src/core/database/migrations/builtin-apps/topic-research.json`（新增）：10 节点 11 边
   （start→plan1→loop1{search1→summ1}→compose1→report1→review1→approve:save1/end，reject:end）。
   start 输入：topic(textarea 必填)/focus(维度多选：总体认识·详细步骤·注意事项·运营方法·工具与资源·常见问题)
   /depth(quick/standard/deep 默认 standard)/model(必填)。
2. `src/core/database/migrations/create-builtin-apps.ts`：import + `BUILTIN_APPS` 追加 1 条
   （appId=builtin_app_topic_research，defId=builtin_def_topic-research，category=调研，tags=主题研究/实操/指南）。
3. 测试：
   - 新增 `tests/unit/core/platform/workflow/topic-research-graph.spec.ts`（11 例图断言）。
   - `builtin-app-templates.spec.ts` / `create-builtin-apps.spec.ts`：**修陈旧基线**（改造前已红：
     模板数断言 19 实际 23、定义/应用行数断言 21 实际 23、select-dynamic source 白名单缺 `assets:*`
     前缀而运行时 RunInputForm 实为前缀通配）→ 对齐 23 后随本模板 →24。

## 验证
- 定向 spec 全绿：3 files / 29 passed（topic-research-graph 11 + builtin-app-templates 8 + create-builtin-apps 10）。
- eslint：改动文件 0 errors。
- 未跑全目录单测（范围过大超时，属误操作，已改为定向跑）。

## 真机验收（待用户在应用内执行，design.md §7）
1. 重启应用 → 「应用/工作流」出现「主题实操研究」；运行"在 TikTok 上开店怎么做" →
   逐问搜索摘要 → waiting_review → 审核页指南含步骤/注意/运营方法/来源 → approve 落资产 / reject 不落。
2. dl task 会话 run_workflow 触发复验（补 dl 收口遗留③"待有模板后复验"，progress/2026-09-09-domain-learning-task-exec.md）。
3. 换主题（如"跨境电商怎么做"）确认章节随主题自适应。

## 提交
本地提交待 push 指令。
