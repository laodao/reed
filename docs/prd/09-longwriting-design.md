# 长文写作功能 PRD 2.0

## 文档信息

| 项目 | 内容 |
|------|------|
| 版本 | v2.0 |
| 创建日期 | 2026-03-28 |
| 更新日期 | 2026-04-07 |
| 作者 | AI Assistant |

### 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0 | 2026-03-28 | 初始版本，完成需求确认 |
| v2.0 | 2026-04-07 | 完善已实现功能描述，增加故事情节阶段，增加临时实体模板功能，数据库重构说明 |

---

## 1. 功能概述

长文写作是一个基于 AI 的创作辅助系统，支持故事类和评论类两种长文创作模式。用户通过分阶段设计，与 AI 协作完成高质量长文内容。

### 1.1 核心价值

- **结构化创作**：分阶段设计，从概要到章节，层次清晰
- **AI 协作**：每个阶段可与 AI 对话讨论，逐步完善设计
- **角色一致性**：通过 @ 引用机制，确保角色在全文中行为一致
- **人像联动**：角色可关联人像设计的人物形象，视觉呈现完整
- **版本管理**：保留内容历史版本，支持回退和对比
- **设定集预览**：可视化预览所有设定，一键导出
- **临时实体模板**：为临时角色/地点自动匹配形象模板，保证视频一致性

### 1.2 目标用户

- 小说创作者：网络小说、武侠仙侠、科幻悬疑等
- 剧本创作者：影视剧、游戏剧本
- 评论作者：深度评论、学术论文、行业分析
- 内容运营：公众号长文、专题策划
- 视频创作者：AI 视频生成内容创作

### 1.3 创作类型

| 类型 | 适用场景 | 流程复杂度 |
|------|----------|------------|
| 故事类 | 小说、剧本、故事创作 | 6 阶段 |
| 评论类 | 深度评论、分析文章 | 3 阶段 |

---

## 2. 故事类长文写作

### 2.1 创作流程概览

```
阶段一：故事概要设计
    ↓ 输入核心构思，保存表单后 AI 生成故事概要（含关键角色/主要场景）
阶段二：故事情节设计（新增）
    ↓ AI 生成故事情节线，用户调整
阶段三：时代背景与地点设定
    ↓ 与 AI 讨论，确定世界观
阶段四：角色设定
    ↓ 创建角色，关联人像形象，临时角色自动匹配模板
阶段五：技能与物品设定（可选）
    ↓ 武侠仙侠类设定武功法术等
阶段六：大纲与章节
    ↓ 生成大纲，逐章节写作
完成 → 导出成品 / 视频化
```

---

### 2.2 阶段一：故事概要设计

#### FR-LONGWRITING-001 故事概要生成

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：用户输入核心故事构思，保存表单后 AI 生成完整的故事概要

**输入内容**：
- 故事类型选择：武侠、仙侠、玄幻、科幻、悬疑、都市、言情、历史等
- 故事标题（可选）：用户可预设或由 AI 生成建议
- 核心故事构思（必填）：用户对故事的初步设想
- 故事风格（可选）：轻松/沉重、热血/冷峻、通俗/文学等
- 目标读者（可选）：年龄段、阅读偏好
- 字数预估（可选）：短篇/中篇/长篇
- 其他要求（可选）：特殊限制、参考作品等

**输出内容**：
- 故事标题建议（2-3 个选项）
- 故事概要（200-300 字）：包含故事的主要脉络和结局走向
- 核心冲突（100-150 字）：故事的主要矛盾和冲突
- **关键角色**（3-5 个）：
  - 角色名称
  - 角色定位（主角/配角/反派等）
  - 简要描述
  - 重要性（主要/次要/边缘）
- **主要场景**（2-4 个）：
  - 场景名称
  - 场景类型
  - 简要描述
  - 重要性
- 预估章节数

**核心逻辑**：
- 故事概要中的关键角色和主要场景将作为后续生成角色设定、技能设定、物品设定、故事情节的依据
- 用户可编辑所有生成内容

**交互流程**：
1. 用户填写表单内容
2. 用户点击"保存表单"按钮
3. 保存成功后，"生成概要"按钮变为可用
4. 用户点击"生成概要"，AI 生成内容
5. 生成结果可编辑
6. 用户确认后保存概要

**验收标准**：
- [x] 支持选择故事类型（8 种预设类型）
- [x] 支持输入核心构思（1-2000 字符）
- [x] 表单保存功能，保存后才可生成概要
- [x] AI 生成故事概要，包含标题建议、概要正文、核心冲突、关键角色、主要场景
- [x] 所有生成内容可编辑
- [x] 支持确认保存概要

---

### 2.3 阶段二：故事情节设计

#### FR-LONGWRITING-019 故事情节生成

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：基于故事概要，AI 生成故事情节线，用户可调整和扩展

**情节信息**：
- 情节名称
- 情节类型：开端、发展、高潮、转折、结局
- 情节描述：该情节的主要内容
- 涉及角色：关联角色设定
- 涉及地点：关联地点设定
- 情节顺序

**AI 协作**：
- 基于故事概要自动生成情节线
- 用户可编辑、添加、删除情节
- 支持调整情节顺序

**验收标准**：
- [x] AI 自动生成故事情节线
- [x] 支持手动添加、编辑、删除情节
- [x] 情节可关联角色和地点
- [x] 支持调整情节顺序

---

### 2.4 阶段三：时代背景与地点设定

#### FR-LONGWRITING-002 时代背景设定

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：确定故事发生的时代背景

**输入内容**：
- 时代类型：古代、现代、未来、架空
- 时代描述：具体年代、社会状况、技术水平
- 特殊设定（可选）：架空规则、历史改编等

**输出内容**：
- 时代背景描述（200-500 字）
- 社会结构说明
- 技术水平说明
- 特殊规则说明（如有）

**AI 协作**：
- 支持 AI 润色各项背景描述
- 用户可与 AI 讨论，完善世界观

#### FR-LONGWRITING-003 地点设定

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：设定故事中的主要地点场景

**地点类型**：
- 主要场景：故事核心发生地
- 重要场景：关键事件发生地
- 辅助场景：配角活动区域

**每个地点包含**：
- 地点名称
- 地点类型：城市、村庄、山脉、宫殿、密林、海域等
- 地点描述：环境特征、氛围特点
- 重要程度：主要/重要/辅助
- 地图关联：可关联地图模块的位置
- 关联事件：在此地点发生的主要事件

**临时地点模板匹配**：
- 对于临时地点（非核心场景），系统自动匹配形象模板
- 匹配规则：基于地点描述关键词匹配最相近的模板
- 模板类型：街道、房间、院子、森林边缘、山路、河岸、市场、客栈、庙宇等

**验收标准**：
- [x] 支持时代背景设定（4 种时代类型）
- [x] 支持多轮对话确定时代背景
- [x] 支持创建地点设定
- [x] 每个地点包含名称、类型、描述、重要程度
- [x] 支持编辑和删除地点
- [x] 地点列表按重要程度排序
- [x] 临时地点自动匹配形象模板

---

### 2.5 阶段四：角色设定

#### FR-LONGWRITING-004 角色创建

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：创建故事中的角色，设定角色背景、特点、定位

**角色信息**：
- 基本信息：姓名、性别、年龄、外貌描述
- 背景故事：出身、经历、身份
- 性格特点：性格描述、行为习惯
- 能力特长：特殊能力、技能（关联技能设定）
- 故事定位：主角/配角/反派/工具人
- 主要事件：角色在故事中的关键事件
- 角色关系：与其他角色的关系

**临时角色模板匹配**：
- 对于临时角色（路人、店小二等），系统自动匹配形象模板
- 模板类型：男性路人、女性路人、老年男性、老年女性、儿童、店家、仆人、守卫、士兵、商人、乞丐、旅行者、男性村民、女性村民、男性贵族、女性贵族等
- 匹配规则：基于角色名称和描述关键词匹配最相近的模板

#### FR-LONGWRITING-005 角色与人像联动

**优先级**：Should Have

**状态**：✅ 已实现

**需求描述**：角色可关联人像设计模块的人物形象

**联动规则**：
- 关联后，角色基本信息与人像信息保持同步
- 角色设定页面显示人物形象缩略图
- 点击缩略图可预览多角度形象
- 可取消关联，取消后保留角色文字信息

**验收标准**：
- [x] 支持创建角色，包含基本信息、背景、特点、定位
- [x] 支持角色关系设定
- [x] 支持关联人像设计的人物形象
- [x] 关联后显示人物缩略图，可预览多角度
- [x] 支持取消关联
- [x] 临时角色自动匹配形象模板

---

### 2.6 阶段五：技能与物品设定

#### FR-LONGWRITING-006 技能设定

**优先级**：Should Have

**状态**：✅ 已实现

**需求描述**：设定故事中的技能、武功、法术等

**技能信息**：
- 技能名称
- 技能类型：武功、法术、异能、科技等
- 技能等级：初级/中级/高级/顶级
- 技能描述：效果、特点、限制
- 所属门派/体系（可选）
- 代表人物：掌握此技能的角色（关联角色）

#### FR-LONGWRITING-007 物品设定

**优先级**：Should Have

**状态**：✅ 已实现

**需求描述**：设定故事中的重要物品、法宝、武器等

**物品信息**：
- 物品名称
- 物品类型：武器、法宝、丹药、秘籍、信物等
- 物品等级：普通/稀有/传奇/神器
- 物品描述：外观、功能、来源
- 持有者：当前持有角色
- 相关事件

**验收标准**：
- [x] 支持创建技能设定
- [x] 技能可关联所属角色
- [x] 支持创建物品设定
- [x] 物品可关联持有角色
- [x] 此阶段对非武侠仙侠类故事可选跳过

---

### 2.7 阶段六：大纲与章节

#### FR-LONGWRITING-008 大纲设计

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：生成故事大纲，支持嵌套结构

**大纲结构**：
- 支持多层嵌套：卷 → 章节 → 小节
- 最少层级：1 层（仅章节）
- 最大层级：3 层（卷/章/节）

**大纲生成方式**：
- 自动生成：AI 根据概要和情节生成大纲
- 手动创建：用户手动添加卷、章节、小节
- 混合模式：AI 生成后用户调整

**大纲节点信息**：
- 节点名称
- 节点类型：卷/章/节
- 节点概要
- 涉及角色：通过关联表管理
- 涉及地点：通过关联表管理
- 状态：未开始/进行中/已完成
- 预估字数

#### FR-LONGWRITING-009 章节内容生成

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：根据大纲逐章节生成内容

**@ 引用机制**：
- 解析文本中的 @ 引用
- 查找对应角色、地点、技能、物品信息
- 构建提示词上下文
- AI 生成内容时，确保角色行为符合设定

**生成参数**：
- 生成字数：可指定该章节目标字数
- 写作风格：延续故事风格或指定风格
- 参考素材：可选择关联素材

#### FR-LONGWRITING-010 版本管理

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：章节内容支持版本管理

**版本功能**：
- 每次生成或保存创建新版本
- 版本列表显示：时间、操作类型
- 版本对比：对比两个版本的差异
- 版本回退：恢复到历史版本
- 版本锁定：标记重要版本

#### FR-LONGWRITING-020 章节记忆功能

**优先级**：Should Have

**状态**：✅ 已实现

**需求描述**：AI 生成章节时能够记住前文关键信息

**记忆内容**：
- 角色状态变化
- 地点场景信息
- 关键事件记录
- 物品状态变化

**记忆关联**：
- 通过关联表管理记忆涉及的实体
- 支持按实体查询相关记忆

---

## 3. 临时实体模板功能

### 3.1 功能概述

#### FR-LONGWRITING-021 临时实体形象模板

**优先级**：Should Have

**状态**：✅ 已实现

**需求描述**：为临时角色和临时地点提供预设的形象模板，用于 AI 视频生成时保持一致性

**设计原则**：
- 模板数据存储在数据库中，支持用户自定义扩展
- 通过关键词匹配自动选择最合适的模板
- 支持多种风格变体

**角色模板类型**：

| 模板类型 | 适用场景 | 关键词 |
|---------|---------|--------|
| 男性路人 | 普通男性过客 | 路人、过客、行人、男子 |
| 女性路人 | 普通女性过客 | 路女、女路人、女子、妇人 |
| 老年男性 | 老人角色 | 老人、老者、老翁、老汉 |
| 老年女性 | 老奶奶角色 | 老妇、老太、老奶奶 |
| 儿童 | 小孩角色 | 小孩、儿童、孩童、少年 |
| 店家 | 商业场景 | 店家、店主、掌柜、小二 |
| 仆人 | 服务角色 | 仆人、丫鬟、侍女、下人 |
| 守卫 | 安保角色 | 守卫、卫兵、门卫、护卫 |
| 士兵 | 军事角色 | 士兵、兵卒、军士、战士 |
| 商人 | 商业角色 | 商人、客商、商贾 |
| 乞丐 | 落魄角色 | 乞丐、乞讨、叫花子 |
| 旅行者 | 流浪角色 | 旅人、行者、游侠 |
| 男性村民 | 农村男性 | 村民、农夫、农民、渔民 |
| 女性村民 | 农村女性 | 农妇、村妇、村姑 |
| 男性贵族 | 上层男性 | 贵族、公子、少爷、老爷 |
| 女性贵族 | 上层女性 | 贵族、小姐、夫人、公主 |

**地点模板类型**：

| 模板类型 | 适用场景 | 关键词 |
|---------|---------|--------|
| 街道 | 城市道路 | 街道、街、大街、巷子 |
| 房间 | 室内空间 | 房间、屋、屋子、室内 |
| 院子 | 庭院空间 | 院子、庭院、院落 |
| 森林边缘 | 自然边界 | 林边、林缘、树林边缘 |
| 山路 | 山间小道 | 山路、山道、山径 |
| 河岸 | 水边场景 | 河岸、河边、江边、湖边 |
| 市场 | 商业场所 | 市场、集市、市集 |
| 客栈 | 住宿场所 | 客栈、旅店、酒楼、茶馆 |
| 庙宇 | 宗教场所 | 庙宇、寺庙、庙、道观 |

**验收标准**：
- [x] 临时角色模板数据存储在数据库
- [x] 临时地点模板数据存储在数据库
- [x] 支持基于关键词的自动匹配
- [x] 支持生成图片提示词
- [x] 支持多种风格变体

---

## 4. 评论类长文写作

### 4.1 创作流程概览

```
阶段一：主题与素材
    ↓ 输入核心主题，上传素材（可选）
阶段二：大纲设计
    ↓ AI 生成大纲，用户确认
阶段三：章节生成
    ↓ 逐章节生成内容
完成 → 导出成品
```

### 4.2 阶段一：主题与素材

#### FR-LONGWRITING-011 主题设定

**优先级**：Must Have

**状态**：✅ 已实现

#### FR-LONGWRITING-012 素材管理

**优先级**：Should Have

**状态**：✅ 已实现

**素材类型**：
- 文件上传：TXT、PDF、Word、Markdown
- 网址引用：输入网址，系统自动抓取内容
- 手动输入：直接粘贴文本内容

---

### 4.3 阶段二：大纲设计

#### FR-LONGWRITING-013 评论大纲生成

**优先级**：Must Have

**状态**：✅ 已实现

---

### 4.4 阶段三：章节生成

#### FR-LONGWRITING-014 评论章节生成

**优先级**：Must Have

**状态**：✅ 已实现

---

## 5. 设定集预览与导出

### 5.1 设定集预览

#### FR-LONGWRITING-015 设定集可视化预览

**优先级**：Should Have

**状态**：部分实现

**需求描述**：以可视化卡片形式预览所有设定内容

### 5.2 导出功能

#### FR-LONGWRITING-016 作品导出

**优先级**：Must Have

**状态**：✅ 已实现

**导出格式**：TXT、Markdown、PDF、Word

---

## 6. 项目管理

### 6.1 项目创建

#### FR-LONGWRITING-017 项目管理

**优先级**：Must Have

**状态**：✅ 已实现

### 6.2 独立模块入口

#### FR-LONGWRITING-018 模块入口

**优先级**：Must Have

**状态**：✅ 已实现

---

## 7. 数据库设计（符合第三范式）

### 7.1 设计原则

根据数据库重构计划，所有 JSON 数组字段已拆分为独立的关联表，符合第三范式：

1. **情节角色/地点关联表**：`lw_plot_characters`、`lw_plot_locations`
2. **大纲角色/地点关联表**：`lw_outline_characters`、`lw_outline_locations`
3. **技能角色关联表**：`lw_skill_characters`
4. **设计对话消息表**：`lw_design_messages`
5. **记忆实体关联表**：`lw_memory_entities`

### 7.2 核心表结构

#### 项目表（lw_projects）

```sql
CREATE TABLE lw_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

#### 故事概要表（lw_story_overviews）

```sql
CREATE TABLE lw_story_overviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  story_type TEXT,
  title TEXT,
  core_idea TEXT,
  style TEXT,
  target_reader TEXT,
  estimated_length TEXT,
  other_requirements TEXT,
  summary TEXT,
  core_conflict TEXT,
  key_characters TEXT DEFAULT '[]',    -- JSON 存储
  key_locations TEXT DEFAULT '[]',     -- JSON 存储
  estimated_chapters INTEGER,
  is_locked INTEGER DEFAULT 0,
  is_saved INTEGER DEFAULT 0,          -- 表单是否已保存
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
);
```

#### 角色表（lw_story_characters）

```sql
CREATE TABLE lw_story_characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  portrait_id TEXT,
  name TEXT NOT NULL,
  gender TEXT,
  age TEXT,
  appearance TEXT,
  background TEXT,
  personality TEXT,
  abilities TEXT,
  role_position TEXT,
  major_events TEXT,
  is_temporary INTEGER DEFAULT 0,      -- 是否临时角色
  template_type TEXT,                   -- 临时角色模板类型
  generated_image_id TEXT,              -- 生成的形象图片 ID
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
);
```

#### 地点表（lw_story_locations）

```sql
CREATE TABLE lw_story_locations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  description TEXT,
  importance TEXT DEFAULT 'secondary',
  is_temporary INTEGER DEFAULT 0,      -- 是否临时地点
  template_type TEXT,                   -- 临时地点模板类型
  generated_image_id TEXT,              -- 生成的形象图片 ID
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
);
```

#### 情节表（lw_story_plots）

```sql
CREATE TABLE lw_story_plots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  plot_type TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
);
```

#### 情节角色关联表（lw_plot_characters）

```sql
CREATE TABLE lw_plot_characters (
  id TEXT PRIMARY KEY,
  plot_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  created_at INTEGER,
  UNIQUE(plot_id, character_id),
  FOREIGN KEY (plot_id) REFERENCES lw_story_plots(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES lw_story_characters(id) ON DELETE CASCADE
);
```

#### 情节地点关联表（lw_plot_locations）

```sql
CREATE TABLE lw_plot_locations (
  id TEXT PRIMARY KEY,
  plot_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  created_at INTEGER,
  UNIQUE(plot_id, location_id),
  FOREIGN KEY (plot_id) REFERENCES lw_story_plots(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES lw_story_locations(id) ON DELETE SET NULL
);
```

#### 大纲表（lw_story_outlines）

```sql
CREATE TABLE lw_story_outlines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  level INTEGER DEFAULT 1,
  summary TEXT,
  status TEXT DEFAULT 'pending',
  estimated_words INTEGER,
  sort_order INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE
);
```

#### 大纲角色关联表（lw_outline_characters）

```sql
CREATE TABLE lw_outline_characters (
  id TEXT PRIMARY KEY,
  outline_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  created_at INTEGER,
  UNIQUE(outline_id, character_id),
  FOREIGN KEY (outline_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES lw_story_characters(id) ON DELETE CASCADE
);
```

#### 大纲地点关联表（lw_outline_locations）

```sql
CREATE TABLE lw_outline_locations (
  id TEXT PRIMARY KEY,
  outline_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  created_at INTEGER,
  UNIQUE(outline_id, location_id),
  FOREIGN KEY (outline_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES lw_story_locations(id) ON DELETE SET NULL
);
```

#### 技能表（lw_story_skills）

```sql
CREATE TABLE lw_story_skills (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  level TEXT,
  description TEXT,
  system TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
);
```

#### 技能角色关联表（lw_skill_characters）

```sql
CREATE TABLE lw_skill_characters (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  created_at INTEGER,
  UNIQUE(skill_id, character_id),
  FOREIGN KEY (skill_id) REFERENCES lw_story_skills(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES lw_story_characters(id) ON DELETE CASCADE
);
```

#### 章节内容表（lw_story_chapters）

```sql
CREATE TABLE lw_story_chapters (
  id TEXT PRIMARY KEY,
  outline_id TEXT NOT NULL,
  content TEXT,
  word_count INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (outline_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE
);
```

#### 章节版本表（lw_chapter_versions）

```sql
CREATE TABLE lw_chapter_versions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  content TEXT NOT NULL,
  version_type TEXT,
  word_count INTEGER,
  is_locked INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (chapter_id) REFERENCES lw_story_chapters(id) ON DELETE CASCADE
);
```

#### 故事记忆表（lw_story_memories）

```sql
CREATE TABLE lw_story_memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT,
  content TEXT NOT NULL,
  memory_type TEXT,
  importance INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id) REFERENCES lw_story_chapters(id) ON DELETE SET NULL
);
```

#### 记忆实体关联表（lw_memory_entities）

```sql
CREATE TABLE lw_memory_entities (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  created_at INTEGER,
  UNIQUE(memory_id, entity_type, entity_id),
  FOREIGN KEY (memory_id) REFERENCES lw_story_memories(id) ON DELETE CASCADE
);
```

#### 临时角色模板表（lw_temp_character_templates）

```sql
CREATE TABLE lw_temp_character_templates (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'other',
  age_min INTEGER DEFAULT 20,
  age_max INTEGER DEFAULT 50,
  base_prompt TEXT NOT NULL,
  style_variants TEXT DEFAULT '[]',
  negative_prompt TEXT,
  match_keywords TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  is_default INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);
```

#### 临时地点模板表（lw_temp_location_templates）

```sql
CREATE TABLE lw_temp_location_templates (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  base_prompt TEXT NOT NULL,
  style_variants TEXT DEFAULT '[]',
  negative_prompt TEXT,
  match_keywords TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  is_default INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);
```

---

## 8. 技术实现要点

### 8.1 @ 引用解析

```typescript
// 解析文本中的 @ 引用
function parseReferences(text: string): Reference[] {
  const pattern = /@(\S+)/g
  const matches = text.matchAll(pattern)
  const references: Reference[] = []

  for (const match of matches) {
    const name = match[1]
    const entity = findEntityByName(name)
    if (entity) {
      references.push({
        type: entity.type,
        id: entity.id,
        name: entity.name,
        info: entity.info
      })
    }
  }

  return references
}
```

### 8.2 临时实体模板匹配

```typescript
// 匹配临时角色模板
function matchCharacterTemplate(name: string, description: string): TemplateMatch {
  const combinedText = `${name} ${description}`.toLowerCase()

  for (const template of characterTemplates) {
    const keywords = JSON.parse(template.matchKeywords || '[]')
    const matchedKeywords = keywords.filter(kw => combinedText.includes(kw))

    if (matchedKeywords.length > 0) {
      const confidence = Math.min(matchedKeywords.length / keywords.length + 0.3, 1)
      return { template, confidence, matchedKeywords }
    }
  }

  return { template: defaultTemplate, confidence: 0.5, matchedKeywords: ['默认匹配'] }
}
```

### 8.3 图片提示词生成

```typescript
// 生成角色形象提示词
function generateCharacterImagePrompt(
  templateType: TemporaryCharacterTemplateType,
  styleName: string = 'cinematic',
  customDescription?: string
): string {
  const template = getCharacterTemplate(templateType)
  const stylePrefix = getStylePrefix(styleName)

  const parts = [
    stylePrefix,
    template.basePrompt,
    getRandomStyleVariant(template.styleVariants),
    customDescription,
    'masterpiece, best quality, highly detailed'
  ].filter(Boolean)

  return parts.join(', ')
}
```

---

## 9. 用户界面设计

### 9.1 项目列表页

```
┌─────────────────────────────────────────────────────────────┐
│ 长文写作                              [+ 新建项目]          │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📖 《剑影江湖》                故事类                    │ │
│ │ 当前阶段：章节写作         进度：35%                    │ │
│ │ 最后更新：2026-04-07                                     │ │
│ │                          [继续写作] [设定集] [导出]     │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 故事概要编辑页

```
┌─────────────────────────────────────────────────────────────┐
│ 故事概要设计                                                │
│ 输入核心故事构思，AI 将帮你生成完整的故事概要               │
├─────────────────────────────────────────────────────────────┤
│ 故事类型：[武侠 ▼]                                          │
│ 故事标题：[___________________________]                      │
│ 核心构思：[________________________________]                 │
│           [________________________________]                 │
│ 故事风格：[轻松幽默 ▼]                                      │
│ 目标读者：[青年 ▼]                                          │
│ 预估字数：[长篇小说 ▼]                                      │
│ 其他要求：[________________________________]                 │
│                                                             │
│ [✓ 保存表单]  [✨ 生成概要]                                 │
│                                                             │
│ ✓ 表单已保存，可生成概要                                    │
├─────────────────────────────────────────────────────────────┤
│ 生成结果（可编辑）                                          │
│ 故事标题：[《剑影江湖》] [《剑影江湖传》] [《剑影录》]      │
│ 故事概要：[________________________________]                 │
│ 核心冲突：[________________________________]                 │
│                                                             │
│ 关键角色：                                                  │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ [张三] [主角] [普通少年获得神秘力量...] [主要 ▼] [×] │   │
│ │ [李四] [配角] [主角的好友...] [次要 ▼] [×]           │   │
│ │ [+ 添加角色]                                          │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ 主要场景：                                                  │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ [青云山] [山脉] [主角修炼之地...] [主要 ▼] [×]       │   │
│ │ [+ 添加场景]                                          │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ 预估章节：[120]                                             │
│                                                             │
│ [重新生成] [确认概要]                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. 后续优化方向

### 10.1 功能增强

- [ ] 世界地图可视化（地点关系图）
- [ ] 角色关系图谱
- [ ] 时间线视图（事件时间轴）
- [ ] 多人协作写作
- [ ] AI 写作风格定制
- [ ] 视频一键生成（基于故事内容）
- [ ] 更多临时实体模板

### 10.2 性能优化

- [ ] 大纲和章节懒加载
- [ ] 版本内容压缩存储
- [ ] 素材内容智能摘要
- [ ] 图片生成缓存

### 10.3 用户体验

- [ ] 快捷键支持
- [ ] 拖拽调整大纲顺序
- [ ] 章节批量生成
- [ ] 写作统计面板
- [ ] 移动端适配