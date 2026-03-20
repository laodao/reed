# 待完成任务

## 任务 1：修复添加供应商界面模型删除 Bug
**问题**：从 API 获取的模型，点击模型名称就把模型删除了
**优先级**：高
**状态**：✅ 已完成
**解决方案**：将 checkbox 和模型信息分离，添加 `@click.stop` 阻止事件冒泡

## 任务 2：模型特性标识
**需求**：
- 从 API 获取的模型，保存模型特性信息：
  - 模型类型（文本/图片/视频）
  - 是否支持思维链
  - 是否支持联网搜索
  - 是否支持使用工具
- 在模型列表和对话界面的模型下拉里用不同 icon 标识这些特性
**优先级**：中
**状态**：✅ 已完成
**实现**：
- 扩展 `ModelDefinition` 类型添加 `type`、`supportsTools` 字段
- 在 `provider-template.service.ts` 添加 `detectModelType` 和 `detectToolSupport` 方法
- 在 `AddProviderDialog.vue` 显示模型类型、深度思考、联网搜索、工具调用图标
- 在 `ChatHeader.vue` 模型下拉中显示特性图标

## 任务 3：对话标题和操作优化
**需求**：
- 发送消息后，对话标题自动改成用户第一句话的缩略
- 右侧删除 icon 改成操作 icon
- 点击操作 icon 弹出删除和修改选项
- 点击修改弹出修改标题的对话框
**优先级**：中
**状态**：✅ 已完成
**实现**：
- 在 `TopicCard.vue` 中将删除按钮改为下拉菜单，包含"重命名"和"删除"选项
- 添加重命名对话框，支持修改标题
- 在 `Chat.vue` 的 `handleSendMessage` 中检测是否为新对话，自动更新标题
- 在 `dialog.ts` store 中添加 `updateDialogTitle` 方法

## 任务 4：模型管理默认显示行为优化
**需求**：
- 默认只显示已保存的模型，没有就显示空
- 点击"从 API 刷新"才从 API 获取全部模型
- 不要一打开模型管理就把所有 API 模型显示出来（太多了不好找）
**优先级**：中
**状态**：✅ 已完成
**实现**：
- 新增 `savedModelsInfo` 用于存储已保存模型的完整信息（名称、类型等）
- 修改 `allModels` 计算逻辑：只有 `apiModels` 有值时才显示 API 模型，否则只显示已启用的模型
- 移除 `watch apiKey` 自动获取模型的逻辑
- 编辑模式下不再自动加载 `apiModels`，只加载已启用模型的详细信息到 `savedModelsInfo`
- 选择模板时清空 `apiModels`
- 优化空模型列表提示信息

## 任务 5：编辑提供商对话框重复打开问题修复
**问题**：同一个模型，第一次点击编辑没问题，第二次再点，打开的界面里就没有信息，变成了新增提供商界面
**优先级**：高
**状态**：✅ 已完成
**原因**：对话框关闭时 `editingConfig` 没有被清除，第二次点击同一个配置时 `watch(editConfig)` 不会触发
**解决方案**：
- 在 `Settings.vue` 中添加 `watch(showAddDialog)` 监听对话框状态
- 对话框关闭时清除 `editingConfig`
- 在 `AddProviderDialog.vue` 的 `watch(editConfig)` 中添加 else 分支，处理 `editConfig` 为空时重置 `selectedTemplate`

## 任务 6：对话模块初始化定位问题修复
**需求**：
- 从菜单进入对话模块时，默认显示最后一个对话
- 助手列表 tab 选中该对话对应的助手
- 对话列表 tab 选中最后一个对话
- tab 切换到话题 tab
**优先级**：中
**状态**：✅ 已完成
**实现**：
- 在 `useChat.ts` 的 `initialize()` 函数中添加 `selectLastDialog()` 调用
- `selectLastDialog()` 方法：按 updatedAt 排序找到最后一个对话，根据 roleId 找到对应助手并选中
- 修改 `selectRole()` 方法：选择默认助手时设置 `selectedRole` 为 null（因为默认助手的对话 roleId 在数据库中为 null）
- 在 `ChatSidebar.vue` 中添加 `isRoleSelected()` 方法处理默认助手的选中状态
- 修改话题列表 header 显示逻辑：`selectedRole` 为 null 时显示"默认助手"而非"所有话题"

## 任务 7：对话模块 Bug 修复
**问题1**：点击默认助手后创建新对话没有反应
**原因**：创建对话后，`dialogs` 列表被 `loadDialogsByRole` 加载的过滤后的对话替换，新创建的对话不在该列表中
**解决方案**：在 `createNewDialog` 中创建对话后，重新调用 `loadDialogsByRole` 刷新当前角色的对话列表

**问题2**：模型选择下拉框有时会显示数据库 id
**原因**：`config.shortId || config.id.slice(0, 8)` 当用户没有设置 shortId 时会显示数据库 id 的前8位
**解决方案**：改为 `config.shortId || config.name`，优先使用用户设置的短标识符，其次使用配置名称

**问题3**：最后一个对话记录不对，发送消息后 `updatedAt` 没有更新
**原因**：`message.repository.ts` 的 `create` 方法只创建消息，没有更新对话的 `updated_at` 字段
**解决方案**：在消息创建时同时更新对话的 `updated_at` 和 `message_count`

**问题4**：selectLastDialog 逻辑问题，选择的对话可能不在过滤后的列表中
**原因**：先从所有对话中找到 lastDialog，然后 loadDialogsByRole 替换了 dialogs 列表，但 lastDialog 是旧列表中的对象引用
**解决方案**：重写 selectLastDialog，直接调用 API 获取排序后的对话列表，加载角色对话后从新列表中用 id 找到要选中的对话

**问题5**：清空数据库文件后软件还有数据
**原因**：sql.js 是内存数据库，软件运行时数据在内存中，save() 才写入磁盘。运行时删除数据库文件后，内存数据会写回磁盘
**状态**：✅ 已完成
**解决方案**：将数据库从 sql.js（内存数据库）迁移到 better-sqlite3（磁盘数据库），每次写入操作都实时持久化到磁盘

## 任务 8：数据库迁移到 better-sqlite3
**需求**：运行时应该实时把数据写入到数据库，不要滥用缓存
**优先级**：高
**状态**：✅ 已完成
**实现**：
- 将 `sql.js` 替换为 `better-sqlite3`
- 重写 `database/index.ts` 数据库管理器
- 重写所有 repository 文件，适配 better-sqlite3 API
- 移除所有 `save()` 调用（better-sqlite3 自动持久化）
- 使用 WAL 模式提高并发性能