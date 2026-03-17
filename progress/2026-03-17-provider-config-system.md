# 开发进度：灵活的 AI 模型配置系统

## 完成日期
2026-03-17

## 功能概述
实现了一个灵活的 AI 模型配置系统，支持多种 API 格式（OpenAI 兼容、Anthropic、Google Gemini、Ollama 本地模型），允许用户轻松配置和管理多个 AI 提供商。

## 新建文件

### 1. 类型定义
- **`src/shared/types/provider-template.types.ts`**
  - 定义了 `AuthType`、`RequestFormat`、`TemplateCategory` 类型
  - 定义了 `CustomParamDefinition`、`ModelDefinition`、`ApiConfigTemplate` 接口
  - 定义了 `ProviderTemplate`（提供商模板）和 `UserProviderConfig`（用户配置）接口
  - 定义了各种 IPC 响应类型

### 2. 数据仓库
- **`src/main/database/repositories/provider-config.repository.ts`**
  - 实现了提供商配置的 CRUD 操作
  - 支持加密存储 API 密钥
  - 支持设置默认提供商
  - 支持测试结果记录

### 3. 模板服务
- **`src/main/services/provider-template.service.ts`**
  - 定义了 9 个预定义提供商模板：
    - OpenAI
    - DeepSeek
    - 智谱 GLM
    - 通义千问
    - Moonshot
    - Anthropic
    - Google AI
    - Ollama（本地）
    - 自定义 OpenAI 兼容
  - 实现了连接测试功能
  - 支持从 API 获取模型列表

### 4. IPC 处理器
- **`src/main/ipc/handlers/provider-config.handler.ts`**
  - `provider-template:list` - 获取模板列表
  - `provider-config:list` - 获取配置列表
  - `provider-config:get` - 获取单个配置
  - `provider-config:create` - 创建配置
  - `provider-config:update` - 更新配置
  - `provider-config:delete` - 删除配置
  - `provider-config:test` - 测试连接
  - `provider-config:set-default` - 设置默认

### 5. 前端组件
- **`src/renderer/src/components/settings/AddProviderDialog.vue`**
  - 选择提供商模板
  - 配置 API 密钥和端点
  - 高级设置（自定义请求头）
  - 模型管理（启用/禁用模型）
  - 从 API 刷新模型列表
  - 测试连接
  - 编辑现有配置

## 修改文件

### 1. 数据库
- **`src/main/database/index.ts`**
  - 添加了 `provider_configs` 表
  - 初始化 `ProviderConfigRepository`

### 2. 预加载脚本
- **`src/preload/index.ts`**
  - 添加了提供商模板和配置相关的 IPC 通道
  - 暴露了 `providerTemplate` 和 `providerConfig` API

### 3. 主进程入口
- **`src/main/index.ts`**
  - 注册了 `registerProviderConfigHandlers()`

### 4. 设置页面
- **`src/renderer/src/views/Settings.vue`**
  - 重写了 "API 密钥" Tab 为 "AI 模型配置"
  - 显示已配置的提供商列表
  - 支持启用/禁用、设为默认、编辑、删除
  - 集成了 `AddProviderDialog` 组件

### 5. 类型索引
- **`src/shared/types/index.ts`**
  - 添加了 `provider-template.types` 导出

## 数据库表结构

```sql
CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  api_key_encrypted TEXT,
  base_url TEXT,
  custom_headers TEXT,        -- JSON
  custom_params TEXT,         -- JSON
  custom_models TEXT,         -- JSON
  enabled_models TEXT,        -- JSON array
  is_enabled INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  last_tested DATETIME,
  test_result TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 使用方式

1. 打开设置 -> AI 模型配置
2. 点击 "添加提供商"
3. 选择提供商类型（如 OpenAI、DeepSeek 等）
4. 输入配置名称和 API 密钥
5. （可选）配置自定义端点、请求头
6. （可选）管理启用的模型
7. 点击 "测试连接" 验证配置
8. 保存配置

## 后续工作

1. 实现通用的 OpenAI 兼容 Provider
2. 实现 Anthropic Provider
3. 实现 Google Provider
4. 实现 Ollama Provider
5. 在聊天功能中集成配置系统
