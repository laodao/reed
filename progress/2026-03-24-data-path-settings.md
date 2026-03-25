# 数据路径设置功能开发完成

## 完成日期
2026-03-24

## 功能概述
实现了应用程序数据存储路径的自定义设置功能，用户可以更改数据存储位置，支持自动迁移现有数据。

## 技术实现

### 1. 后端服务

#### DataPathService (src/main/services/data-path.service.ts)
- 单例模式管理数据路径
- 使用独立配置文件 `data-path-config.json` 存储自定义路径（避免循环依赖）
- 支持数据迁移（数据库、图片、语音、翻译文件）
- 支持计算数据大小

关键方法：
- `initialize()` - 从配置文件加载自定义路径
- `getDataPath()` - 获取当前数据路径
- `setDataPath(newPath, migrate)` - 设置新路径并迁移数据
- `resetToDefault(migrate)` - 重置为默认路径
- `migrateData(targetPath)` - 执行数据迁移
- `calculateDataSize()` - 计算数据大小

#### DataPathHandler (src/main/ipc/handlers/data-path.handler.ts)
IPC 处理器，处理渲染进程的数据路径请求：
- `data-path:get-config` - 获取配置
- `data-path:select` - 选择目录
- `data-path:set` - 设置新路径
- `data-path:reset` - 重置默认路径
- `data-path:migration-status` - 获取迁移状态
- `data-path:calculate-size` - 计算数据大小
- `data-path:open-folder` - 打开数据目录

### 2. 数据库管理器更新

更新 `src/main/database/index.ts`：
- 在初始化时调用 DataPathService.initialize()
- 使用 DataPathService.getDataPath() 获取数据库路径

### 3. 前端界面

更新 `src/renderer/src/views/Settings.vue`：
- 添加"数据路径"设置标签页
- 显示当前数据路径和状态（默认/自定义）
- 显示数据大小（总计和明细）
- 更改路径和恢复默认路径按钮
- 迁移确认对话框

## 数据迁移逻辑

迁移时复制以下内容：
1. 数据库文件：`the_bot.db`, `the_bot.db-wal`, `the_bot.db-shm`
2. 安全存储密钥：`secure_storage.key`
3. 子目录：`images/`, `voice/`, `translations/`

## 注意事项

- 配置文件 `data-path-config.json` 始终保存在 userData 目录下，不随自定义路径变化
- 数据迁移使用复制方式，不删除原数据，确保安全
- 更改路径后需要重启应用才能生效（数据库路径改变）