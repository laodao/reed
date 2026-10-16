# 章节预写与故事记忆系统设计文档

## 1. 背景与目标

### 1.1 问题背景

在长篇小说创作过程中，存在以下痛点：

1. **预写内容易丢失**：用户使用 AI 生成预写提纲后，如果不立即生成正文，预写内容无法保存
2. **情节一致性问题**：随着章节增多，AI 容易写出与前文相悖的内容（如已死亡的角色再次出现、忘记已建立的人物关系等）
3. **关键信息分散**：重要的情节发展、角色成长、势力变化等信息缺乏系统化的记录和管理
4. **状态追踪困难**：无法快速了解"某角色在第N章时是什么状态"，难以防止状态矛盾（如已死角色再次出场、已学会的技能又重新学习）

### 1.2 设计目标

1. **预写持久化**：预写内容可随时保存到数据库，支持编辑修改
2. **事件记录**：预写确认后，AI 自动提取关键事件保存为"记忆"
3. **状态快照**：章节正文完成后，AI 生成/更新各实体的状态快照
4. **按需注入**：后续章节生成时，提取该章节涉及实体的最新状态作为上下文

### 1.3 核心概念

**双层记忆结构**：

```
┌─────────────────────────────────────────────────────────────┐
│                      记忆系统架构                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  事件层 (lw_story_memories)                                 │
│  ├── 记录"发生了什么"                                       │
│  ├── 第3章：林风练成神功                                     │
│  ├── 第5章：林风获得古剑                                     │
│  └── 用于追溯事件历史                                       │
│                                                             │
│  状态层 (lw_entity_state_snapshots)                         │
│  ├── 记录"当前是什么状态"                                   │
│  ├── 每章节完成时，更新涉及实体的状态                       │
│  ├── 林风@第5章：神功第四层，持有古剑，与苏瑶是师姐弟...    │
│  └── 用于防止状态矛盾、生成上下文注入                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**状态快照原则**：
- **最新而非累积**：状态只记录最新结果，如"已死亡"而非"第2章受伤，第3章死亡"
- **实体级别**：每条记录对应一个实体在某章节的状态
- **增量更新**：只更新本章节涉及的实体，其他实体状态不变则不新增记录
- **可回溯**：每个章节结束都有状态快照，可查询"第N章时某实体的状态"

## 2. 功能概述

### 2.1 核心功能

```
┌─────────────────────────────────────────────────────────────┐
│                      章节写作流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │ 生成预写 │───▶│ 编辑预写 │───▶│ 确认预写 │───▶│ 生成正文 │  │
│  └─────────┘    └─────────┘    └────┬────┘    └────┬────┘  │
│                                      │              │      │
│                                      ▼              ▼      │
│                               ┌─────────────┐ ┌─────────┐  │
│                               │ AI提取事件  │ │正文确认 │  │
│                               │ (记忆层)    │ └────┬────┘  │
│                               └──────┬──────┘      │      │
│                                      │             ▼      │
│                                      │      ┌─────────────┐│
│                                      │      │ AI更新状态  ││
│                                      │      │ (状态层)    ││
│                                      │      └──────┬──────┘│
│                                      ▼             ▼      │
│                               ┌─────────────────────────┐ │
│                               │     双层记忆存储        │ │
│                               │  ├─ 事件记忆表         │ │
│                               │  └─ 状态快照表         │ │
│                               └─────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 记忆类型（事件层）

| 类型 | 说明 | 示例 |
|------|------|------|
| `character_event` | 角色事件 | 主角练成神功、配角死亡 |
| `location_event` | 地点事件 | 发现秘境、城池陷落 |
| `item_event` | 物品事件 | 获得神器、丢失秘籍 |
| `relationship_change` | 关系变化 | 结为夫妻、反目成仇 |
| `faction_event` | 势力事件 | 帮派易主、势力覆灭 |
| `skill_event` | 技能事件 | 新技能出现、技能传承 |
| `general` | 一般事件 | 其他重要情节 |

### 2.3 实体类型（状态层）

| 类型 | 说明 | 状态示例 |
|------|------|----------|
| `character` | 角色 | 存活/死亡、当前位置、持有物品、掌握技能、人际关系 |
| `location` | 地点 | 状态（正常/毁坏/发现）、归属势力、重要事件 |
| `item` | 物品 | 持有者、状态（完好/损坏/丢失）、位置 |
| `faction` | 势力 | 领导者、状态（兴盛/衰落/覆灭）、控制区域 |
| `skill` | 技能 | 掌握者列表、传承情况、等级分布 |

### 2.4 重要程度

| 等级 | 说明 | 示例 |
|------|------|------|
| `critical` | 关键 | 主角突破、重要角色死亡、势力覆灭 |
| `normal` | 重要 | 学到新技能、结交盟友、获得重要物品 |
| `minor` | 次要 | 日常互动、小冲突 |

## 3. 数据库设计

### 3.1 预写表 `lw_chapter_prewrites`

```sql
CREATE TABLE IF NOT EXISTS lw_chapter_prewrites (
  id TEXT PRIMARY KEY,
  outline_id TEXT NOT NULL UNIQUE,  -- 关联大纲节点，一对一
  content TEXT,                      -- 预写内容
  is_confirmed INTEGER DEFAULT 0,    -- 是否已确认
  confirmed_at INTEGER,              -- 确认时间
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (outline_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE
)
```

**设计说明**：
- `outline_id` 与大纲节点一对一关联，确保每个章节只有一份预写
- `is_confirmed` 标记预写是否已确认，确认后可提取记忆

### 3.2 事件记忆表 `lw_story_memories`

```sql
CREATE TABLE IF NOT EXISTS lw_story_memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_outline_id TEXT,            -- 来源章节（大纲ID）
  memory_type TEXT NOT NULL,         -- 记忆类型
  title TEXT NOT NULL,               -- 记忆标题
  description TEXT,                  -- 详细描述
  involved_entities TEXT,            -- 涉及实体 JSON
  chapter_number INTEGER,            -- 章节序号
  importance TEXT DEFAULT 'normal',  -- 重要程度
  is_active INTEGER DEFAULT 1,       -- 是否生效
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_outline_id) REFERENCES lw_story_outlines(id) ON DELETE SET NULL
)
```

**设计说明**：
- `source_outline_id` 记录记忆来源，支持追溯
- `chapter_number` 用于过滤章节之前的记忆
- `involved_entities` 存储 JSON 数组，关联涉及的实体
- `is_active` 支持临时禁用某些记忆

### 3.3 实体状态快照表 `lw_entity_state_snapshots`

```sql
CREATE TABLE IF NOT EXISTS lw_entity_state_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,         -- 实体类型：character/location/item/faction/skill
  entity_id TEXT NOT NULL,           -- 实体ID（关联对应设定表）
  entity_name TEXT NOT NULL,         -- 实体名称（用于显示和搜索）
  chapter_number INTEGER NOT NULL,   -- 章节序号（该章节完成时的状态）
  state_summary TEXT NOT NULL,       -- 状态摘要（自然语言描述）
  key_changes TEXT,                  -- 本章节的关键变化（JSON数组）
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES lw_story_characters(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES lw_story_locations(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES lw_story_items(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES lw_story_factions(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES lw_story_skills(id) ON DELETE CASCADE
)
```

**设计说明**：
- `entity_type` + `entity_id` 定位具体实体
- `chapter_number` 标识快照时间点
- `state_summary` 是核心字段，存储实体在该章节结束时的完整状态描述
- `key_changes` 记录本章节导致的变化（便于追溯）
- 同一实体的状态采用增量更新：只在本章节涉及该实体时才新增记录

**状态摘要示例**：
```
角色"林风"在第5章的状态摘要：
"青云宗弟子，修炼《天元神功》至第四层，持有古剑'断月'，
与苏瑶是师姐弟关系，与长老王明是师徒关系，
当前位于青云宗后山，状态：正常"

地点"青云宗后山禁地"在第3章的状态摘要：
"发现于第2章，内有失传秘籍《天元神功》，
已被林风探索，秘籍已取出，当前状态：半开放"

物品"古剑断月"在第5章的状态摘要：
"上古神剑，品级：传说，持有者：林风，
于第5章在禁地深处发现，状态：完好"
```

### 3.4 索引设计

```sql
CREATE INDEX idx_lw_chapter_prewrites_outline ON lw_chapter_prewrites(outline_id)
CREATE INDEX idx_lw_story_memories_project ON lw_story_memories(project_id)
CREATE INDEX idx_lw_story_memories_chapter ON lw_story_memories(chapter_number)

-- 状态快照索引
CREATE INDEX idx_lw_entity_snapshots_project ON lw_entity_state_snapshots(project_id)
CREATE INDEX idx_lw_entity_snapshots_entity ON lw_entity_state_snapshots(entity_type, entity_id)
CREATE INDEX idx_lw_entity_snapshots_chapter ON lw_entity_state_snapshots(project_id, chapter_number)
CREATE UNIQUE INDEX idx_lw_entity_snapshots_unique ON lw_entity_state_snapshots(project_id, entity_type, entity_id, chapter_number)
```

## 4. 核心流程

### 4.1 预写流程

```
用户选择章节
     │
     ▼
加载已保存的预写 ──▶ 有预写：显示内容
     │                │
     │                └──▶ 无预写：显示空编辑区
     │
     ▼
用户编辑/生成预写
     │
     ▼
保存预写到数据库
     │
     ▼
用户确认预写
     │
     ▼
AI 提取事件记忆
     │
     ▼
用户编辑/确认事件记忆
     │
     ▼
保存事件记忆到数据库
```

### 4.2 章节正文完成流程（新增）

```
章节正文生成完成
     │
     ▼
用户确认正文内容
     │
     ▼
AI 分析本章节对各实体的状态影响
     │
     ▼
生成/更新实体状态快照
     │
     ├─▶ 获取本章节涉及的实体列表（角色、地点、物品、势力、技能）
     │
     ├─▶ 获取每个实体的上一章节状态（如果存在）
     │
     ├─▶ AI 生成新的状态摘要
     │
     ▼
保存状态快照到数据库（增量更新）
```

### 4.3 章节生成流程（更新）

```
用户点击生成章节
     │
     ▼
计算当前章节序号
     │
     ▼
获取本章节涉及的实体列表（从大纲设定）
     │
     ▼
查询这些实体在上一章节的状态快照
     │
     ▼
构建实体状态上下文
     │
     ▼
获取预写内容（如果有）
     │
     ▼
获取上一章节的事件记忆（可选，用于补充细节）
     │
     ▼
组合 Prompt 发送给 AI
     │
     ▼
生成章节内容
```

### 4.4 状态快照查询示例

```
查询"林风"在第5章时的状态：
  SELECT * FROM lw_entity_state_snapshots
  WHERE entity_type = 'character'
    AND entity_id = 'char_001'
    AND chapter_number <= 5
  ORDER BY chapter_number DESC LIMIT 1

结果：返回第5章或之前最近的状态快照
```

### 4.5 状态快照数据流

```
章节1完成 → 无状态快照（初始状态从设定表获取）
章节2完成 → 林风状态：入门青云宗，修炼天元神功第一层
章节3完成 → 林风状态：神功第二层，发现禁地
章节4完成 → （林风未涉及，不更新）
章节5完成 → 林风状态：神功第四层，获得古剑，与苏瑶师姐弟

生成第6章时：
  检测涉及实体：林风、苏瑶、青云宗长老
  提取状态：
    - 林风@第5章：神功第四层，持有古剑...
    - 苏瑶@第5章：（无记录，从设定表获取初始状态）
    - 青云宗长老@第3章：正常状态...
```

## 5. API 设计

### 5.1 预写相关 API

| 通道 | 说明 | 参数 |
|------|------|------|
| `longwriting:getPrewrite` | 获取预写 | `outlineId` |
| `longwriting:savePrewrite` | 保存预写 | `{ outlineId, content }` |
| `longwriting:confirmPrewrite` | 确认预写 | `outlineId` |
| `longwriting:deletePrewrite` | 删除预写 | `outlineId` |

### 5.2 事件记忆相关 API

| 通道 | 说明 | 参数 |
|------|------|------|
| `longwriting:getMemories` | 获取项目记忆 | `projectId` |
| `longwriting:getMemoriesBeforeChapter` | 获取章节前记忆 | `projectId, chapterNumber` |
| `longwriting:createMemory` | 创建记忆 | `CreateMemoryRequest` |
| `longwriting:batchCreateMemories` | 批量创建记忆 | `CreateMemoryRequest[]` |
| `longwriting:updateMemory` | 更新记忆 | `id, UpdateMemoryRequest` |
| `longwriting:deleteMemory` | 删除记忆 | `id` |
| `longwriting:toggleMemoryActive` | 切换记忆状态 | `id` |
| `longwriting:getMemoryStats` | 获取记忆统计 | `projectId` |

### 5.3 状态快照相关 API（新增）

| 通道 | 说明 | 参数 |
|------|------|------|
| `longwriting:getEntityStateSnapshots` | 获取项目所有状态快照 | `projectId` |
| `longwriting:getEntityStateAtChapter` | 获取实体在指定章节的状态 | `projectId, entityType, entityId, chapterNumber` |
| `longwriting:getEntitiesStatesForChapter` | 获取指定章节涉及实体的状态 | `projectId, chapterNumber, entityIds[]` |
| `longwriting:createEntityStateSnapshot` | 创建状态快照 | `CreateEntityStateSnapshotRequest` |
| `longwriting:batchCreateEntityStateSnapshots` | 批量创建状态快照 | `CreateEntityStateSnapshotRequest[]` |
| `longwriting:updateEntityStateSnapshot` | 更新状态快照 | `id, UpdateEntityStateSnapshotRequest` |
| `longwriting:deleteEntityStateSnapshot` | 删除状态快照 | `id` |
| `longwriting:getSnapshotStats` | 获取快照统计 | `projectId` |

### 5.4 AI 相关 API

| 通道 | 说明 | 参数 |
|------|------|------|
| `longwriting:extractMemories` | AI 提取事件记忆 | `projectId, outlineId, prewriteContent, chapterNumber, providerConfigId?, modelId?` |
| `longwriting:extractEntityStates` | AI 提取实体状态（新增） | `projectId, outlineId, chapterContent, chapterNumber, involvedEntities[], providerConfigId?, modelId?` |

## 6. 前端交互设计

### 6.1 预写编辑区

```
┌─────────────────────────────────────────────────────────┐
│ AI 预写提纲                           [已确认] [清除]  │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │                                                     │ │
│ │  [可编辑的文本区域]                                 │ │
│ │                                                     │ │
│ │  1. 时间：故事发生的第二天清晨...                   │ │
│ │  2. 地点：青云宗后山禁地...                         │ │
│ │  3. 人物：主角林风、宗门长老...                     │ │
│ │  ...                                                │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ ℹ️ 已加载 5 条相关记忆                                  │
└─────────────────────────────────────────────────────────┘
```

### 6.2 记忆确认对话框

```
┌─────────────────────────────────────────────────────────┐
│ 确认记忆                                                │
├─────────────────────────────────────────────────────────┤
│ 以下是从预写内容中提取的关键记忆，请确认是否保存：       │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [重要▼]  [角色事件▼]                                │ │
│ │ 林风练成神功                                         │ │
│ │ 林风在后山禁地发现失传秘籍，修炼七七四十九天后...    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [次要▼]  [关系变化▼]                                │ │
│ │ 林风与苏瑶结为师姐弟                                 │ │
│ │ 苏瑶在林风修炼期间指导其心法，两人建立深厚情谊...    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│                           [取消]  [保存记忆]            │
└─────────────────────────────────────────────────────────┘
```

## 7. AI Prompt 设计

### 7.1 事件记忆提取 Prompt

```
你是一位专业的小说创作顾问。请从章节预写内容中提取关键事件记忆信息。

你的回复必须是纯 JSON 数组格式，每条记忆包含以下字段：
- memoryType: 记忆类型，可选值：
  - character_event（角色事件：角色的重要经历、成长、变化）
  - location_event（地点事件：地点的重要变化、发现）
  - item_event（物品事件：物品的获得、失去、变化）
  - relationship_change（关系变化：角色间关系的建立、改变、破裂）
  - faction_event（势力事件：势力的兴衰、更替、冲突）
  - skill_event（技能事件：技能的出现、传承、变化）
  - general（一般事件：其他重要情节）
- title: 简短标题（10-20字）
- description: 详细描述（50-100字）
- involvedEntities: 涉及的实体数组 [{type, id, name}]
- importance: 重要程度（critical/normal/minor）

提取原则：
1. 只提取有长期影响的信息，不要提取临时性的对话或场景描写
2. 重点关注：角色成长、关系变化、物品得失、势力变动、重要发现
3. 每个事件独立成条，避免重复
4. 如果预写内容中没有值得记录的事件，返回空数组
```

### 7.2 实体状态提取 Prompt（新增）

```
你是一位专业的小说创作顾问。请分析章节正文内容，提取涉及实体的最新状态。

## 实体类型说明
- character（角色）：存活状态、当前位置、掌握技能、持有物品、人际关系、身体状态
- location（地点）：状态（正常/毁坏/发现中）、归属势力、重要特征变化
- item（物品）：持有者、状态（完好/损坏/丢失）、当前位置
- faction（势力）：领导者、状态（兴盛/衰落/覆灭）、控制区域变化
- skill（技能）：掌握者列表、传承情况、等级分布

## 你的任务
分析以下章节内容，为涉及的实体生成/更新状态摘要。

## 输入信息
【章节内容】
{chapterContent}

【涉及的实体】
{involvedEntities}

【实体上一章节状态（如有）】
{previousStates}

## 输出格式
返回 JSON 数组，每个实体一条记录：
{
  "entityType": "character/location/item/faction/skill",
  "entityId": "实体ID",
  "entityName": "实体名称",
  "stateSummary": "完整的状态摘要描述（100-200字，包含所有关键状态信息）",
  "keyChanges": ["本章节导致的关键变化列表"]
}

## 状态摘要原则
1. 状态是"最新结果"，不是"过程描述"——如"已死亡"而非"第2章受伤，第3章死亡"
2. 状态摘要应完整，包含该实体当前所有关键信息
3. 如果实体在本章节无变化，但有上一状态，则继承上一状态并补充新变化
4. 如果实体首次出现且无上一状态，从章节内容和设定信息推断初始状态
5. keyChanges 只记录本章节新增的变化，便于追溯
```

### 7.3 章节生成上下文注入（更新）

```
【重要：实体状态一致性】请确保以下实体状态在写作中保持一致：

【角色状态】
- 林风：青云宗弟子，修炼《天元神功》至第四层，持有古剑'断月'，与苏瑶是师姐弟关系，当前位于青云宗后山，状态：正常
- 苏瑶：青云宗师姐，修炼《青云剑法》至精通，性格温柔，与林风关系亲密

【地点状态】
- 青云宗后山禁地：发现于第2章，秘籍已取出，当前状态：半开放

【物品状态】
- 古剑断月：上古神剑，持有者：林风，状态：完好

【势力状态】
- 青云宗：兴盛状态，掌门：李道真，主要势力区域：青云山脉

【技能状态】
- 天元神功：修炼者：林风（第四层），传承来源：禁地秘籍

【注意事项】
1. 已死亡的角色不能再出现
2. 已学会的技能不能再"初学"
3. 已获得的物品不能再"首次获得"
4. 已建立的关系不能忽略
5. 状态变化需要合乎逻辑
```

## 8. 技术细节

### 8.1 数据序列化

**问题**：Electron IPC 通信使用结构化克隆算法，Vue 响应式对象无法被克隆。

**解决方案**：在 IPC 调用前使用 `JSON.parse(JSON.stringify(data))` 序列化数据。

```typescript
// 错误：直接传递 Vue 响应式对象
const result = await window.electronAPI.batchCreateMemories(extractedMemories.value)

// 正确：序列化后再传递
const result = await window.electronAPI.batchCreateMemories(
  JSON.parse(JSON.stringify(extractedMemories.value))
)
```

### 8.2 记忆数据验证

AI 返回的记忆数据可能存在格式问题，需要验证：

```typescript
const validatedMemories = memories.map(m => ({
  memoryType: validTypes.includes(m.memoryType) ? m.memoryType : 'general',
  importance: validImportances.includes(m.importance) ? m.importance : 'normal',
  title: m.title || '未命名事件',
  description: m.description || '',
  involvedEntities: Array.isArray(m.involvedEntities) ? m.involvedEntities : []
}))
```

### 8.3 章节序号计算

为了获取章节之前的记忆，需要计算章节序号：

```typescript
function calculateChapterNumber(outlineId: string): number {
  let count = 0
  for (const node of outlineNodes) {
    if (node.nodeType === 'chapter' || node.nodeType === 'section') {
      count++
    }
    if (node.id === outlineId) {
      return count
    }
  }
  return count || 1
}
```

## 9. 扩展规划

### 9.1 短期优化

- [ ] 记忆管理面板：支持查看、编辑、删除所有记忆
- [ ] 记忆标签：支持自定义标签分类
- [ ] 记忆搜索：按实体、类型、时间范围搜索
- [ ] 状态快照可视化：展示实体状态随章节变化的时间线

### 9.2 长期规划

- [ ] 状态快照对比：对比同一实体在不同章节的状态变化
- [ ] 记忆关联图谱：可视化展示角色、地点、物品之间的关系
- [ ] 智能记忆推荐：根据章节内容自动推荐相关记忆
- [ ] 记忆冲突检测：自动检测前后矛盾的情节
- [ ] 知识图谱升级：如需复杂关系推理，考虑升级到知识图谱系统

## 10. 更新记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-04-03 | 1.0.0 | 初始版本，实现预写持久化和事件记忆提取功能 |
| 2026-04-03 | 1.1.0 | 新增实体状态快照系统，双层记忆结构，章节完成时更新状态 |