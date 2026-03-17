# F01-04 - 角色管理

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M01 - AI对话 |
| 功能编号 | F01-04 |
| 功能名称 | 角色管理 |
| 优先级 | P1 |
| 功能描述 | 创建和管理对话角色模板，预设系统提示词 |

## 2. 操作流程

### 2.1 查看角色列表

```
用户进入角色管理页面
    │
    ▼
调用 loadRoles()
    │
    ▼
调用 role:list IPC
    │
    ▼
主进程查询数据库
    │
    ▼
返回角色列表
    │
    ▼
前端显示角色卡片
```

### 2.2 创建角色

```
用户点击"新建角色"按钮
    │
    ▼
显示角色编辑对话框
    │
    ▼
用户输入角色信息
    │
    ├── 名称（必填）
    │
    ├── 图标（可选，默认🎭）
    │
    ├── 系统提示词（必填）
    │
    └── 描述（可选）
    │
    ▼
用户点击"保存"
    │
    ▼
前端验证必填项
    │
    ▼
调用 role:create IPC
    │
    ▼
主进程保存到数据库
    │
    ▼
返回成功
    │
    ▼
前端刷新列表
```

### 2.3 编辑角色

```
用户点击"编辑"按钮
    │
    ▼
显示角色编辑对话框（预填数据）
    │
    ▼
用户修改信息
    │
    ▼
用户点击"保存"
    │
    ▼
调用 role:update IPC
    │
    ▼
主进程更新数据库
    │
    ▼
前端刷新列表
```

### 2.4 删除角色

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
调用 role:delete IPC
    │
    ▼
主进程删除记录
    │
    ▼
前端从列表移除
```

## 3. 界面设计

### 3.1 角色管理页面

```
┌─────────────────────────────────────────────────────────────────────────┐
│  角色管理                                               [+ 新建角色]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 🎭 代码助手                                                       │  │
│  │    你是一个专业的编程助手，擅长多种编程语言，能够...             │  │
│  │    使用次数: 15                                                   │  │
│  │                                              [编辑] [删除]        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ✍️ 写作助手                                                       │  │
│  │    你是一个专业的写作助手，擅长各类文体写作，能够...             │  │
│  │    使用次数: 8                                                    │  │
│  │                                              [编辑] [删除]        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 🌐 翻译助手                                                       │  │
│  │    你是一个专业的翻译，精通多国语言，能够准确流畅地...           │  │
│  │    使用次数: 23                                                   │  │
│  │                                              [编辑] [删除]        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 角色编辑对话框

```
┌─────────────────────────────────────────────┐
│  新建角色 / 编辑角色                         │
├─────────────────────────────────────────────┤
│                                              │
│  角色名称 *                                  │
│  ┌────────────────────────────────────────┐ │
│  │ 代码助手                               │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  角色图标                                    │
│  ┌────────────────────────────────────────┐ │
│  │ 🎭                          [选择]     │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  系统提示词 *                                │
│  ┌────────────────────────────────────────┐ │
│  │                                        │ │
│  │  你是一个专业的编程助手，              │ │
│  │  擅长多种编程语言...                   │ │
│  │                                        │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  描述（可选）                                │
│  ┌────────────────────────────────────────┐ │
│  │ 用于代码编写、调试、优化等场景         │ │
│  └────────────────────────────────────────┘ │
│                                              │
├─────────────────────────────────────────────┤
│                    [取消]  [保存]            │
└─────────────────────────────────────────────┘
```

### 3.3 角色选择器（在对话中）

```
┌─────────────────────────────────────────────┐
│  角色: [无 ▼]                               │
└─────────────────────────────────────────────┘

下拉列表：
┌─────────────────────────────────────────────┐
│  无（不使用角色）                            │
│  ──────────────────────────────────────────│
│  🎭 代码助手                                │
│  ✍️ 写作助手                                │
│  🌐 翻译助手                                │
│  📊 数据分析师                              │
└─────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 数据类型

```typescript
// 角色
interface Role {
  id: string                    // 角色ID（UUID）
  name: string                  // 角色名称
  icon: string                  // 角色图标（emoji）
  systemPrompt: string          // 系统提示词
  description?: string          // 描述
  useCount: number              // 使用次数
  createdAt: Date               // 创建时间
  updatedAt: Date               // 更新时间
}

// 创建角色请求
interface CreateRoleRequest {
  name: string
  icon?: string
  systemPrompt: string
  description?: string
}

// 更新角色请求
interface UpdateRoleRequest {
  name?: string
  icon?: string
  systemPrompt?: string
  description?: string
}
```

### 4.2 数据库表

```sql
-- 角色表
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🎭',
  system_prompt TEXT NOT NULL,
  description TEXT,
  use_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_roles_created_at ON roles(created_at DESC);
```

## 5. 涉及文件

### 5.1 前端文件

| 文件路径 | 描述 |
|---------|------|
| `src/renderer/src/views/RoleManageView.vue` | 角色管理页面 |
| `src/renderer/src/stores/role.ts` | 角色状态管理 |
| `src/renderer/src/components/dialog/RoleSelector.vue` | 角色选择器 |
| `src/renderer/src/components/role/RoleCard.vue` | 角色卡片 |
| `src/renderer/src/components/role/RoleDialog.vue` | 角色编辑对话框 |

### 5.2 后端文件

| 文件路径 | 描述 |
|---------|------|
| `src/main/ipc/handlers/role.handler.ts` | 角色IPC处理器 |
| `src/main/database/repositories/role.repository.ts` | 角色数据访问 |

### 5.3 共享文件

| 文件路径 | 描述 |
|---------|------|
| `src/shared/types/role.types.ts` | 角色类型定义 |

## 6. 函数设计

### 6.1 前端函数

#### stores/role.ts

```typescript
/**
 * 角色列表
 */
const roles = ref<Role[]>([])

/**
 * 加载角色列表
 * @returns Promise<void>
 */
async function loadRoles(): Promise<void>

/**
 * 创建角色
 * @param request - 创建请求
 * @returns Promise<Role>
 */
async function createRole(request: CreateRoleRequest): Promise<Role>

/**
 * 更新角色
 * @param id - 角色ID
 * @param request - 更新请求
 * @returns Promise<void>
 */
async function updateRole(id: string, request: UpdateRoleRequest): Promise<void>

/**
 * 删除角色
 * @param id - 角色ID
 * @returns Promise<void>
 */
async function deleteRole(id: string): Promise<void>

/**
 * 增加使用次数
 * @param id - 角色ID
 * @returns void
 */
function incrementUseCount(id: string): void
```

### 6.2 后端函数

#### role.handler.ts

```typescript
/**
 * 处理获取角色列表
 */
async function handleListRoles(): Promise<{ success: boolean, roles: Role[] }>

/**
 * 处理获取单个角色
 */
async function handleGetRole(id: string): Promise<{ success: boolean, role?: Role }>

/**
 * 处理创建角色
 */
async function handleCreateRole(request: CreateRoleRequest): Promise<{ success: boolean, role?: Role }>

/**
 * 处理更新角色
 */
async function handleUpdateRole(id: string, request: UpdateRoleRequest): Promise<{ success: boolean }>

/**
 * 处理删除角色
 */
async function handleDeleteRole(id: string): Promise<{ success: boolean }>
```

#### role.repository.ts

```typescript
/**
 * 获取所有角色
 */
async function getAll(): Promise<Role[]>

/**
 * 根据ID获取角色
 */
async function getById(id: string): Promise<Role | null>

/**
 * 创建角色
 */
async function create(role: Omit<Role, 'id' | 'useCount' | 'createdAt' | 'updatedAt'>): Promise<Role>

/**
 * 更新角色
 */
async function update(id: string, data: Partial<Role>): Promise<void>

/**
 * 删除角色
 */
async function delete(id: string): Promise<void>

/**
 * 增加使用次数
 */
async function incrementUseCount(id: string): Promise<void>
```

## 7. 边界检查

| 场景 | 验证规则 | 错误提示 |
|-----|---------|---------|
| 名称为空 | `!name.trim()` | "请输入角色名称" |
| 提示词为空 | `!systemPrompt.trim()` | "请输入系统提示词" |
| 名称过长 | `name.length > 50` | "名称不能超过50字符" |
| 提示词过长 | `systemPrompt.length > 5000` | "提示词不能超过5000字符" |

## 8. 测试用例

| 用例ID | 描述 | 步骤 | 预期结果 |
|-------|------|-----|---------|
| TC001 | 创建角色 | 输入信息→保存 | 创建成功 |
| TC002 | 编辑角色 | 修改信息→保存 | 更新成功 |
| TC003 | 删除角色 | 点击删除→确认 | 删除成功 |
| TC004 | 在对话中使用角色 | 选择角色→发送消息 | AI使用角色提示词 |
| TC005 | 角色名称必填 | 不输入名称→保存 | 显示错误提示 |
| TC006 | 提示词必填 | 不输入提示词→保存 | 显示错误提示 |
