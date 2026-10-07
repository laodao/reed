# workflow + agent-runtime 独立开源项目迁移方案

- **日期**：2026-10-07
- **状态**：待评审
- **范围**：将 `src/core/platform/agent-runtime`（agent harness/runtime）与 `src/core/platform/workflow`（工作流引擎）抽出为独立开源项目，主系统（the-bot）以 npm 包方式消费。pack 体系的组织方式（如何组合成产品、是否开源）不在本方案内，另行决策。
- **前置结论**：可行性评估已完成（见附录 A 审计数据）。引擎已具备 `engine/ports.ts` 依赖倒置模式与 `workflow-boot` 宿主装配器形态，本拆分属于"收尾工程"而非"重构工程"。

---

## 0. 背景与总体战略

1. 主系统已具备 pack 体系（`src/core/packs/`，12 个业务包 + 包内核），未来基于"产品档案"组合出多个产品（创作工坊 / 学习空间 / 轻量助手 / 完整版）。
2. 平台层（agent-runtime、workflow 引擎、pack kernel）是所有产品共用的底座，适合以 open-core 模式开源：**引擎开源，业务 pack 闭源或择机开源**。
3. 本方案先解决平台层中耦合最清晰的两件：workflow 引擎 + agent runtime。二者合并为一个开源项目（workflow 依赖 agent-runtime，拆两个仓库徒增同步成本）。

## 1. 命名方案

### 1.1 推荐：**runrail**

- **npm 包名**：未占用（2026-10-07 实查）✅
- **GitHub 组织/用户名**：未占用 ✅
- **叙事**：`runs on rails` —— 工作流引擎是"铺轨道"（确定性编排、图校验、可复跑），agent runtime 是"轨道上运行的车"（工具调用、上下文、预算）；journal/replay 让每次 run 沿轨道重放，正是引擎的持久化执行特性。
- **Tagline**：*Durable workflow engine & agent runtime for local-first apps*（面向本地优先应用的内嵌式工作流引擎与 Agent 运行时）。

### 1.2 可用性核查记录（2026-10-07 快照）

| 候选 | npm | GitHub | 结论 |
|---|---|---|---|
| **runrail** | ✅ 未占用 | ✅ 未占用 | **推荐** |
| runloom | ✅ 未占用 | ❌ 有同名组织（AI 终端工具 pier，105★） | 备选（仓库挂个人账号） |
| flowloom | ✅ 未占用 | ❌ 同名组织做 AI workflow，同领域撞车 | 排除 |
| weft | ❌ Google Web Fonts wrapper（2021） | — | 排除 |
| bobbin | ❌ worker pool 库（2015） | — | 排除 |
| thrum | ❌ livecoding 音乐工具 | — | 排除 |
| knotwork | ❌ 占位包 | — | 排除 |
| millrace | ❌ 活跃 kanban 工具 | — | 排除 |
| heddle | ❌ full stack framework（2026-02） | — | 排除 |
| railyard | ❌ shunting-yard parser | — | 排除 |
| sluice | ❌（2013） | — | 排除 |
| escapement | ❌ agent orchestration 库（2026-08） | — | 排除（同领域） |
| agentloom | ❌ agent CLI（2026-04） | — | 排除（同领域） |
| signalbox | ❌ redux middleware（2017） | — | 排除 |
| agentrail | — | ❌ LLM 可观测性组织 | 排除 |

> escapement / agentloom 被同领域项目占用，侧面说明该命名空间热度高。
> **行动项**：方案批准后 24 小时内注册 npm org `runrail` 与 GitHub org `runrail`（可用性为时点快照，先到先得）。备选 runloom 同理。

### 1.3 命名约定

- GitHub 仓库：`runrail/runrail`（单仓库 monorepo）
- npm 包：`@runrail/runtime`（agent runtime）、`@runrail/workflow`（工作流引擎）
- 代码内品牌词统一为 `runrail`，定名前文档/代码一律用占位 scope `@runrail/*`，定名后全局替换即可。

## 2. 目标形态

```
runrail/
├── packages/
│   ├── runtime/                  ← 原 src/core/platform/agent-runtime（31 文件 / ~8.2k 行）
│   │   ├── src/
│   │   │   ├── budget/  context/  host/  memory/  provider/
│   │   │   ├── runtime/ tasks/   tools/  trajectory/  verify/
│   │   │   ├── types/            ← 原 @shared/types/agent.types 等（见 §3.2）
│   │   │   └── index.ts          ← 公共 API 唯一出口
│   │   ├── tests/
│   │   └── package.json          name: @runrail/runtime
│   └── workflow/                 ← 原 src/core/platform/workflow（引擎 + 通用节点）
│       ├── src/
│       │   ├── engine/           ← ports.ts 依赖倒置模式保留
│       │   ├── nodes/            ← 仅通用节点族（见 §3.3 分拣清单）
│       │   ├── tools/ skills/ trigger/ variables/ visual/ draft/
│       │   ├── datasource/       ← mysql/pg/mssql/clickhouse 驱动（通用件）
│       │   ├── types/            ← 原 @shared/types/workflow.types 等
│       │   └── index.ts
│       ├── tests/
│       └── package.json          name: @runrail/workflow  deps: @runrail/runtime
├── examples/                     ← 最小 workflow + 最小 agent run 各一个（OSS 门面，必做）
├── docs/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.workspace.ts
├── .github/workflows/ci.yml
└── LICENSE(MIT)  README.md(双语)  CONTRIBUTING.md  CHANGELOG.md
```

**公共 API 原则**：对外仅经各包 `src/index.ts` 导出；`workflow.types` 是事实上的公共契约（全库 51 个消费文件），发布前做一轮导出面收敛，此后按 semver 管理。

## 3. 边界裁定：搬什么、留什么

### 3.1 总表

| | 进 runrail | 留在主系统 |
|---|---|---|
| agent-runtime | 全部 31 文件 | 4 个 agent 仓储改为 Port 注入；`ai-call`、`event-producer` 变 Port |
| workflow 引擎 | `engine/`、run/definition/draft 服务、`trigger/`、`variables/`、`visual/`、`skills/`、`datasource/` 驱动 | `workflow-boot.ts`（宿主装配器）；`packs/workflow/` 的 IPC handler（wf:/at:/am:/ac: 前缀） |
| nodes | 通用族：http、code、control、variable、task、oas、ai、agent-loop | 业务族：diary、asset、news、voice-clone、video、visual、media、extra 等（宿主侧注册） |
| harness | ——（agent-runtime 即 harness） | `dl-agent-harness.service`、`ep-agent-harness.service` 等包层封装 |

> 澄清：业务包里的 `dl/ep-agent-harness.service` 是基于 agent-runtime 的封装，**不搬**。
> `workflow-boot.ts` 对 packs 的 import 在宿主侧合法，无需清理（它留在主系统）。

### 3.2 shared 文件归属清单（随迁）

**→ packages/runtime/src/types|utils/**

| 原路径 | 消费计数 |
|---|---|
| `src/shared/types/agent.types.ts` | 11（runtime 内） |
| `src/shared/types/agent-budget.types.ts` | 1 |
| `src/shared/utils/agent-budget.ts` | 3 |
| `src/shared/utils/agent-context-params.ts` | 4 |
| `src/shared/utils/agent-tool-params.ts` | 3 |
| `src/shared/utils/runtime-limits.ts` | 3+2（双方共用，放 runtime，workflow 跨包引用） |
| `src/shared/utils/model-predicates.ts` | 1 |

**→ packages/workflow/src/types|utils/**

| 原路径 | 消费计数 |
|---|---|
| `src/shared/types/workflow.types.ts` | 38 |
| `src/shared/utils/workflow-runtime-params.ts` | 24 |
| `src/shared/types/workflow-skill.types.ts` | 4 |
| `src/shared/types/workflow-node-catalog.ts` | 4 |
| `src/shared/types/datasource.types.ts` | 8 |
| `src/shared/types/variable.types.ts` | 2 |
| `src/shared/utils/openapi-parser.ts` | 1 |

**不随迁（业务参数，随业务节点留在宿主侧）**：`video-scene-lexicon`、`portrait-params`、`longwriting-params`、`knowledge-params`、`tool.types`（裁定项）。

> 以上清单来自 2026-10-07 import 审计；执行时以 §5.4 的"外部依赖归零哨兵"为准补漏。

### 3.3 节点分拣清单

关键词扫描命中（执行时逐个裁定，原则：**读主系统服务/读业务参数 = 业务节点，留宿主**）：

- 业务族（移宿主）：`diary-nodes`、`asset-nodes`、`news-nodes`、`voice-clone-nodes`、`video-nodes`、`visual-nodes`、`media-nodes`、`extra-nodes`、`a2-nodes`、`ffmpeg-utils`（视裁定）、`yt-dlp-manager`/`video-url-resolver`（tools/，视裁定）
- 通用族（随迁）：`http-fetch`、`http-politeness`、`code-nodes`、`control-nodes`、`variable-nodes`、`task-nodes`、`oas-nodes`、`ai-nodes`、`agent-loop-node`、`sub-workflow-nodes`、`skill-nodes`、`tool-nodes`、`retry-submit`、`response-body`、`graph` 系列
- 宿主注册机制现成：`packs/longwriting/workflow-nodes.ts`、`packs/podcast-video/workflow-nodes.ts` 已在使用节点扩展 API，分拣出的业务节点照此挂回。

## 4. 阶段 1：主库清场（第 1 周）

原则：**先在主库完成所有涉及主库其它文件的改动，新库拿到干净代码**，避免跨库来回改。每步完成后主系统可运行、可回归。

### 4.1 业务节点分拣

1. 按 §3.3 清单将业务节点族从 `platform/workflow/nodes/` 移至宿主侧注册模块（建议 `src/core/platform/workflow-host-nodes/`，或直接挂到对应 pack）。
2. `workflow-boot` 装配时统一注册。
3. 验收：工作流全功能回归；`platform/workflow/nodes/` 内不再有读主系统服务的文件。

### 4.2 Port 化收尾（约 90 处宿主 import → 6-8 个端口接口）

| Port | 覆盖依赖（处数） | 建议形态 |
|---|---|---|
| Logger | `@core/utils/logger`（19+14） | 最小 Logger 接口，宿主传 pino 实例（pino 本就是依赖） |
| HostContext | `@core/context/user-context`（6+7） | 上下文读取接口，宿主传 ALS 实现 |
| PathPort | `path.interface`(9) + `asset-path`(3) | 路径解析接口 |
| EventPort | `event.interface`(5) + `event-producer`(1) | 事件发射接口 |
| OutboundHttpGuard | `outbound-url`(5) | 出站 URL 审批接口 |
| StoragePort | `storage.interface`(2) + 4 个 agent 仓储(5) + `database-manager`(3) | 沿用 `engine/ports.ts` 模式扩展 |
| SettingsReload | (1) | 回调注入 |
| AICall | (1) | 接口注入 |

注：`ai` SDK（agent-runtime 内 10 处）直接作为 npm 依赖随迁，无需抽象。

### 4.3 类型归位

将 §3.2 清单中的 shared 文件物理移入两个平台目录内部，主库全局改 import（`@shared/types/agent.types` → `@core/platform/agent-runtime/types` 等）。

### 4.4 阶段验收

- 主系统全部功能回归：包启用、工作流运行、agent 会话、剧集制作、领域学习。
- `git grep "@shared/types/workflow.types\|@shared/types/agent.types" src` 仅剩平台目录内部引用。

## 5. 阶段 2：新建 git 库与历史迁移（第 2-3 周）

### 5.1 历史策略

**方案 A（推荐）：git filter-repo 保留历史** —— 8k + 22k 行引擎的 blame 有长期价值，成本一条命令。
**方案 B（退路）**：新库 init + 单快照 commit，最简单，丢 blame。

### 5.2 方案 A 命令模板

```bash
# 在 fresh clone 上执行（filter-repo 拒绝非 fresh 仓库）
git clone --no-local <主库URL> runrail && cd runrail
git filter-repo \
  --path src/core/platform/agent-runtime \
  --path src/core/platform/workflow \
  --path src/shared/types/agent.types.ts \
  --path src/shared/types/agent-budget.types.ts \
  --path src/shared/utils/agent-context-params.ts \
  --path src/shared/utils/agent-tool-params.ts \
  --path src/shared/utils/agent-budget.ts \
  --path src/shared/utils/runtime-limits.ts \
  --path src/shared/utils/model-predicates.ts \
  --path src/shared/types/workflow.types.ts \
  --path src/shared/types/workflow-skill.types.ts \
  --path src/shared/types/workflow-node-catalog.ts \
  --path src/shared/types/datasource.types.ts \
  --path src/shared/types/variable.types.ts \
  --path src/shared/utils/workflow-runtime-params.ts \
  --path src/shared/utils/openapi-parser.ts \
  --path tests/unit/core/platform/agent-runtime \
  --path tests/unit/core/platform/workflow \
  --path-rename src/core/platform/agent-runtime/:packages/runtime/src/ \
  --path-rename src/core/platform/workflow/:packages/workflow/src/ \
  --path-rename tests/unit/core/platform/agent-runtime/:packages/runtime/tests/ \
  --path-rename tests/unit/core/platform/workflow/:packages/workflow/tests/
  # shared 文件逐个加 --path-rename 落到对应包（按 §3.2 清单）

git remote add origin <新库URL> && git push -u origin main
```

注意事项：

- `workflow-boot.ts` 与业务节点文件会随目录被带过去，在迁移后第一个 commit 中删除（它们留在主库）。
- 主库的原文件删除放在阶段 3 的切换提交中，迁移期间主库照常运行。
- 若审计外还有遗漏的 shared 文件被包内引用，补跑一次 filter-repo（改清单重做）或在首个 commit 中手工挪入。

### 5.3 脚手架（迁移后第一个 commit）

pnpm workspace + 各包 package.json（name/exports/types 入口）+ tsconfig.base（路径别名改包内相对引用）+ vitest.workspace + GitHub Actions CI + LICENSE/README/CONTRIBUTING + `examples/` 两个最小示例。

### 5.4 外部依赖归零哨兵（必须全绿）

```bash
grep -rhoE "from '@(core|shared)[^']*'" packages --include='*.ts'   # 输出必须为空
grep -rnE "typeorm|better-sqlite3|nodejieba|@lancedb" packages --include='*.ts'   # 原生依赖必须为零
```

### 5.5 测试基线

现有测试仅 5 个 spec（workflow/local 3 个、agent-runtime/memory 2 个）。ports 内存假实现已支持无 DB 测试，但新库 CI 测试基线要作为本阶段工作项：engine 核心（图校验、拓扑、journal 回放）、runtime 核心（loop、tools 注册、预算）至少各 5-10 个用例。

## 6. 阶段 3：主系统切换与发布（第 4-5 周）

1. **开发期链接**：主库 `package.json` 以 `file:../runrail/packages/workflow` 链接两个包。
   ⚠️ electron-builder 打包注意：symlink 依赖进 asar 会出问题，发布构建前用 `npm pack` 产出 tarball 安装，或直接发 npm 后以版本安装。
2. **发布**：`@runrail/runtime@0.1.0`、`@runrail/workflow@0.1.0`（可先 npm private / unlisted 跑 2-4 周，再转 public）。版本管理用 changesets。
3. **主库切换**：`file:` → `^0.1.0` 版本化依赖 → 全局替换 import（主库侧约 100 个文件：agent-runtime 消费者 57 + workflow 消费者 55，renderer/web client 约 5 处；机械替换）→ 删除 `src/core/platform/{agent-runtime,workflow}`。
4. **冻结窗口**：阶段 2-3 期间主库平台层（这两个目录及其消费方的结构性改动）冻结；业务 pack 开发可继续。

## 7. CI 与质量基线（runrail 仓库）

CI 四件事：typecheck、build、test、**边界哨兵**（§5.4 的两条 grep 作为 lint 级检查，禁止 `@core/*`/`@shared/*` 与任何主系统路径 import 回归）。

## 8. 验收标准

1. runrail 在**无主库的机器**上 `pnpm i && pnpm build && pnpm test` 全绿；
2. 主库 `grep -r "@core/platform/agent-runtime\|@core/platform/workflow" src` 归零；
3. 主系统回归无差异（包启用、工作流运行、agent 会话、受影响 pack 全链路）；
4. npm 安装 `@runrail/workflow` 后能跑通 `examples/` demo。

## 9. 时间表（4-5 周，单人净工时）

| 周 | 内容 | 里程碑 |
|---|---|---|
| W1 | 主库清场：节点分拣 + Port 化 + 类型归位 | 主库回归通过 |
| W2-3 | runrail 建库 + filter-repo 迁移 + 构建修复 + CI + 测试基线 | 哨兵全绿；主系统经 `file:` 链接正常工作 |
| W4 | npm 发布 0.1.0 + 主库切换版本依赖 + 删旧目录 + import 替换 | 验收标准 1-3 |
| W5 | examples、双语 README、（转 public）| 验收标准 4，正式对外 |

## 10. 风险与缓解

| # | 风险 | 缓解 |
|---|---|---|
| R1 | W2-3 双头修改（主库与 runrail 同改平台代码） | 平台层冻结两周；改动走专用分支短周期合并 |
| R2 | 业务节点分拣决策耗时（通用/业务边界是产品判断） | 先按"能移则移"执行，拿不准的留宿主侧，后续再收 |
| R3 | shared 文件清单遗漏（审计为时点快照） | 以 §5.4 哨兵为准迭代补漏 |
| R4 | `workflow.types` 成为公共 API 后的 semver 负担 | 发布前做导出面收敛；破坏性变更走 changesets 明示 |
| R5 | 测试基线薄（现仅 5 spec），开源后回归保护不足 | W2-3 强制补 engine/runtime 核心用例，作为里程碑而非事后项 |
| R6 | 发布后维护承诺（issue/PR/安全响应） | 先 private 2-4 周验证消费链路，转 public 前准备好 CONTRIBUTING 与安全政策 |

## 附录 A：依赖审计数据（2026-10-07）

### A.1 规模

| 目录 | 文件数 | 行数 |
|---|---|---|
| `src/core/platform/agent-runtime` | 31 | ~8,179 |
| `src/core/platform/workflow` | 78 | ~21,914 |

### A.2 agent-runtime 外部依赖（按 import 计数）

```
19  @core/utils/logger          11  @shared/types/agent.types
10  ai（SDK，随迁）              6  @core/context/user-context
 4  @shared/utils/agent-context-params
 3  @shared/utils/runtime-limits / agent-tool-params / agent-budget
 2  @core/database/repositories/agent-session.repository
 1  trajectory / task / memory-entry 仓储、event-producer、ai-call、model-predicates、agent-budget.types
```

### A.3 workflow 外部依赖（按 import 计数）

```
38  @shared/types/workflow.types       24  @shared/utils/workflow-runtime-params
14  @core/utils/logger                  9  @core/interfaces/path.interface
 8  @shared/types/datasource.types      7  @core/context/user-context
 6  agent-runtime types / tools/registry（合并后为包内依赖）
 5  @core/utils/outbound-url / @core/interfaces/event.interface
 4  workflow-skill.types / workflow-node-catalog / tool.types
 3  knowledge-params / asset-path / database-manager.interface
 2  runtime-limits / video-scene-lexicon / variable.types / provider-adapter / storage.interface
 1  settings-reload / portrait-params / openapi-parser / longwriting-params
```

### A.4 消费面

- agent-runtime：主库 57 个文件消费（不含自身 31 个），含 packs（workflow/longwriting/domain-learning/chat）、platform services（kb-brain、ep-agent、longwriting-ai）、database repositories。
- workflow：主库 55 个文件消费（不含自身 78 个），含 electron/web 宿主入口、7 个 pack、多个 platform services。
- `@shared/types/workflow.types`：全库 51 个消费文件，其中 renderer/web client 仅 5 个（前端改动面小）。

### A.5 测试现状

`tests/unit/core/platform/workflow/local` 3 个 spec；`tests/unit/core/platform/agent-runtime/memory` 2 个 spec。ports 内存假实现模式支持无 DB 单测（见 `engine/ports.ts` 头注）。

## 附录 B：执行检查清单

- [ ] 定名 runrail（或备选）→ 24h 内注册 npm org + GitHub org
- [ ] W1 节点分拣：业务节点移宿主 + boot 注册 + 回归
- [ ] W1 Port 化：8 个端口接口 + boot 装配 + 回归
- [ ] W1 类型归位：§3.2 清单 + 全库 import 替换
- [ ] W2 新库：filter-repo 迁移 + 脚手架 commit + 推送远端
- [ ] W2-3 哨兵全绿（外部依赖归零 + 原生依赖归零）
- [ ] W2-3 测试基线补齐（engine/runtime 各 5-10 用例）+ CI 四件事
- [ ] W3 主系统 `file:` 链接连通，回归通过
- [ ] W4 npm 0.1.0 发布 → 主库版本化切换 → 删旧目录 → import 替换 → 验收 1-3
- [ ] W5 examples + 双语 README → 验收 4 →（可选）转 public
