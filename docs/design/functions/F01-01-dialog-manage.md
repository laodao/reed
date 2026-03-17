# F01-01 - 对话管理

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M01 - AI对话 |
| 功能编号 | F01-01 |
| 功能名称 | 对话管理 |
| 优先级 | P0 |
| 功能描述 | 创建、查看、删除对话，管理对话列表 |

## 2. 操作流程

### 2.1 查看对话列表

```
用户进入对话页面
    │
    ▼
前端调用 loadDialogs()
    │
    ▼
调用 dialog:list IPC
    │
    ▼
主进程查询数据库
    │
    ▼
按 updated_at 倒序返回
    │
    ▼
前端显示对话列表
```

### 2.2 创建新对话

```
用户点击"新建对话"按钮
    │
    ▼
显示新建对话框
    │
    ▼
用户选择模型（必选）
    │
    ├── 可选：输入标题
    │
    ├── 可选：选择角色
    │
    ▼
用户点击"创建"
    │
    ▼
调用 dialog:create IPC
    │
    ▼
主进程创建对话记录
    │
    ├── 生成对话ID
    │
    ├── 如果有角色，获取角色的系统提示词
    │
    ├── 保存到数据库
    │
    ▼
返回对话信息
    │
    ▼
前端跳转到新对话
```

### 2.3 删除对话

```
用户点击删除按钮（或在对话详情页）
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
调用 dialog:delete IPC
    │
    ▼
主进程删除对话及所有消息
    │
    ▼
返回成功
    │
    ▼
前端更新列表
    │
    ├── 如果删除的是当前对话，跳转到列表第一个
    │
    ▼
显示删除成功提示
```

## 3. 界面设计

### 3.1 对话列表组件

```
┌────────────────────────────┐
│  对话列表                   │
│  ┌──────────────────────┐  │
│  │  + 新建对话           │  │
│  └──────────────────────┘  │
│                             │
│  ┌──────────────────────┐  │
│  │ 💬 关于Vue3的问题     │  │
│  │    今天 10:30        │  │
│  │    5条消息            │  │
│  └──────────────────────┘  │
│                             │
│  ┌──────────────────────┐  │
│  │ 💬 Python爬虫         │  │
│  │    昨天               │  │
│  │    12条消息           │  │
│  └──────────────────────┘  │
│                             │
│  ┌──────────────────────┐  │
│  │ 💬 代码优化建议       │  │
│  │    01-15             │  │
│  │    3条消息            │  │
│  └──────────────────────┘  │
│                             │
│  ...                        │
│                             │
└────────────────────────────┘
```

### 3.2 新建对话对话框

```
┌─────────────────────────────────────┐
│  新建对话                            │
├─────────────────────────────────────┤
│                                      │
│  对话标题（可选）                    │
│  ┌────────────────────────────────┐ │
│  │                                │ │
│  └────────────────────────────────┘ │
│  留空将根据首次对话自动生成          │
│                                      │
│  选择模型 *                          │
│  ┌────────────────────────────────┐ │
│  │ qwen-turbo                  ▼ │ │
│  └────────────────────────────────┘ │
│                                      │
│  选择角色（可选）                    │
│  ┌────────────────────────────────┐ │
│  │ 无                          ▼ │ │
│  └────────────────────────────────┘ │
│                                      │
├─────────────────────────────────────┤
│                    [取消]  [创建]    │
└─────────────────────────────────────┘
```

### 3.3 删除确认对话框

```
┌─────────────────────────────────────┐
│  确认删除                            │
├─────────────────────────────────────┤
│                                      │
│  ⚠️ 确定要删除对话"关于Vue3的问题"吗？│
│                                      │
│  此操作将删除该对话的所有消息，       │
│  且无法恢复。                        │
│                                      │
├─────────────────────────────────────┤
│                    [取消]  [删除]    │
└─────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 数据类型

```typescript
// 对话
interface Dialog {
  id: string                    // 对话ID（UUID）
  title: string                 // 对话标题
  modelId: string               // 使用的模型ID
  roleId?: string               // 角色ID（可选）
  systemPrompt?: string         // 系统提示词
  createdAt: Date               // 创建时间
  updatedAt: Date               // 更新时间
  messageCount: number          // 消息数量
}

// 创建对话请求
interface CreateDialogRequest {
  title?: string                // 标题（可选）
  modelId: string               // 模型ID（必填）
  roleId?: string               // 角色ID（可选）
}

// 对话列表项（显示用）
interface DialogListItem {
  id: string
  title: string
  modelId: string
  messageCount: number
  updatedAt: Date
  preview?: string              // 最后一条消息预览
}
```

### 4.2 数据库表

```sql
-- 对话表
CREATE TABLE dialogs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '新对话',
  model_id TEXT NOT NULL,
  role_id TEXT,
  system_prompt TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  message_count INTEGER DEFAULT 0
);

-- 索引
CREATE INDEX idx_dialogs_updated_at ON dialogs(updated_at DESC);
```

## 5. 涉及文件

### 5.1 前端文件

| 文件路径 | 描述 |
|---------|------|
| `src/renderer/src/views/DialogView.vue` | 对话主页面 |
| `src/renderer/src/stores/dialog.ts` | 对话状态管理 |
| `src/renderer/src/components/dialog/DialogList.vue` | 对话列表组件 |
| `src/renderer/src/components/dialog/CreateDialogDialog.vue` | 新建对话框 |

### 5.2 后端文件

| 文件路径 | 描述 |
|---------|------|
| `src/main/ipc/handlers/dialog.handler.ts` | 对话IPC处理器 |
| `src/main/database/repositories/dialog.repository.ts` | 对话数据访问 |

### 5.3 共享文件

| 文件路径 | 描述 |
|---------|------|
| `src/shared/types/dialog.types.ts` | 对话类型定义 |

## 6. 函数设计

### 6.1 前端函数

#### stores/dialog.ts

```typescript
/**
 * 对话列表
 */
const dialogs = ref<Dialog[]>([])

/**
 * 当前选中的对话
 */
const currentDialog = ref<Dialog | null>(null)

/**
 * 加载对话列表
 * @returns Promise<void>
 * 逻辑：
 * 1. 调用 window.electronAPI.listDialogs()
 * 2. 更新 dialogs 响应式变量
 * 3. 捕获错误并显示提示
 */
async function loadDialogs(): Promise<void>

/**
 * 创建新对话
 * @param request - 创建请求
 * @returns Promise<Dialog>
 * 逻辑：
 * 1. 验证 modelId 必填
 * 2. 调用 window.electronAPI.createDialog(request)
 * 3. 将新对话添加到列表开头
 * 4. 设置为当前对话
 * 5. 返回新对话
 */
async function createDialog(request: CreateDialogRequest): Promise<Dialog>

/**
 * 删除对话
 * @param dialogId - 对话ID
 * @returns Promise<void>
 * 逻辑：
 * 1. 调用 window.electronAPI.deleteDialog(dialogId)
 * 2. 从列表中移除
 * 3. 如果删除的是当前对话，清空 currentDialog
 */
async function deleteDialog(dialogId: string): Promise<void>

/**
 * 选择对话
 * @param dialog - 对话对象
 * @returns void
 * 逻辑：
 * 1. 设置 currentDialog
 * 2. 加载该对话的消息列表
 */
function selectDialog(dialog: Dialog): void

/**
 * 生成对话标题
 * @param firstMessage - 首条用户消息
 * @returns string
 * 逻辑：
 * 1. 截取前20个字符
 * 2. 如果超过20字符，添加"..."
 */
function generateTitle(firstMessage: string): string
```

#### components/dialog/DialogList.vue

```typescript
/**
 * 格式化时间显示
 * @param date - 日期对象
 * @returns string
 * 逻辑：
 * 1. 今天：显示"HH:mm"
 * 2. 昨天：显示"昨天"
 * 3. 一周内：显示"星期X"
 * 4. 其他：显示"MM-DD"
 */
function formatTime(date: Date): string

/**
 * 处理对话点击
 * @param dialog - 对话对象
 */
function handleDialogClick(dialog: Dialog): void

/**
 * 处理删除点击
 * @param dialog - 对话对象
 * @param event - 鼠标事件
 */
function handleDeleteClick(dialog: Dialog, event: MouseEvent): void
```

### 6.2 后端函数

#### dialog.handler.ts

```typescript
/**
 * 处理获取对话列表
 * @param event - IPC事件
 * @returns Promise<{ success: boolean, dialogs: Dialog[] }>
 * 逻辑：
 * 1. 调用 repository.getAll()
 * 2. 按 updated_at 倒序排列
 * 3. 返回列表
 */
async function handleListDialogs(event: IpcMainInvokeEvent): Promise<{ success: boolean, dialogs: Dialog[] }>

/**
 * 处理获取单个对话
 * @param event - IPC事件
 * @param dialogId - 对话ID
 * @returns Promise<{ success: boolean, dialog?: Dialog }>
 * 逻辑：
 * 1. 调用 repository.getById(dialogId)
 * 2. 返回对话信息
 */
async function handleGetDialog(event: IpcMainInvokeEvent, dialogId: string): Promise<{ success: boolean, dialog?: Dialog }>

/**
 * 处理创建对话
 * @param event - IPC事件
 * @param request - 创建请求
 * @returns Promise<{ success: boolean, dialog?: Dialog }>
 * 逻辑：
 * 1. 验证 modelId 有效
 * 2. 生成 UUID
 * 3. 如果有 roleId，获取角色的系统提示词
 * 4. 调用 repository.create()
 * 5. 返回新对话
 */
async function handleCreateDialog(
  event: IpcMainInvokeEvent,
  request: CreateDialogRequest
): Promise<{ success: boolean, dialog?: Dialog }>

/**
 * 处理删除对话
 * @param event - IPC事件
 * @param dialogId - 对话ID
 * @returns Promise<{ success: boolean }>
 * 逻辑：
 * 1. 调用 repository.delete(dialogId)
 * 2. 级联删除所有消息
 * 3. 返回成功
 */
async function handleDeleteDialog(
  event: IpcMainInvokeEvent,
  dialogId: string
): Promise<{ success: boolean }>
```

#### dialog.repository.ts

```typescript
/**
 * 获取所有对话
 * @returns Promise<Dialog[]>
 * 逻辑：
 * 1. 查询 dialogs 表
 * 2. 按 updated_at DESC 排序
 * 3. 返回列表
 */
async function getAll(): Promise<Dialog[]>

/**
 * 根据ID获取对话
 * @param id - 对话ID
 * @returns Promise<Dialog | null>
 */
async function getById(id: string): Promise<Dialog | null>

/**
 * 创建对话
 * @param dialog - 对话数据
 * @returns Promise<Dialog>
 * 逻辑：
 * 1. 插入新记录
 * 2. 返回创建的对话
 */
async function create(dialog: Omit<Dialog, 'id' | 'createdAt' | 'updatedAt' | 'messageCount'>): Promise<Dialog>

/**
 * 更新对话
 * @param id - 对话ID
 * @param data - 更新数据
 * @returns Promise<void>
 * 逻辑：
 * 1. 更新指定字段
 * 2. 更新 updated_at
 */
async function update(id: string, data: Partial<Dialog>): Promise<void>

/**
 * 删除对话
 * @param id - 对话ID
 * @returns Promise<void>
 * 逻辑：
 * 1. 删除对话记录
 * 2. 级联删除消息（外键约束）
 */
async function delete(id: string): Promise<void>

/**
 * 更新消息计数
 * @param id - 对话ID
 * @param count - 消息数量
 * @returns Promise<void>
 */
async function updateMessageCount(id: string, count: number): Promise<void>
```

## 7. 边界检查

### 7.1 输入验证

| 场景 | 验证规则 | 错误提示 |
|-----|---------|---------|
| 模型未选择 | `!modelId` | "请选择模型" |
| 标题过长 | `title.length > 100` | "标题不能超过100字符" |
| 对话不存在 | `!dialog` | "对话不存在" |

### 7.2 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| 数据库查询失败 | 记录日志，返回空列表 |
| 创建失败 | 返回错误信息 |
| 删除失败 | 返回错误信息 |

## 8. 测试用例

| 用例ID | 描述 | 步骤 | 预期结果 |
|-------|------|-----|---------|
| TC001 | 查看对话列表 | 进入对话页面 | 显示所有对话 |
| TC002 | 创建新对话（仅模型） | 选择模型→创建 | 创建成功，跳转到新对话 |
| TC003 | 创建新对话（完整） | 输入标题+选择模型+选择角色→创建 | 创建成功，包含系统提示词 |
| TC004 | 删除对话 | 点击删除→确认 | 对话从列表移除 |
| TC005 | 取消删除 | 点击删除→取消 | 对话保持不变 |
| TC006 | 对话排序 | 查看列表 | 按更新时间倒序 |
| TC007 | 空列表 | 无对话时 | 显示"暂无对话"提示 |
