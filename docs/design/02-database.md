# 数据库设计文档

## 1. 数据库概述

### 1.1 技术选型

- **数据库**：SQLite
- **驱动**：better-sqlite3（同步 API）
- **模式**：WAL（Write-Ahead Logging）

### 1.2 文件位置

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%/the_bot/the_bot.db` |
| macOS | `~/Library/Application Support/the_bot/the_bot.db` |
| Linux | `~/.config/the_bot/the_bot.db` |

### 1.3 数据库配置

```typescript
const db = new Database(dbPath, {
  verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
})

// 性能优化配置
db.pragma('journal_mode = WAL')      // WAL 模式
db.pragma('foreign_keys = ON')       // 启用外键
db.pragma('synchronous = NORMAL')    // 同步模式
```

---

## 2. 表结构设计

### 2.1 设置表 (settings)

**用途**：存储应用全局配置

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT | 配置键（主键） |
| value | TEXT | 配置值（JSON 格式） |
| updated_at | DATETIME | 更新时间 |

**常用配置项**：

| key | value 类型 | 说明 |
|-----|------------|------|
| theme | string | 主题：light/dark/auto |
| language | string | 语言：zh-CN/en-US |
| defaultProviderConfigId | string | 默认提供商 ID |
| defaultModelId | string | 默认模型 ID |

---

### 2.2 角色表 (roles)

**用途**：存储自定义角色配置

```sql
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  avatar TEXT,
  system_prompt TEXT,
  default_model_id TEXT,
  default_provider_config_id TEXT,
  generation_config TEXT,
  knowledge_base_ids TEXT,
  is_builtin INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

CREATE INDEX IF NOT EXISTS idx_roles_created_at ON roles(created_at)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID 或内置 ID |
| name | TEXT | 角色名称 |
| description | TEXT | 角色描述 |
| avatar | TEXT | 头像（emoji） |
| system_prompt | TEXT | 系统提示词 |
| default_model_id | TEXT | 默认模型 ID |
| default_provider_config_id | TEXT | 默认提供商 ID |
| generation_config | TEXT | 生成参数（JSON） |
| knowledge_base_ids | TEXT | 知识库 ID 列表（JSON） |
| is_builtin | INTEGER | 是否内置（0/1） |

---

### 2.3 提供商配置表 (provider_configs)

**用途**：存储 AI 提供商配置

```sql
CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_id TEXT,
  template_id TEXT,
  is_enabled INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  base_url TEXT,
  custom_headers TEXT,
  models TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

CREATE INDEX IF NOT EXISTS idx_provider_configs_is_enabled ON provider_configs(is_enabled)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| name | TEXT | 配置名称 |
| short_id | TEXT | 短 ID |
| template_id | TEXT | 模板 ID |
| is_enabled | INTEGER | 是否启用（0/1） |
| is_default | INTEGER | 是否默认（0/1） |
| base_url | TEXT | API 基础 URL |
| custom_headers | TEXT | 自定义请求头（JSON） |
| models | TEXT | 模型列表（JSON） |

**models 字段 JSON 结构**：

```json
[
  {
    "id": "gpt-4o",
    "name": "GPT-4o",
    "type": "multimodal",
    "contextWindow": 128000,
    "supportsThinking": false,
    "supportsWebSearch": false,
    "supportsTools": true
  }
]
```

---

### 2.4 API 密钥表 (api_keys)

**用途**：加密存储 API 密钥

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  provider_config_id TEXT NOT NULL,
  key_type TEXT NOT NULL DEFAULT 'api_key',
  encrypted_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_config_id) REFERENCES provider_configs(id) ON DELETE CASCADE
)

CREATE INDEX IF NOT EXISTS idx_api_keys_provider_config_id ON api_keys(provider_config_id)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| provider_config_id | TEXT | 关联提供商 ID |
| key_type | TEXT | 密钥类型：api_key/access_key |
| encrypted_key | TEXT | 加密后的密钥 |
| iv | TEXT | 初始化向量 |
| auth_tag | TEXT | 认证标签 |

---

### 2.5 对话表 (dialogs)

**用途**：存储对话记录

```sql
CREATE TABLE IF NOT EXISTS dialogs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  model_id TEXT,
  provider_config_id TEXT,
  role_id TEXT,
  system_prompt TEXT,
  context_config TEXT,
  message_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_config_id) REFERENCES provider_configs(id) ON DELETE SET NULL
)

CREATE INDEX IF NOT EXISTS idx_dialogs_role_id ON dialogs(role_id)
CREATE INDEX IF NOT EXISTS idx_dialogs_updated_at ON dialogs(updated_at DESC)
CREATE INDEX IF NOT EXISTS idx_dialogs_provider_config_id ON dialogs(provider_config_id)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| title | TEXT | 对话标题 |
| model_id | TEXT | 当前模型 ID |
| provider_config_id | TEXT | 提供商配置 ID |
| role_id | TEXT | 关联角色 ID |
| system_prompt | TEXT | 系统提示词 |
| context_config | TEXT | 上下文配置（JSON） |
| message_count | INTEGER | 消息数量 |

---

### 2.6 消息表 (messages)

**用途**：存储对话中的消息

```sql
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  dialog_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model_id TEXT,
  tokens_used INTEGER,
  attachments TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dialog_id) REFERENCES dialogs(id) ON DELETE CASCADE
)

CREATE INDEX IF NOT EXISTS idx_messages_dialog_id ON messages(dialog_id)
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| dialog_id | TEXT | 所属对话 ID |
| role | TEXT | 角色：user/assistant |
| content | TEXT | 消息内容 |
| model_id | TEXT | 使用的模型 |
| tokens_used | INTEGER | Token 用量 |
| attachments | TEXT | 附件列表（JSON） |
| metadata | TEXT | 元数据（JSON） |

**attachments JSON 结构**：

```json
[
  {
    "type": "image",
    "url": "file:///path/to/image.png",
    "name": "image.png",
    "mimeType": "image/png",
    "size": 102400
  }
]
```

**metadata JSON 结构**：

```json
{
  "thinkingChain": "思考过程内容...",
  "webSearchResults": [...],
  "edited": true,
  "editedAt": "2024-03-23T14:30:00Z"
}
```

---

### 2.7 图像任务表 (image_tasks)

**用途**：存储图像生成任务

```sql
CREATE TABLE IF NOT EXISTS image_tasks (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  provider_config_id TEXT NOT NULL,
  model TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  style TEXT,
  quality TEXT,
  seed INTEGER,
  count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  error TEXT,
  image_url TEXT,
  local_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (provider_config_id) REFERENCES provider_configs(id) ON DELETE SET NULL
)

CREATE INDEX IF NOT EXISTS idx_image_tasks_status ON image_tasks(status)
CREATE INDEX IF NOT EXISTS idx_image_tasks_created_at ON image_tasks(created_at DESC)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| prompt | TEXT | 正向提示词 |
| negative_prompt | TEXT | 负面提示词 |
| provider_config_id | TEXT | 提供商配置 ID |
| model | TEXT | 模型 ID |
| width | INTEGER | 宽度 |
| height | INTEGER | 高度 |
| style | TEXT | 风格 |
| quality | TEXT | 质量 |
| seed | INTEGER | 种子值 |
| count | INTEGER | 生成数量 |
| status | TEXT | 状态：pending/processing/completed/failed |
| progress | INTEGER | 进度（0-100） |
| error | TEXT | 错误信息 |
| image_url | TEXT | 图像 URL |
| local_path | TEXT | 本地路径 |
| completed_at | DATETIME | 完成时间 |

---

## 3. 数据库迁移

### 3.1 迁移机制

```typescript
class DatabaseManager {
  private migrations: Map<string, () => void> = new Map()

  registerMigration(version: string, migration: () => void) {
    this.migrations.set(version, migration)
  }

  private runMigrations(): void {
    const currentVersion = this.getVersion()

    // 按版本顺序执行迁移
    const versions = Array.from(this.migrations.keys()).sort()

    for (const version of versions) {
      if (this.compareVersions(version, currentVersion) > 0) {
        const migration = this.migrations.get(version)
        if (migration) {
          migration()
          this.setVersion(version)
        }
      }
    }
  }
}
```

### 3.2 迁移示例

```typescript
// 添加新列
this.db.exec('ALTER TABLE provider_configs ADD COLUMN models TEXT')

// 数据迁移
const configs = this.db.prepare('SELECT id FROM provider_configs').all()
for (const config of configs) {
  // 迁移逻辑...
}
```

---

## 4. Repository 层设计

### 4.1 Repository 接口

```typescript
interface IRepository<T> {
  findById(id: string): T | undefined
  findAll(): T[]
  create(data: Partial<T>): T
  update(id: string, data: Partial<T>): boolean
  delete(id: string): boolean
}
```

### 4.2 DialogRepository 示例

```typescript
export class DialogRepository {
  constructor(private db: Database) {}

  findById(id: string): Dialog | undefined {
    const row = this.db.prepare(`
      SELECT * FROM dialogs WHERE id = ?
    `).get(id)
    return row ? this.toDialog(row) : undefined
  }

  findAll(): Dialog[] {
    const rows = this.db.prepare(`
      SELECT * FROM dialogs ORDER BY updated_at DESC
    `).all()
    return rows.map(row => this.toDialog(row))
  }

  findByRoleId(roleId: string | null): Dialog[] {
    const rows = this.db.prepare(`
      SELECT * FROM dialogs
      WHERE role_id ${roleId ? '= ?' : 'IS NULL'}
      ORDER BY updated_at DESC
    `).all(roleId)
    return rows.map(row => this.toDialog(row))
  }

  create(data: CreateDialogRequest): Dialog {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO dialogs (id, title, model_id, provider_config_id, role_id, system_prompt, context_config)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.title, data.modelId, data.providerConfigId, data.roleId, data.systemPrompt, JSON.stringify(data.contextConfig))
    return this.findById(id)!
  }

  update(id: string, data: Partial<Dialog>): boolean {
    const fields: string[] = []
    const values: any[] = []

    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title) }
    if (data.modelId !== undefined) { fields.push('model_id = ?'); values.push(data.modelId) }
    // ...

    if (fields.length === 0) return false

    values.push(id)
    const result = this.db.prepare(`
      UPDATE dialogs SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(...values)
    return result.changes > 0
  }

  delete(id: string): boolean {
    // 级联删除消息
    this.db.prepare('DELETE FROM messages WHERE dialog_id = ?').run(id)
    const result = this.db.prepare('DELETE FROM dialogs WHERE id = ?').run(id)
    return result.changes > 0
  }

  private toDialog(row: any): Dialog {
    return {
      ...row,
      contextConfig: JSON.parse(row.context_config || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}
```

---

## 5. 数据安全

### 5.1 敏感数据加密

**加密流程**：

```
明文 → SecureStorageService.encrypt() → 密文 → 存储
密文 ← SecureStorageService.decrypt() ← 读取 ← 密文
```

**加密算法**：
- 优先使用 Electron `safeStorage`（系统级加密）
- 回退使用 AES-256-GCM（自定义加密）

### 5.2 数据库安全

- 启用外键约束保证数据完整性
- 使用参数化查询防止 SQL 注入
- 数据库文件权限限制

---

## 6. 性能优化

### 6.1 索引策略

| 表 | 索引 | 用途 |
|------|------|------|
| dialogs | idx_dialogs_updated_at | 按更新时间排序 |
| dialogs | idx_dialogs_role_id | 按角色筛选 |
| messages | idx_messages_dialog_id | 按对话查询消息 |
| image_tasks | idx_image_tasks_created_at | 按时间排序历史 |

### 6.2 查询优化

```typescript
// 使用预编译语句
const findByIdStmt = this.db.prepare('SELECT * FROM dialogs WHERE id = ?')

function findById(id: string): Dialog | undefined {
  return findByIdStmt.get(id)
}

// 批量操作使用事务
const insertMany = this.db.transaction((items) => {
  for (const item of items) {
    insertStmt.run(item)
  }
})
```

### 6.3 连接配置

```typescript
// WAL 模式提高并发
db.pragma('journal_mode = WAL')

// 同步模式平衡性能和安全
db.pragma('synchronous = NORMAL')

// 缓存大小
db.pragma('cache_size = -64000')  // 64MB
```
