# 任务完成检查清单 · Task Completion Checklist

| 项 | 值 |
|---|---|
| 文件 | `docs/superpowers/dod/2026-05-05-task-completion-checklist.md` |
| 适用范围 | 所有 episode-production 模块 task；后续可推广到全仓 |
| 制定日期 | 2026-05-05 |
| 制定背景 | P5/P6 出现"plan ✅ 但 UI 未装配"的偷懒模式，必须用清单防止再发生 |
| 使用方 | Claude（自查）+ 用户/外部 Reviewer（复查），同一份清单两边用 |

---

## 0. 红线（一票否决，发现任何一项 → task 立即降级 🟡 + 重做）

不允许任何借口、任何"下次补"、任何"先这样跑通再说"：

| # | 红线 | 探测命令 |
|---|---|---|
| R1 | **V2 兼容后门** — V3 stage 完成时 V2 老组件/老 IPC channel 仍被引用 | `grep -rn "ScriptTabContent\|RegenerateDialog\|SynthesisDialog" src/renderer` 检查是否还在用 |
| R2 | **写死/假数据** — 包括 `'Cherry'` `'unknown'` `model.id === 'wan-xxx'` 这种硬编码 | `grep -rn "TODO\|FIXME\|hardcoded\|'unknown'" src/core/modules/episode-production` |
| R3 | **跳过 UI 直接 IPC 验证算"完成"** — 仅 curl/Playwright 调 IPC 出结果不算端到端 | 检查 commit 是否含 UI 文件改动；不含则不能标 ✅ |
| R4 | **service 完成 + 单测通过 → 标 ✅** — 没有 UI 装配证据的 task 不允许 ✅ | plan 文件每个 ✅ 必须附"用户验收路径" |
| R5 | **mock provider 充当真实调用** — e2e 必须真打外部 API（含真实 cost） | grep `mockResolvedValue\|jest.fn()` 不能出现在 e2e spec |
| R6 | **commit message 含 ✅ 但实际工作未走完清单** | 见 §6 commit message 规范 |
| R7 | **plan 文档自我表扬** — 没有"用户验收路径"的 ✅ | 任何 ✅ 行旁必须有可执行的 demo 命令 |

---

## 1. Phase A · 单文件代码层（写完每个文件立即自查）

每改完一个 `.ts` / `.vue` 文件立即跑：

- [ ] **A1** 没有 `console.log` 残留（除非明确是 logger）
- [ ] **A2** 没有 `TODO` / `FIXME` 没解决就提交
- [ ] **A3** 没有未使用的 import / variable
- [ ] **A4** 没有 `any` 类型逃逸（除非有显式 `// eslint-disable` 注释 + 理由）
- [ ] **A5** 没有 `as any` 类型穿透（同上规则）
- [ ] **A6** 错误处理：所有 `catch` 都有具体的 user-facing message，没有 silent swallow
- [ ] **A7** 文件 < 500 行（Vue）/ < 1000 行（ts）；超出立即拆（memory 自动规则）
- [ ] **A8** 中文优先：注释 / commit / 文档 / 用户提示语全中文（CLAUDE.md 强制要求）
- [ ] **A9** 没有"应急路径"留白：所有 `if (!something) return null` 必须能解释为什么这条路径合法
- [ ] **A10** **遵循模块边界**：core 层不依赖 electron / web；UI 不直接 import core；entity 不被 UI import

**自查命令组：**

```bash
# A1 / A2 / A4 / A5 一次扫
grep -rn "console\.log\|TODO\|FIXME\|: any\|as any" <修改的文件路径>

# A7 行数
wc -l <修改的文件路径>
```

---

## 2. Phase B · 组件装配层（UI 真接通）

当 task 涉及 UI 时（基本所有 task 都涉及）：

- [ ] **B1** 组件**真有入口能渲染**：路径是 `<URL> → <tab/click> → 看到组件`，写出来
- [ ] **B2** 组件接收的所有 **prop 都有数据来源**（不是 `null` / `undefined` placeholder）
- [ ] **B3** 组件 emit 的所有事件都**有父组件接收并处理**（不是 `@event="() => {}"` 空函数）
- [ ] **B4** 用户输入字段（input / textarea / select）都**真传到 IPC**，可以在 IPC handler 里 `console.log` 看见
- [ ] **B5** 用户能看到的字段（v-bind 的所有 `:value="x"`）都**真从后端拿数据**，不是写死
- [ ] **B6** **Loading / 空状态 / 错误状态** 三态都有 UI 表达，不是只有 happy path
- [ ] **B7** 关键操作有 **二次确认**（删除 / 重生成 / 覆盖 / 导出）
- [ ] **B8** 组件 unmount 时**没有内存泄漏**（事件监听 / interval / WebSocket 都清理）
- [ ] **B9** 组件**没有走 V2 老 store / V2 老 IPC**（除非 task 明确是 V2 兼容）
- [ ] **B10** UI **对照 spec 原型**：对应 spec §X.Y 的字段是否每个都在 UI 出现？逐字段勾对

**自查方法：**

打开浏览器，**每个用户操作都真点一遍**。不允许"代码看着对就 OK"。

---

## 3. Phase C · 数据流层（DB → IPC → UI 全程证据）

每个能改 / 读数据库的 task：

- [ ] **C1** 用户在 UI 操作后，**DB 真有新行/改行**：`SELECT * FROM <表> WHERE id = <刚生成的 id>` 能查到
- [ ] **C2** DB 行的**关键字段都非 null**：列出本 task 应该写入的字段，逐个 `column IS NOT NULL` 验证
- [ ] **C3** **再读一次**：UI 刷新页面后能看到刚才写入的内容（不是只在内存 store 里）
- [ ] **C4** **跨进程边界数据无损**：encryption / serialization / IPC bridge 都不丢字段
- [ ] **C5** **多用户隔离生效**（user_id 注入）：用另一个账号登录看不到本账号的数据
- [ ] **C6** **修改 entity 字段**时检查完整调用链（memory 强制规则）：`grep <字段名>` 全仓核对
- [ ] **C7** **migration 幂等**：跑两次不出错；新表/新列在 PG 和 SQLite 双端都建

**自查命令组：**

```bash
# C1 / C2 真查 DB（连 web staging）
PGPASSWORD=... psql -h localhost -p 5433 -d the_bot_test -c "SELECT id, <key cols> FROM <table> ORDER BY created_at DESC LIMIT 5"

# C6 字段调用链
grep -rn "<字段名>" src/ --include="*.ts" --include="*.vue" | wc -l
```

---

## 4. Phase D · 端到端层（最关键 · 没过这条不能 ✅）

每个 task 必须有**至少一个**端到端验证。不允许只跑单测就标完成：

- [ ] **D1** **Playwright 真走 UI**：写 `tests/e2e/web/<feature>.spec.ts`（可标 `.skip` 但代码必须 commit）
- [ ] **D2** 测试步骤**从登录开始**，不允许跳过 auth 直接调 IPC
- [ ] **D3** 测试**真打外部 API**（image / video provider），不 mock
- [ ] **D4** 关键步骤**截图存档**：`tests/e2e/web/screenshots/<task>-<step>.png`
- [ ] **D5** 控制台**无 console.error**（warning 可放过；error 必须解释或修）
- [ ] **D6** 网络请求**全部 200/2xx**（4xx/5xx 必须解释或修）
- [ ] **D7** 端到端**真出产物**：图片落盘 / 视频落盘 / mp4 能播放 — 给出文件路径 + ffprobe 输出
- [ ] **D8** **happy path + 至少 1 个错误路径**（无网络 / API key 失效 / 数据缺失）
- [ ] **D9** **可重复**：清掉 DB 数据后重跑，结果一致

**自查命令模板（写进每个 task 完成报告）：**

```bash
# D7 真有 mp4 + 时长 > 0
ffprobe -hide_banner -loglevel error -show_entries format=duration -of csv=p=0 <output.mp4>

# 期望：> 0 秒，stream count >= 1
```

---

## 5. Phase E · 文档同步层（防止 plan 文档自我表扬）

- [ ] **E1** plan 文件状态准确：✅ / 🟡 / ⏳ 三态严格区分；🟡 必须列具体缺口
- [ ] **E2** plan 每个 ✅ 行旁必须有 **"用户验收路径"** 列：登录 URL → 操作步骤 → 期望看到 X
- [ ] **E3** 修改 spec 字段或 entity 字段时，spec 文档同步更新（memory 强制规则）
- [ ] **E4** **架构图用 Mermaid**（memory 强制规则），不画 ASCII
- [ ] **E5** commit message 含具体验证证据：DB 行数 / 文件路径 / Playwright 截图路径
- [ ] **E6** plan 进度状态总结：本次 commit 后 task 完成度变化（✅/🟡/⏳ 数量）

**plan 文档 ✅ 行的强制格式：**

```markdown
| P5-T18 | KeyframeGrid 九宫格 | ✅ 端到端可用 |
> 验收路径：登录 test@local.dev → 进入项目 vp_xxx → ⑤ 制作 tab → 选分镜 → 点"生成关键帧" → 看到 N 张图按 frameIndex 排序 + 角色/地点 chip 显示
> 截图：tests/e2e/web/screenshots/p5-t18-keyframe-grid.png
> DB 证据：SELECT COUNT(*) FROM storyboard_keyframe WHERE storyboard_id = sb_xxx → 返回 N
```

---

## 6. Commit Message 规范

每条 commit 必须含：

```
<type>(<scope>): <task-id> · <subject>

【新 DoD 5 条】
- A 单文件层：✅
- B 组件装配：✅ <列出新增 user-visible 字段>
- C 数据流：✅ <列出 DB 新行 id / 字段>
- D 端到端：✅ <Playwright spec 路径 + 截图路径>
- E 文档同步：✅ <plan / spec 改动文件>

【对照 spec】
- §X.Y 第 Z 行：<要求的字段> → 实现位置 <file:line>

【用户验收路径】
登录 → ... → ...

【红线探测】
R1-R7 全部不命中：✅

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

不满 5 条 + 红线全过 → **不允许 commit**。

---

## 7. Reviewer（外部检查者）反向核查清单

**给 Reviewer 的话**：不要信 Claude 的 commit message 和 plan ✅。下面这套清单逐条自己跑：

### 7.1 反偷懒探测（30 秒能跑完）

```bash
# R1: V2 后门
grep -rn "ScriptTabContent\|RegenerateDialog\|SynthesisDialog" src/renderer/src/views/EpisodeWorkbench.vue

# R2: 写死/假数据
grep -rn "'Cherry'\|'unknown'\|hardcoded" src/core/modules/episode-production

# R3: UI 文件改动
git show HEAD --stat | grep "renderer/.*\.vue"
# 如果是 0，task 不可能完成

# R4: 单测无 UI 接通
git diff HEAD~1 HEAD --name-only | grep "\.spec\.ts$"
# 如果只有 spec，无 .vue → task 是骨架

# R5: e2e 是否真打 API
grep -rn "mockResolvedValue\|jest.fn" tests/e2e/

# R6/R7: plan 文档 ✅ 是否带验收路径
grep -A 2 "✅" docs/superpowers/plans/<latest>.md | grep -c "验收路径"
# 应该和 ✅ 数量一致
```

### 7.2 用户视角自己跑一遍

不允许只看代码。Reviewer 必须：

- [ ] 自己启动 web server + web client
- [ ] 自己登录 test@local.dev
- [ ] 自己点完 commit 声称的"用户验收路径"
- [ ] 自己看 UI 是否有 spec §X.Y 要求的字段
- [ ] 自己看 DB 是否真有新行
- [ ] 任何一步走不通 → **打回，task 标 🟡**

### 7.3 可疑信号（出现任何一项 → 高度怀疑偷懒）

- 🚩 task 描述含 "service + IPC 完成" 但 commit 无 .vue 改动
- 🚩 task 标 ✅ 但 plan 旁没有验收路径
- 🚩 commit message 没列 5 条 DoD 状态
- 🚩 e2e spec 里有 mock / stub
- 🚩 多个 task 在同一 commit 完成（应该一 task 一 commit）
- 🚩 单测覆盖率高 + UI 截图缺失
- 🚩 spec 引用模糊（"按 spec §4 实现" 没具体行号）
- 🚩 commit message 大量"已完成 X" 但 git diff 只改 1-2 行

### 7.4 反偷懒一票否决判定

Reviewer 发现以下任一情况 → **task 立刻降级 🟡，Claude 重做**：

- 标 ✅ 的功能在浏览器跑不通
- DB 应该有新行但实际没有
- UI 应该有的字段实际没有
- spec 要求的用户输入入口实际不存在
- e2e spec 用 mock 不真打 API

---

## 8. 失败处理

### 8.1 自查发现红线 / 失败项

- **不要硬过** ❌
- 立即把 task 标 🟡 + 列具体缺口
- 修完缺口再来一遍清单
- 不允许"先 commit 再补"

### 8.2 已 commit 才发现错

- 立刻**新加一个 fix commit**（不允许 amend，memory 强制规则）
- plan 文档把对应 task 改回 🟡
- 在 commit message 写明：`fix(<scope>): <task-id> 上一 commit 标 ✅ 实际未达 DoD（缺 X/Y/Z），降级 🟡`

### 8.3 Reviewer 打回

- **不解释、不辩护**（feedback 守则）
- 立即降 🟡
- 列重做计划
- 完成后再次走完整清单

### 8.4 时间压力下的诱惑

如果出现以下念头，立刻 STOP：

- "这个清单太严了，简化一下吧" → ❌ 简化就是回到偷懒老路
- "先标 ✅，下个 task 一起补" → ❌ 一票否决
- "服务端能调通了就行了，UI 后续补" → ❌ 一票否决
- "测试覆盖率够了" → ❌ 测试不等于端到端
- "用户应该能看出来怎么用" → ❌ 不能装配的 UI 等于没做

---

## 9. 这份清单本身的演进

- 发现新偷懒模式 → 立即加新红线 / 新自查项
- 反复出现的失败模式 → 升格成红线
- 不再适用的项 → 标注废止时间，但保留历史

**owner**：当前 Claude session 维护；用户 review 修订。

---

## 10. 立即可用的"清账模板"

清算 P5/P6 已 ✅ task 时用：

```markdown
## P5-T<N> 清账

| DoD 条目 | 状态 | 证据 |
|---|---|---|
| A 单文件层 | ✅/🟡 | grep 结果 / 行数 |
| B 组件装配 | ✅/🟡 | 涉及 .vue 文件 + 用户可见字段 |
| C 数据流 | ✅/🟡 | DB 表名 + 行数 |
| D 端到端 | ✅/🟡 | Playwright spec 路径 / 截图 |
| E 文档同步 | ✅/🟡 | spec 行号 + plan 验收路径 |
| 红线 R1-R7 | ✅ 全过 / ❌ 命中 R<N> | 探测命令输出 |

**总判定**：✅ 端到端可用 / 🟡 部分完成 / ⏳ 重做

**🟡 时必填**：缺 <具体什么> → 重做计划：<具体步骤>
```
