# 领域共学空间 M2-E 进度记录:Atlas 增强视图按画像启用 + profile 可视化配置

日期:2026-09-08 · 分支 feat/domain-learning · 依据 m2-implementation-plan.md §2 M2-E + design-v3 §4.4/§6(画像)与 §15 M2

## 完成内容

1. **shared 契约扩展**(domain-learning.types.ts):`DlAtlasViewKind`(timeline/flow/matrix/layers)、`DlAtlasViews` 载荷(available/enabled + 四视图数据:时间线条目、流程阶段、矩阵计数、三层结构)、`DL_EMPHASIS_VIEW_ALIASES`(侧重词→视图宽容映射)、`DL_PROFILE_PRESETS`(理论体系/法规标准/实践技能/前沿研究/自定义 五预设,含 nature 与侧重词)。
2. **纯派生规则** `rules/learning-atlas-views.ts`(TDD,6 用例):
   - 时间线:概念 attrs 时间类键(年份/日期/施行/生效等宽容候选)提取锚点,按年份升序,附 group 归属;
   - 流程:prerequisite 关系子图按拓扑层分组(Kahn,同层可并行),给 source/sink;
   - 矩阵:nodeType×relationType 边计数(行=边起点类型,起点非知识节点取终点);
   - 三层结构:目录 group→概念→卡片/著作计数(根层概念归「根层」桶);
   - enabled = 侧重别名 ∩ available;无侧重跟随 available(软规则,不锁死)。
3. **服务/IPC**:`LearningViewService.buildAtlasViews(spaceId)`(dl_* 仓储 → 规则入参,含每概念当前卡片计数);`dl:get-atlas-views` handler;`dl:create-space` 透传自定义 profile;新增 `dl:set-space-profile`(已建空间改画像/侧重);preload/channel-map/store 契约与函数同步(store:fetchAtlasViews/saveSpaceProfile/paceOf/savePaceOf + currentAtlasViews 状态)。
4. **前端**:
   - 新组件 `AtlasEnhancedViews.vue`:时间线(竖轴列表)、流程(阶段并行 chips)、矩阵(el-table 动态列)、三层(el-collapse 分组)渲染,概念点击上抛右栏档案;
   - `DomainAtlas.vue`:中区视图切换条(图谱+enabled 增强视图);顶栏「空间设置」弹层 = 领域画像(预设/标签/特质/侧重 chips,应用后即时刷新增强视图) + 自动推进(M2-C 收口:启用/周期/两开关,含调度状态读数);
   - `DomainLearningHome.vue` 建空间对话框:画像预设选择 + 类型标签/特质输入 + 侧重 chips,随 dl:create-space 落 profile。

## 校验

- rules spec 6 passed;dl 全套 43 passed(含仓储/调度/动作回归);
- vue-tsc 相关文件零新增错误(存量仅 preload arity/channel-map episode 等历史项);
- 视觉/交互真机回归留 M2-F CDP。

## 变更文件

- 修改:`shared/types/domain-learning.types.ts`、`rules/learning-atlas-views.ts`(新)、`services/learning-view.service.ts`、`handlers/domain-learning.handler.ts`、`src/preload/index.ts`、`src/web/client/channel-map.ts`、`stores/domain-learning.ts`、`views/domain-learning/DomainAtlas.vue`、`DomainLearningHome.vue`、`tests/.../learning-atlas-views.spec.ts`(新)
- 新增:`views/domain-learning/AtlasEnhancedViews.vue`

## 下一步

- M2-F:真机纵线验收(KB+arxiv 兜底源自动采集出卡、未解问题开子研究、调度 tick 驱动、重启完好、图谱增强视图/画像侧重切换走查)+ 进度记录;push 待用户指令。
