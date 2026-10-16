# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 语言要求

**重要：请始终使用中文进行以下内容：**
- 与用户的交流沟通
- 代码注释
- 提交信息（commit message）
- 文档编写
- 进度报告

## 项目概述

这是一个基于 Electron + Vue3 + TypeScript 的 AI 工具箱桌面应用程序。

**技术栈：**
- 框架：Electron + Vue3 + Vite
- 语言：TypeScript
- UI组件库：Element Plus / Naive UI
- 状态管理：Pinia
- 数据库：SQLite (better-sqlite3)
- 构建工具：electron-vite

## 构建命令

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建生产版本
npm run build

# 仅构建渲染进程
npm run build:renderer

# 仅构建主进程
npm run build:main

# 代码检查
npm run lint

# 代码格式化
npm run format
```

## 测试命令

```bash
# 运行所有测试
npm test

# 运行单个测试文件
npm test -- path/to/test.spec.ts

# 运行测试并生成覆盖率报告
npm run test:coverage
```

> 说明：单测默认跑在 Electron 内置 Node 上（`scripts/vitest-electron.cjs`，内部设
> `ELECTRON_RUN_AS_NODE=1`），better-sqlite3/canvas/nodejieba 等原生模块只需 Electron
> ABI 一套，dev 与测试共用，**不再需要为跑测试切换 ABI**（详见
> `progress/2026-09-08-abi-unify-electron-node.md`）。若确需 host Node 原生模块而手动
> 执行过 `npm run rebuild:node`，跑测试/dev 前须先 `npm run rebuild:electron` 切回。

## 项目结构

```
src/
├── main/                          # Electron 主进程
│   ├── index.ts                   # 主进程入口
│   ├── database/                  # 数据库相关
│   │   ├── index.ts               # 数据库管理器
│   │   └── repositories/          # 数据仓库层
│   ├── ipc/                       # IPC 通信
│   │   ├── index.ts               # IPC 注册
│   │   ├── base.ts                # IPC 基类
│   │   └── handlers/              # IPC 处理器
│   ├── providers/                 # AI 提供商
│   ├── services/                  # 业务服务
│   └── utils/                     # 工具函数
├── preload/                       # 预加载脚本
│   └── index.ts                   # contextBridge 暴露 API
├── renderer/                      # 渲染进程（Vue3 前端）
│   └── src/
│       ├── main.ts                # Vue 应用入口
│       ├── App.vue                # 根组件
│       ├── components/            # 组件
│       │   └── common/            # 通用组件
│       ├── views/                 # 页面视图
│       ├── stores/                # Pinia 状态管理
│       └── router/                # 路由配置
└── shared/                        # 共享代码（主进程和渲染进程共用）
    └── types/                     # 类型定义
        ├── ipc.types.ts           # IPC 类型
        ├── provider.types.ts      # Provider 类型
        └── dialog.types.ts        # 对话类型
```

## 关键配置文件

- 主配置：`electron.vite.config.ts`
- TypeScript 配置：`tsconfig.json`
- 包管理：`package.json`

## 代码风格

- 遵循 TypeScript 最佳实践
- 使用组合式 API (Composition API) 编写 Vue 组件
- 使用 Pinia 进行状态管理
- 保持 IPC 处理器简洁，将业务逻辑放在服务层
- 使用 Repository 模式进行数据访问
- 所有共享类型定义放在 `src/shared/types/` 目录

## IPC 通信规范

1. 所有 IPC 通道名称定义在 `src/shared/types/ipc.types.ts`
2. IPC 处理器放在 `src/main/ipc/handlers/`
3. 渲染进程通过 `window.electronAPI` 调用 IPC 方法
4. 所有 IPC 调用返回统一的 `{ success, data?, error? }` 格式

## 业务包架构（2026-08 落地）

系统按"业务无关内核 + 内置业务包"组织（设计文档：`tasks/2026-08-28-agent-loop-harness/`，尤其 18 号与 19 号）：

- **包内核**：`src/core/packs/`（registry / pack.service / kernel / ipc-guard）+ `src/renderer/src/packs/`（前端注册表与各包路由/菜单贡献）；共享契约 `src/shared/types/pack.types.ts`。
- **内置业务包**（11 个）：skills、diary、portrait、chat、voice-design、longwriting、episode-production、workflow、app（依赖 workflow）、knowledge-base、asset-center。清单在 `src/core/packs/builtin-packs.ts`（后端）与 `src/renderer/src/packs/index.ts`（前端）。平台级 handler（settings/api-key/provider-config/data-path/image/file/translation/export/search-engine/tool/email/news-source/favicon/oss/datasource/event-admin/pack）按裁决留壳。
- **平台层**（2026-09 三期落地）：`src/core/platform/` 收拢全部被多包/壳共用的实现——`platform/services/`（kb/image/voice/longwriting/event-system/vector 等 26 项）、`platform/workflow/`（引擎/节点/数据源/工具/技能/触发器）、`platform/episode-production/`、`platform/assets/`、`platform/providers/{llm,image,video,voice,search}`（五类 provider）。`src/core/modules/` 与 `src/core/services/` 已清零删除；包专属服务收在包内 `services/`（packs/app/services、packs/episode-production/services、packs/chat/services）。
- **新业务的接入规则**：新增业务功能须以包形式接入——manifest 声明 `contributions.ipcChannelPrefixes`，handler 注册放包的 `activate()`，路由/菜单放前端包模块；**禁止**再向 `initIpcHandlers()` / `registerAllWebChannels()` / 路由表 / 菜单表平铺业务条目（那里只剩壳级平台功能）。
- **跨包纪律**：包间依赖须在 manifest `dependencies` 显式声明（现状实例：episode-production → voice-design、app → workflow）；禁止产生新的跨包私有引用，共享能力下沉壳/公共层。
- **启用/禁用**：禁用 = 前端入口消失 + IPC 守卫按前缀统一拦截（`PACK_DISABLED`）；本期服务实例不卸载、在途数据不动。

## 安全规范

- API 密钥必须加密存储（使用 SecureStorage）
- 敏感信息不能出现在日志中
- 使用 contextBridge 安全暴露 API

## 开发方法
- 采用TDD方式，以测试驱动开发，保障代码质量。

## 开发进度跟踪
- **非常重要** 所有交流过程和开发过程中的进度记录保存在 `progress/` 目录
- 使用 `tasks/` 目录存放任务详情文件

## 职业道德
- **坚决禁止** 坚决禁止使用写死的方式或使用假数据的方式实现功能，糊弄用户。这是非常恶劣的行为，要坚决制止。

## 开发原则
- 不能投机取巧，要规规矩矩实现功能，不能偷懒。
- 要适当考虑扩展性和灵活性，不能直接使用最简单方式
- 严禁代码中写死配置、选项、数据（原型界面除外）
- 严禁复制粘贴代码，要充分考虑代码的复用
- 遵循TDD开发模型
- 数据库设计要遵循第三范式