# 单测 ABI 统一：让 vitest 跑在 Electron 内置 Node 上（2026-09-08）

## 结论（TL;DR）

采纳用户建议方案一并落地：**单测改为通过 `ELECTRON_RUN_AS_NODE=1` 用 Electron 内置 Node 跑 vitest**，
better-sqlite3 / canvas / nodejieba 只需编译成 Electron ABI 一套，dev 与测试共用，**从此不再为测试切换 ABI**。
实测：Electron-as-Node 下原生三件套直载成功；全量 407 个单测文件中 Electron 环境特有失败仅 3 个（已逐一适配修复），
其余失败与 host Node 基线完全一致（分支既有测试漂移 + 本机缺 ffmpeg-static 二进制），与运行器无关。
**方案二（双副本 ABI 切换脚本）经实测无需启用**。

## 背景

- better-sqlite3 / canvas / nodejieba 均为按 ABI 绑定的原生模块：
  - PC dev（Electron 28.3.3）：`process.versions.modules = 119`（内置 Node 18.18.2）；
  - vitest/tsx（host Node v22.20.0）：`process.versions.modules = 127`。
- 旧流程每次在「跑单测」与「跑 dev」之间都要 `npm run rebuild:node` / `rebuild:electron`，慢且依赖工具链。
  更糟的是：本机在 host Node 全量跑单测会直接段错误崩溃（exit 0xC0000005），旧流程事实上跑不动全量。
- 历史：15fab6cf 曾加 `scripts/swap-sqlite-abi.sh`（双副本 cp 切换），7340afe2 因 Web 切 PG 移除。

## 方案一实测记录

### 1. Electron-as-Node 冒烟

```bash
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe node_modules/vitest/vitest.mjs run ...
```

- ABI 校验：`modules=119, node=18.18.2, electron=28.3.3`；
- better-sqlite3 / canvas / nodejieba 在 Electron-as-Node 下**全部直接加载成功**（当前即为 Electron ABI 构建，零 rebuild）；
- 冒烟用例 `tests/unit/core/database/sqlite-serial-gate.spec.ts`：5/5 通过。

### 2. 全量对照（tests/unit，SKIP_PG_TESTS=1，共 407 文件 / 3364+ 用例）

| 运行器 | 结果 |
|---|---|
| Electron-as-Node（首轮，改动前） | 34 文件失败 / 373 通过；95 用例失败 / 3264 通过 / 1 跳过（Errors 4） |
| host Node 全量（Node ABI 重编后） | 段错误崩溃（0xC0000005），无法完成（旧流程实证） |
| host Node 仅跑 Electron 失败的 33 个文件 | 30 文件失败 / 3 通过 |
| Electron-as-Node（适配 3 处后，终轮） | **31 文件失败 / 376 通过**；94 用例失败 / 3274 通过 / 1 跳过（Errors 4） |

归类结论：33 个对照文件中 host Node 通过而 Electron 失败的只有 3 个 → **Electron 环境特有失败仅 3 个**；
其余 30 个在两种运行器上都红 = 分支既有漂移（StageHeaderBar 断言、AppUserPrefs 实体注册缺失、webhook-trigger 少 import `afterEach`、
gossip-event-report 平台值断言等）+ 本机缺 `node_modules/ffmpeg-static/ffmpeg.exe`（reference-video 相关用例，机器安装问题，与运行器无关）。

### 3. Electron 环境特有的 3 个问题与适配（均已修复并验证）

1. `tests/unit/core/database/migrate-legacy-settings-table.spec.ts`
   - 原因：测试用 `process.getBuiltinModule('node:sqlite')`（Node 22 内置，当初为绕 ABI 切换）；
     Electron 28 内置 Node 18 既无 `getBuiltinModule` 也无 `node:sqlite`。
   - 适配：改用 better-sqlite3 `:memory:`（ABI 统一后绕行动机消失；src 迁移函数本就是驱动无关的 `SqliteLikeDb`，零改动）。
2. `tests/unit/electron/ipc/file-write-binary.spec.ts`
   - 原因：`beforeAll` 里直接给 `process.versions.electron` 赋值伪造桌面环境；Electron-as-Node 下该属性已存在且只读 → TypeError。
   - 适配：仅当属性不存在时才赋值（host Node 语义不变；Electron-as-Node 下本来就是真桌面分支）。
3. `tests/unit/core/platform/workflow/code-node.spec.ts`（含 1 处 src 微改）
   - 原因：`code-nodes.ts` 的桌面判定 `isElectronRuntime()` 只看 `process.versions.electron`，
     Electron-as-Node 被误判为「桌面端」而放行 code 节点任意 JS（测试期望非桌面拒绝 → failed）。
   - 适配：`isElectronRuntime()` 增加排除 `process.env.ELECTRON_RUN_AS_NODE === '1'`
     （Electron-as-Node 语义仍是 Node，非桌面主进程；**保留防服务端 RCE 门禁**）。
   - 回归验证：code-node / agent-tool-adapters / agent-loop-node / tool-registry 共 6 文件 91 用例全绿。

## 落地内容

- 新增 `scripts/vitest-electron.cjs`：跨平台启动器，解析 Electron 路径与 vitest 入口，
  注入 `ELECTRON_RUN_AS_NODE=1` 后透传 vitest 参数；支持 `--sqlite-only`/`--skip-pg`（等价旧 `SKIP_PG_TESTS=1`）。
- `package.json` 测试脚本全部改为走 wrapper（语义不变，仅换运行器）：
  - `test` → wrapper（watch 模式）；`test:unit` / `test:unit:pg` → wrapper `run tests/unit`；
  - `test:unit:sqlite` → wrapper `--sqlite-only run tests/unit`；
  - `test:coverage` → wrapper `run --coverage`（v8 覆盖率在 Electron-as-Node 下实测可用）。
- `rebuild:electron` / `rebuild:node` 保留：`rebuild:node` 仅在确有 host-Node 原生需求的场景使用，
  用后需 `npm run rebuild:electron` 切回（dev 与单测都要求 Electron ABI）。

## 边界与已知残余

- Electron 28 内置 Node 18 与 host Node 22 的差异已扫描：ES2023 数组方法、`node:sqlite`、`import.meta.*` 均无 src/测试残留使用；
  唯一冲突即上述 3 处，已修。
- vitest 大并发跑批偶发「Failed to terminate worker / Vite server 不退出」告警（收尾悬挂，非必现；
  单文件与首轮全量均正常退出），与既有漂移文件 tool.service.spec 相关，暂不影响使用。
- 本机 `ffmpeg-static` 无二进制导致的 reference-video 用例失败为环境问题（与 ABI/运行器无关）。
- 分支现有约 30 个漂移失败文件与本任务无关，待对应业务任务修复。

## 状态

方案一验证通过并落地，方案二无需启用。改动文件：
`scripts/vitest-electron.cjs`、`package.json`、`src/core/platform/workflow/nodes/code-nodes.ts`、
`tests/unit/core/database/migrate-legacy-settings-table.spec.ts`、`tests/unit/electron/ipc/file-write-binary.spec.ts`、本文件。
