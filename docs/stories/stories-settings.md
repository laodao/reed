# 系统设置模块 - 用户故事

**模块名称：** 系统设置
**所属Epic：** EPIC-005 系统基础设施
**优先级：** Must Have
**Sprint：** 第1周
**日期：** 2026-03-01

---

## 故事列表

| 故事ID | 故事名称 | 故事点数 | 优先级 | 状态 |
|--------|----------|----------|--------|------|
| SET-001 | API密钥管理 | 5 | Must Have | ✅ 已完成 |
| SET-002 | 主题和界面设置 | 3 | Must Have | ✅ 已完成 |
| SET-003 | 数据导入导出 | 5 | Must Have | 待开发 |
| SET-004 | 应用信息与更新 | 3 | Must Have | 待开发 |

---

## SET-001: API密钥管理

### 用户故事

```
作为一个 用户
我想要 安全地配置和管理各服务的API密钥
以便 能够使用各种AI服务功能
```

### 描述

**背景：**
AI工具箱需要调用多个第三方AI服务API，每个服务都需要API密钥进行认证。用户需要一个安全、便捷的方式来配置和管理这些密钥。

**范围：**
- 支持多个服务提供商的API密钥配置
- 密钥加密存储
- 密钥有效性测试
- 密钥的添加、编辑、删除

**用户流程：**
1. 用户进入设置页面
2. 选择"API密钥管理"
3. 查看已配置的服务列表
4. 点击"配置"添加新密钥或编辑现有密钥
5. 输入API密钥
6. 点击"测试连接"验证密钥有效性
7. 保存配置

### 验收标准

- [x] 用户可以添加新的API密钥配置
- [x] 用户可以编辑已有的API密钥
- [x] 用户可以删除API密钥
- [x] API密钥以加密形式存储在本地
- [x] 提供API密钥测试功能，显示连接状态
- [x] 支持以下服务的API密钥配置：
  - [x] 通义千问
  - [x] 豆包
  - [x] GLM
  - [x] DeepSeek
  - [x] 火山引擎
- [x] 密钥输入框默认隐藏显示
- [x] 提供显示/隐藏密钥的切换按钮
- [x] 配置保存后立即生效
- [x] 支持自定义端点配置（用于代理或私有部署）

### 技术说明

**涉及的组件：**
- 前端：SettingsView.vue, APIKeyForm.vue
- 后端：api-key.service.ts, secure-storage
- IPC：settings-handler.ts

**API接口：**
```typescript
// 保存API密钥
IPC.saveAPIKey(provider: string, apiKey: string): Promise<Result<void>>

// 获取API密钥（脱敏）
IPC.getAPIKey(provider: string): Promise<Result<{ masked: string, configured: boolean }>>

// 测试API密钥
IPC.testAPIKey(provider: string, apiKey: string): Promise<Result<{ valid: boolean, message: string }>>

// 删除API密钥
IPC.deleteAPIKey(provider: string): Promise<Result<void>>
```

**数据存储：**
- 使用系统级加密存储（Electron safeStorage）
- 密钥不存储在明文配置文件中
- 不在日志中输出密钥

**边界检查：**
| 检查项 | 规则 | 错误提示 |
|--------|------|----------|
| 密钥为空 | 不能为空 | "请输入API密钥" |
| 密钥格式 | 根据服务商验证 | "API密钥格式不正确" |
| 网络连接 | 测试时检查 | "网络连接失败，请检查网络" |

### 故事点数：5

**估算依据：**
- 前端表单和列表：2点
- 后端加密存储：2点
- API测试功能：1点

### 依赖

- 无前置依赖
- 阻塞：所有需要API的模块

### 实现进度

**完成日期：** 2026-03-01
**实际工作量：** 5点（与估算一致）

**实现的文件：**
- `src/renderer/src/views/SettingsView.vue` - 前端设置页面
- `src/main/services/api-key.service.ts` - API密钥服务
- `src/main/ipc/handlers/api-key.handler.ts` - IPC处理器
- `src/main/providers/provider.manager.ts` - Provider管理器
- `src/shared/types/provider.types.ts` - Provider类型定义

**实现说明：**
1. 使用 AES-256-GCM 加密算法存储 API 密钥
2. 支持自定义端点配置，可用于代理或私有部署
3. API 测试功能：
   - 对于已实现 Provider 的服务（qwen、doubao、glm、deepseek、ollama），会进行真正的连接测试
   - 对于未实现 Provider 的服务（volcengine），会验证密钥是否可以解密

---

## SET-002: 主题和界面设置

### 用户故事

```
作为一个 用户
我想要 自定义应用的主题和界面外观
以便 获得舒适的使用体验
```

### 描述

**背景：**
用户对界面外观有不同的偏好，有些喜欢浅色主题，有些喜欢深色主题。提供主题切换和界面自定义功能可以提升用户体验。

**范围：**
- 深色/浅色/跟随系统主题切换
- 界面语言切换（中/英文）
- 字体大小调节

**用户流程：**
1. 用户进入设置页面
2. 选择"外观设置"
3. 选择主题（浅色/深色/跟随系统）
4. 选择界面语言
5. 调节字体大小
6. 设置实时生效

### 验收标准

- [x] 支持浅色主题
- [x] 支持深色主题
- [x] 支持跟随系统主题
- [x] 主题切换立即生效，无需重启
- [x] 支持简体中文界面
- [x] 支持英文界面
- [x] 语言切换后提示需要重启
- [x] 支持字体大小调节（小/中/大）
- [x] 设置自动保存

### 技术说明

**涉及的组件：**
- 前端：SettingsView.vue, ThemeSelector.vue
- 状态管理：settingsStore.ts
- CSS变量主题系统

**实现要点：**
- 使用CSS变量实现主题切换
- 主题状态存储在localStorage
- 监听系统主题变化事件

### 故事点数：3

**估算依据：**
- 主题系统实现：1.5点
- 语言切换：1点
- 字体大小调节：0.5点

### 依赖

- 无前置依赖

### 实现进度

**完成日期：** 2026-03-02
**实际工作量：** 3点（与估算一致）

**实现的文件：**
- `src/renderer/src/stores/settings.ts` - 设置状态管理
- `src/renderer/src/views/SettingsView.vue` - 设置页面
- `src/renderer/src/styles/variables.scss` - CSS 变量定义
- `src/renderer/src/styles/main.scss` - 全局样式

**实现说明：**
1. 主题切换使用 CSS 变量实现，支持 light/dark/auto 三种模式
2. 自动模式下监听系统主题变化，实时切换
3. 语言切换后提示需要重启应用才能生效
4. 字体大小支持 small/medium/large 三种规格，通过 CSS 变量 --font-size-base 控制
5. 所有设置自动保存到主进程

---

## SET-003: 数据导入导出

### 用户故事

```
作为一个 用户
我想要 导入和导出我的应用数据
以便 备份数据或迁移到新设备
```

### 描述

**背景：**
用户在使用应用过程中会产生大量数据（对话历史、角色设置、知识库等）。需要提供数据导入导出功能，方便用户备份和迁移。

**范围：**
- 导出所有用户数据
- 导出选中类型的数据
- 导入数据文件
- 重置应用数据

**用户流程：**
1. 用户进入设置页面
2. 选择"数据管理"
3. 选择要导出的数据类型
4. 点击"导出"按钮
5. 选择保存位置
6. 系统生成并保存导出文件

### 验收标准

- [ ] 用户可以导出所有数据
- [ ] 用户可以选择性导出特定类型数据：
  - [ ] API配置（密钥加密导出）
  - [ ] 对话历史
  - [ ] 角色预设
  - [ ] 应用设置
- [ ] 导出文件为JSON格式
- [ ] 用户可以导入数据文件
- [ ] 导入前显示预览信息
- [ ] 导入时提示覆盖警告
- [ ] 用户可以重置所有设置
- [ ] 用户可以清除所有数据（需二次确认）

### 技术说明

**涉及的组件：**
- 前端：SettingsView.vue, DataManagement.vue
- 后端：data-export.service.ts, data-import.service.ts

**导出文件格式：**
```json
{
  "version": "1.0.0",
  "exportDate": "2026-03-01T10:00:00Z",
  "appVersion": "1.0.0",
  "data": {
    "settings": {...},
    "conversations": [...],
    "roles": [...],
    "apiKeys": {
      "encrypted": true,
      "data": "..."
    }
  }
}
```

### 故事点数：5

**估算依据：**
- 导出功能：2点
- 导入功能：2点
- 重置/清除功能：1点

### 依赖

- SET-001（API密钥管理，导出时需要处理密钥）

---

## SET-004: 应用信息与更新

### 用户故事

```
作为一个 用户
我想要 查看应用版本信息并检查更新
以便 了解应用状态和获取最新功能
```

### 描述

**背景：**
用户需要知道当前使用的应用版本，并能够检查是否有新版本可用。

**范围：**
- 显示应用版本信息
- 显示技术栈信息
- 检查更新功能
- 打开项目主页和问题反馈

**用户流程：**
1. 用户进入设置页面
2. 选择"关于"
3. 查看应用版本、构建信息
4. 点击"检查更新"
5. 系统检查并显示更新结果

### 验收标准

- [ ] 显示应用名称和图标
- [ ] 显示当前版本号
- [ ] 显示构建日期
- [ ] 显示技术栈版本（Electron、Node、Vue）
- [ ] 显示开发者信息
- [ ] 提供项目主页链接
- [ ] 提供问题反馈链接
- [ ] 提供检查更新按钮
- [ ] 检查更新时显示加载状态
- [ ] 有新版本时显示更新信息和下载按钮
- [ ] 已是最新版本时显示提示

### 技术说明

**涉及的组件：**
- 前端：SettingsView.vue, AboutView.vue
- 后端：update.service.ts

**更新检查API：**
```typescript
IPC.checkUpdate(): Promise<Result<{
  hasUpdate: boolean,
  latestVersion: string,
  releaseNotes: string,
  downloadUrl: string
}>>
```

### 故事点数：3

**估算依据：**
- 关于页面：1点
- 更新检查：2点

### 依赖

- 无前置依赖

---

## 模块验收标准

- [ ] 所有4个故事完成
- [ ] 设置页面整体布局完成
- [ ] 左侧导航正常
- [ ] 所有设置项可正常保存和加载
- [ ] 设置变更实时生效（除语言切换外）

---

**返回：** [故事总体大纲](./stories-overview.md)
