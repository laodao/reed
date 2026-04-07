# 长文写作业务逻辑分析与改进方案

## 日期：2026-04-06

## 一、现状分析

### 1.1 实体处理逻辑

#### 当前流程
```
大纲生成 → 实体识别(匹配已有实体) → 章节生成 → 实体识别(匹配已有实体) → 记忆提取
```

#### 问题发现
**问题1：新实体不会自动添加**

当 AI 生成大纲或章节时，如果内容中出现了项目中不存在的新角色、新地点或新物品：
- `recognizeChapterEntities` 方法只会匹配**已存在**的实体
- 新实体不会被识别，也不会自动添加到项目的角色/地点/物品列表中
- 这导致后续章节中引用这些实体时无法正确关联

**示例场景**：
- 用户设定了3个角色：主角A、配角B、配角C
- 第1章生成时，AI引入了新角色"路人D"
- "路人D"不会被添加到角色列表
- 第2章再次提到"路人D"时，无法正确关联

### 1.2 视频制作绑定机制

#### 当前实现
- 只有 `CharacterBinding` 接口，用于角色图片绑定
- 没有 `LocationBinding` 和 `ItemBinding`
- 地点和物品的图片生成逻辑未完善

#### 问题影响
- 视频制作时无法为地点和物品生成专属图片
- 分镜画面中只能显示角色图片

### 1.3 实体识别匹配范围

#### 当前逻辑
```typescript
// 只在项目已有实体中匹配
const characters = this.db.lwCharacters.getByProjectId(projectId)
const locations = this.db.lwLocations.getByProjectId(projectId)
const items = this.db.lwItems.getByProjectId(projectId)
```

#### 问题
- 无法识别"临时实体"（如路人、过客）
- 无法区分重要实体和临时实体
- 实体名称变更后无法自动关联历史记录

---

## 二、改进方案

### 2.1 新实体自动识别与添加（高优先级）

#### 设计方案
```typescript
interface NewEntityDetectionResult {
  newCharacters: Array<{ name: string; description: string; importance: 'main' | 'secondary' | 'temporary' }>
  newLocations: Array<{ name: string; description: string }>
  newItems: Array<{ name: string; description: string }>
}
```

#### 实现步骤
1. **扩展实体识别服务**
   - 在 `recognizeChapterEntities` 中添加新实体检测逻辑
   - 通过 AI 分析文本，提取所有实体（包括已有和新的）

2. **实体重要性分类**
   - `main`：主要角色，需要完整形象设定
   - `secondary`：次要角色，需要基本形象
   - `temporary`：临时角色，使用通用形象或简单描述

3. **自动添加流程**
   ```
   检测新实体 → AI分类重要性 → 用户确认(可选) → 自动添加到项目实体列表
   ```

4. **用户交互**
   - 提供开关：自动添加 / 手动确认
   - 对于`main`级别实体，建议用户确认后添加
   - 对于`temporary`实体，可自动添加并标记

### 2.2 LocationBinding 和 ItemBinding（中优先级）✅ 已完成

#### 设计方案
```typescript
interface LocationBinding {
  locationId: string
  locationName: string
  imagePaths: string[]        // 地点图片（可多张）
  promptTemplate: string      // 图片生成提示词模板
  generateImages: boolean     // 是否生成专属图片
}

interface ItemBinding {
  itemId: string
  itemName: string
  imagePaths: string[]        // 物品图片
  promptTemplate: string
  generateImages: boolean
}
```

#### 已完成内容
1. **类型定义** (`src/shared/types/story-to-video.types.ts`)
   - 添加 `LocationBinding` 接口
   - 添加 `ItemBinding` 接口
   - 添加数据库记录类型 `LocationBindingRecord` 和 `ItemBindingRecord`

2. **数据库表** (`src/main/database/index.ts`)
   - 创建 `location_bindings` 表
   - 创建 `item_bindings` 表

3. **Repository 层**
   - `src/main/database/repositories/location-binding.repository.ts` - 地点绑定仓库
   - `src/main/database/repositories/item-binding.repository.ts` - 物品绑定仓库

4. **服务层更新** (`src/main/services/story-to-video-resource.service.ts`)
   - 更新 `buildImagePrompt` 方法支持地点描述
   - 更新 `generateStoryboardImage` 方法签名
   - 添加 `autoCreateLocationBindings` 方法
   - 添加 `autoCreateItemBindings` 方法
   - 添加地点/物品绑定管理方法

### 2.3 完善临时实体支持（低优先级）

#### 设计方案
- 为临时实体创建简化版设定
- 使用通用模板生成图片
- 不影响主要故事线追踪

---

## 三、数据结构改进

### 3.1 实体重要性字段

```sql
-- 角色表添加重要性字段
ALTER TABLE lw_story_characters ADD COLUMN importance TEXT DEFAULT 'secondary';
-- 可选值: 'main', 'secondary', 'temporary'

-- 地点表添加重要性字段
ALTER TABLE lw_story_locations ADD COLUMN importance TEXT DEFAULT 'normal';
-- 可选值: 'main', 'secondary', 'temporary'

-- 物品表添加重要性字段
ALTER TABLE lw_story_items ADD COLUMN importance TEXT DEFAULT 'normal';
```

### 3.2 视频绑定表扩展

```sql
-- 地点绑定表
CREATE TABLE lw_video_location_bindings (
  id TEXT PRIMARY KEY,
  video_project_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  location_name TEXT NOT NULL,
  image_paths TEXT DEFAULT '[]',
  prompt_template TEXT,
  generate_images INTEGER DEFAULT 0,
  created_at INTEGER,
  FOREIGN KEY (video_project_id) REFERENCES lw_video_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES lw_story_locations(id) ON DELETE SET NULL
);

-- 物品绑定表
CREATE TABLE lw_video_item_bindings (
  id TEXT PRIMARY KEY,
  video_project_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  image_paths TEXT DEFAULT '[]',
  prompt_template TEXT,
  generate_images INTEGER DEFAULT 0,
  created_at INTEGER,
  FOREIGN KEY (video_project_id) REFERENCES lw_video_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES lw_story_items(id) ON DELETE SET NULL
);
```

---

## 四、实施优先级

| 优先级 | 任务 | 预估工作量 | 依赖关系 | 状态 |
|--------|------|------------|----------|------|
| 高 | 新实体自动识别与添加 | 中 | 无 | ✅ 已完成 |
| 高 | 实体重要性分类 | 小 | 新实体识别 | ✅ 已完成 |
| 中 | LocationBinding 实现 | 中 | 无 | ✅ 已完成 |
| 中 | ItemBinding 实现 | 中 | 无 | ✅ 已完成 |
| 低 | 临时实体图片模板 | 小 | 实体重要性分类 | ✅ 已完成 |

---

## 五、技术实现要点

### 5.1 新实体检测服务

```typescript
// src/main/services/lw-entity-detection.service.ts
export class LwEntityDetectionService {
  /**
   * 检测文本中的新实体
   * @param projectId 项目ID
   * @param text 章节文本或大纲文本
   */
  async detectNewEntities(projectId: string, text: string): Promise<NewEntityDetectionResult> {
    // 1. 获取项目已有实体
    const existingCharacters = this.db.lwCharacters.getByProjectId(projectId)
    const existingLocations = this.db.lwLocations.getByProjectId(projectId)
    const existingItems = this.db.lwItems.getByProjectId(projectId)

    // 2. AI分析文本，提取所有实体
    const allEntities = await this.aiExtractEntities(text)

    // 3. 过滤出新实体
    const newCharacters = allEntities.characters.filter(
      c => !existingCharacters.some(ec => ec.name === c.name)
    )

    // ... 同理处理地点和物品

    return { newCharacters, newLocations, newItems }
  }
}
```

### 5.2 实体重要性判断

```typescript
/**
 * AI判断实体重要性
 */
async classifyEntityImportance(
  entityName: string,
  entityDescription: string,
  storyContext: string
): Promise<'main' | 'secondary' | 'temporary'> {
  // 通过AI分析：
  // - 出现频率
  // - 对剧情的影响程度
  // - 是否有对话/动作
  // - 是否在多个章节出现
}
```

---

## 六、用户界面设计

### 6.1 新实体确认对话框

当检测到新实体时，弹出确认界面：
- 显示实体名称、描述、建议重要性
- 用户可选择：添加、忽略、修改重要性
- 批量处理多个新实体

### 6.2 实体重要性标记

在角色/地点/物品编辑界面：
- 添加重要性下拉选择
- 主角显示特殊图标
- 临时实体使用不同样式

---

## 七、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| AI误判实体重要性 | 提供用户手动调整选项 |
| 过多临时实体干扰 | 过滤显示，仅显示重要实体 |
| 名称歧义 | 提供实体名称规范化建议 |

---

## 八、后续迭代方向

1. 实体别名支持（同一实体多个称呼）
2. 实体关系图谱可视化
3. 实体图片风格一致性保证
4. 跨项目实体复用