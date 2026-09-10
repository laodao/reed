# 领域共学空间:答疑框智能判断 + 任务化执行 收口(2026-09-09)

分支 feat/domain-learning。目标 M6-3(同框自动判断,不设模式;复杂任务拆子任务/进度展示;
必要时 skill/工作流;全部基于 agent-harness,不另造 harness)。

## 摸底结论(目标①)
- dl 会话(bindings)构成:dl_* 动作 + 读工具(research/task;tutor 不带)+ 系统透出;
- 系统透出 DL_SYSTEM_PASSTHROUGH = discover_capabilities / invoke_skill(所有模式);
  task 会话额外透出 DL_TASK_WORKFLOW_TOOLS = run_workflow / get_workflow_run;
- 宿主护栏:DL_AGENT_MAX_STEPS=12、工具频控表、回复/事件通道 dl:agent:<spaceId>[:conceptId] 与
  dl:generate:<eventId>;动作富事件 action:done 回流(actionSummaries/前端 taskLog);
  记忆 flywheel 与 workflow 模板为平台基座能力(task 可 run 已有模板;dl 域模板暂无)。

## 交付(三阶段)
- 阶段一(意图路由 + task 会话):shared 纯函数 routeDlIntent(强任务词→task/弱词带产出宾语→task/
  默认 tutor);dl-agent 新增 task 模式(bindings 同 research 级:读工具+动作+系统透出),系统提示词
  dlTaskSystemPrompt(答疑讲解/资料采集/整理规划生成/技能工作流/长任务拆 2-5 子步骤逐步回报、不落
  dl_question);task 回复气泡保留(仅 tutor 刷新即清,切概念清);mode 类型链三端扩展。
- 阶段二(进度可见):前端采集 action:done 动作流水 taskLog,「任务执行」进度条 ✓已建概念/已存讲义等。
- 阶段三(子任务结构化 + 工作流):dl_task_progress(plan/start/done,只上报不落库,仅 task bind)→
  前端子步骤 chip(「任务计划:共N步/▶开始/✓完成」);task 透出 run_workflow/get_workflow_run。

## 验证
- TDD/回归:意图路由 spec(答疑/任务/弱词边界)、bindings spec(task 含进度与工作流透出、research/tutor
  不含)、技能契约等;阶段末 11 files 59 passed、bindings 8 passed;eslint 0 errors;
  vue-tsc 相关零新增(仅既有 MarkdownViewer 存量错误)。
- 真机:①答疑输入走 tutor 正常存档;②任务指令自动路由 task(研究/整理…),Agent 先查能力再执行并保留回复;
  ③复杂任务(分三步整理)→ 模型按 dl_task_progress 协议上报「计划共3步→第1/2/3步 开始/完成」,进度条逐步点亮;
  ④动作落库照旧 dl_* 服务校验(走查中 dl_save_concept 幂等更新「先验概率」定义)。

## 提交(本地,待用户 push 指令)
M7-A dac120ef(起步研究 skill)、M7-B 997cc9d5(空间笔记总览)、阶段一、阶段二 3b8c5f9f、
阶段三 e6069c46、workflow 透出 a319d2ef。

## 遗留(如实)
- 平台暂无 dl 域工作流模板:run_workflow 真实触发场景待有模板后复验(不硬造);
- 意图路由为可测启发式(默认 tutor),极端表达可能误判(样例已盖);如需更强可后续叠加 LLM 复核;
- push 待用户显式指令;子任务队列纯函数以工具协议+前端展示达成(未另做独立纯函数队列)。
