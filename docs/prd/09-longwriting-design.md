# 长文写作功能 PRD

## 1. 功能概述

长文写作是一个基于 AI 的创作辅助系统，支持故事类和评论类两种长文创作模式。用户通过分阶段设计，与 AI 协作完成高质量长文内容。

### 1.1 核心价值

- **结构化创作**：分阶段设计，从概要到章节，层次清晰
- **AI 协作**：每个阶段可与 AI 对话讨论，逐步完善设计
- **角色一致性**：通过 @ 引用机制，确保角色在全文中行为一致
- **人像联动**：角色可关联人像设计的人物形象，视觉呈现完整
- **版本管理**：保留内容历史版本，支持回退和对比
- **设定集预览**：可视化预览所有设定，一键导出

### 1.2 目标用户

- 小说创作者：网络小说、武侠仙侠、科幻悬疑等
- 剧本创作者：影视剧、游戏剧本
- 评论作者：深度评论、学术论文、行业分析
- 内容运营：公众号长文、专题策划

### 1.3 创作类型

| 类型 | 适用场景 | 流程复杂度 |
|------|----------|------------|
| 故事类 | 小说、剧本、故事创作 | 5 阶段 |
| 评论类 | 深度评论、分析文章 | 3 阶段 |

---

## 2. 故事类长文写作

### 2.1 创作流程概览

```
阶段一：故事概要设计
    ↓ 输入核心构思，AI 生成故事概要
阶段二：时代背景与地点设定
    ↓ 与 AI 讨论，确定世界观
阶段三：角色设定
    ↓ 创建角色，关联人像形象
阶段四：技能与物品设定（可选）
    ↓ 武侠仙侠类设定武功法术等
阶段五：大纲与章节
    ↓ 生成大纲，逐章节写作
完成 → 导出成品
```

---

### 2.2 阶段一：故事概要设计

#### FR-LONGWRITING-001 故事概要生成

**优先级**：Must Have

**需求描述**：用户输入核心故事构思，AI 生成完整的故事概要

**输入内容**：
- 故事类型选择：武侠、仙侠、玄幻、科幻、悬疑、都市、言情、历史等
- 核心故事构思（必填）：用户对故事的初步设想
- 故事风格（可选）：轻松/沉重、热血/冷峻、通俗/文学等
- 目标读者（可选）：年龄段、阅读偏好
- 字数预估（可选）：短篇/中篇/长篇
- 其他要求（可选）：特殊限制、参考作品等

**输出内容**：
- 故事标题建议（2-3 个选项）
- 故事概要（300-500 字）：包含起因、发展、高潮、结局
- 故事核心冲突
- 故事主题
- 预估章节范围

**AI 协作**：
- 用户输入后，AI 生成概要初稿
- **信息不足时 AI 自动提问**：AI 判断输入信息是否足够，不足则主动询问
- 用户可对概要提出修改意见，AI 重新生成或调整
- 多轮对话直到用户满意
- 用户点击"确认"锁定概要（锁定后可解锁修改）

**验收标准**：
- [ ] 支持选择故事类型（8 种预设类型）
- [ ] 支持输入核心构思（1-2000 字符）
- [ ] AI 生成故事概要，包含标题建议、概要正文、核心冲突、主题
- [ ] **信息不足时 AI 自动提问获取更多信息**
- [ ] 支持多轮对话修改概要
- [ ] 支持确认锁定概要，锁定后可解锁
- [ ] 保存概要设计的历史对话记录

---

### 2.3 阶段二：时代背景与地点设定

#### FR-LONGWRITING-002 时代背景设定

**优先级**：Must Have

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

#### FR-LONGWRITING-003 地点设定

**优先级**：Must Have

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
- 关联事件：在此地点发生的主要事件（可后续补充）

**AI 协作**：
- 用户输入地点构想，AI 生成地点描述
- 用户可与 AI 讨论，完善地点细节
- 支持添加、编辑、删除地点

**验收标准**：
- [ ] 支持时代背景设定（4 种时代类型）
- [ ] 支持多轮对话确定时代背景
- [ ] 支持创建地点设定
- [ ] 每个地点包含名称、类型、描述、重要程度
- [ ] 支持编辑和删除地点
- [ ] 地点列表按重要程度排序

---

### 2.4 阶段三：角色设定

#### FR-LONGWRITING-004 角色创建

**优先级**：Must Have

**需求描述**：创建故事中的角色，设定角色背景、特点、定位

**角色信息**：
- 基本信息：姓名、性别、年龄、外貌描述
- 背景故事：出身、经历、身份
- 性格特点：性格描述、行为习惯
- 能力特长：特殊能力、技能（关联技能设定）
- 故事定位：主角/配角/反派/工具人
- 主要事件：角色在故事中的关键事件
- 角色关系：与其他角色的关系（如师徒、仇敌、恋人）

#### FR-LONGWRITING-005 角色与人像联动

**优先级**：Should Have

**需求描述**：角色可关联人像设计模块的人物形象

**交互流程**：
```
角色设定页面
    │
    ├─ 填写角色文字信息
    │
    ├─ [关联人像形象] 按钮
    │      │
    │      ├─ 点击 → 弹出人像设计人物列表
    │      │        │
    │      │        ├─ 显示：人物项目列表（带缩略图）
    │      │        ├─ 筛选：按性别/年龄筛选人物
    │      │        ├─ 搜索：按姓名搜索人物
    │      │        │
    │      │        ├─ 选择人物 → 确认关联
    │      │        │        │
    │      │        │        ├─ 显示关联状态：人物正面缩略图
    │      │        │        ├─ 显示来源：人像项目名称
    │      │        │        ├─ 操作：预览多角度、取消关联
    │      │        │
    │      │        ├─ [创建新形象] → 跳转人像设计模块
    │      │        │        │
    │      │        │        ├─ 创建完成后返回，自动关联
    │      │        │
    │      │        └─ 关联后角色信息与人像信息可双向同步
    │      │           （姓名、性别、年龄、描述）
    │
    └─ 角色设定完成
```

**联动规则**：
- 关联后，角色基本信息与人像信息保持同步
- 角色设定页面显示人物形象缩略图
- 点击缩略图可预览多角度形象
- 可取消关联，取消后保留角色文字信息

**验收标准**：
- [ ] 支持创建角色，包含基本信息、背景、特点、定位
- [ ] 支持角色关系设定（与其他角色）
- [ ] 支持关联人像设计的人物形象
- [ ] 关联后显示人物缩略图，可预览多角度
- [ ] 支持取消关联
- [ ] 支持跳转人像设计创建新形象
- [ ] 关联后基本信息双向同步

---

### 2.5 阶段四：技能与物品设定

#### FR-LONGWRITING-006 技能设定

**优先级**：Should Have

**需求描述**：设定故事中的技能、武功、法术等（武侠仙侠类适用）

**技能信息**：
- 技能名称
- 技能类型：武功、法术、异能、科技等
- 技能等级：初级/中级/高级/顶级
- 技能描述：效果、特点、限制
- 所属门派/体系（可选）
- 代表人物：掌握此技能的角色（关联角色）

#### FR-LONGWRITING-007 物品设定

**优先级**：Should Have

**需求描述**：设定故事中的重要物品、法宝、武器等

**物品信息**：
- 物品名称
- 物品类型：武器、法宝、丹药、秘籍、信物等
- 物品等级：普通/稀有/传奇/神器
- 物品描述：外观、功能、来源
- 持有者：当前持有角色（关联角色）
- 相关事件：物品相关的重要事件

**验收标准**：
- [ ] 支持创建技能设定
- [ ] 技能可关联所属角色
- [ ] 支持创建物品设定
- [ ] 物品可关联持有角色
- [ ] 技能/物品列表展示
- [ ] 此阶段对非武侠仙侠类故事可选跳过

---

### 2.6 阶段五：大纲与章节

#### FR-LONGWRITING-008 大纲设计

**优先级**：Must Have

**需求描述**：生成故事大纲，支持嵌套结构

**大纲结构**：
- 支持多层嵌套：卷 → 章节 → 小节
- 最少层级：1 层（仅章节）
- 最大层级：3 层（卷/章/节）

**大纲生成方式**：
- 自动生成：输入故事叙事描述，AI 自动生成大纲
- 手动创建：用户手动添加卷、章节、小节
- 混合模式：AI 生成后用户调整

**大纲节点信息**：
- 节点名称
- 节点类型：卷/章/节
- 节点概要：该部分的主要内容概述
- 涉及角色：该部分出场角色（关联角色设定）
- 涉及地点：该部分发生地点（关联地点设定）
- 状态：未开始/进行中/已完成
- 预估字数

**验收标准**：
- [ ] 支持自动生成大纲（输入叙事描述）
- [ ] 支持手动添加大纲节点
- [ ] 支持 1-3 层嵌套结构
- [ ] 大纲节点包含概要、涉及角色、地点
- [ ] 大纲节点显示状态进度
- [ ] 支持调整大纲顺序
- [ ] 支持编辑、删除大纲节点

#### FR-LONGWRITING-009 章节内容生成

**优先级**：Must Have

**需求描述**：根据大纲逐章节生成内容

**@ 引用机制**：
```
用户输入： "@张三 冷冷地看着@李四..."

系统处理：
    ├─ 解析文本中的 @ 引用
    │
    ├─ 查找对应角色信息
    │      ├─ 角色名称、性别、年龄
    │      ├─ 背景故事、性格特点
    │      ├─ 能力特长、故事定位
    │      ├─ 关联人像形象（传入 AI，若支持多模态）
    │
    ├─ 构建提示词上下文
    │      ├─ 系统提示：包含当前大纲概要、出场角色信息
    │      ├─ 用户输入：章节正文请求
    │
    └─ AI 生成内容时，角色行为符合设定
```

**生成参数**：
- 生成字数：可指定该章节目标字数
- 写作风格：延续故事风格或指定风格
- 参考素材：可选择关联素材

**验收标准**：
- [ ] 支持 @ 引用角色，自动带入角色信息到上下文
- [ ] 支持 @ 引用地点、技能、物品
- [ ] 生成时可指定目标字数
- [ ] AI 生成的角色行为符合设定
- [ ] 支持手动编辑生成的内容
- [ ] 支持重新生成

#### FR-LONGWRITING-010 版本管理

**优先级**：Must Have

**需求描述**：章节内容支持版本管理，保留历史版本

**版本功能**：
- 每次生成或保存创建新版本
- 版本列表显示：时间、操作类型（生成/手动保存）
- 版本对比：对比两个版本的差异
- 版本回退：恢复到历史版本
- 版本锁定：标记重要版本，防止误删

**验收标准**：
- [ ] 自动保存每次生成结果为新版本
- [ ] 手动保存创建新版本
- [ ] 版本列表按时间排序
- [ ] 支持版本对比（差异高亮）
- [ ] 支持版本回退
- [ ] 支持版本锁定标记

---

## 3. 评论类长文写作

### 3.1 创作流程概览

```
阶段一：主题与素材
    ↓ 输入核心主题，上传素材（可选）
阶段二：大纲设计
    ↓ AI 生成大纲，用户确认
阶段三：章节生成
    ↓ 逐章节生成内容
完成 → 导出成品
```

### 3.2 阶段一：主题与素材

#### FR-LONGWRITING-011 主题设定

**优先级**：Must Have

**需求描述**：输入评论文章的核心主题和要求

**输入内容**：
- 文章类型：深度评论、学术论文、行业分析、专题策划
- 核心主题（必填）：文章要讨论的核心问题
- 评论立场（可选）：支持/反对/中立/分析
- 目标读者（可选）：专业读者/大众读者
- 文章风格（可选）：严谨/通俗/犀利/温和
- 字数预估（可选）
- 其他要求（可选）

#### FR-LONGWRITING-012 素材管理

**优先级**：Should Have

**需求描述**：管理与项目关联的素材

**素材类型**：
- 文件上传：TXT、PDF、Word、Markdown
- 网址引用：输入网址，系统自动抓取内容
- 手动输入：直接粘贴文本内容

**素材信息**：
- 素材名称
- 素材类型
- 素材来源：文件路径/网址/手动输入
- 素材内容：抓取或上传的内容文本
- 添加时间
- 使用状态：未使用/已使用

**网址抓取规则**：
- 抓取后内容不支持编辑
- 不支持更新（网址内容变化不会重新抓取）
- 抓取失败自动重试，最多 5 次
- 5 次均失败则标记该素材为失败状态，显示错误信息

**素材使用**：
- 生成大纲时可选择参考素材
- 生成章节时可选择关联素材
- 系统自动将素材内容注入 AI 上下文

**验收标准**：
- [ ] 支持上传文件素材（TXT/PDF/Word/Markdown）
- [ ] 支持网址引用，自动抓取内容
- [ ] 网址抓取失败自动重试，最多 5 次
- [ ] 支持手动粘贴文本
- [ ] 素材列表管理（查看/删除）
- [ ] 生成时可选择使用素材
- [ ] 素材内容自动注入 AI 上下文

---

### 3.3 阶段二：大纲设计

#### FR-LONGWRITING-013 评论大纲生成

**优先级**：Must Have

**需求描述**：基于主题和素材生成评论文章大纲

**大纲结构**：
- 引言
- 分论点（支持多级嵌套）
- 结论

**大纲生成**：
- AI 根据主题和素材自动生成大纲
- 用户可调整大纲结构
- 用户确认后开始章节生成

**验收标准**：
- [ ] AI 自动生成评论大纲
- [ ] 支持手动调整大纲结构
- [ ] 确认后进入章节生成阶段

---

### 3.4 阶段三：章节生成

#### FR-LONGWRITING-014 评论章节生成

**优先级**：Must Have

**需求描述**：根据大纲逐章节生成评论内容

**与故事类相同功能**：
- 版本管理
- 手动编辑
- 重新生成

**验收标准**：
- [ ] 支持逐章节生成
- [ ] 支持版本管理
- [ ] 支持手动编辑
- [ ] 支持重新生成

---

## 4. 设定集预览与导出

### 4.1 设定集预览

#### FR-LONGWRITING-015 设定集可视化预览

**优先级**：Should Have

**需求描述**：以可视化卡片形式预览所有设定内容

**设定集内容**：

| 卡片类型 | 内容 |
|---------|------|
| 故事概要卡片 | 标题、概要、核心冲突、主题 |
| 时代背景卡片 | 时代描述、社会结构、技术水平 |
| 地点卡片 | 地点名称、描述、场景图（如有） |
| 角色卡片 | 角色信息 + 人像形象 |
| 技能卡片 | 技能名称、描述、代表人物 |
| 物品卡片 | 物品名称、描述、持有者 |

**角色卡片设计**：
```
┌─────────────────────────────────────────┐
│  ┌──────────┐                           │
│  │ 人像形象  │  张三                     │
│  │ (正面)   │  性别：男 | 年龄：35       │
│  │          │  定位：反派二号           │
│  └──────────┘                           │
│                                         │
│  背景：XX世家继承人，性格冷酷...        │
│                                         │
│  特点：剑术精湛、沉默寡言、行事果断      │
│                                         │
│  技能：寒冰剑法（顶级）                  │
│                                         │
│  主要事件：                             │
│  - 第3章：首次登场，与主角对峙          │
│  - 第10章：关键转折...                  │
│                                         │
└─────────────────────────────────────────┘
```

**验收标准**：
- [ ] 设定集预览页面
- [ ] 各类设定以卡片形式展示
- [ ] 角色卡片显示人像形象（如有）
- [ ] 卡片支持展开/折叠详情
- [ ] 支持筛选显示（只显示某类设定）
- [ ] **卡片点击可跳转编辑页面**
- [ ] 支持选择部分卡片导出

### 4.2 导出功能

#### FR-LONGWRITING-016 作品导出

**优先级**：Must Have

**需求描述**：导出完成的文章内容和设定集

**导出格式**：

| 格式 | 用途 | 说明 |
|------|------|------|
| TXT | 纯文本阅读 | 简单通用格式 |
| Markdown | 内容平台发布 | 适合发布到公众号、知乎等平台 |
| PDF | 打印/分享 | 适合打印和正式场合 |
| 长图 | 社交分享 | 适合分享到微信、微博等社交平台 |

**导出范围**：
- 仅正文：只导出章节内容
- 仅设定集：只导出设定卡片
- 完整作品：正文 + 设定集

**设定集导出样式**：
- Markdown：以文档形式组织，支持标题层级
- PDF：排版美观，适合打印
- 长图：竖版卡片拼图，适合社交分享

**导出结构**：
```
作品名称/
├── 正文/
│   ├── 第一卷.md
│   │   ├── 第一章.md
│   │   ├── 第二章.md
│   ├── 第二卷.md
├── 设定集/
│   ├── 故事概要.md
│   ├── 角色设定.md
│   ├── 技能物品.md
```

**验收标准**：
- [ ] 支持 TXT、Markdown、PDF、长图四种格式导出
- [ ] 支持仅正文导出
- [ ] 支持仅设定集导出
- [ ] 支持完整作品导出（正文+设定集）
- [ ] 设定集支持选择部分卡片导出
- [ ] 导出文件按结构组织

---

## 5. 项目管理

### 5.1 项目创建

#### FR-LONGWRITING-017 项目管理

**优先级**：Must Have

**需求描述**：管理长文写作项目

**项目信息**：
- 项目名称
- 项目类型：故事类/评论类
- 创建时间
- 更新时间
- 当前阶段
- 进度统计

**验收标准**：
- [ ] 支持创建项目，选择类型
- [ ] 项目列表展示
- [ ] 显示项目当前阶段和进度
- [ ] 支持编辑项目名称
- [ ] 支持删除项目（需确认）

### 5.2 独立模块入口

#### FR-LONGWRITING-018 模块入口

**优先级**：Must Have

**需求描述**：长文写作作为独立模块，在左侧导航菜单添加入口

**验收标准**：
- [ ] 左侧导航菜单显示"长文写作"入口
- [ ] 点击跳转到独立页面
- [ ] 有独立 URL 路由

---

## 6. 数据模型设计

### 6.1 项目表（longwriting_projects）

```sql
CREATE TABLE longwriting_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'story' | 'comment'
  stage TEXT NOT NULL,          -- 当前阶段
  progress INTEGER DEFAULT 0,   -- 进度百分比
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 6.2 故事概要表（story_overviews）

```sql
CREATE TABLE story_overviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  story_type TEXT,              -- 武侠/仙侠/玄幻等
  title TEXT,                   -- 故事标题
  summary TEXT,                 -- 故事概要
  core_conflict TEXT,           -- 核心冲突
  theme TEXT,                   -- 故事主题
  estimated_chapters INTEGER,   -- 预估章节数
  is_locked BOOLEAN DEFAULT 0,  -- 是否锁定
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES longwriting_projects(id) ON DELETE CASCADE
);
```

### 6.3 时代背景表（story_backgrounds）

```sql
CREATE TABLE story_backgrounds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  era_type TEXT,                -- 古代/现代/未来/架空
  era_description TEXT,
  social_structure TEXT,
  tech_level TEXT,
  special_rules TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES longwriting_projects(id) ON DELETE CASCADE
);
```

### 6.4 地点表（story_locations）

```sql
CREATE TABLE story_locations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,                    -- 城市/村庄/山脉等
  description TEXT,
  importance TEXT,              -- 主要/重要/辅助
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES longwriting_projects(id) ON DELETE CASCADE
);
```

### 6.5 角色表（story_characters）

```sql
CREATE TABLE story_characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  portrait_id TEXT,             -- 关联的人像形象 ID（可选）
  name TEXT NOT NULL,
  gender TEXT,
  age INTEGER,
  appearance TEXT,              -- 外貌描述
  background TEXT,              -- 背景故事
  personality TEXT,             -- 性格特点
  abilities TEXT,               -- 能力特长
  role_position TEXT,           -- 主角/配角/反派
  major_events TEXT,            -- 主要事件
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES longwriting_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (portrait_id) REFERENCES portrait_variants(id) ON DELETE SET NULL
);
```

### 6.6 角色关系表（character_relations）

```sql
CREATE TABLE character_relations (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  related_character_id TEXT NOT NULL,
  relation_type TEXT,           -- 师徒/仇敌/恋人等
  relation_description TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES story_characters(id) ON DELETE CASCADE,
  FOREIGN KEY (related_character_id) REFERENCES story_characters(id) ON DELETE CASCADE
);
```

### 6.7 技能表（story_skills）

```sql
CREATE TABLE story_skills (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,                    -- 武功/法术/异能等
  level TEXT,                   -- 初级/中级/高级/顶级
  description TEXT,
  system TEXT,                  -- 所属门派/体系
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES longwriting_projects(id) ON DELETE CASCADE
);
```

### 6.8 物品表（story_items）

```sql
CREATE TABLE story_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,                    -- 武器/法宝/丹药等
  level TEXT,                   -- 普通/稀有/传奇/神器
  description TEXT,
  owner_id TEXT,                -- 持有者角色 ID
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES longwriting_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES story_characters(id) ON DELETE SET NULL
);
```

### 6.9 大纲表（story_outlines）

```sql
CREATE TABLE story_outlines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,               -- 父节点 ID（支持嵌套）
  name TEXT NOT NULL,
  level INTEGER DEFAULT 1,      -- 层级：1/2/3
  summary TEXT,                 -- 节点概要
  involved_characters TEXT,     -- 涉及角色 ID 列表（JSON）
  involved_locations TEXT,      -- 涉及地点 ID 列表（JSON）
  status TEXT DEFAULT 'pending', -- pending/progressing/completed
  estimated_words INTEGER,
  order_index INTEGER,          -- 排序索引
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES longwriting_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES story_outlines(id) ON DELETE CASCADE
);
```

### 6.10 章节内容表（story_chapters）

```sql
CREATE TABLE story_chapters (
  id TEXT PRIMARY KEY,
  outline_id TEXT NOT NULL,
  content TEXT,                 -- 章节正文
  word_count INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (outline_id) REFERENCES story_outlines(id) ON DELETE CASCADE
);
```

### 6.11 章节版本表（chapter_versions）

```sql
CREATE TABLE chapter_versions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  content TEXT NOT NULL,
  version_type TEXT,            -- generated/manual
  word_count INTEGER,
  is_locked BOOLEAN DEFAULT 0,  -- 是否锁定
  created_at INTEGER NOT NULL,
  FOREIGN KEY (chapter_id) REFERENCES story_chapters(id) ON DELETE CASCADE
);
```

### 6.12 素材表（story_materials）

```sql
CREATE TABLE story_materials (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,                    -- file/url/manual
  source TEXT,                  -- 文件路径或网址
  content TEXT,                 -- 素材内容
  used BOOLEAN DEFAULT 0,       -- 是否已使用
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES longwriting_projects(id) ON DELETE CASCADE
);
```

### 6.13 对话记录表（design_conversations）

```sql
CREATE TABLE design_conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  stage TEXT NOT NULL,          -- 所属阶段
  messages TEXT,                -- 对话消息列表（JSON）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES longwriting_projects(id) ON DELETE CASCADE
);
```

---

## 7. 技术实现要点

### 7.1 @ 引用解析

```typescript
// 解析文本中的 @ 引用
function parseReferences(text: string): Reference[] {
  const pattern = /@(\w+)/g
  const matches = text.matchAll(pattern)
  const references: Reference[] = []

  for (const match of matches) {
    const name = match[1]
    // 查找角色、地点、技能、物品
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

// 构建 AI 上下文
function buildAIContext(references: Reference[]): string {
  const contextParts: string[] = []

  for (const ref of references) {
    if (ref.type === 'character') {
      contextParts.push(`
【角色：${ref.name}】
- 性别：${ref.info.gender}
- 年龄：${ref.info.age}
- 背景：${ref.info.background}
- 性格：${ref.info.personality}
- 定位：${ref.info.rolePosition}
`)
    }
    // 地点、技能、物品类似处理
  }

  return contextParts.join('\n')
}
```

### 7.2 网址内容抓取

```typescript
async function fetchUrlContent(url: string): Promise<string> {
  // 使用 WebFetch 工具抓取网页内容
  const response = await fetch(url)
  const html = await response.text()

  // 提取正文内容（去除 HTML 标签）
  const content = extractMainContent(html)

  return content
}
```

### 7.3 版本对比算法

```typescript
// 使用 diff 算法对比两个版本
function compareVersions(v1: string, v2: string): DiffResult[] {
  // 使用 diff-match-patch 或类似库
  const dmp = new diff_match_patch()
  const diffs = dmp.diff_main(v1, v2)
  dmp.diff_cleanupSemantic(diffs)
  return diffs
}
```

---

## 8. 用户界面设计

### 8.1 项目列表页

```
┌─────────────────────────────────────────────────────────────┐
│ 长文写作                              [+ 新建项目]          │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📖 《剑影江湖》                故事类                    │ │
│ │ 当前阶段：章节写作         进度：35%                    │ │
│ │ 最后更新：2026-03-28                                     │ │
│ │                          [继续写作] [设定集] [导出]     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📝 AI时代的机遇与挑战          评论类                    │ │
│ │ 当前阶段：大纲设计         进度：20%                    │ │
│ │                          [继续写作] [导出]              │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 故事类编辑页

```
┌─────────────────────────────────────────────────────────────┐
│ ← 返回    《剑影江湖》    [设定集预览] [导出]              │
├─────────────────────────────────────────────────────────────┤
│ [概要] [背景] [角色] [技能] [大纲] [章节]                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 当前阶段：角色设定                                          │
│                                                             │
│ ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│ │ 👤 张三         │  │ 👤 李四         │  │  [+ 添加]    │ │
│ │ 反派二号        │  │ 主角            │  │              │ │
│ │ ┌────┐          │  │ ┌────┐          │  │              │ │
│ │ │人像│          │  │ │人像│          │  │              │ │
│ │ └────┘          │  │ └────┘          │  │              │ │
│ │ 性别: 男        │  │ 性别: 女        │  │              │ │
│ │ 年龄: 35        │  │ 年龄: 25        │  │              │ │
│ │ [编辑] [关联]   │  │ [编辑] [关联]   │  │              │ │
│ └─────────────────┘  └─────────────────┘  └──────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ AI 协作对话                                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 用户：张三的性格太单薄了，需要更有层次感                 │ │
│ │                                                         │ │
│ │ AI：好的，我来丰富张三的性格设定。他的冷酷外表下，      │ │
│ │     实际隐藏着一段不为人知的过去...                     │ │
│ │                                                         │ │
│ │ [确认更新] [继续讨论]                                   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 章节编辑页

```
┌─────────────────────────────────────────────────────────────┐
│ ← 返回    《剑影江湖》 > 第一卷 > 第一章                   │
├─────────────────────────────────────────────────────────────┤
│ 大纲概要：张三首次登场，与主角在客栈相遇...                │
│                                                             │
│ 涉及角色：张三、李四                                        │
│ 涉及地点：青云客栈                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 正文内容                                               │ │
│ │                                                         │ │
│ │ 青云客栈内，酒香弥漫。@张三 独坐角落...                │ │
│ │                                                         │ │
│ │ （@ 引用高亮显示，点击可查看角色信息）                  │ │
│ │                                                         │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 字数：1250    版本：v3    [版本历史]                        │
│                                                             │
│ [生成内容] [重新生成] [保存]                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. 后续优化方向

### 9.1 功能增强

- [ ] 支持 Word 导出格式
- [ ] 世界地图可视化（地点关系图）
- [ ] 角色关系图谱
- [ ] 时间线视图（事件时间轴）
- [ ] 多人协作写作
- [ ] AI 写作风格定制

### 9.2 性能优化

- [ ] 大纲和章节懒加载
- [ ] 版本内容压缩存储
- [ ] 素材内容智能摘要（过长素材）

### 9.3 用户体验

- [ ] 快捷键支持
- [ ] 拖拽调整大纲顺序
- [ ] 章节批量生成
- [ ] 写作统计面板

---

**文档版本**：v1.0
**创建日期**：2026-03-28
**更新日期**：2026-03-28
**作者**：AI Assistant
**变更记录**：
- v1.0 (2026-03-28): 初始版本，完成需求确认