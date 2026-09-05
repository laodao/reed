# 插件（业务包）架构第二期 · 剩余模块收编实施记录

> 日期：2026-09-05 ｜ 分支：feat/plugin-arch
> 范围：把壳里剩余的业务模块全部迁移为内置业务包；平台级 handler 留壳。
> 用户裁决（2026-09-05）：业务成包、平台留壳；app 单独成包（dependencies: ['workflow']）。

## 迁移清单（4 个新包，95 个 channel）

| 包 | handler（搬入 src/core/packs/\<id>/handlers/） | channel 前缀与数量 | 前端路由 | 菜单锚点 |
|---|---|---|---|---|
| workflow | workflow.handler.ts | wf: ×27 | /workflow、/workflow/editor/:id、/workflow-run/:token（guest）、/workflow/runs/:definitionId、/workflow/run/:runId | 注册序 |
| app | app.handler.ts | app: ×12、app-session: ×8 | /apps、/apps/:id、/apps/:id/session/:sessionId、/app-share/:token（复用 workflow 包 WorkflowGuestRun）、/image /translate /voice/* 旧能力入口 redirect（redirectToApp 随包收编） | 注册序 |
| knowledge-base | knowledge-base.handler.ts | knowledge-base: ×19、kb: ×4、kb-qa: ×7 | /knowledge-base | 注册序 |
| asset-center | asset.handler.ts | asset: ×18 | /assets | 注册序 |

## 留壳（平台层，不动）

settings / api-key / provider-config / data-path / image / file / translation / export /
search-engine / tool / email / news-source / favicon / oss / datasource / event-admin / pack
——裁决依据：无独立业务界面（被工作流节点与其他包共用的能力），或禁用即自残（设置/
数据路径/模型提供商等）。工作流引擎本体（core/modules/workflow）是平台内核，同样留壳；
workflow 包收编的只是"工作流编排"业务的 IPC + UI。

## 关键改动

- 后端：`src/core/packs/{workflow,app,knowledge-base,asset-center}/index.ts`（manifest +
  activate 调既有 register 函数）；`builtin-packs.ts` 登记 11 包；`src/electron/index.ts`
  与 `src/web/server/api/register-channels.ts` 移除 4 个平铺注册。
- 前端：`src/renderer/src/packs/{workflow,app,knowledge-base,asset-center}/index.ts`
  （routes + menuItems）；壳路由表只剩 首页/设置/story-to-video 兼容 redirect；
  壳主菜单只剩 首页（设置在底部菜单）。
- 菜单顺序保序机制：installBuiltinPackages 先注册 4 个原壳位包（无锚点追加，复刻
  原壳条目位置），再注册以 '/knowledge-base'、'/assets' 为锚点的包——锚点从壳条目
  变成包条目，语义不变。最终顺序：首页 → AI对话 → 人像设计 → 长文写作 → 剧集制作
  → 知识库 → 工作流 → 应用 → 日记 → 资产管理 → 声音设计 → 技能库。
- 测试：新增 4 个 channel 覆盖断言（tests/unit/packs/{workflow,app,knowledge-base,
  asset-center}-pack.spec.ts，防静默漂移阈值 27/20/30/18）；改写 app-share-route.spec
  （路由改断 app 包定义）；packs-registry.spec 锚点用例适配壳菜单只剩 '/'。
- 冒烟：scripts/e2e-pack-smoke.cjs 升级 11 包 + 新增 5b（禁 workflow → app pending
  且 wf:/app: 双拦截）。
- 顺手清理触碰文件存量 lint error 6 处（no-var-requires disable 注释补全 ×5、
  no-useless-escape ×1）；修正知识库包 channel 数注释（30，原误写 32）。

## 验证记录

- 构建：electron-vite build ✓、web:client:build ✓。
- eslint：全部触碰文件 0 error（存量 warning 不动）。
- typecheck：总量 956（存量基线区间 955–969 内），新增文件 0 错误；搬动 handler 的
  TS2739/TS6133/TS7006 为存量，随文件平移。
- 单测：packs + packs-registry + app-share-route 60/66 通过（6 失败 = pack.service PG
  凭据不可用，存量）；全量 2784 通过 / 63 失败——失败清单（app.repository、
  asset-service、builtin-app-templates 19→21 漂移、StageHeaderBar、app-list、
  api-key 等）经 HEAD worktree 对照全部为存量，与本次改动无关。
- PC 真机：启动日志 `[pack-kernel] 业务包子系统已启动（11 个内置包）`；
  e2e-pack-smoke 7/7 通过（11 包激活、菜单 11 入口、10 条路由、skills 启停、
  两条依赖级联）；首页截图核对菜单顺序无漂移。

## 已知耦合（只记录）

- chat/diary 运行时调 knowledge-base:list/addDocument（对话挂 KB、消息存 KB、日记
  关联 KB）——软耦合不升级硬依赖：主功能不依赖 KB，包禁用时对应入口降级报错。
- app 包 /app-share/:token 复用 workflow 包 WorkflowGuestRun 视图——由
  dependencies: ['workflow'] 保证方向合法。

## 遗留（下一期候选，不变）

- 包管理 UI、运行时动态启停（启停仍需重启）、per-user binding Web 端验证、
  PG 方言全套件（存量 datetime 阻塞）。
