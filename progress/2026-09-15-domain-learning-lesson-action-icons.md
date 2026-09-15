# 领域学习「主题学习」讲义动作行：待复核 / 确认发布 / 导出 / 历史 全部图标化

日期：2026-09-15
类型：界面调整（用户需求）
用户原话：「知识学习界面，待复核、确认发布、导出、历史这几个按钮全部换成icon」

## 一、现状

中栏讲义标题栏右侧（`.lesson-actions`）的动作区混着图标按钮（懂了 / 没懂 / 讲义演示）与一堆
文字控件，文字按钮把讲义标题挤窄：

```html
<!-- 改前（DomainLearningSpace.vue，约 292-323 行） -->
<el-tag size="small" effect="plain" :type="verifyTagType">{{ verifyLabel }}</el-tag>  <!-- 待复核 3 -->
<el-button ... >确认发布 v{{ currentConcept.card.version }}</el-button>
<el-button size="small" plain :loading="exportingLesson">导出 <el-icon ...><ArrowDown /></el-icon></el-button>
<el-button size="small" plain @click="openVersionHistory">历史</el-button>
```

「待复核」在这一处是核验状态的 `el-tag`（不是按钮），但它和另外三个文字按钮同处一行、
同样占地，按用户口径一并图标化。

## 二、方案

**原则：图标化不能丢信息**——原本靠文字承载的三类信息各找落点，全部可悬停/可见地保留。

| 控件 | 改后 | 信息去哪了 |
| --- | --- | --- |
| 核验状态（待复核 N） | 状态图标 `WarningFilled` + 条数角标 `N` | 角标留条数；完整详情（状态/时间/note）仍在 `verifyTip`；`role="img" + aria-label` 给读屏器 |
| 确认发布 vN | `Stamp` 圆形图标按钮 | 版本号挪进新的 `publishTip`（`确认发布 v2（草稿 → 正式采用…）`） |
| 导出 | `Download` 圆形图标按钮（仍是 `el-dropdown` 三格式） | 格式清单进 tooltip「导出讲义（Markdown / PDF / 长图 PNG）」，下拉项本身也写明 |
| 历史 | `Clock` 圆形图标按钮 | tooltip「版本历史（预览 / 导出 / 恢复）」 |

**图标按钮一律带 `aria-label`**（确认发布 / 导出讲义 / 版本历史）：文字撤掉后不能让读屏器
只剩一个无名按钮；核验状态 `span` 加 `tabindex="0"`，键盘聚焦也能看到 tooltip。

**核验状态的图标/色调/条数收口成 computed**（`verifyIcon` / `verifyTone` / `verifyIssues`），
模板只做渲染；旧 `verifyTagType`（文字 tag 的档位映射）已无调用方，删除（`noUnusedLocals` 下留着会挂 typecheck）。
色调沿用本仓既有的 `coverage-btn` 档位语汇：`ok`(success) / `warn`(warning) / `busy`(primary) / `idle`(placeholder)，
`verifying` 复用 `el-icon.is-loading` 转圈；`.verify-chip { cursor: help }` 提示「可悬停」。

**已发布态**：`已发布 vN` 是状态标签、不在用户点名的四个控件里，保持原样。

## 三、改动清单

- `src/renderer/src/views/domain-learning/DomainLearningSpace.vue`
  - 模板：动作区四个控件改图标（tooltip 包裹；导出仍是 `el-dropdown`，`@command="onExportCommand"` 绑定不变）
  - 脚本：新增 `verifyStatus / verifyIssues / verifyIcon / verifyTone / publishTip`；删 `verifyTagType`；
    图标导入加 `WarningFilled / Download / Clock / Stamp`，删已无用的 `ArrowDown`
  - 样式：`.lesson-actions .verify-chip`（含 `.verify-count` 角标与四档色调）
- `tests/unit/renderer/domain-learning/lesson-action-icons.spec.ts`（新增，TDD 先红后绿）

## 四、验证

| 项 | 结果 |
| --- | --- |
| 新增契约测试 | 10/10 通过（9 项源码契约 + 1 项 shallowMount 渲染契约） |
| 渲染契约内容 | 待复核 3 → `.verify-chip.warn` + 角标 `3` + `aria-label="待复核 3"`；tooltip 文案含「待复核 3」「确认发布 v2」；动作行无可读文字「确认发布/导出/历史」 |
| `npm test -- run tests/unit/renderer` | 384 passed / 18 failed，**失败全在本次未触碰的文件**（StageHeaderBar / app-list / markdown-viewer / lesson-typography 等，见下） |
| `npx vue-tsc --noEmit` | 本文件零错误（仓库其余预存错误不变） |
| `npx eslint`（改动文件） | 0 error（2 个 `no-explicit-any` 警告为预存行） |
| `npm run build` | 成功（DomainLearningSpace chunk 正常产出，SFC + SCSS 编译通过） |

**tooltip 包裹 `el-dropdown` 的可行性**：Element Plus 的 `el-tooltip` 只接受单个子节点，
`el-dropdown` 根是普通 `div`，用临时探针（happy-dom 内挂载同结构）实测：悬停出 tooltip、
点击图标仍能打开格式下拉（菜单项 Markdown / PDF 正常渲染），事后删除探针文件，不入库。

## 五、遗留 / 说明

- 上述 `tests/unit/renderer` 的 18 项失败为**预存/他人进行中**：`StageHeaderBar*`（分镜段落数）、
  `app-list`、`lesson-typography`（选择器缩进）、`markdown-viewer`、`qa-answer-view` 的
  「真 MarkdownViewer 集成」（bytemd 懒加载未就绪）——均不读本次改动文件，与本次无关，不在本次修复范围。
- `npx prettier --check` 对这些 `.vue` 报差异是**仓库预存状态**（HEAD 版本同样不通过，
  且工作区文件为 CRLF 而配置 `endOfLine: lf`）；未做全文件 reformat，避免产生与本次无关的巨型 diff。
