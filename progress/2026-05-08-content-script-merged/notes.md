# 合并 ① 内容 + ③ 剧本 · 实施笔记

**日期：** 2026-05-08
**分支：** feat/episode-production-redesign
**spec：** docs/superpowers/specs/2026-05-08-content-script-merged-design.md
**plan：** docs/superpowers/plans/2026-05-08-content-script-merged.md

## 实施概览

11 个 task 全部完成。commits 列表：

```
c4cd892c feat(ep): EpisodeWorkbench 接入合并 v3 + 删除 stage-content-v2 / stage-script-v2
218bef2e feat(ep): 新增 StageContentScriptView 容器 + 拆 ExcerptPanel/StoryBackgroundPanel + 迁入 ManualAddEntityDialog
e59c7a83 feat(ep): 新增 SynopsisPanel + SceneListPanel（从 stage-script-v2 拆出 + 联动）
0b30991b feat(ep): 新增 EntitySidebar 三件套 + SceneEntityChips
3df7de5d feat(ep): StageHeaderBar 合并段重渲染（6→5 段，染色用 cur > min(段集合)）
daa41830 feat(ep): 新增 scene-entity-utils 工具函数（场景↔要素反查）
```

## 自动化验证

- typecheck：已知历史错误 1 条（`electron.vite.config.d.ts` 未 build，为 prebuild/predev 清理导致的已知问题，非新增）
- lint：428 errors + 4617 warnings，均为历史遗留 `any` 类型等问题，新增测试文件无 error
- unit test：总 839 个测试（830 passed + 1 skipped + 8 failed）；8 个失败均为已知历史 `EntityMetadataNotFoundError`（VideoProjectEntity 未注册到测试 DataSource），与本次变更无关
- 6 个新 component spec 全绿（25/25 PASS）

## 实施过程的关键偏离 / 决策

### Task 1（scene-entity-utils）
- TDD 过程发现并修复 `undefined === undefined` 假阳性 bug：id 匹配必须加 `entity.id != null` 守卫

### Task 9（StageContentScriptView 容器）
- StoryBackgroundPanel 没有独立 IPC，走 episodeStore.updateEpisode 保存（落 episode 主表的 storyEra/storyRegion 字段）
- ScriptCompletenessPanel 未接入：spec 没列，工作量大；后续如要接入需新建 follow-up task
- ExcerptPanel save 流程不阻塞编辑态退出（与 v2 略有体验差异，可后续调整）
- WorkbenchStage 类型从 `Exclude<EpisodeStatus, 'completed'>` 改为明确 5 个 tab name（去掉 scripting）

## 待 user 手动验证

- [ ] PC dev / Web dev 完整 E2E 三 sub-state 流程
- [ ] 联动 4 项交互（要素 chip 显示场景号 / 点要素高亮场景 / 展开场景高亮要素 / 场景卡 chip 点击）
- [ ] ScriptCompletenessPanel 是否需要补回（产品判断）

## 后续优化建议（非阻塞）

- 物品反查依赖 SceneCharacter.props 或文本 @ 引用，AI 生成剧本时如能稳定填 props 可消除文本扫描
- StageContentScriptView 容器组件较大（~770 行），后续如增功能可考虑再拆 useXxx composable
- ScriptCompletenessPanel 重新接入（含 jump-to-scene / fix-violation 路由）
