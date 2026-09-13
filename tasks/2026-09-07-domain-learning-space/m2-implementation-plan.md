# M2 实施计划:研究引擎自动化 + 图谱视图增强(领域共学空间)

依据 design-v3.md §15 M2、atlas-design.md、content-template-design.md(§5 相关)、design.md v2 §7。

## 0. 范围决策(用户 2026-09 拍板)

- 里程碑顺序 **A→F**,每里程碑提交+汇报;
- 自动推进载体 = **包内 scheduler + dl 宿主直跑**(不工作流化、不迁 AgentTaskService);
- 「模板可视化编辑(区内微调/折叠偏好)+ content_md 导出完善」与「研究环节工作流化」**挪 M3**;
- 自动采集真机验收源:**KB + arxiv/公开页(http_get)兜底**;`web_search` 分支做成「有默认搜索源即 bind/启用,无则跳过并在事件中提示」。
- 硬约束不变:一切长程/上下文管理/子任务规划环节基于 agent-harness(dl 宿主直驱),禁止另起炉灶。

## 1. 侦察结论(2026-09 复核,已核源码)

- agent-harness 读工具可直接复用,均**裸名注册**于 AgentToolRegistry:
  - `web_search`(agent-builtin-tools.ts → search-engine.service,用用户默认引擎配置);
  - `http_get`(agent-builtin-tools.ts → executeHttpFetch,SSRF 闸门强制生效;可抓 arxiv API/公开页);
  - `wf_web_extract`(node-tool-adapter.ts,网页正文提取,web-extract 节点同链);
  - `wf_kb_retrieve`(node-tool-adapter.ts,知识库检索,kb-retrieve 节点同链;任务树 TASK_TOOL_ALLOWLIST 同名单佐证裸名可达)。
- dl 宿主现状(services/dl-agent-harness.service.ts):research/tutor 两模式共用宿主;bindings = dl_* 动作裸名 + SYSTEM_PASSTHROUGH(discover/invoke_skill);research 模式当前**无任何读工具**,采集靠模型先验/用户给料 → M2-B 在此扩展。
- 自动推进载体候选(排除):workflow-trigger-scheduler 属 workflow 域 cron(跑 WorkflowRun,工作流化已挪 M3);AgentTaskService 面向一次性目标分解+审批链,且写库只有 dl_* 工具可达 → 采用包内 `DlSchedulerService`(单例 + setInterval + 可注入 timer,参照 workflow-trigger-scheduler 模式),到点调 DlAgentHarnessService.sendMessage(research),动作本身仍是 agent-harness 宿主直跑。
- ForceGraph 抽取对象:`components/longwriting/graph/GraphView.vue`(1046 行)与 `views/domain-learning/AtlasGraph.vue`(519 行),两套自绘 SVG 同源 → 抽 `components/common/ForceGraph.vue`。
- Atlas 画像:dl:get-space-view 已回 spaceProfile(画像标签/侧重);dl_project.profile_json 已存在(可空),建空间 UI 需补画像库选择+侧重调整。

## 2. 里程碑

### M2-A 研究侧三 skill 资产(纯资产,同 M1-C 手法)
- `src/core/platform/workflow/skills/builtin-skills.ts` 追加三个研究侧 SKILL.md(中文,frontmatter 五字段 + system_prompt + output_desc;output_desc 不以裸 `{` 开头;id 全局唯一):
  - `learning-source-collector`:资料路由/采集计划,输出 `{plan:[{action:'检索KB'|'抓网页'|'搜arxiv'|'读论文', target, reason}], risk}`(design.md v2 §7);
  - `learning-question-generator`:多视角提问(补盲/验证),输出 `{questions:[{perspective, question, why}]}`;
  - `learning-relation-miner`:关系+建议提取,输出 `{relations:[{source,target,type,evidence}], suggestions:[...]}`。
- 内容资产不入单测(design §16.8);跑 skill 注册/渲染相关回归,确认无数量/清单断言被破坏。
- 验收:skill 相关 spec 全绿;提交 M2-A 并汇报。

### M2-B 研究宿主采集扩展(自动采集闭环)
- 白名单按模式组装:research 模式 bindings = dl_* 动作 + SYSTEM_PASSTHROUGH + 读工具(`wf_kb_retrieve` 常驻;`wf_web_extract`/`http_get` 可用;`web_search` 仅当有默认搜索源时 bind,否则跳过并在 reply 事件提示「无默认搜索源,联网搜索分支未启用」);tutor 模式白名单保持 M1 现状(防工具滥用)。
- 研究系统提示补「采集纪律」:先 KB 检索再联网;arxiv 用 http_get 打 `export.arxiv.org/api/query`;evidence 必须真实来源(quote/url),无来源不落卡(复用 dl_save_card 硬门);采集失败可重试一次、仍败则标记并在事件说明,不硬编。
- 新增 IPC 用途面:「未解问题自动开子研究」= 对 open 问题触发 dl:agent-send(research,conceptId 置空 + 问题引用),宿主在快照里注入该问题上下文,产出经 dl_answer_question 回填/新证据落卡。
- TDD:工具白名单按模式组装(纯函数)、开子研究路径(仓储 fake + 宿主 spy)、web_search 有/无默认源两分支。
- 验收:单测绿;真机取 KB 命中概念自动研究出卡一条(KB 源),http_get(arxiv/公开页)路径出卡一条。

### M2-C 周期推进调度器(DlSchedulerService)
- 数据模型评审后定:dl_project 增自动推进配置(倾向新列 pace_settings json {enabled, intervalMin, autoResearchOnOpenQuestion};迁移幂等,双端登记)。
- 单例服务(可注入 timer):每 tick 扫描 active 且 pace 开启的空间——未研究概念按 pickNext 队列自动研究;open 未解队列自动开子研究(间隔节流+busy 互斥,防风暴/重复)。
- 服务挂载与启停:包 activate 时注册;按空间 enable/disable + 应用内全局开关(IPC)。
- TDD:注入 timer 触发一轮、节流不重复、暂停/恢复、忙时不叠加。
- 验收:单测绿;IPC 开关真机可用(UI 开关可随 M2-E 一起露出,此处仅服务+IPC)。

### M2-D ForceGraph 公共抽取
- 抽 `components/common/ForceGraph.vue`(布局/拖拽/缩放/自适应容器/节点点击;props 收敛 nodes/edges/类型元数据/选中态,事件外抛);`views/domain-learning/AtlasGraph.vue` 与 `components/longwriting/graph/GraphView.vue` 两处改用,删重复实现。
- 回归:两宿主页面真机 CDP 走查(布局/交互/类型配色);能抽的纯逻辑(如力导向布局入参计算)带单测。
- 验收:Atlas 与长文图谱均正常渲染交互,无功能回退。

### M2-E Atlas 增强视图 + profile 可视化配置
- 画像侧重 → 视图映射(软规则,渲染层配置 + 服务端派生数据聚合):
  - 时间线:取 attrs 时间类字段(如论文年份/法规施行/事件日期)排序;
  - 矩阵/流程:relation 类型分组(流程=prerequisite 链,矩阵=双维关系计数);
  - 三层结构:树层级(目录 group → 概念 → 属性/证据)。
- 后端:dl:get-atlas-views(或 get-space-view 扩展)按画像返回可启用的视图与各视图派生数据;IPC 前后端接线(shared 类型补视图 DTO)。
- 前端:DomainAtlas 视图切换 + 四视图组件(时间线/矩阵/流程/三层);建空间与空间设置的画像库选择 + 侧重调整(profile_json 读写,画像元数据为软配置不锁死规则)。
- TDD:视图派生聚合单测;前端组件走查。
- 验收:单测绿;画像侧重切换后 Atlas 出现对应增强视图;建空间可选画像并调侧重。

### M2-F 真机纵线验收 + 收尾
- 验收纵线(依 §0 决策,KB+arxiv 兜底):建空间(配画像)→ 地图人审 → KB 命中概念自动研究出卡(evidence 硬门过)→ http_get 抓 arxiv/公开页自动采集出卡 → 未解问题自动开子研究回填 → 调度 tick 驱动下一概念研究 → 重启状态完好;若验收环境有默认搜索源则补跑 web_search 分支。
- 记录 progress/2026-09-1x-domain-learning-m2-*.md;全部提交;push 待用户指令。

## 3. 风险与对策

- web_search 无默认源 → 跳过分支 + 事件提示(已批);arxiv/公开页可达性依赖网络 → 失败优雅降级(重试一次、标记失败不重复扫)。
- ForceGraph 重构回归面大(长文 1046 行)→ 同屏截图差分走查。
- scheduler 风暴/重复 → 节流 + 单概念/问题锁 + 宿主 busy 互斥 + 幂等扫描。
- 自动采集消耗 token → research 已有 maxSteps 上限;自动研究并发 1;采集节奏由 pace_settings 约束。
- 自动推进以用户开关为准:系统不自封、掌握度仍用户驱动(design §13 不变)。
