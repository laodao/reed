# 远端提交 Review + 修复三项（2026-08-29）

## 背景
把个人分支 rebase 到远端 `feat/workflow-engine`（落后 26 个提交）后，对远端提交
`d25fca29..39a685b7` 做了系统 review（子代理），确认与本人改动合并干净、无冲突。

review 结论：26 个提交整体质量良好、有测试佐证；发现 1 高 + 3 中问题，按用户要求全部修复。

## 修复列表

### 🔴 高 · main-image-upload 文件名断言与实现不符
- `tests/unit/episode-production/assets/main-image-upload.service.spec.ts:99`
  断言 `/asset-images\/character-ch1-main-\d+\.png$/`，但实现生成
  `character-ch1-{ts}-{8位hex}.png`（无 `-main-` 段）→ 测试必然 FAIL，新 CI 会染红。
- 改断言为 `/^asset-images\/character-ch1-\d+-[0-9a-f]{8}\.png$/`。
- 同步修正 `main-image-upload.service.ts` 顶部 docstring（`-main-{ts}` → `{ts}-{rand}`）。

### 🟠 中 · 连接池任意查询失败即驱逐共享池
- 根因：`mysql/pg/sqlserver-driver` 的 `query` catch 里无条件 `evictPooled`，
  SQL 语法/约束等与连接无关的错误也会销毁池，可能打断同池并发在途查询。
- 新增 `pool-cache.ts` 导出 `isConnectionClassError(e)`（连接/网络/认证类失败才 true，
  用限定短语+错误码保守匹配），三个驱动的 query catch 改为仅连接类失败才驱逐。
- 新增单测 `datasource-pool-cache.spec.ts`（连接类 true / 查询类 false / 空错误 false）。

### 🟠 中 · armWaitingReviewTimeout 死线钳制提前终态
- 根因：`workflow-run.service.ts` `setTimeout(..., Math.min(delay, 2^31-1))`，
  超过约 24.8 天的死线会被钳到 24.8 天提前转 interrupted。
- 改为自重挂：`setTimeout` 到期后由 `arm()` 判断——死线未到则重挂（继续等），
  真正到期才 `transitionIfStatus(waiting_review → interrupted)`。

### typecheck 存量错误（未修复）
- `70cb8859` 已解除 TS6305 阻断；但全仓仍有约 1035 条历史类型错误（多为
  workflow/shared/web 等既有债务），非本区间引入、也非本次改动引入（已用
  `tsc` 复核：本次改动的文件无新增类型错误）。属已知欠账，需专项处理，不在本次范围。

## 验证
- `datasource-pool-cache.spec.ts`：8 用例通过（含新增 3 个 `isConnectionClassError`）。
- `tsc --noEmit`（临时 config）：本次改动的文件（pool-cache / 三 driver / workflow-run
  / main-image-upload + 其 spec）无新增类型错误；既有报错均为历史欠账。
- PC 端主进程重编译成功、正常运行（4 个 electron 进程）。
- 说明：better-sqlite3 当前为 Electron ABI，Node 单测中的 sqlite 用例无法在本环境实测，
  依赖静态核对 + 类型检查。
