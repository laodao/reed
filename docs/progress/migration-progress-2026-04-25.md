# 代码迁移进度记录

**日期**: 2026-04-25
**任务**: src/main 分离到 src/core 和 src/electron
**状态**: ✅ 完成

## 一、已完成工作

### 阶段 1：基础设施准备 ✅

- 创建 `src/core/` 目录结构
- 创建 `src/core/interfaces/` 下的 5 个接口文件
- 更新 `tsconfig.json` 添加路径别名 `@core/*`, `@electron/*`
- 更新 `electron.vite.config.ts` 调整入口和 resolve alias

### 阶段 2：迁移无依赖代码 ✅

已复制目录到 `src/core/`：
- `providers/` - AI Provider
- `image-providers/` - 图像生成 Provider
- `voice-providers/` - 语音处理 Provider
- `search-engines/` - 搜索引擎实现
- `database/repositories/` - Repository 类（大部分）
- `utils/` - 工具函数

### 阶段 3：迁移纯 Node.js 服务 ✅

已复制服务到 `src/core/services/`

### 阶段 4：创建常量和提取函数 ✅

已创建常量文件和模型检测函数

### 阶段 5：实现平台接口 ✅

已创建 `src/electron/platform/` 下的 4 个实现文件

### 阶段 6：迁移 Electron 特定代码 ✅

已复制到 `src/electron/`：
- IPC handlers
- Electron 特定 services
- video-providers（依赖 OSSService）
- 部分 repositories（依赖 DatabaseManager）

### 阶段 7：更新导入路径 ✅

已更新所有导入路径使用 `@core/*`, `@shared/*`

### 阶段 8：验证和归档 ✅

- ✅ 更新 electron.vite.config.ts 入口指向 `src/electron/index.ts`
- ✅ 编译验证通过
- ✅ 应用启动正常
- ✅ src/main 已归档到 `docs/archive/src_main_2026_04_25`

## 二、最终目录结构

```
src/
├── core/           # 平台无关核心代码
│   ├── interfaces/ # 平台抽象接口
│   ├── constants/  # 常量定义
│   ├── providers/  # AI Provider（大部分）
│   ├── image-providers/
│   ├── voice-providers/
│   ├── search-engines/
│   ├── database/repositories/  # 大部分 Repository
│   ├── services/   # 平台无关服务
│   └── utils/
├── electron/       # Electron 特定代码
│   ├── index.ts    # 主进程入口
│   ├── database/   # DatabaseManager + 特定 repositories
│   ├── ipc/        # IPC handlers
│   ├── services/   # Electron services
│   ├── video-providers/  # 依赖 OSS 的视频 Provider
│   ├── platform/   # 平台接口实现
│   └── utils/
├── preload/        # 预加载脚本
├── renderer/       # Vue 前端
└── shared/         # 共享类型定义
```

## 三、路径别名配置

```typescript
// electron.vite.config.ts
alias: {
  '@core': resolve(__dirname, 'src/core'),
  '@shared': resolve(__dirname, 'src/shared'),
  '@electron': resolve(__dirname, 'src/electron')
}
```

## 四、归档位置

- `src/main` → `docs/archive/src_main_2026_04_25`

## 五、后续维护说明

1. **新增平台无关代码** → 放入 `src/core/`
2. **新增 Electron 特定代码** → 放入 `src/electron/`
3. **新增类型定义** → 放入 `src/shared/types/`
4. **编译入口** → `src/electron/index.ts`

---

**迁移完成日期**: 2026-04-25