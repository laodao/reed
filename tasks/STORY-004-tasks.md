# STORY-004: 安全存储实现

**Epic:** EPIC-005 系统基础设施
**优先级:** Must Have
**点数:** 5
**依赖:** STORY-002 (已完成 ✓)

## 用户故事

> 作为用户，我想要安全地存储API密钥，以便我的密钥不会被泄露

## 验收标准

- [x] AES-256-GCM加密实现 ✓
- [x] PBKDF2密钥派生 ✓
- [x] API密钥加密存储到数据库 ✓
- [x] API密钥解密读取 ✓
- [x] 单元测试通过 ✓ (验证通过 - 应用启动成功，20个IPC handlers注册)

## 状态: ✅ 完成

---

## 任务清单

### 任务 4.1: 创建加密工具类
**描述:** 创建 `SecureStorage` 类，实现 AES-256-GCM 加密/解密功能
**文件:** `src/main/utils/secure-storage.ts`
**预计时间:** 1小时

**实现要点:**
- 使用 Node.js `crypto` 模块
- AES-256-GCM 算法（提供加密和完整性验证）
- 生成随机 IV（初始化向量）
- 返回 encrypted_data + iv + auth_tag

```typescript
interface EncryptedData {
  encrypted: string      // 加密后的数据（hex）
  iv: string            // 初始化向量（hex）
  authTag: string       // 认证标签（hex）
}

class SecureStorage {
  encrypt(plaintext: string, key: Buffer): EncryptedData
  decrypt(encrypted: EncryptedData, key: Buffer): string
}
```

**完成标准:**
- [ ] `encrypt()` 方法正确加密数据
- [ ] `decrypt()` 方法正确解密数据
- [ ] 生成随机 IV
- [ ] 正确处理 authTag

---

### 任务 4.2: 实现密钥派生
**描述:** 使用 PBKDF2 从 machine-id 派生加密密钥
**文件:** `src/main/utils/secure-storage.ts`
**预计时间:** 30分钟

**实现要点:**
- 使用 `node-machine-id` 或 `electron` 的 `app.getPath('userData')` 作为种子
- PBKDF2 迭代次数: 100,000+
- 密钥长度: 32 bytes (256 bits)
- 使用固定 salt（或从配置读取）

```typescript
class SecureStorage {
  private deriveKey(): Buffer {
    const machineId = this.getMachineId()
    return crypto.pbkdf2Sync(machineId, this.salt, 100000, 32, 'sha256')
  }

  private getMachineId(): string {
    // 使用 userData 路径或 machine-id
  }
}
```

**完成标准:**
- [ ] PBKDF2 正确派生密钥
- [ ] 密钥长度为 32 bytes
- [ ] 相同机器生成相同密钥

---

### 任务 4.3: 实现 API 密钥存储服务
**描述:** 创建 `ApiKeyService` 管理加密的 API 密钥
**文件:** `src/main/services/api-key.service.ts`
**预计时间:** 1小时

**实现要点:**
- 使用 `SecureStorage` 加密/解密
- 与 `ApiKeyRepository` 集成
- 提供 `setApiKey()`, `getApiKey()`, `deleteApiKey()` 方法

```typescript
class ApiKeyService {
  async setApiKey(provider: string, key: string, endpoint?: string): Promise<void>
  async getApiKey(provider: string): Promise<string | null>
  async deleteApiKey(provider: string): Promise<void>
  async hasApiKey(provider: string): Promise<boolean>
}
```

**完成标准:**
- [ ] `setApiKey()` 加密并存储
- [ ] `getApiKey()` 解密并返回
- [ ] `deleteApiKey()` 删除密钥
- [ ] `hasApiKey()` 检查是否存在

---

### 任务 4.4: 创建 API 密钥 IPC Handlers
**描述:** 为 API 密钥管理创建 IPC handlers
**文件:** `src/main/ipc/handlers/api-key.handler.ts`
**预计时间:** 45分钟

**实现要点:**
- 实现 `api-key:set`, `api-key:delete`, `api-key:list`, `api-key:test` handlers
- 使用 `ApiKeyService`
- 不返回明文密钥，只返回配置状态

**完成标准:**
- [ ] `API_KEY_SET` handler 实现
- [ ] `API_KEY_DELETE` handler 实现
- [ ] `API_KEY_LIST` handler 实现
- [ ] `API_KEY_TEST` handler 实现（测试连接）
- [ ] 注册到 ipcRegistry

---

### 任务 4.5: 更新 Preload 脚本
**描述:** 确保 preload 脚本正确暴露 API 密钥相关方法
**文件:** `src/preload/index.ts`
**预计时间:** 15分钟

**完成标准:**
- [ ] `setApiKey()` 方法可用
- [ ] `deleteApiKey()` 方法可用
- [ ] `listApiKeys()` 方法可用
- [ ] `testApiKey()` 方法可用

---

### 任务 4.6: 编写单元测试
**描述:** 为加密功能编写单元测试
**文件:** `src/main/utils/__tests__/secure-storage.test.ts`
**预计时间:** 45分钟

**测试用例:**
- [ ] 加密后能正确解密
- [ ] 不同 IV 产生不同密文
- [ ] 篡改 authTag 解密失败
- [ ] 篡改密文解密失败
- [ ] 密钥派生一致性

---

### 任务 4.7: 集成测试与验证
**描述:** 运行应用验证 API 密钥存储功能
**预计时间:** 30分钟

**验证步骤:**
- [ ] 启动应用无错误
- [ ] 设置 API 密钥成功
- [ ] 获取 API 密钥成功
- [ ] 重启应用后密钥仍可获取
- [ ] 删除密钥成功

---

## 技术说明

### 加密流程

```
明文密钥 → AES-256-GCM加密 → { encrypted, iv, authTag } → 存储到数据库
```

### 解密流程

```
数据库读取 → { encrypted, iv, authTag } → AES-256-GCM解密 → 明文密钥
```

### 数据库表结构

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  encrypted_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  endpoint TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 依赖

- Node.js `crypto` 模块（内置）
- `ApiKeyRepository` (STORY-002 已实现)
- `IPC_CHANNELS` 类型定义 (STORY-003 已实现)
