# 前端与后端 API 数据格式文档

> 本文档梳理了 The Bot 项目中前端（渲染进程）与后端（主进程）之间的 IPC API 通信方式和数据格式定义。

## 目录

1. [通信架构概述](#通信架构概述)
2. [IPC 响应格式规范](#ipc-响应格式规范)
3. [IPC 通道命名规范](#ipc-通道命名规范)
4. [各模块 API 详情](#各模块-api-详情)
5. [流式通信与事件监听](#流式通信与事件监听)
6. [安全注意事项](#安全注意事项)

---

## 通信架构概述

### 技术架构

本项目采用 Electron + Vue3 + TypeScript 技术栈，前后端通信通过 Electron IPC（Inter-Process Communication）机制实现：

```
┌─────────────────────────────────────────────────────────┐
│                   渲染进程 (Vue3)                        │
│                                                         │
│  ┌─────────────┐                                        │
│  │  Vue 组件   │                                        │
│  │  Pinia Store│  ←─────→  window.electronAPI          │
│  └─────────────┘                                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          │
                          │ IPC (ipcRenderer.invoke / ipcMain.handle)
                          │ IPC Events (ipcRenderer.on / ipcMain.send)
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   预加载脚本 (preload)                   │
│                                                         │
│  contextBridge.exposeInMainWorld('electronAPI', {...}) │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   主进程 (Electron Main)                │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ IPC Handler │  │   Service   │  │  Database   │     │
│  │   处理器    │←→│   服务层    │←→│   数据层    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 关键文件位置

| 层级 | 文件路径 | 说明 |
|------|----------|------|
| 类型定义 | `src/shared/types/*.types.ts` | 共享类型定义 |
| 预加载脚本 | `src/preload/index.ts` | API 暴露层 |
| IPC 处理器 | `src/main/ipc/handlers/*.handler.ts` | 主进程 IPC 处理 |
| 业务服务 | `src/main/services/*.service.ts` | 业务逻辑层 |
| 数据仓库 | `src/main/database/repositories/*.ts` | 数据访问层 |
| 前端调用 | `src/renderer/src/stores/*.ts` | Pinia 状态管理 |

---

## IPC 响应格式规范

### 统一响应格式

所有 IPC 调用返回统一的 `{ success, data?, error? }` 格式：

```typescript
/**
 * 通用 IPC 响应
 */
interface IpcResponse<T = any> {
  success: boolean    // 操作是否成功
  data?: T            // 成功时返回的数据
  error?: string      // 失败时的错误信息
}
```

### 典型响应示例

**成功响应**：
```typescript
{
  success: true,
  data: { ... }  // 或直接在顶层字段
}
```

**失败响应**：
```typescript
{
  success: false,
  error: "错误信息描述"
}
```

**列表响应**：
```typescript
interface ListDialogsResponse {
  success: boolean
  dialogs: Dialog[]   // 直接在顶层字段
}
```

---

## IPC 通道命名规范

### 命名模式

IPC 通道名称采用 `模块名:操作名` 的命名模式：

```
模块名:操作名
例如：dialog:list, dialog:create, dialog:update
```

### 操作类型映射

| 操作名 | 说明 | HTTP 类比 |
|--------|------|-----------|
| `list` | 获取列表 | GET /resource |
| `get` | 获取单个 | GET /resource/:id |
| `create` | 创建 | POST /resource |
| `update` | 更新 | PUT /resource/:id |
| `delete` | 删除 | DELETE /resource/:id |
| `test` | 测试连接 | POST /resource/test |
| `set-default` | 设置默认 | PUT /resource/:id/default |

### 全部 IPC 通道一览

#### 设置相关
| 通道名 | 说明 |
|--------|------|
| `settings:get` | 获取设置 |
| `settings:set` | 设置配置项 |

#### API 密钥相关（已废弃，使用提供商配置替代）
| 通道名 | 说明 |
|--------|------|
| `api-key:list` | 获取密钥列表 |
| `api-key:set` | 设置密钥 |
| `api-key:delete` | 删除密钥 |
| `api-key:test` | 测试密钥 |

#### 提供商模板相关
| 通道名 | 说明 |
|--------|------|
| `provider-template:list` | 获取模板列表 |

#### 提供商配置相关
| 通道名 | 说明 |
|--------|------|
| `provider-config:list` | 获取配置列表 |
| `provider-config:get` | 获取单个配置 |
| `provider-config:create` | 创建配置 |
| `provider-config:update` | 更新配置 |
| `provider-config:delete` | 删除配置 |
| `provider-config:test` | 测试配置 |
| `provider-config:set-default` | 设置默认配置 |
| `provider-config:changed` | 配置变化事件（监听） |

#### 对话相关
| 通道名 | 说明 |
|--------|------|
| `dialog:list` | 获取对话列表 |
| `dialog:list-by-role` | 按角色获取列表 |
| `dialog:get` | 获取单个对话 |
| `dialog:create` | 创建对话 |
| `dialog:update` | 更新对话 |
| `dialog:delete` | 删除对话 |
| `dialog:touch` | 更新时间戳 |

#### 消息相关
| 通道名 | 说明 |
|--------|------|
| `message:list` | 获取消息列表 |
| `message:get` | 获取单个消息 |
| `message:create` | 创建消息 |
| `message:update` | 更新消息 |
| `message:delete` | 删除对话所有消息 |
| `message:deleteSingle` | 删除单条消息 |

#### 聊天相关（流式）
| 通道名 | 说明 |
|--------|------|
| `chat:send` | 发送聊天消息 |
| `chat:stream` | 流式响应事件（监听） |
| `chat:stop` | 停止流式响应 |

#### 角色相关
| 通道名 | 说明 |
|--------|------|
| `role:list` | 获取角色列表 |
| `role:get` | 获取单个角色 |
| `role:create` | 创建角色 |
| `role:update` | 更新角色 |
| `role:delete` | 删除角色 |
| `role:dialog-count` | 获取对话数量 |

#### 图像生成相关
| 通道名 | 说明 |
|--------|------|
| `image:generate` | 生成图像 |
| `image:task-status` | 获取任务状态 |
| `image:stop` | 停止生成 |
| `image:list` | 获取图像列表 |
| `image:get` | 获取单个图像 |
| `image:toggle-favorite` | 切换收藏 |
| `image:delete` | 删除图像 |
| `image:delete-many` | 批量删除 |
| `image:providers` | 获取提供商 |
| `image:models` | 获取模型列表 |
| `image:test-provider` | 测试提供商 |
| `image:download` | 下载图像 |
| `image:select-file` | 选择参考图 |
| `image:generation-event` | 生成事件（监听） |

#### 搜索引擎相关
| 通道名 | 说明 |
|--------|------|
| `search-engine:templates` | 获取模板列表 |
| `search-engine:list` | 获取配置列表 |
| `search-engine:get` | 获取单个配置 |
| `search-engine:create` | 创建配置 |
| `search-engine:update` | 更新配置 |
| `search-engine:delete` | 删除配置 |
| `search-engine:test` | 测试配置 |
| `search-engine:set-default` | 设置默认 |
| `search-engine:search` | 执行搜索 |
| `search-engine:get-disabled-quick` | 获取禁用的快速引擎 |
| `search-engine:set-quick-enabled` | 设置快速引擎状态 |
| `search-engine:changed` | 配置变化事件（监听） |

#### 日记相关
| 通道名 | 说明 |
|--------|------|
| `diary:list-folders` | 获取目录列表 |
| `diary:get-all-folders` | 获取所有目录 |
| `diary:create-folder` | 创建目录 |
| `diary:update-folder` | 更新目录 |
| `diary:delete-folder` | 删除目录 |
| `diary:list-entries` | 获取日记列表 |
| `diary:get-entry` | 获取日记详情 |
| `diary:create-entry` | 创建日记 |
| `diary:update-entry` | 更新日记 |
| `diary:delete-entry` | 删除日记 |
| `diary:move-entry` | 移动日记 |
| `diary:search` | 搜索日记 |
| `diary:get-backlinks` | 获取反向链接 |
| `diary:export-html` | 导出 HTML |
| `diary:export-pdf` | 导出 PDF |
| `diary:export-docx` | 导出 Word |

#### 长文写作相关
| 通道名 | 说明 |
|--------|------|
| `longwriting:getProjects` | 获取项目列表 |
| `longwriting:getProject` | 获取项目详情 |
| `longwriting:createProject` | 创建项目 |
| `longwriting:updateProject` | 更新项目 |
| `longwriting:deleteProject` | 删除项目 |
| **故事概要** | |
| `longwriting:getStoryOverview` | 获取故事概要 |
| `longwriting:updateStoryOverview` | 更新概要 |
| `longwriting:lockStoryOverview` | 锁定概要 |
| **背景设定** | |
| `longwriting:getBackground` | 获取背景设定 |
| `longwriting:updateBackground` | 更新背景 |
| **地图管理** | |
| `longwriting:getMaps` | 获取地图列表 |
| `longwriting:getMap` | 获取地图详情 |
| `longwriting:createMap` | 创建地图 |
| `longwriting:updateMap` | 更新地图 |
| `longwriting:deleteMap` | 删除地图 |
| `longwriting:generateMapData` | AI生成地图数据 |
| `longwriting:generateMapImage` | AI生成地图图片 |
| **地点管理** | |
| `longwriting:getLocations` | 获取地点列表 |
| `longwriting:getLocation` | 获取地点详情 |
| `longwriting:createLocation` | 创建地点 |
| `longwriting:updateLocation` | 更新地点 |
| `longwriting:deleteLocation` | 删除地点 |
| `longwriting:generateLocations` | AI生成地点 |
| **势力管理** | |
| `longwriting:getFactions` | 获取势力列表 |
| `longwriting:getFactionsByType` | 按类型获取势力 |
| `longwriting:getFaction` | 获取势力详情 |
| `longwriting:createFaction` | 创建势力 |
| `longwriting:updateFaction` | 更新势力 |
| `longwriting:deleteFaction` | 删除势力 |
| `longwriting:reorderFactions` | 重排序势力 |
| `longwriting:generateFactions` | AI生成势力 |
| **情节管理** | |
| `longwriting:getPlots` | 获取情节列表 |
| `longwriting:getPlot` | 获取情节详情 |
| `longwriting:createPlot` | 创建情节 |
| `longwriting:batchCreatePlots` | 批量创建情节 |
| `longwriting:updatePlot` | 更新情节 |
| `longwriting:reorderPlots` | 重排序情节 |
| `longwriting:deletePlot` | 删除情节 |
| `longwriting:getPlotCount` | 获取情节数量 |
| `longwriting:generatePlots` | AI生成情节 |
| **角色管理** | |
| `longwriting:getCharacters` | 获取角色列表 |
| `longwriting:getCharacter` | 获取角色详情 |
| `longwriting:createCharacter` | 创建角色 |
| `longwriting:updateCharacter` | 更新角色 |
| `longwriting:deleteCharacter` | 删除角色 |
| `longwriting:linkPortrait` | 关联人像 |
| `longwriting:unlinkPortrait` | 解除人像关联 |
| `longwriting:getCharacterRelations` | 获取角色关系 |
| `longwriting:createCharacterRelation` | 创建角色关系 |
| `longwriting:deleteCharacterRelation` | 删除角色关系 |
| `longwriting:getCharacterByPortraitId` | 通过人像ID获取角色 |
| `longwriting:syncCharacterToPortrait` | 同步角色到人像 |
| `longwriting:generateCharacters` | AI生成角色 |
| **技能管理** | |
| `longwriting:getSkills` | 获取技能列表 |
| `longwriting:getSkill` | 获取技能详情 |
| `longwriting:createSkill` | 创建技能 |
| `longwriting:updateSkill` | 更新技能 |
| `longwriting:deleteSkill` | 删除技能 |
| **物品管理** | |
| `longwriting:getItems` | 获取物品列表 |
| `longwriting:getItem` | 获取物品详情 |
| `longwriting:createItem` | 创建物品 |
| `longwriting:updateItem` | 更新物品 |
| `longwriting:deleteItem` | 删除物品 |
| `longwriting:generateSkillsItems` | AI生成技能物品 |
| `longwriting:generateSkillItemTypes` | AI生成技能物品类型 |
| `longwriting:generateSkillsOnly` | AI仅生成技能 |
| `longwriting:generateItemsOnly` | AI仅生成物品 |
| **素材管理** | |
| `longwriting:getMaterials` | 获取素材列表 |
| `longwriting:getMaterial` | 获取素材详情 |
| `longwriting:createMaterial` | 创建素材 |
| `longwriting:updateMaterial` | 更新素材 |
| `longwriting:updateMaterialStatus` | 更新素材状态 |
| `longwriting:deleteMaterial` | 删除素材 |
| `longwriting:processMaterial` | 处理素材 |
| **大纲管理** | |
| `longwriting:getOutlineTree` | 获取大纲树 |
| `longwriting:getOutline` | 获取大纲详情 |
| `longwriting:createOutline` | 创建大纲 |
| `longwriting:updateOutline` | 更新大纲 |
| `longwriting:deleteOutline` | 删除大纲 |
| `longwriting:moveOutline` | 移动大纲节点 |
| **章节管理** | |
| `longwriting:getChapter` | 获取章节内容 |
| `longwriting:getChaptersByOutlineIds` | 批量获取章节 |
| `longwriting:saveChapter` | 保存章节 |
| `longwriting:getChapterVersions` | 获取章节版本 |
| `longwriting:restoreChapterVersion` | 恢复章节版本 |
| `longwriting:lockChapterVersion` | 锁定章节版本 |
| **AI 生成** | |
| `longwriting:generateStoryOverview` | AI生成故事概要 |
| `longwriting:polishBackground` | AI润色背景 |
| `longwriting:generateOutlineStory` | AI生成故事大纲 |
| `longwriting:generateOutlineComment` | AI生成评论大纲 |
| `longwriting:generateChapter` | AI生成章节 |
| `longwriting:generateSection` | AI生成段落 |
| `longwriting:generateChapterPrewrite` | AI生成章节预写 |
| `longwriting:onGenerateEvent` | AI生成事件（监听） |
| **导出** | |
| `longwriting:getExportData` | 获取导出数据 |
| `longwriting:exportMarkdown` | 导出Markdown |
| `longwriting:exportWord` | 导出Word |
| `longwriting:exportChapter` | 导出章节 |
| **全局配置** | |
| `longwriting:getGlobalSettings` | 获取全局设置 |
| `longwriting:updateGlobalSettings` | 更新全局设置 |
| **字典管理** | |
| `longwriting:getDictionaryCategories` | 获取字典分类 |
| `longwriting:createDictionaryCategory` | 创建字典分类 |
| `longwriting:updateDictionaryCategory` | 更新字典分类 |
| `longwriting:deleteDictionaryCategory` | 删除字典分类 |
| `longwriting:getDictionaryAll` | 获取所有字典项 |
| `longwriting:getDictionaryByCategory` | 按分类获取字典项 |
| `longwriting:createDictionaryItem` | 创建字典项 |
| `longwriting:updateDictionaryItem` | 更新字典项 |
| `longwriting:deleteDictionaryItem` | 删除字典项 |
| `longwriting:reorderDictionary` | 重排序字典 |
| **项目类型配置** | |
| `longwriting:getSkillTypeConfigs` | 获取技能类型配置 |
| `longwriting:createSkillTypeConfig` | 创建技能类型配置 |
| `longwriting:updateSkillTypeConfig` | 更新技能类型配置 |
| `longwriting:deleteSkillTypeConfig` | 删除技能类型配置 |
| `longwriting:getItemTypeConfigs` | 获取物品类型配置 |
| `longwriting:createItemTypeConfig` | 创建物品类型配置 |
| `longwriting:updateItemTypeConfig` | 更新物品类型配置 |
| `longwriting:deleteItemTypeConfig` | 删除物品类型配置 |
| `longwriting:initDefaultTypeConfigs` | 初始化默认类型配置 |
| **等级配置** | |
| `longwriting:getSkillLevels` | 获取技能等级 |
| `longwriting:createSkillLevel` | 创建技能等级 |
| `longwriting:updateSkillLevel` | 更新技能等级 |
| `longwriting:deleteSkillLevel` | 删除技能等级 |
| `longwriting:reorderSkillLevels` | 重排序技能等级 |
| `longwriting:getItemLevels` | 获取物品等级 |
| `longwriting:createItemLevel` | 创建物品等级 |
| `longwriting:updateItemLevel` | 更新物品等级 |
| `longwriting:deleteItemLevel` | 删除物品等级 |
| `longwriting:reorderItemLevels` | 重排序物品等级 |
| **章节预写** | |
| `longwriting:getPrewrite` | 获取预写内容 |
| `longwriting:savePrewrite` | 保存预写 |
| `longwriting:confirmPrewrite` | 确认预写 |
| `longwriting:deletePrewrite` | 删除预写 |
| **故事记忆** | |
| `longwriting:getMemories` | 获取记忆列表 |
| `longwriting:getMemoriesBeforeChapter` | 获取章节前记忆 |
| `longwriting:getMemory` | 获取记忆详情 |
| `longwriting:createMemory` | 创建记忆 |
| `longwriting:batchCreateMemories` | 批量创建记忆 |
| `longwriting:updateMemory` | 更新记忆 |
| `longwriting:deleteMemory` | 删除记忆 |
| `longwriting:toggleMemoryActive` | 切换记忆状态 |
| `longwriting:getMemoryStats` | 获取记忆统计 |
| `longwriting:extractMemories` | AI提取记忆 |
| **实体状态快照** | |
| `longwriting:getEntityStateSnapshots` | 获取实体状态快照 |
| `longwriting:getEntityStateAtChapter` | 获取章节实体状态 |
| `longwriting:getEntitiesStatesForChapter` | 批量获取实体状态 |
| `longwriting:getEntityStatesByChapter` | 按章节获取实体状态 |
| `longwriting:getEntityStateSnapshot` | 获取快照详情 |
| `longwriting:createEntityStateSnapshot` | 创建实体状态快照 |
| `longwriting:batchCreateEntityStateSnapshots` | 批量创建快照 |
| `longwriting:upsertEntityStateSnapshot` | 更新或创建快照 |
| `longwriting:updateEntityStateSnapshot` | 更新快照 |
| `longwriting:deleteEntityStateSnapshot` | 删除快照 |
| `longwriting:deleteEntityStatesByChapter` | 删除章节实体状态 |
| `longwriting:getSnapshotStats` | 获取快照统计 |
| `longwriting:extractEntityStates` | AI提取实体状态 |
| `longwriting:recognizeChapterEntities` | AI识别章节实体 |
| **章节状态摘要** | |
| `longwriting:getChapterStateSummaries` | 获取章节状态摘要 |
| `longwriting:getChapterStateSummary` | 获取摘要详情 |
| `longwriting:getChapterStateSummaryByOutline` | 按大纲获取摘要 |
| `longwriting:getLatestChapterStateSummary` | 获取最新摘要 |
| `longwriting:extractChapterStateSummary` | AI提取章节状态摘要 |
| `longwriting:saveChapterStateSummary` | 保存章节状态摘要 |
| **新实体检测** | |
| `longwriting:detectNewEntities` | AI检测新实体 |
| `longwriting:autoAddEntities` | 自动添加实体 |
| **步骤模型配置** | |
| `longwriting:getStageModelConfigs` | 获取步骤模型配置 |
| `longwriting:getStageModelConfig` | 获取单个步骤配置 |
| `longwriting:setStageModelConfig` | 设置步骤模型配置 |
| `longwriting:setStageModelConfigs` | 批量设置步骤配置 |
| **数据迁移** | |
| `longwriting:backupDatabase` | 备份数据库 |
| `longwriting:migrateProject` | 迁移项目 |
| `longwriting:migrateAllProjects` | 迁移所有项目 |
| `longwriting:checkNeedsMigration` | 检查迁移需求 |
| `longwriting:getMigrationStats` | 获取迁移统计 |

#### 人像设计相关
| 通道名 | 说明 |
|--------|------|
| **项目管理** | |
| `portrait:create-project` | 创建项目 |
| `portrait:list-projects` | 获取项目列表 |
| `portrait:get-project` | 获取项目详情 |
| `portrait:update-project` | 更新项目 |
| `portrait:delete-project` | 删除项目 |
| **角色管理** | |
| `portrait:create-character` | 创建角色 |
| `portrait:list-characters` | 获取角色列表 |
| `portrait:get-character` | 获取角色详情 |
| `portrait:update-character` | 更新角色 |
| `portrait:delete-character` | 删除角色 |
| **生成操作** | |
| `portrait:generate` | 生成人像 |
| `portrait:change-clothes` | 换衣 |
| `portrait:change-background` | 换背景 |
| `portrait:generate-angles` | 生成多角度 |
| `portrait:edit-image` | 编辑图片 |
| **变体管理** | |
| `portrait:get-variant` | 获取变体详情 |
| `portrait:list-variants` | 获取变体列表 |
| `portrait:delete-variant` | 删除变体 |
| **导出** | |
| `portrait:export` | 导出人像 |
| **事件监听** | |
| `portrait:generation-event` | 生成事件（监听） |

#### 剧集制作相关
| 通道名 | 说明 |
|--------|------|
| **项目管理** | |
| `stv:list-projects` | 获取项目列表 |
| `stv:get-project` | 获取项目详情 |
| `stv:create-project` | 创建项目 |
| `stv:update-project` | 更新项目 |
| `stv:delete-project` | 删除项目 |
| **角色绑定** | |
| `stv:get-character-bindings` | 获取角色绑定列表 |
| `stv:bind-character` | 绑定角色 |
| `stv:update-character-binding` | 更新角色绑定 |
| `stv:delete-character-binding` | 删除角色绑定 |
| **地点绑定** | |
| `stv:get-location-bindings` | 获取地点绑定列表 |
| `stv:bind-location` | 绑定地点 |
| `stv:update-location-binding` | 更新地点绑定 |
| `stv:delete-location-binding` | 删除地点绑定 |
| **物品绑定** | |
| `stv:get-item-bindings` | 获取物品绑定列表 |
| `stv:bind-item` | 绑定物品 |
| `stv:update-item-binding` | 更新物品绑定 |
| `stv:delete-item-binding` | 删除物品绑定 |
| **剧集管理** | |
| `stv:list-episodes` | 获取剧集列表 |
| `stv:get-episode` | 获取剧集详情 |
| `stv:create-episode` | 创建剧集 |
| `stv:update-episode` | 更新剧集 |
| `stv:delete-episode` | 删除剧集 |
| **剧本管理** | |
| `stv:get-script` | 获取剧本详情 |
| `stv:update-script` | 更新剧本 |
| **场景管理** | |
| `stv:list-scenes` | 获取场景列表 |
| `stv:get-scene` | 获取场景详情 |
| `stv:update-scene` | 更新场景 |
| **分镜管理** | |
| `stv:list-storyboards` | 获取分镜列表 |
| `stv:get-storyboard` | 获取分镜详情 |
| `stv:update-storyboard` | 更新分镜 |
| **AI 生成** | |
| `stv:generate-script` | AI生成剧本 |
| `stv:generate-scenes` | AI生成场景 |
| `stv:generate-storyboard` | AI生成分镜（单个场景） |
| `stv:generate-storyboards` | AI生成分镜（批量） |
| **资源生成** | |
| `stv:get-style-presets` | 获取风格预设 |
| `stv:generate-storyboard-image` | 生成分镜图片 |
| `stv:generate-scene-images` | 生成场景图片 |
| `stv:generate-audio` | 生成音频 |
| **视频合成** | |
| `stv:get-video-presets` | 获取视频预设 |
| `stv:synthesize-scene-video` | 合成场景视频 |
| `stv:synthesize-storyboard-video` | 合成分镜视频 |
| `stv:export-video` | 导出视频 |
| **上传实体管理** | |
| `stv:get-uploaded-entity` | 获取上传实体详情 |
| `stv:update-uploaded-entity` | 更新上传实体 |
| `stv:delete-uploaded-entity` | 删除上传实体 |
| `stv:is-binding-from-longwriting` | 判断绑定来源 |
| **进度事件（监听）** | |
| `stv:image-progress` | 图像生成进度 |
| `stv:audio-progress` | 音频生成进度 |
| `stv:storyboard-progress` | 分镜生成进度（单场景） |
| `stv:storyboards-progress` | 分镜生成进度（批量） |
| `stv:synthesis-progress` | 视频合成进度 |

#### OSS 图床相关
| 通道名 | 说明 |
|--------|------|
| `oss:list-configs` | 获取配置列表 |
| `oss:get-config` | 获取单个配置 |
| `oss:create-config` | 创建配置 |
| `oss:update-config` | 更新配置 |
| `oss:delete-config` | 删除配置 |
| `oss:set-default` | 设置默认 |
| `oss:toggle-enabled` | 启用/禁用 |
| `oss:test-connection` | 测试连接 |
| `oss:upload-file` | 上传文件 |

#### 知识库相关
| 通道名 | 说明 |
|--------|------|
| **知识库管理** | |
| `knowledge-base:list` | 获取知识库列表 |
| `knowledge-base:get` | 获取知识库详情 |
| `knowledge-base:create` | 创建知识库 |
| `knowledge-base:update` | 更新知识库 |
| `knowledge-base:delete` | 删除知识库 |
| **文档管理** | |
| `knowledge-base:add-document` | 添加文档（文本） |
| `knowledge-base:add-webpage` | 添加网页 |
| `knowledge-base:upload-documents` | 上传文档 |
| `knowledge-base:get-documents` | 获取文档列表 |
| `knowledge-base:delete-document` | 删除文档 |
| `knowledge-base:reprocess-document` | 重新处理文档 |
| **切片管理** | |
| `knowledge-base:get-document-chunks` | 获取文档切片列表 |
| `knowledge-base:get-document-chunks-paginated` | 分页获取切片 |
| `knowledge-base:get-chunk` | 获取单个切片详情 |
| **检索与配置** | |
| `knowledge-base:search` | 检索知识库 |
| `knowledge-base:get-embedding-models` | 获取Embedding模型列表 |
| `knowledge-base:select-files` | 选择文件 |
| `knowledge-base:get-file-limits` | 获取文件限制信息 |
| **事件监听** | |
| `kb:document-progress` | 文档处理进度（监听） |
| `kb:document-status` | 文档状态变化（监听） |
| `kb:stats` | 统计更新（监听） |

#### 翻译相关
| 通道名 | 说明 |
|--------|------|
| `translation:providers` | 获取提供商列表 |
| `translation:text` | 文本翻译 |
| `translation:file` | 文件翻译 |
| `translation:select-file` | 选择文件 |
| `translation:history` | 获取历史 |
| `translation:get` | 获取详情 |
| `translation:toggle-favorite` | 切换收藏 |
| `translation:delete` | 删除记录 |
| `translation:download` | 下载结果 |
| `translation:open-folder` | 打开文件夹 |
| **事件监听** | |
| `translation:progress` | 翻译进度（监听） |
| `translation:completed` | 翻译完成（监听） |
| `translation:failed` | 翻译失败（监听） |

#### 语音相关
| 通道名 | 说明 |
|--------|------|
| `voice:providers` | 获取提供商列表 |
| `voice:voices` | 获取发音人列表 |
| `voice:tts` | 文本转语音 |
| `voice:stt` | 语音转文本 |
| `voice:clone` | 语音复刻 |
| `voice:select-file` | 选择文件 |
| `voice:history` | 获取历史 |
| `voice:delete` | 删除记录 |
| `voice:toggle-favorite` | 切换收藏 |
| `voice:cloned-list` | 获取复刻声音 |
| `voice:cloned-delete` | 删除复刻声音 |
| `voice:download` | 下载音频 |
| **事件监听** | |
| `voice:tts-completed` | TTS完成（监听） |
| `voice:stt-completed` | STT完成（监听） |

#### 文件相关
| 通道名 | 说明 |
|--------|------|
| `file:open-dialog` | 打开文件选择框 |
| `file:read-base64` | 读取文件为Base64 |
| `file:save-dialog` | 保存文件对话框 |
| `file:write-text` | 写入文本文件 |
| `file:open-folder-dialog` | 打开文件夹选择 |
| `file:copy` | 复制文件 |

#### 导出相关
| 通道名 | 说明 |
|--------|------|
| `export:message-image` | 导出消息为图片 |
| `export:message-word` | 导出消息为Word |
| `export:get-obsidian-vaults` | 获取Obsidian保管库 |
| `export:get-vault-directories` | 获取保管库目录 |
| `export:get-vault-files` | 获取保管库文件 |
| `export:to-obsidian` | 导出到Obsidian |

#### 数据路径相关
| 通道名 | 说明 |
|--------|------|
| `data-path:get-config` | 获取配置 |
| `data-path:select` | 选择路径 |
| `data-path:set` | 设置路径 |
| `data-path:reset` | 重置路径 |
| `data-path:migration-status` | 迁移状态 |
| `data-path:calculate-size` | 计算大小 |
| `data-path:open-folder` | 打开目录 |

---

## 各模块 API 详情

### 1. 设置模块 (Settings)

#### 请求/响应类型

```typescript
// 获取设置
settings.get(key?: string) => Promise<IpcResponse<Record<string, any> | any>>

// 设置配置项
settings.set(key: string, value: any) => Promise<IpcResponse<void>>
```

#### 数据类型

```typescript
// 系统设置
interface AppSettings {
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en-US'
  fontSize: 'small' | 'medium' | 'large'
  dataPath?: string
}
```

---

### 2. 提供商配置模块 (ProviderConfig)

#### 请求类型

```typescript
// 创建配置
providerConfig.create(data: {
  templateId: string           // 模板 ID
  name: string                 // 配置名称
  shortId?: string             // 短标识符
  apiKey?: string              // API 密钥（加密存储）
  accessKeyId?: string         // Access Key ID（火山引擎）
  accessKeySecret?: string     // Access Key Secret（加密）
  baseUrl?: string             // 文本 API 端点
  imageBaseUrl?: string        // 图像 API 端点
  videoBaseUrl?: string        // 视频 API 端点
  audioBaseUrl?: string        // 语音 API 端点
  customHeaders?: Record<string, string>   // 自定义请求头
  customParams?: Record<string, unknown>   // 自定义参数
  models?: ModelDefinition[]   // 启用的模型列表
  isEnabled?: boolean          // 是否启用
  isDefault?: boolean          // 是否默认
})

// 更新配置
providerConfig.update(id: string, data: Partial<...>)

// 测试配置
providerConfig.test(data: {
  configId?: string            // 已保存的配置 ID
  templateId?: string          // 模板 ID（直接测试）
  apiKey?: string              // API 密钥
  accessKeyId?: string         // Access Key ID
  accessKeySecret?: string     // Access Key Secret
  baseUrl?: string             // API 端点
})
```

#### 数据类型

```typescript
// 提供商模板
interface ProviderTemplate {
  id: string                   // 模板 ID
  name: string                 // 模板名称
  description: string          // 描述
  category: TemplateCategory   // 分类
  capabilities: ProviderCapability[]  // 能力
  icon?: string                // 图标
  apiConfig: ApiConfigTemplate // API 配置模板
  supportedParams: {...}       // 支持的参数
  models: ModelDefinition[]    // 预定义模型
  allowCustomModels: boolean   // 是否允许自定义模型
}

// 模型定义
interface ModelDefinition {
  id: string                   // 模型 ID
  name: string                 // 模型名称
  type?: ModelType             // 类型（text/image/video/audio/multimodal）
  contextWindow: number        // 上下文窗口
  maxOutputTokens: number      // 最大输出 Token
  features: string[]           // 支持特性
  supportsThinking?: boolean   // 支持深度思考
  supportsWebSearch?: boolean  // 内置联网搜索
  supportsTools?: boolean      // 支持工具调用
  inputPrice?: number          // 输入价格
  outputPrice?: number         // 输出价格
}

// 用户配置（返回时隐藏密钥）
interface UserProviderConfig {
  id: string
  shortId?: string
  templateId: string
  name: string
  apiKey?: string              // 返回时为 '******'
  baseUrl?: string
  models?: ModelDefinition[]
  isEnabled: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}
```

---

### 3. 对话模块 (Dialog)

#### 请求类型

```typescript
// 创建对话
dialog.create(data: {
  title?: string               // 对话标题
  modelId: string              // 模型 ID
  providerConfigId?: string    // 提供商配置 ID
  roleId?: string              // 角色 ID
  systemPrompt?: string        // 系统提示词
  contextConfig?: ContextConfig // 上下文配置
})

// 更新对话
dialog.update(id: string, data: Partial<{
  title: string
  systemPrompt: string
  contextConfig: ContextConfig
  modelId: string
  providerConfigId: string
}>)
```

#### 数据类型

```typescript
// 对话实体
interface Dialog {
  id: string
  title: string
  modelId: string
  providerConfigId?: string
  roleId: string | null        // null 表示默认助手
  systemPrompt?: string
  contextConfig?: ContextConfig
  knowledgeBaseIds?: string[]  // 关联知识库
  webSearchConfig?: DialogWebSearchConfig
  createdAt: Date
  updatedAt: Date
  messageCount: number
}

// 上下文配置
interface ContextConfig {
  maxMessages: number          // 最大消息数
  maxTokens: number            // 最大 Token 数
}

// 联网搜索配置
interface DialogWebSearchConfig {
  enabled: boolean
  engine: SearchEngineType
  configId?: SearchEngineConfigId
}
```

---

### 4. 消息模块 (Message)

#### 请求类型

```typescript
// 创建消息
message.create(data: {
  dialogId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelId?: string
  tokensUsed?: number
  attachments?: Attachment[]
  metadata?: MessageMetadata
})

// 更新消息
message.update(id: string, content: string)
```

#### 数据类型

```typescript
// 消息实体
interface Message {
  id: string
  dialogId: string
  role: MessageRole
  content: string
  modelId?: string
  tokensUsed?: number
  attachments?: Attachment[]
  metadata?: MessageMetadata
  createdAt: Date
}

// 附件
interface Attachment {
  id: string
  type: 'image' | 'document'
  fileName: string
  filePath: string
  fileSize: number
  mimeType: string
}

// 消息元数据
interface MessageMetadata {
  thinkingChain?: string       // 思维链内容
  webSearch?: WebSearchResult[] // 联网搜索结果
  knowledgeBase?: KnowledgeBaseReference[] // 知识库引用
}
```

---

### 5. 聊天模块 (Chat) - 流式

#### 请求类型

```typescript
// 发送聊天消息
chat.send(data: {
  dialogId: string
  content: string
  attachments?: Attachment[]
  enableWebSearch?: boolean    // 启用联网搜索
  enableThinkingChain?: boolean // 启用思维链
  modelId?: string             // 当前选中的模型
  providerConfigId?: string    // 当前选中的提供商
  knowledgeBaseIds?: string[]  // 知识库 ID 列表
  knowledgeRetrieveCount?: number // 检索数量
  knowledgeThreshold?: number  // 相似度阈值
})
```

#### 流式事件类型

```typescript
// 流式事件
interface StreamEvent {
  type: 'start' | 'delta' | 'done' | 'error' | 'thinking'
  dialogId?: string            // 用于验证
  messageId?: string
  content?: string             // delta 事件的内容片段
  thinkingContent?: string     // 思维链内容
  error?: string
  interrupted?: boolean
  usage?: TokenUsage           // done 事件中的 Token 用量
}

// Token 用量
interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}
```

---

### 6. 角色模块 (Role)

#### 请求类型

```typescript
// 创建角色
role.create(data: {
  name: string
  description?: string
  systemPrompt?: string
  avatar?: string
  defaultModelId?: string      // 默认模型
  defaultProviderConfigId?: string // 默认提供商
  autoResetModel?: boolean     // 新话题重置模型
  temperature?: number         // 温度 (0-2)
  topP?: number                // Top P (0-1)
  maxContextMessages?: number  // 上下文消息数
  maxTokens?: number           // 最大输出 Token
  enableStream?: boolean       // 流式输出
  customParams?: Record<string, unknown>
  knowledgeBaseIds?: string[]  // 关联知识库
  knowledgeRetrieveCount?: number
  knowledgeThreshold?: number
})
```

#### 数据类型

```typescript
// 角色实体
interface Role {
  id: string
  name: string
  description?: string
  systemPrompt?: string
  avatar?: string
  isBuiltin?: boolean
  defaultModelId?: string
  defaultProviderConfigId?: string
  autoResetModel?: boolean
  temperature?: number
  topP?: number
  maxContextMessages?: number
  maxTokens?: number
  enableStream?: boolean
  customParams?: Record<string, unknown>
  knowledgeBaseIds?: string[]
  knowledgeRetrieveCount?: number
  knowledgeThreshold?: number
  createdAt: Date
  updatedAt: Date
}
```

---

### 7. 图像生成模块 (Image)

#### 请求类型

```typescript
// 生成图像
image.generate(request: {
  providerId: string           // 提供商 ID
  modelId: string              // 模型 ID
  prompt: string               // 提示词
  negativePrompt?: string      // 反向提示词
  width: number                // 宽度
  height: number               // 高度
  style?: string               // 风格
  quality?: string             // 质量
  count?: number               // 生成数量
  seed?: number                // 随机种子
  referenceImage?: string      // 参考图片
})

// 获取图像列表
image.list(page?: number, pageSize?: number, favoriteOnly?: boolean, status?: string)
```

#### 数据类型

```typescript
// 图像记录
interface ImageRecord {
  id: string
  dialogId?: string
  messageId?: string
  filePath: string
  fileName?: string
  fileSize?: number
  width?: number
  height?: number
  favorite: boolean
  createdAt: Date
  prompt?: string
  negativePrompt?: string
  style?: string
  quality?: string
  providerId?: string
  modelId?: string
  seed?: number
  taskId?: string
  status: 'pending' | 'completed' | 'failed'
  errorMessage?: string
}

// 生成事件（监听）
interface ImageGenerationEvent {
  type: 'generation-started' | 'generation-progress' | 
        'generation-completed' | 'generation-failed'
  taskId: string
  images?: any[]
  status?: string
  progress?: number
  error?: string
}
```

---

### 8. 搜索引擎模块 (SearchEngine)

#### 请求类型

```typescript
// 创建配置
searchEngine.create(data: {
  templateId: SearchEngineType
  name: string
  apiKey?: string
  extraConfig?: Record<string, unknown>
  maxResults?: number
  isEnabled?: boolean
  isDefault?: boolean
})

// 执行搜索
searchEngine.search(request: {
  query: string                // 搜索词
  engine: SearchEngineType     // 搜索引擎类型
  configId?: string            // 配置 ID
  maxResults?: number          // 最大结果数
})
```

#### 数据类型

```typescript
// 搜索引擎类型
type SearchEngineType =
  | 'baidu'      // 百度（网页抓取）
  | 'bing-web'   // 必应（网页抓取）
  | 'google-web' // Google（网页抓取）
  | 'zhipu'      // 智谱 AI（API）
  | 'tavily'     // Tavily（API）
  | 'model'      // 模型内置搜索

// 搜索引擎模板
interface SearchEngineTemplate {
  id: SearchEngineType
  name: string
  description: string
  category: 'web-scrape' | 'api' | 'model-built-in'
  icon?: string
  authConfig: SearchEngineAuthConfig
  defaultMaxResults: number
  maxResultsLimit: number
}

// 搜索结果
interface WebSearchResultItem {
  title: string
  url: string
  snippet: string
  source: SearchEngineType
  sourceName?: string
  score?: number
}
```

---

### 9. 知识库模块 (KnowledgeBase)

#### 请求类型

```typescript
// 创建知识库
knowledgeBase.create(data: {
  name: string
  description?: string
  embeddingModel: string       // Embedding 模型 ID
  embeddingProvider: 'cloud' | 'local'
  embeddingDimension: number   // 向量维度
  providerConfigId?: string    // 云端提供商配置
  ollamaBaseUrl?: string       // Ollama 服务地址
})

// 上传文档
knowledgeBase.uploadDocuments(knowledgeBaseId: string, files: Array<{
  path: string
  name: string
  size: number
}>)

// 检索知识库
knowledgeBase.search(request: {
  knowledgeBaseId: string
  query: string
  topK?: number
  vectorWeight?: number
  threshold?: number
})
```

#### 数据类型

```typescript
// 知识库实体
interface KnowledgeBase {
  id: string
  name: string
  description?: string
  embeddingModel: string
  embeddingDimension: number
  embeddingConfig?: string     // JSON
  splitStrategy?: SplitStrategy
  splitConfig?: string         // JSON
  documentCount: number
  vectorCount: number
  totalSize: number
  createdAt: Date | string
  updatedAt: Date | string
}

// 文档实体
interface KbDocument {
  id: string
  knowledgeBaseId: string
  name: string
  filePath: string
  fileType: FileType           // 'pdf' | 'docx' | 'txt' | 'md' | ...
  fileSize: number
  status: DocumentStatus       // 'pending' | 'processing' | 'completed' | 'failed'
  progress: number             // 0-100
  chunkCount: number
  errorMessage?: string
  createdAt: Date | string
}

// 切片实体
interface KbChunk {
  id: string
  documentId: string
  knowledgeBaseId: string
  content: string              // 切片内容
  chunkIndex: number           // 切片序号
  startOffset?: number         // 原文起始位置
  endOffset?: number           // 原文结束位置
  title?: string               // 章节标题
  level?: number               // 层级深度
  parentChunkId?: string       // 父切片 ID
  splitMethod?: string         // 切分方法
  sectionPath?: string         // 层级路径（JSON）
  metadata?: ChunkMetadata
  createdAt: Date | string
}

// 切片元数据
interface ChunkMetadata {
  page?: number                // 页码
  section?: string             // 章节
}

// 检索结果
interface SearchResult {
  chunkId: string
  documentId: string
  documentName: string
  content: string              // 切片内容
  score: number                // 相似度
  metadata?: ChunkMetadata
}

// Embedding 模型
interface EmbeddingModel {
  id: string
  name: string
  provider: 'cloud' | 'local'
  dimension: number            // 向量维度
  maxTokens: number            // 最大 Token 数
  providerConfigId?: string    // 云端模型配置
  providerTemplateId?: string
  ollamaBaseUrl?: string       // Ollama 服务地址
}

// 文件信息（用于上传）
interface FileInfo {
  path: string
  name: string
  size: number
}
```

---

### 10. 长文写作模块 (LongWriting)

#### 项目管理

```typescript
// 创建项目
longwriting.createProject(data: {
  name: string
  type: 'story' | 'comment'    // 故事类/评论类
})

// 获取项目详情
longwriting.getProject(id: string)

// 更新项目
longwriting.updateProject(id: string, data: {
  name?: string
  stage?: StoryStage | CommentStage
  progress?: number
})
```

#### 故事概要

```typescript
// 故事概要实体
interface StoryOverview {
  id: string
  projectId: string
  storyType: StoryType         // 'wuxia' | 'xianxia' | 'kehuan' | ...
  title: string
  coreIdea: string             // 核心构思
  style?: StoryStyle           // 'light' | 'heavy' | ...
  targetReader?: TargetReader  // 'teenager' | 'youth' | ...
  estimatedLength?: EstimatedLength // 'short' | 'medium' | 'long'
  summary: string              // 故事梗概
  coreConflict: string         // 核心冲突
  keyCharacters: KeyCharacter[]
  keyLocations: KeyLocation[]
  estimatedChapters: number
  enabledFeatures?: FeatureToggle[] // 'country' | 'faction' | 'sect' | ...
  isLocked: boolean
}
```

#### 角色设定

```typescript
// 创建角色
longwriting.createCharacter(data: {
  projectId: string
  name: string
  gender: 'male' | 'female' | 'other'
  age: number
  height?: number
  weight?: number
  race?: 'asian' | 'european' | 'other'
  occupation?: string
  position?: string
  appearance?: string          // 外貌描述
  background?: string          // 背景故事
  personality?: string         // 性格特点
  abilities?: string           // 能力特长
  rolePosition?: 'protagonist' | 'supporting' | 'antagonist' | 'minor'
  importance?: 'main' | 'secondary' | 'temporary'
  portraitId?: string          // 关联人像 ID
})

// 角色实体
interface StoryCharacter {
  id: string
  projectId: string
  portraitId?: string
  name: string
  gender: 'male' | 'female' | 'other'
  age: number
  appearance: string
  background: string
  personality: string
  abilities: string
  rolePosition: CharacterRolePosition
  importance: EntityImportance
  generatedImageId?: string
  createdAt: number
}
```

#### 大纲与章节

```typescript
// 大纲节点
interface StoryOutline {
  id: string
  projectId: string
  parentId?: string            // 父节点（支持嵌套）
  name: string
  level: number                // 层级 1/2/3
  nodeType: 'volume' | 'chapter' | 'section'
  summary: string              // 概要
  involvedCharacters: string[] // 涉及角色 ID
  involvedLocations: string[]  // 涉及地点 ID
  involvedItems: string[]      // 涉及物品 ID
  status: 'pending' | 'progressing' | 'completed'
  estimatedWords: number
  orderIndex: number
}

// 章节内容
interface StoryChapter {
  id: string
  outlineId: string
  content: string
  wordCount: number
  createdAt: number
}
```

#### AI 生成（流式）

```typescript
// AI 生成事件监听
longwriting.onGenerateEvent(eventId: string, callback: (data) => void)

// 事件通道: `longwriting:generate:${eventId}`
// 事件数据包含: { type, content, progress, error, ... }
```

#### 素材管理

```typescript
// 素材实体
interface StoryMaterial {
  id: string
  projectId: string
  name: string
  type: 'file' | 'url' | 'manual'
  source: string             // 文件路径或网址
  content: string            // 素材内容
  status: 'pending' | 'success' | 'failed'
  errorMessage?: string
  retryCount: number
  used: boolean
  createdAt: number
}
```

#### 章节预写

```typescript
// 预写内容
interface ChapterPrewrite {
  id: string
  outlineId: string          // 关联大纲节点，一对一
  content: string            // 预写内容
  isConfirmed: boolean       // 是否已确认
  confirmedAt?: number
  createdAt: number
  updatedAt: number
}
```

#### 故事记忆

```typescript
// 记忆类型
type MemoryType =
  | 'character_event'    // 角色事件
  | 'location_event'     // 地点事件
  | 'item_event'         // 物品事件
  | 'relationship_change' // 关系变化
  | 'faction_event'      // 势力事件
  | 'skill_event'        // 技能事件
  | 'general'            // 一般事件

// 记忆实体
interface StoryMemory {
  id: string
  projectId: string
  sourceOutlineId?: string
  memoryType: MemoryType
  title: string
  description: string
  involvedEntities: MemoryEntity[]
  chapterNumber: number
  importance: 'critical' | 'normal' | 'minor'
  isActive: boolean
  createdAt: number
}

// 记忆实体引用
interface MemoryEntity {
  type: 'character' | 'location' | 'item' | 'skill' | 'faction'
  id: string
  name: string
}
```

#### 实体状态快照

```typescript
// 实体状态快照
interface EntityStateSnapshot {
  id: string
  projectId: string
  entityType: 'character' | 'location' | 'item' | 'faction' | 'skill'
  entityId: string
  entityName: string
  chapterNumber: number
  stateSummary: string      // 状态摘要
  keyChanges: string[]      // 本章节的关键变化
  createdAt: number
  updatedAt: number
}
```

#### 章节状态摘要

```typescript
// 章节状态摘要
interface ChapterStateSummary {
  id: string
  projectId: string
  outlineId: string
  chapterNumber: number
  storyTime: string         // 故事内时间
  currentLocation: string   // 当前地点
  characterStates: string   // 角色状态概要
  pendingEvents: string     // 待处理事件/伏笔
  keyChanges: string        // 本章关键变化
  createdAt: number
  updatedAt: number
}
```

#### 步骤模型配置

```typescript
// 步骤模型配置
interface StageModelConfig {
  id: string
  projectId: string
  stage: StoryStage | CommentStage
  providerConfigId: string
  modelId: string
  createdAt: number
  updatedAt: number
}
```

#### 字典管理

```typescript
// 字典分类
interface DictionaryCategory {
  id: string
  code: string
  name: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

// 字典项
interface DictionaryItem {
  id: string
  categoryCode: string
  code: string
  name: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}
```

#### 项目类型配置

```typescript
// 项目技能类型配置
interface ProjectSkillTypeConfig {
  id: string
  projectId: string
  code: string
  name: string
  description?: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

// 技能等级配置
interface SkillLevelConfig {
  id: string
  projectId: string
  skillTypeCode: string
  code: string
  name: string
  description: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

// 物品等级配置（类似结构）
interface ItemLevelConfig { ... }
```

---

### 11. 人像设计模块 (Portrait)

#### 请求类型

```typescript
// 创建人物角色
portrait.createCharacter(data: {
  projectId: string
  name: string
  gender: 'male' | 'female'
  age: number
  height: number               // cm
  weight: number               // kg
  race: 'asian' | 'european'
  description?: string         // 人物简介
  prompt?: string              // 生成提示词
  referenceImages?: string[]   // 参考图片
  providerId?: string          // AI 提供商
  modelId?: string             // 模型 ID
  config?: PortraitGenerateConfig
})

// 生成人像
portrait.generate(request: {
  characterId?: string         // 已有角色 ID
  prompt: string               // 描述提示词
  negativePrompt?: string
  referenceImages?: string[]
  providerId: string
  modelId: string
  config: {
    angles: ('front' | 'left' | 'right' | 'back')[]
    backgroundType?: 'solid' | 'transparent'
    backgroundColor?: string
    width?: number
    height?: number
    seed?: number
  }
})

// 换衣
portrait.changeClothes(request: {
  characterId: string
  variantId?: string           // 基于哪个变体
  clothesDescription: string
  angles: PortraitAngle[]
})

// 换背景
portrait.changeBackground(request: {
  characterId: string
  variantId?: string
  backgroundType: 'solid' | 'preset' | 'custom'
  backgroundColor?: string
  presetScene?: string         // 预设场景 ID
  customDescription?: string
  angles: PortraitAngle[]
})

// 编辑图片
portrait.editImage(request: {
  characterId: string
  variantId: string            // 要编辑的变体
  editPrompt: string           // 编辑提示词
})
```

#### 数据类型

```typescript
// 人物项目
interface PortraitProject {
  id: string
  name: string
  description?: string
  defaultProviderId?: string
  defaultModelId?: string
  createdAt: number
}

// 人物角色
interface PortraitCharacter {
  id: string
  projectId: string
  name: string
  gender: 'male' | 'female'
  age: number
  height: number
  weight: number
  race: 'asian' | 'european'
  description?: string
  prompt?: string
  referenceImages: string[]
  providerId?: string
  modelId?: string
  config: PortraitGenerateConfig
}

// 变体
interface PortraitVariant {
  id: string
  characterId: string
  type: 'base' | 'clothes' | 'background'
  parentId?: string
  angle: PortraitAngle
  imagePath: string
  prompt: string
  config: Record<string, any>
  variantInfo?: PortraitVariantInfo
}
```

---

### 12. 剧集制作模块 (StoryToVideo)

#### 项目管理

```typescript
// 创建项目
storyToVideo.createProject(
  name: string,
  longWritingProjectId?: string,  // 关联长文项目
  config?: VideoProjectConfig
)

// 绑定角色
storyToVideo.bindCharacter(
  projectId: string,
  longWritingCharacterId: string, // 长文角色 ID
  portraitId?: string,            // 人像 ID
  voiceConfig?: {                 // 声音配置
    voiceId: string
    speed: number
    pitch: number
  },
  generateConfig?: {...}          // 生成配置
)
```

#### 剧集管理

```typescript
// 创建剧集
storyToVideo.createEpisode(projectId: string, data: {
  sourceType: 'outline' | 'uploaded' // 内容来源
  outlineId?: string                 // 长文大纲 ID
  uploadedContent?: string           // 上传的长文内容
  episodeNumber: number              // 剧集序号
  title: string
  providerConfigId?: string          // AI 提供商
  modelId?: string                   // 模型
})
```

#### 数据类型

```typescript
// 视频项目配置
interface VideoProjectConfig {
  resolution: '1080p' | '720p' | '4k'
  aspectRatio: '16:9' | '9:16' | '1:1'
  fps: 24 | 30 | 60
  defaultNarratorVoice: string
  defaultCharacterVoice: string
  backgroundMusicEnabled: boolean
  backgroundMusicVolume: number     // 0-100
  scriptModel?: { providerConfigId, modelId }
  storyboardModel?: { providerConfigId, modelId }
  imageModel?: { providerConfigId, modelId }
  imageStyle: string                // 图像风格
  defaultShotDuration: number       // 默认分镜时长
}

// 剧本
interface EpisodeScript {
  id: string
  projectId: string
  episodeId: string
  status: 'pending' | 'generating' | 'reviewing' | 'approved'
  synopsis: string                  // 章节梗概
  scenes: SceneScript[]             // 场景列表
  totalDuration: number             // 预计时长（秒）
}

// 场景剧本
interface SceneScript {
  id: string
  episodeScriptId: string
  sceneNumber: number
  location: string                  // 地点名称
  locationType: 'interior' | 'exterior' | 'mixed'
  timeOfDay: 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'dawn' | 'dusk'
  weather?: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy' | 'stormy'
  sceneDescription: string          // 场景视觉描述
  mood: string                      // 氛围
  characters: SceneCharacter[]      // 出场角色
  originalText: string              // 原文片段
  narration: string                 // 旁白文本
  dialogues: Dialogue[]             // 对话列表
  actions: ActionDescription[]      // 动作描述
  createdAt: number
  updatedAt: number
}

// 分镜
interface Storyboard {
  id: string
  sceneScriptId: string
  shotNumber: number
  shotType: ShotType                // 景别
  cameraAngle: CameraAngle          // 角度
  cameraMovement: CameraMovement    // 运动
  frameDescription: string          // 画面描述
  characters: StoryboardCharacter[] // 角色
  duration: number                  // 时长（秒）
  transition: TransitionConfig      // 转场
  status: 'pending' | 'generating' | 'reviewing' | 'approved' | 'error'
  frameImage?: ImageAsset           // 帧画面图片
  videoPath?: string                // 生成的视频路径
}

// 景别类型
type ShotType =
  | 'extreme_long'  // 大远景
  | 'long'          // 远景
  | 'full'          // 全景
  | 'medium'        // 中景
  | 'medium_close'  // 中近景
  | 'close'         // 近景
  | 'extreme_close' // 特写
  | 'detail'        // 大特写

// 镜头运动
type CameraMovement =
  | 'static'        // 固定
  | 'pan_left'      // 左摇
  | 'pan_right'     // 右摇
  | 'tilt_up'       // 上仰
  | 'tilt_down'     // 下俯
  | 'dolly_in'      // 推镜
  | 'dolly_out'     // 拉镜
  | 'zoom_in'       // 变焦推进
  | 'zoom_out'      // 变焦拉远
  | 'crane_up'      // 升镜
  | 'crane_down'    // 降镜
  | 'handheld'      // 手持晃动
  | 'orbit'         // 环绕

// 角色绑定
interface CharacterBinding {
  id: string
  projectId: string
  longWritingCharacterId: string    // 长文角色 ID
  portraitId?: string               // 人像 ID
  voiceConfig: {
    voiceId: string                 // 声音 ID
    speed: number                   // 语速
    pitch: number                   // 音调
  }
  generateConfig?: {
    baseDescription: string         // 基础描述
    styleReference?: string         // 风格参考图
    additionalPrompts?: string      // 额外提示词
  }
  createdAt: number
  updatedAt: number
}

// 地点绑定
interface LocationBinding {
  id: string
  projectId: string
  longWritingLocationId: string
  locationName: string
  imagePaths: string[]              // 图片路径列表
  thumbnailPath?: string
  generateConfig?: {
    baseDescription: string
    timeOfDay?: TimeOfDay
    weather?: WeatherType
  }
  generateImages: boolean           // 是否自动生成图片
  createdAt: number
  updatedAt: number
}

// 物品绑定（类似结构）
interface ItemBinding { ... }

// 图像资产
interface ImageAsset {
  id: string
  type: 'generated' | 'uploaded'
  provider?: string
  model?: string
  prompt: string
  imagePath: string
  thumbnailPath?: string
  width: number
  height: number
  createdAt: number
}

// 音频资产
interface AudioAsset {
  id: string
  type: 'narration' | 'dialogue' | 'music' | 'sfx' | 'ambient'
  text?: string                     // 文本内容
  voiceId?: string                  // 声音 ID
  audioPath: string
  duration: number                  // 时长（毫秒）
  volume: number                    // 音量 0-100
  fadeIn?: number
  fadeOut?: number
  createdAt: number
}
```

---

### 13. 日记模块 (Diary)

#### 请求类型

```typescript
// 创建目录
diary.createFolder(data: {
  name: string
  parentId?: string            // 父目录 ID
})

// 创建日记
diary.createEntry(data: {
  folderId: string
  title?: string
  content?: string             // Markdown 内容
})

// 更新日记
diary.updateEntry(id: string, data: {
  title?: string
  content?: string
  tags?: string[]
})
```

#### 数据类型

```typescript
// 目录
interface DiaryFolder {
  id: string
  name: string
  parentId?: string
  path: string                 // 文件系统路径
  sortOrder: number
  childCount?: number
  entryCount?: number
}

// 日记条目
interface DiaryEntry {
  id: string
  folderId: string
  title: string
  content?: string             // Markdown
  filePath: string
  wordCount: number
  tags?: string[]
  frontmatter?: string         // YAML frontmatter
}

// 反向链接
interface BacklinkInfo {
  sourceEntryId: string
  sourceEntryTitle: string
  linkText?: string
  context?: string
}
```

---

### 14. OSS 图床模块 (OSS)

#### 请求类型

```typescript
// 创建配置
oss.createConfig(data: {
  name: string
  provider: 'aliyun' | 'volcengine'
  accessKeyId: string
  accessKeySecret: string      // 加密存储
  region: string               // oss-cn-hangzhou / cn-beijing
  bucket: string
  endpoint?: string
  customDomain?: string        // 自定义域名
  pathPrefix?: string          // 路径前缀
})

// 上传文件
oss.uploadFile(request: {
  configId?: string            // 指定配置，默认使用默认配置
  localPath: string            // 本地文件路径
  customPath?: string          // 自定义云存储路径
  fileName?: string            // 自定义文件名
})
```

#### 数据类型

```typescript
// OSS 配置
interface OSSConfig {
  id: string
  name: string
  provider: 'aliyun' | 'volcengine'
  accessKeyId: string
  accessKeySecret: string      // 加密
  region: string
  bucket: string
  endpoint?: string
  customDomain?: string
  pathPrefix?: string
  isEnabled: boolean
  isDefault: boolean
}

// 上传结果
interface OSSUploadResult {
  success: boolean
  url?: string                 // 公网 URL
  path?: string                // 云存储路径
  error?: string
}
```

---

### 15. 翻译模块 (Translation)

#### 请求类型

```typescript
// 文本翻译
translation.text(request: {
  text: string
  sourceLanguage: LanguageCode // 'auto' | 'zh' | 'en' | 'ja' | ...
  targetLanguage: LanguageCode
  providerId?: string
  modelId?: string
})

// 文件翻译
translation.file(request: {
  filePath: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  providerId?: string
  modelId?: string
})
```

#### 数据类型

```typescript
// 翻译记录
interface TranslationRecord {
  id: string
  type: 'text' | 'file'
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  sourceText?: string
  targetText?: string
  sourceFile?: string
  targetFile?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  favorite: boolean
  wordCount: number
}

// 支持的语言
type LanguageCode =
  | 'auto' | 'zh' | 'en' | 'ja' | 'ko'
  | 'fr' | 'de' | 'es' | 'ru' | 'pt'
  | 'it' | 'ar' | 'th' | 'vi'
```

---

### 16. 语音模块 (Voice)

#### 请求类型

```typescript
// 文本转语音
voice.tts(request: {
  text: string
  voiceId: string              // 发音人 ID
  language?: VoiceLanguageCode
  speed?: number               // 0.5 - 2.0
  pitch?: number               // -12 到 12
  volume?: number              // 0 - 100
  emotion?: string
  style?: string
  providerId?: string
  modelId?: string
})

// 语音转文本
voice.stt(request: {
  audioPath?: string           // 文件路径
  audioData?: string           // Base64 音频数据
  language?: VoiceLanguageCode
  providerId?: string
  modelId?: string
})

// 语音复刻
voice.clone(request: {
  name: string
  sampleAudioPath?: string
  sampleAudioData?: string     // Base64
  providerId?: string
})
```

#### 数据类型

```typescript
// 发音人
interface VoiceSpeaker {
  id: string
  name: string
  language: VoiceLanguageCode
  gender?: 'male' | 'female' | 'neutral'
  previewUrl?: string
  isCloned?: boolean
}

// 语音记录
interface VoiceRecord {
  id: string
  type: 'tts' | 'stt'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  inputText?: string           // TTS 输入
  outputAudioPath?: string     // TTS 输出
  inputAudioPath?: string      // STT 输入
  outputText?: string          // STT 输出
  voiceId?: string
  duration?: number            // 音频时长（毫秒）
  favorite: boolean
}

// 复刻声音
interface ClonedVoice {
  id: string
  name: string
  status: 'training' | 'ready' | 'failed'
  sampleAudioPath?: string
  voiceId?: string             // 服务商返回的声音 ID
  previewAudioPath?: string
}
```

---

## 流式通信与事件监听

### 事件监听机制

前端通过 `ipcRenderer.on` 监听主进程推送的事件。preload 脚本封装了便捷的监听方法，返回取消监听的函数：

```typescript
// 监听流式消息
const unsubscribe = chat.onStream((event, data) => {
  // 处理流式数据
  if (data.type === 'delta') {
    // 增量内容
  } else if (data.type === 'done') {
    // 完成
  }
})

// 取消监听
unsubscribe()
```

### 流式事件类型

| 事件通道 | 说明 | 数据类型 |
|----------|------|----------|
| `chat:stream` | 聊天流式响应 | `StreamEvent` |
| `longwriting:generate:${eventId}` | 长文 AI 生成 | `{ type, content, progress, error }` |
| `portrait:generation-event` | 人像生成事件 | `ImageGenerationEvent` |
| `stv:image-progress` | 剧集图像生成进度 | `{ sceneId, index, total }` |
| `stv:audio-progress` | 剧集音频生成进度 | `{ sceneId, type, index, total }` |
| `stv:storyboard-progress` | 分镜生成进度 | `{ sceneId, shotNumber, total, storyboard }` |
| `kb:document-progress` | 文档处理进度 | `{ documentId, progress, estimatedSeconds }` |
| `kb:document-status` | 文档状态变化 | `{ documentId, status, chunkCount, errorMessage }` |
| `translation:progress` | 翻译进度 | `{ translationId, progress }` |
| `translation:completed` | 翻译完成 | `{ translationId, targetFile }` |
| `voice:tts-completed` | TTS 完成 | `{ recordId, audioPath }` |
| `voice:stt-completed` | STT 完成 | `{ recordId, text }` |

### 配置变化事件

| 事件通道 | 说明 |
|----------|------|
| `provider-config:changed` | 提供商配置变化 |
| `search-engine:changed` | 搜索引擎配置变化 |

### 全局事件

| 事件通道 | 说明 | 数据类型 |
|----------|------|----------|
| `error:show` | 错误显示事件 | `{ error: string }` |
| `autosave:status` | 自动保存状态 | `{ id: string, status: string }` |
| `shortcut:triggered` | 快捷键触发 | `id: string` |

---

## 安全注意事项

### 1. 数据序列化

Electron IPC 使用结构化克隆算法，某些对象无法传递：

**禁止传递的类型**：
- 函数
- DOM 元素
- 循环引用对象
- Vue 响应式对象（Proxy）

**解决方案**：
```typescript
// 错误：直接传递 Vue 响应式对象
await window.electronAPI.dialog.update(dialogData)

// 正确：深拷贝或提取原始数据
await window.electronAPI.dialog.update(JSON.parse(JSON.stringify(dialogData)))
// 或手动提取
await window.electronAPI.dialog.update({
  id: dialogData.id,
  title: dialogData.title,
  // ...
})
```

### 2. 密钥安全

API 密钥在主进程加密存储，返回前端时隐藏：

```typescript
// 主进程返回配置时
const safeConfig = {
  ...config,
  apiKey: config.apiKey ? '******' : undefined,
  accessKeySecret: config.accessKeySecret ? '******' : undefined
}
```

前端更新时，如果值为 `'******'`，主进程不解密原值：
```typescript
if (data.apiKey !== '******') {
  // 更新密钥
} else {
  // 保持原密钥不变
}
```

### 3. contextBridge 安全暴露

预加载脚本通过 `contextBridge.exposeInMainWorld` 安全暴露 API，避免直接暴露 Node.js API：

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld('electronAPI', {
  // 只暴露特定方法，不暴露 ipcRenderer 原始对象
  dialog: {
    list: () => ipcRenderer.invoke('dialog:list'),
    // ...
  }
})
```

---

## 附录：类型定义文件索引

| 文件路径 | 模块 |
|----------|------|
| `src/shared/types/ipc.types.ts` | IPC 响应类型 |
| `src/shared/types/dialog.types.ts` | 对话类型 |
| `src/shared/types/message.types.ts` | 消息类型 |
| `src/shared/types/provider.types.ts` | 提供商类型（旧版） |
| `src/shared/types/provider-template.types.ts` | 提供商模板类型 |
| `src/shared/types/role.types.ts` | 角色类型 |
| `src/shared/types/settings.types.ts` | 设置类型 |
| `src/shared/types/image.types.ts` | 图像类型 |
| `src/shared/types/search-engine.types.ts` | 搜索引擎类型 |
| `src/shared/types/knowledge-base.types.ts` | 知识库类型 |
| `src/shared/types/longwriting.types.ts` | 长文写作类型 |
| `src/shared/types/portrait.types.ts` | 人像设计类型 |
| `src/shared/types/story-to-video.types.ts` | 剧集制作类型 |
| `src/shared/types/diary.types.ts` | 日记类型 |
| `src/shared/types/oss.types.ts` | OSS 类型 |
| `src/shared/types/translation.types.ts` | 翻译类型 |
| `src/shared/types/voice.types.ts` | 语音类型 |

---

**文档版本**: v1.1.0  
**最后更新**: 2026-04-25  
**维护者**: Claude Code