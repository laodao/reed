# 最终对抗性审查 · 报告 D（W1.5 修复波复核）

> 审查员 D ｜ 只读 ｜ 2026-10-14
> 结论：6 项修复中 **4 项守住**（P2-2/P2-3/P2-4/P3-2），**2 项被击败或部分击败**；新发现 F1–F6。

## F1（P2，必修）T01 影响统计的 location/item 走场景级主推导路径缺口——原 P1-1 失败模式存活

- `asset-reference.service.ts:156-188` jsonArrayImpact 只数分镜级覆盖列（locationBindingIds/itemBindingIds）；而真实生成的主推导路径在**场景级**：`scene_scripts.location_binding_id` 为 validator 强制非空（scene-script.entity.ts:31-36）、items 默认来自 `scene.characters[*].props`（keyframe-generation.service.ts:1103-1116, 1232-1245）。
- 常见形状（地点绑在场景级、分镜覆盖 NULL）→ `getWriteImpact('location'/'item')` 返回 0 → 确认弹窗静默跳过。ESTIMATE_NOTE 的口径声明只在弹窗内展示——弹窗恰因计数 0 永不打开，披露不可达。
- character 修复本身经五路击败尝试全部守住（LIKE 转义/JSON 解析/去重键/数组包含均无懈可击）。
- **修法**：location 补第四路 `scene_scripts.location_binding_id`（场景→名下分镜展开）；item 补 `scene_characters`/props 遍历；或最低成本：计数为 0 时也弹仅含口径声明的弱确认。

## F2（P2，必修）T05 pickStyle 接线引入模板文本双通道重复注入；测试 seed 形状失真掩盖缺陷

- applyToProject 写三键（styleTemplateId + stylePrompt 快照 + styleNegative 快照），pickStyle 命中模板后 preset 槽也变成模板文本 → 正向 `[TPL_PREFIX, body, TPL_SUFFIX, TPL_PREFIX, TPL_SUFFIX]`、负面 `[TPL_NEG, era, TPL_NEG]` 各重复一次（style-resolver.ts:107,114,126 + keyframe-generation.service.ts:770-810）。违反"projectStyle 追加一次"职责划分。
- 回归测试 seed 只写 `{styleTemplateId}` 不写快照两键——与 applyToProject 真实产出不符，断言在真实形状下假红。
- **修法**：preset 来源为模板时跳过 ctx.styleNegative/projectStyle 的重复段（或 pickStyle 命中时剔除快照键）；补按真实三键形状 seed 的回归。

## F3（P2）`episodeTargetChars` 无上限钳制 → P2-1 死路重开

- SettingsDialog 只钳下限 1000（:69-77, :692-695）；项目目标设 20000 → 18000 字无结构文放行体检卡 → 建集 15000 硬门必拒。
- **修法**：钳 `Math.min(15000, ...)` 或建集上限读 `min(项目目标, 15000)` 两口径归一。

## P3

- F4：15000 上限三处字面量未同源（episode.handler :392/:607/:663 应引用 DEFAULT_EPISODE_TARGET_CHARS）
- F5：同形守卫不可检边（progress 可选性/GenTaskType 塌缩——语义等价可接受；9 方法签名靠 implements 结构化把关成立）
- F6：结构化章节超 15000 字先放行后拒绝（有"请拆分"指引的软死路，轻于原 P2-1）

## 修复复核矩阵

| 修复项 | 结论 |
|---|---|
| P1-1 character 三路并集 + S-05 租户过滤 | character 部分守住（五路击败尝试全失败）；**location/item 缺口存活（F1）** |
| P2-1 兜底超限 + 批建校验 | 本体正确；**部分击败（F3/F4/F6）** |
| P2-2 StoryRoom 换通道 | 守住（新旧 handler 同 repo 方法，无其他误用调用点） |
| P2-3 同形守卫 | 守住（负向变体验证 vue-tsc 必报错；F5 为边缘备注） |
| P2-4 老数据标注删除 | 守住（零残留） |
| T05 pickStyle 接线 | **被击败（F2）** |
| P3-2 archived !== true | 守住 |
