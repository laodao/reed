# F09-01 - API密钥管理

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M09 - 系统设置 |
| 功能编号 | F09-01 |
| 功能名称 | API密钥管理 |
| 优先级 | P0（最高） |
| 功能描述 | 管理各AI平台的API密钥，包括配置、修改、删除、测试连接 |

## 2. 操作流程

### 2.1 查看API密钥列表

```
用户进入设置页面
    │
    ▼
前端调用 listApiKeys()
    │
    ▼
主进程查询数据库
    │
    ▼
返回密钥列表（不包含实际密钥值）
    │
    ▼
前端显示列表（显示配置状态）
```

### 2.2 配置API密钥

```
用户点击"配置"或"修改"按钮
    │
    ▼
显示配置对话框
    │
    ▼
用户输入API密钥
    │
    ├── 可选：输入自定义端点
    │
    ▼
用户点击"保存"
    │
    ▼
前端验证输入非空
    │
    ├── 为空 → 显示错误提示
    │
    ▼
调用 setApiKey(provider, key, endpoint)
    │
    ▼
主进程接收请求
    │
    ▼
获取加密密钥
    │
    ▼
加密API密钥
    │
    ▼
保存到数据库
    │
    ▼
返回成功
    │
    ▼
前端更新显示状态
    │
    ▼
显示成功提示
```

### 2.3 测试API密钥

```
用户点击"测试"按钮
    │
    ▼
显示"正在测试..."提示
    │
    ▼
调用 testApiKey(provider)
    │
    ▼
主进程接收请求
    │
    ▼
获取并解密API密钥
    │
    ▼
调用对应Provider的测试方法
    │
    ├── 发送简单请求到AI平台
    │
    ▼
返回测试结果
    │
    ▼
前端显示结果（成功/失败+原因）
```

### 2.4 删除API密钥

```
用户点击"删除"按钮
    │
    ▼
显示确认对话框
    │
    ├── 用户取消 → 结束
    │
    ▼
用户确认
    │
    ▼
调用 deleteApiKey(provider)
    │
    ▼
主进程删除数据库记录
    │
    ▼
返回成功
    │
    ▼
前端更新显示状态
```

## 3. 界面设计

### 3.1 密钥列表组件

```
┌─────────────────────────────────────────────────────────────────┐
│ API 密钥                                                         │
│ 配置各平台的 API 密钥以使用相应功能                              │
├─────────────────────────────────────────────────────────────────┤
│ 提供商          状态              操作                           │
├─────────────────────────────────────────────────────────────────┤
│ 通义千问        ● 已配置          [修改] [测试] [删除]          │
│ 豆包            ○ 未配置          [配置]                         │
│ GLM             ● 已配置          [修改] [测试] [删除]          │
│ DeepSeek        ○ 未配置          [配置]                         │
│ 火山引擎        ● 已配置(自定义)  [修改] [测试] [删除]          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 配置对话框

```
┌─────────────────────────────────────────────┐
│  配置 通义千问 API 密钥                      │
├─────────────────────────────────────────────┤
│                                              │
│  API 密钥 *                                  │
│  ┌────────────────────────────────────────┐ │
│  │ ************************           👁️ │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  自定义端点（可选）                          │
│  ┌────────────────────────────────────────┐ │
│  │ https://api.example.com/v1             │ │
│  └────────────────────────────────────────┘ │
│  如需使用代理或私有部署，可填写自定义端点    │
│                                              │
│  说明                                        │
│  请前往 阿里云灵积控制台 获取 API Key        │
│                                              │
├─────────────────────────────────────────────┤
│                          [取消]  [保存]      │
└─────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 输入数据

```typescript
// 设置API密钥请求
interface SetApiKeyRequest {
  provider: string        // 提供商标识（必填）
  key: string            // API密钥（必填，非空）
  endpoint?: string      // 自定义端点（可选，URL格式）
}

// 删除API密钥请求
interface DeleteApiKeyRequest {
  provider: string        // 提供商标识（必填）
}
```

### 4.2 输出数据

```typescript
// API密钥列表项
interface ApiKeyInfo {
  provider: string        // 提供商标识
  name: string            // 显示名称
  configured: boolean     // 是否已配置
  hasEndpoint: boolean    // 是否有自定义端点
}

// API密钥列表响应
interface ListApiKeysResponse {
  success: boolean
  keys: ApiKeyInfo[]
}

// 设置密钥响应
interface SetApiKeyResponse {
  success: boolean
  error?: string
}

// 测试密钥响应
interface TestApiKeyResponse {
  success: boolean
  message: string         // 成功/失败信息
}
```

### 4.3 数据验证规则

| 字段 | 验证规则 |
|-----|---------|
| provider | 必填，必须是预定义的提供商之一 |
| key | 必填，不能为空字符串，长度3-200 |
| endpoint | 可选，如果填写必须是有效的URL格式 |

## 5. 涉及文件

### 5.1 前端文件

| 文件路径 | 描述 |
|---------|------|
| `src/renderer/src/views/SettingsView.vue` | 设置页面，包含API密钥管理 |
| `src/renderer/src/stores/settings.ts` | 设置状态管理 |
| `src/preload/index.ts` | 预加载脚本，暴露API |

### 5.2 后端文件

| 文件路径 | 描述 |
|---------|------|
| `src/main/ipc/handlers/api-key.handler.ts` | API密钥IPC处理器 |
| `src/main/services/secure-storage.service.ts` | 安全存储服务 |
| `src/main/database/repositories/api-key.repository.ts` | API密钥数据访问 |
| `src/main/utils/encryption.ts` | 加密工具 |

### 5.3 共享文件

| 文件路径 | 描述 |
|---------|------|
| `src/shared/types/settings.types.ts` | 设置相关类型定义 |
| `src/shared/types/ipc.types.ts` | IPC通道定义 |

## 6. 函数设计

### 6.1 前端函数

#### SettingsView.vue

```typescript
/**
 * 加载API密钥列表
 * @returns Promise<void>
 * 逻辑：
 * 1. 调用 window.electronAPI.listApiKeys()
 * 2. 更新 apiKeys 响应式变量
 * 3. 捕获错误并显示提示
 */
async function loadApiKeys(): Promise<void>

/**
 * 打开配置对话框
 * @param item - 要配置的密钥信息
 * @returns void
 * 逻辑：
 * 1. 设置 currentConfig 为当前项
 * 2. 清空 configKey 和 configEndpoint
 * 3. 设置 showConfigDialog 为 true
 */
function openConfigDialog(item: ApiKeyInfo): void

/**
 * 保存API密钥
 * @returns Promise<void>
 * 逻辑：
 * 1. 验证 configKey 非空
 * 2. 调用 window.electronAPI.setApiKey()
 * 3. 成功后关闭对话框，刷新列表
 * 4. 失败显示错误提示
 */
async function saveApiKey(): Promise<void>

/**
 * 删除API密钥
 * @param item - 要删除的密钥信息
 * @returns Promise<void>
 * 逻辑：
 * 1. 显示确认对话框
 * 2. 用户确认后调用 deleteApiKey()
 * 3. 刷新列表
 */
async function deleteApiKey(item: ApiKeyInfo): Promise<void>

/**
 * 测试API密钥
 * @param item - 要测试的密钥信息
 * @returns Promise<void>
 * 逻辑：
 * 1. 显示测试中提示
 * 2. 调用 testApiKey()
 * 3. 显示测试结果
 */
async function testApiKey(item: ApiKeyInfo): Promise<void>
```

### 6.2 后端函数

#### api-key.handler.ts

```typescript
/**
 * 注册API密钥相关IPC处理器
 * @param ipcMain - Electron IPC主进程对象
 * @returns void
 * 逻辑：
 * 1. 注册 api-key:list 处理器
 * 2. 注册 api-key:set 处理器
 * 3. 注册 api-key:delete 处理器
 * 4. 注册 api-key:test 处理器
 */
export function registerApiKeyHandlers(ipcMain: IpcMain): void

/**
 * 处理获取密钥列表请求
 * @param event - IPC事件对象
 * @returns Promise<ListApiKeysResponse>
 * 逻辑：
 * 1. 从数据库查询所有已配置的密钥
 * 2. 合并预定义的提供商列表
 * 3. 返回配置状态（不返回实际密钥）
 */
async function handleListApiKeys(event: IpcMainInvokeEvent): Promise<ListApiKeysResponse>

/**
 * 处理设置密钥请求
 * @param event - IPC事件对象
 * @param request - 设置请求 { provider, key, endpoint? }
 * @returns Promise<SetApiKeyResponse>
 * 逻辑：
 * 1. 验证 provider 有效性
 * 2. 验证 key 非空
 * 3. 验证 endpoint 格式（如果提供）
 * 4. 获取加密密钥
 * 5. 加密 API 密钥
 * 6. 保存到数据库（UPSERT）
 * 7. 返回成功
 */
async function handleSetApiKey(
  event: IpcMainInvokeEvent,
  request: SetApiKeyRequest
): Promise<SetApiKeyResponse>

/**
 * 处理删除密钥请求
 * @param event - IPC事件对象
 * @param request - 删除请求 { provider }
 * @returns Promise<{ success: boolean }>
 * 逻辑：
 * 1. 从数据库删除对应记录
 * 2. 返回成功
 */
async function handleDeleteApiKey(
  event: IpcMainInvokeEvent,
  request: DeleteApiKeyRequest
): Promise<{ success: boolean }>

/**
 * 处理测试密钥请求
 * @param event - IPC事件对象
 * @param request - 测试请求 { provider }
 * @returns Promise<TestApiKeyResponse>
 * 逻辑：
 * 1. 从数据库获取加密的密钥
 * 2. 解密密钥
 * 3. 获取对应的 Provider 实例
 * 4. 调用 Provider 的 testConnection 方法
 * 5. 返回测试结果
 */
async function handleTestApiKey(
  event: IpcMainInvokeEvent,
  request: { provider: string }
): Promise<TestApiKeyResponse>
```

#### secure-storage.service.ts

```typescript
/**
 * 安全存储服务
 * 用于管理加密密钥和加密解密操作
 */
class SecureStorageService {
  /**
   * 初始化安全存储
   * @returns Promise<void>
   * 逻辑：
   * 1. 检查是否存在加密密钥
   * 2. 不存在则生成新密钥
   * 3. 使用系统密钥链存储主密钥
   */
  async initialize(): Promise<void>

  /**
   * 加密数据
   * @param data - 要加密的明文数据
   * @returns string - 加密后的Base64字符串
   * 逻辑：
   * 1. 获取主密钥
   * 2. 使用 AES-256-GCM 加密
   * 3. 返回 Base64 编码的密文
   */
  encrypt(data: string): string

  /**
   * 解密数据
   * @param encryptedData - 加密的Base64字符串
   * @returns string - 解密后的明文
   * 逻辑：
   * 1. 获取主密钥
   * 2. Base64 解码
   * 3. 使用 AES-256-GCM 解密
   * 4. 返回明文
   */
  decrypt(encryptedData: string): string

  /**
   * 获取主密钥
   * @returns Buffer - 主密钥
   * 逻辑：
   * 1. 从系统密钥链获取
   * 2. 如果不存在，生成并存储新密钥
   */
  private getMasterKey(): Buffer
}

export const secureStorage = new SecureStorageService()
```

#### api-key.repository.ts

```typescript
/**
 * API密钥数据访问层
 */
class ApiKeyRepository {
  /**
   * 获取所有已配置的密钥
   * @returns Promise<Array<{ provider: string, hasEndpoint: boolean }>>
   * 逻辑：
   * 1. 查询 api_keys 表所有记录
   * 2. 返回 provider 和是否有 endpoint
   */
  async getAll(): Promise<Array<{ provider: string, hasEndpoint: boolean }>>

  /**
   * 保存密钥（创建或更新）
   * @param provider - 提供商
   * @param encryptedKey - 加密后的密钥
   * @param endpoint - 自定义端点（可选）
   * @returns Promise<void>
   * 逻辑：
   * 1. 使用 UPSERT 操作
   * 2. 更新 updated_at 时间戳
   */
  async save(provider: string, encryptedKey: string, endpoint?: string): Promise<void>

  /**
   * 获取密钥
   * @param provider - 提供商
   * @returns Promise<{ encryptedKey: string, endpoint?: string } | null>
   * 逻辑：
   * 1. 根据 provider 查询
   * 2. 返回加密密钥和端点
   */
  async get(provider: string): Promise<{ encryptedKey: string, endpoint?: string } | null>

  /**
   * 删除密钥
   * @param provider - 提供商
   * @returns Promise<void>
   * 逻辑：
   * 1. 根据 provider 删除记录
   */
  async delete(provider: string): Promise<void>
}

export const apiKeyRepository = new ApiKeyRepository()
```

## 7. 边界检查

### 7.1 输入验证

| 场景 | 验证规则 | 错误提示 |
|-----|---------|---------|
| 密钥为空 | `!key || !key.trim()` | "请输入API密钥" |
| 密钥过短 | `key.length < 3` | "API密钥格式不正确" |
| 密钥过长 | `key.length > 200` | "API密钥格式不正确" |
| 端点格式错误 | `endpoint && !isValidUrl(endpoint)` | "端点地址格式不正确" |
| 提供商无效 | `!validProviders.includes(provider)` | "无效的提供商" |

### 7.2 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| 数据库操作失败 | 记录日志，返回"保存失败，请重试" |
| 加密失败 | 记录日志，返回"密钥加密失败" |
| 解密失败 | 记录日志，返回"密钥读取失败" |
| 网络测试失败 | 返回具体错误信息（如超时、401等） |
| 系统密钥链不可用 | 降级使用文件存储（加密） |

### 7.3 异常情况

| 情况 | 处理方式 |
|-----|---------|
| 应用首次启动（无密钥） | 显示"未配置"状态，引导用户配置 |
| 密钥已过期/失效 | 测试时返回失败，提示用户更新 |
| 并发修改密钥 | 使用数据库事务，后写入覆盖 |
| 密钥迁移（版本升级） | 检测旧格式，自动重新加密 |

## 8. 测试用例

### 8.1 正常流程

| 用例ID | 描述 | 步骤 | 预期结果 |
|-------|------|-----|---------|
| TC001 | 查看密钥列表 | 进入设置页面 | 显示所有提供商及配置状态 |
| TC002 | 配置新密钥 | 点击配置→输入密钥→保存 | 显示"已配置"状态 |
| TC003 | 修改密钥 | 点击修改→输入新密钥→保存 | 保存成功 |
| TC004 | 测试有效密钥 | 点击测试 | 显示"连接测试成功" |
| TC005 | 删除密钥 | 点击删除→确认 | 显示"未配置"状态 |
| TC006 | 配置自定义端点 | 输入密钥和端点→保存 | 保存成功 |

### 8.2 边界情况

| 用例ID | 描述 | 输入 | 预期结果 |
|-------|------|-----|---------|
| TC101 | 密钥最短长度 | "abc" | 保存成功 |
| TC102 | 密钥最长长度 | 200字符 | 保存成功 |
| TC103 | 密钥包含特殊字符 | "sk-abc!@#$%" | 保存成功 |
| TC104 | 端点带路径 | "https://api.example.com/v1" | 保存成功 |
| TC105 | 端点带端口 | "https://localhost:8080" | 保存成功 |

### 8.3 错误情况

| 用例ID | 描述 | 输入/操作 | 预期结果 |
|-------|------|---------|---------|
| TC201 | 密钥为空 | "" | 显示"请输入API密钥" |
| TC202 | 密钥只有空格 | "   " | 显示"请输入API密钥" |
| TC203 | 端点格式错误 | "not-a-url" | 显示"端点地址格式不正确" |
| TC204 | 端点缺少协议 | "api.example.com" | 显示"端点地址格式不正确" |
| TC205 | 测试无效密钥 | 错误的密钥 | 显示"连接测试失败：认证失败" |
| TC206 | 测试网络断开 | 断开网络后测试 | 显示"连接测试失败：网络错误" |
| TC207 | 取消删除确认 | 点击删除→取消 | 不删除，状态不变 |

## 9. 安全考虑

1. **密钥存储**
   - 使用 AES-256-GCM 加密
   - 主密钥存储在系统密钥链
   - 数据库不存储明文密钥

2. **传输安全**
   - 仅 IPC 本地通信
   - 不记录密钥到日志

3. **显示安全**
   - 前端不显示完整密钥
   - 使用密码输入框
   - 提供显示/隐藏切换

4. **操作安全**
   - 删除需要二次确认
   - 测试不暴露密钥详情
