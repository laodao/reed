# M4-A 架构合规整改清单(领域共学空间)

来源:4 个子代理横向审查(2026-09-09;数据层3NF/服务-宿主/IPC-包-前端/横切规范);决策:P0 全改(实际 P0=0)、P1 全改、P2 择优、P3 记录。下列每项附 来源审计 与 状态勾选。

## P1(全改)

- [ ] **P1-1 写路径空间属主校验**:dl:agent-send 直接放行(handler:151-156),tutor 先落 dl_question(harness:147-152),dl_* 动作 create 前不校验空间存在/归属(actions);set-space-profile/review/pace 对不存在 id 静默 ok。→ sendMessage/executeDlAction 统一 ensureOwnedSpace(经项目仓储 getById 校验,ALS 归属);设置写路径先查存在。
- [ ] **P1-2 平台 registry LLM 侧工具名别名 + dl 回归 packId 注册**:注册表支持对 pack 工具在协议层用 `def.name`(裸名)而内部保持 namespaced(审计/注销/冲突),buildToolDefs/execute 按裸名解析回注册项;dl 从 `{source:'tool'}` 裸名改回 `{packId: DL_AGENT_PACK_ID}`;补 registry 协议名 `^[a-zA-Z0-9_-]+$` 与注销回归(EP/LW/dl 现有 spec 全绿)。(平台改动,带回归)
- [ ] **P1-3 聚合双实现漂移/死码收敛**:graph.buildTree(带 createdAt 排序,仅测试引用)与 view.buildTree(无排序,生产源)双份;graph.stats 与 view.stats/buildSpaceStats;review 到期 graph.listReviewDue 与 view.buildSpaceStats 同构;card latest map 双份。→ 收敛为单一聚合(buildTree/stats/reviewDue/card-latest),删测试专用副本,统一排序契约。
- [ ] **P1-4(IPC) 四方键集合相等护栏**:handler 27 条 dl:* = preload 27 = channel-map(27 调用+2 事件);加 spec 用 readFileSync 断言四端键集合相等,防 Web 静默失效。
- [ ] **P1-5(IPC) 通知缺失**:自动研究产出就绪(reply:done/card-ready)、研究失败、复习到期首现不写 platform_event/不进 NotificationService 白名单,用户离开页面零感知。→ 关键业务长尾事件接入平台事件/通知(类型注册 + 前端路由映射),或 Home/空间进入刷新带待审/到期数。(涉及 notification.service 白名单与 dl-agent-events)
- [ ] **P1-6 前端巨型组件拆分**:DomainAtlas.vue 1307 行 → 抽 SpaceSettingsPanel.vue(画像/pace/复习三块+到期列表)与 png-export 纯工具模块;DomainLearningSpace 1313 行后续拆(本期记录)。

## P2(择优执行;按主题)

- [ ] P2-1 handler 收敛服务层:set-space-profile/list-questions/pace/review 直插 db.dl* 改走 service(见 P1-1 载体);handler 本地 new 仓储+`void cards` 死码清理。
- [ ] P2-2 dl:agent-cancel 移入 wrap(统一返回契约)。
- [ ] P2-3 store 加 schedulerState wrapper,删 DomainAtlas 两处 `(window as any)` 直连。
- [ ] P2-4 preload createSpace 参数补 `profile`(契约权威)。
- [ ] P2-5 IpcLike 改共用 IpcResponse 形态并兼容 PACK_DISABLED 对象 error(防 [object Object])。
- [ ] P2-6 常量/文案单源:EMPHASIS_OPTIONS(两处)与 VIEW_KIND_LABELS 由 shared(DL_EMPHASIS_VIEW_ALIASES/preset)派生;复习默认值引用 DEFAULT_DL_REVIEW_SETTINGS(替换 DomainAtlas:420 等字面量);掌握度文案走 ui masteryLabel;trigger/mastery/状态字面量与 rules.isMastered 复用;attrs 键(confusedCount/confusedSections/needsVerification)集中常量并统一命名;分钟→ms 抽 intervalMinutesToMs;repo parse 默认值 import DEFAULT_*;time keys 集中。
- [ ] P2-7 死代码:tools `void DL_AGENT_PACK_ID`(随 P1-2 自然消失)、atlas-views:199 no-op filter、dl_doc 全链与 DlDocType 标注预留或删除、dl:get-space 未用通道处置。
- [ ] P2-8 日志:动作落库/掌握度变更/统计导出关键 info;harness 空 catch(141/167)降级日志;store 错误处理统一(callApi 或 withIpc,消 16 处 console 分裂)。
- [ ] P2-9 错误结构化:至少为业务失败(空间不存在/前置未就绪/状态非法/参数缺失)稳定 message+code 归类(随平台 IpcResponse 演进或包内 DL_ERR 常量)。
- [ ] P2-10 复制收敛:safeParse 下沉 BaseRepository 或 core/utils;store 镜像 DlAgentUiEvent 上收 shared;导出改走系统 utils/file-saver saveBlobAs;技能 id/研究纪律文本单源(常量/模板)。
- [ ] P2-11 性能:N+1 消批量(listByProject 一次建 Map),view 聚合与 scheduler 候选。
- [ ] P2-12 契约-实现错位:DlSpaceSummary.stats 补齐(Home 进度条)或删字段。

## P3(记录,视进度)
bundle 无 reset、切空间竞态(refreshView id 校验)、DlFlowStage 补名称、domain 组件再拆分、NNI `!` 收敛、goal 中文存储枚举改键等。

## 验收
P1 逐项打勾+回归(dl 全套+平台相关 spec 绿、vue-tsc 零新增);P2 按 60% 完成线;无新增架构违规。
