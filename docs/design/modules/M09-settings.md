# M09 - 系统设置模块设计

## 1. 模块概述

| 属性 | 值 |
|-----|-----|
| 模块编号 | M09 |
| 模块名称 | 系统设置 |
| 模块代码 | settings |
| 优先级 | P0 |
| 描述 | 管理应用程序的全局设置、API密钥配置、主题和界面设置 |

## 2. 功能列表

| 功能编号 | 功能名称 | 功能描述 | 优先级 |
|---------|---------|---------|-------|
| F09-01 | API密钥管理 | 管理各AI平台的API密钥 | P0 |
| F09-02 | 主题设置 | 切换浅色/深色/跟随系统主题 | P0 |
| F09-03 | 语言设置 | 切换界面语言 | P1 |
| F09-04 | 字体大小设置 | 调整界面字体大小 | P1 |
| F09-05 | 数据路径设置 | 自定义数据存储路径 | P2 |
| F09-06 | 通用设置管理 | 其他应用级设置 | P2 |

## 3. 界面设计

### 3.1 设置页面布局

```
┌─────────────────────────────────────────────────────────────┐
│  设置                                                        │
│  配置应用程序                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 外观                                                     ││
│  │ ─────────────────────────────────────────────────────── ││
│  │ 主题        ○ 浅色  ○ 深色  ● 跟随系统                  ││
│  │ 语言        [简体中文 ▼]                                 ││
│  │ 字体大小    ○ 小  ● 中  ○ 大                            ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ API 密钥                                                 ││
│  │ 配置各平台的 API 密钥以使用相应功能                       ││
│  │ ─────────────────────────────────────────────────────── ││
│  │ 提供商      状态        操作                             ││
│  │ ─────────────────────────────────────────────────────── ││
│  │ 通义千问    已配置      [修改] [测试] [删除]             ││
│  │ 豆包        未配置      [配置]                           ││
│  │ GLM         已配置      [修改] [测试] [删除]             ││
│  │ DeepSeek    未配置      [配置]                           ││
│  │ 火山引擎    未配置      [配置]                           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 数据                                                     ││
│  │ ─────────────────────────────────────────────────────── ││
│  │ 数据存储路径  [                    ] [浏览]              ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  [重置为默认]                                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 API密钥配置对话框

```
┌─────────────────────────────────────────────┐
│  配置 通义千问 API 密钥                       │
├─────────────────────────────────────────────┤
│                                              │
│  API 密钥    [************************] 👁️  │
│                                              │
│  自定义端点  [                          ]    │
│              可选，留空使用默认端点           │
│                                              │
│  说明                                        │
│  请前往 阿里云灵积控制台 获取 API Key        │
│                                              │
├─────────────────────────────────────────────┤
│                    [取消]  [保存]            │
└─────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 设置数据结构

```typescript
// 主题模式
type ThemeMode = 'light' | 'dark' | 'auto'

// 语言
type Language = 'zh-CN' | 'en-US'

// 字体大小
type FontSize = 'small' | 'medium' | 'large'

// 设置接口
interface AppSettings {
  theme: ThemeMode        // 主题模式
  language: Language      // 界面语言
  fontSize: FontSize      // 字体大小
  dataPath: string        // 数据存储路径（空则使用默认）
}

// API密钥信息
interface ApiKeyInfo {
  provider: string        // 提供商标识
  name: string            // 显示名称
  configured: boolean     // 是否已配置
  hasEndpoint: boolean    // 是否有自定义端点
}

// API密钥存储（加密）
interface ApiKeyStorage {
  provider: string        // 提供商标识
  key: string             // 加密后的密钥
  endpoint?: string       // 自定义端点
  createdAt: Date         // 创建时间
  updatedAt: Date         // 更新时间
}
```

### 4.2 数据库表

```sql
-- 系统设置表
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API密钥表（加密存储）
CREATE TABLE api_keys (
  provider TEXT PRIMARY KEY,
  encrypted_key TEXT NOT NULL,
  endpoint TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 5. IPC接口设计

### 5.1 设置相关

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| settings:get | GET | key?: string | { success, data } | 获取设置 |
| settings:set | SET | key, value | { success } | 设置值 |

### 5.2 API密钥相关

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| api-key:list | GET | - | { success, keys: ApiKeyInfo[] } | 获取密钥列表 |
| api-key:set | SET | provider, key, endpoint? | { success } | 保存密钥 |
| api-key:delete | DELETE | provider | { success } | 删除密钥 |
| api-key:test | TEST | provider | { success, message } | 测试密钥 |

## 6. 文件结构

```
src/
├── main/
│   ├── database/
│   │   └── repositories/
│   │       └── settings.repository.ts    # 设置数据访问
│   ├── ipc/
│   │   └── handlers/
│   │       ├── settings.handler.ts       # 设置IPC处理
│   │       └── api-key.handler.ts        # API密钥IPC处理
│   ├── services/
│   │   ├── secure-storage.service.ts     # 安全存储服务
│   │   └── settings.service.ts           # 设置服务
│   └── utils/
│       └── encryption.ts                 # 加密工具
├── renderer/
│   └── src/
│       ├── views/
│       │   └── SettingsView.vue          # 设置页面
│       ├── stores/
│       │   └── settings.ts               # 设置状态管理
│       └── components/
│           └── settings/
│               ├── ThemeSetting.vue      # 主题设置组件
│               ├── ApiKeyTable.vue       # API密钥表格
│               └── ApiKeyDialog.vue      # API密钥对话框
└── shared/
    └── types/
        └── settings.types.ts             # 设置类型定义
```

## 7. 核心流程

### 7.1 API密钥保存流程

```
用户输入密钥
    │
    ▼
前端验证（非空）
    │
    ▼
调用 api-key:set IPC
    │
    ▼
主进程接收请求
    │
    ▼
获取加密密钥（从SecureStorage）
    │
    ▼
加密API密钥
    │
    ▼
保存到数据库
    │
    ▼
返回成功结果
    │
    ▼
前端更新状态
```

### 7.2 主题切换流程

```
用户选择主题
    │
    ▼
调用 settingsStore.setTheme()
    │
    ▼
更新CSS变量（立即生效）
    │
    ▼
如果是auto模式
    │
    ├── 监听系统主题变化
    │
    ▼
调用 settings:set IPC
    │
    ▼
保存到数据库
```

### 7.3 语言切换流程

```
用户选择语言
    │
    ▼
调用 settingsStore.setLanguage()
    │
    ▼
调用 settings:set IPC
    │
    ▼
保存到数据库
    │
    ▼
显示提示"需要重启应用"
    │
    ▼
用户手动重启
    │
    ▼
应用加载新语言
```

## 8. 错误处理

| 错误场景 | 错误码 | 错误信息 | 处理方式 |
|---------|-------|---------|---------|
| API密钥为空 | E001 | 请输入API密钥 | 前端提示 |
| 加密失败 | E002 | 密钥加密失败 | 弹窗提示 |
| 测试连接失败 | E003 | 连接测试失败：{原因} | 弹窗提示 |
| 数据库写入失败 | E004 | 保存失败 | 弹窗提示 |

## 9. 安全考虑

1. **API密钥加密存储**
   - 使用AES-256-GCM加密
   - 加密密钥存储在系统密钥链（Windows DPAPI / macOS Keychain）
   - 密钥不以明文形式出现在日志中

2. **输入验证**
   - API密钥格式验证
   - 端点URL格式验证
   - 防止XSS攻击

3. **传输安全**
   - IPC通信仅在本地
   - 不涉及网络传输敏感信息

## 10. 依赖关系

### 10.1 内部依赖
- 数据库模块（存储设置）
- 加密模块（保护API密钥）

### 10.2 外部依赖
- Electron安全存储API
- 各AI平台API（用于测试连接）

## 11. 测试要点

### 11.1 功能测试
- [ ] API密钥增删改查
- [ ] API密钥测试连接
- [ ] 主题切换（浅色/深色/自动）
- [ ] 语言切换
- [ ] 字体大小调整
- [ ] 设置持久化（重启后保持）

### 11.2 安全测试
- [ ] 数据库中密钥已加密
- [ ] 日志中不包含明文密钥
- [ ] 前端不暴露加密密钥

### 11.3 边界测试
- [ ] 空密钥处理
- [ ] 超长密钥处理
- [ ] 无效端点URL处理
- [ ] 网络断开时的测试连接
