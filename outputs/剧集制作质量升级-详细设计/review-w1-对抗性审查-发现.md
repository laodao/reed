# W1 对抗性审查 · 发现与修复计划

> 审查时间：2026-10-13 ｜ 审查对象：dev @ `779330b4`（T04/T02/T01/T00 四任务合并后）
> 审查方式：只读静态审查（读真实代码全上下文 + git show + 对照设计 AC），未跑构建
> 结论：**1×P1 + 4×P2 + 9×P3**；T00 契约逐字段 diff 属实；T04 租户隔离无越权

## P1-1（必修，W2 内完成）T01 character 影响统计漏掉主引用路径 → 高危覆盖静默放行

- 协调者独立复核：**属实**。三证据：`storyboards.characters` 为 simple-json 列（`storyboard.entity.ts:49-50`）；关键帧参考解析"表空回退 JSON"（`keyframe-generation.service.ts:1043-1075`）；主生产路径（AI 分镜生成 `storyboard-cogen.service.ts:881-913`）只写 JSON 不写 `storyboard_characters` 表。
- 后果：最常见数据形状下 `getWriteImpact('character')` 返回 0 → 影响确认弹窗静默跳过 → T01 立项要防的事故（00 §7"提示弹出率 100%"）被击穿。
- 既有 S-05 通道 `ep:asset:reference-impact`（`keyframe.handler.ts:52-67`）对 character 恰按 JSON LIKE 计数但**无租户过滤**（`keyframe-generation.service.ts:537-553`）——两套口径并存漂移。
- **修法**：character 口径并入第三路 `storyboards.characters` JSON（LIKE 收窄候选 + 应用层解析 `entry.characterId`，与 location/item 同型），三路去重到 storyboard 粒度；顺带给 S-05 补租户过滤或收敛单一来源；notes 补披露。

## P2-1（必修）T02 "＞5000 字单章兜底" 与 15000 字单集上限互相矛盾

- 死路：EpisodeCreator 2 万字无结构 → 体检卡放行 → `createEpisode` 必报"字数超出限制"（`episode.handler.ts:572-578`），用户被引导进死路。
- 绕限：批建通道无字数校验（`episode.handler.ts:361-396`），5 万字无结构文可落库单集。
- **修法**：兜底单章超过目标字数（`DEFAULT_EPISODE_TARGET_CHARS`/项目 `episodeTargetChars`）时维持拒绝并提示补章节标记；`handleBatchCreateEpisodes` 补齐与单建一致的字数校验。

## P2-2（必修）T04 缺省 active 过滤破坏 StoryRoom 转短剧查重

- `StoryRoom.vue:1419-1424` 用 `listProjectsSummary()` 按 `longWritingProjectId` 查重——归档 A 后查重不到 → 重复建第二个 EP 项目。
- **修法**：StoryRoom 查重改调 `ep:list-projects(longWritingProjectId)`（未过滤）或显式传 `archiveState`；教训入档：**改既有 channel 缺省语义必须全调用方排查**。

## P2-3（必修）T00 "契约同形编译期校验"是伪测试

- 条件类型在 `tests/` 下从未被类型检查（`tsconfig.json` include 仅 `src/**`，vitest esbuild 转译不做类型检查），运行时断言恒真。AC1 目前只靠人工纪律（本次人工 diff 属实）。
- **修法**：把同形守卫移到 `src/` 下被 `vue-tsc` 覆盖的位置（如在 `src/shared/types/gen-task.types.ts` 内对 core 契约的赋值断言）。

## P2-4（必修）T01 "含未迁移老数据"检测是死代码

- 老数据 `character_id` 是 `lw_character.id`（`add-narrative-binding-fks.ts:5-6`），永不可能等于 binding id → `legacyUnmigratedSceneCount` 恒 0；单测用 binding id 冒充老数据形状，固化了错误前提。
- **修法**：删除该口径与 notes 文案（诚实优于永不触发的声明），或按 character_name 启发式归因。

## P3 清单（择机处理，不阻塞）

1. T04 恢复统一回 draft 有损（completed/producing 一旦归档即丢）——建议独立归档位标记，T11 前注明限制
2. T04 `archived === false ? 'draft' : 'archived'` 应显式化 `archived !== true`
3. T04 死类型 `EpListProjectsSummaryParams`/`EpSetProjectArchivedRequest` 零引用
4. T04 列表头"共 N 个项目"随页签变化语义含混
5. T01 双口径并存（新通道 vs S-05 无租户过滤）——与 P1-1 合并收敛
6. T01 查询失败 fail-open（返回 null 直接执行）——建议降级确认弹窗
7. T01 非主图分类行"设为主图"有类别突变副作用（服装图设为主图会改 category）——隐藏或二次说明；floor-plan 重新生成未接影响确认
8. T00 容量淘汰不发事件（T11 UI 幽灵记录）；update 不校验 progress 0-1
9. T02 标题启发式裸 `第` 前缀误报（"第二天他走进山中"）——收紧为 `第[数字中文]+[章节回集序]?` 形

## 修复调度

- **W2 内必修**：P1-1、P2-1、P2-2、P2-3、P2-4（T05 合并后、T06 之前派专职修复 agent，独立分支 `fix/w1-review-findings`）
- **P3**：#2/#8 随 T11 前处理；#5 随 P1-1 一并收敛；#1/#3/#4/#6/#7/#9 记入积压，随对应模块任务搭车
- **最终对抗性 review**：全部开发完成后执行，覆盖 W2–W5 新代码 + 复核本清单修复情况
