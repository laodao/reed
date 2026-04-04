# 日记模块设计文档

> 创建日期：2026-04-04

## 一、产品概述

### 1.1 产品背景

用户需要一个本地化的个人日记系统，能够以 Markdown 格式记录日常内容。要求支持丰富的编辑功能、目录管理、双向链接、附件管理和多格式导出。

### 1.2 目标用户

- 需要日常记录的个人用户
- 喜欢使用 Markdown 进行写作的用户
- 需要管理大量笔记和知识的用户

### 1.3 产品定位

一个功能完善的本地日记应用，类似于 Obsidian 的核心功能，集成在 The Bot 工具箱中。

---

## 二、功能需求

### 2.1 核心功能模块

```
┌─────────────────────────────────────────────────────────────┐
│                        日记模块                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  目录管理   │  │  编辑器     │  │  导出功能   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  附件管理   │  │  双向链接   │  │  知识库集成 │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 功能清单

| 模块 | 功能 | 优先级 | 说明 |
|------|------|--------|------|
| 目录管理 | 创建/重命名/删除目录 | P0 | 树形结构管理 |
| 目录管理 | 移动日记到其他目录 | P1 | 拖拽或菜单操作 |
| 日记管理 | 创建/编辑/删除日记 | P0 | 基础 CRUD |
| 日记管理 | 日记列表展示 | P0 | 按时间排序 |
| 日记管理 | 日记搜索 | P1 | 标题和内容搜索 |
| 编辑器 | Markdown 编辑 | P0 | 源码模式 + 所见即所得 |
| 编辑器 | 实时预览 | P0 | 分屏/切换预览 |
| 编辑器 | 数学公式渲染 | P1 | KaTeX/MathJax |
| 编辑器 | 图表支持 | P2 | Mermaid 流程图等 |
| 编辑器 | 代码高亮 | P1 | 已有 highlight.js |
| 双向链接 | [[链接]]语法 | P1 | Obsidian 风格 |
| 双向链接 | 链接预览 | P2 | 悬浮预览链接内容 |
| 双向链接 | 反向链接面板 | P1 | 显示哪些日记引用了当前日记 |
| 附件管理 | 图片上传 | P0 | 拖拽/粘贴/选择 |
| 附件管理 | 文件附件 | P1 | 任意文件类型 |
| 附件管理 | .assets 目录 | P0 | 自动创建管理附件 |
| 导出功能 | 导出为 HTML | P1 | 带样式的网页 |
| 导出功能 | 导出为 PDF | P1 | Electron printToPDF |
| 导出功能 | 导出为 Word | P2 | .docx 格式 |
| 知识库集成 | 导出到知识库 | P1 | 作为文档添加 |

---

## 三、详细功能设计

### 3.1 目录管理

#### 3.1.1 目录结构

**存储位置**: App userData 目录下的 `diary` 子目录

```
{userData}/diary/
├── 2024年/
│   ├── 01月/
│   │   ├── .assets/           # 附件目录（自动创建）
│   │   │   ├── image1.png
│   │   │   └── document.pdf
│   │   ├── 2024-01-01.md      # 日记文件
│   │   └── 2024-01-02.md
│   └── 02月/
│       └── ...
├── 读书笔记/
│   ├── .assets/
│   └── 读书笔记-2024-01-01.md
└── 工作日志/
    └── ...
```

#### 3.1.2 数据库设计

**diary_folders 表**
```sql
CREATE TABLE diary_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,               -- 目录名称
  parent_id TEXT,                   -- 父目录 ID（NULL 表示根目录）
  path TEXT NOT NULL,               -- 文件系统路径（相对路径）
  sort_order INTEGER DEFAULT 0,     -- 排序
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES diary_folders(id) ON DELETE CASCADE
)
```

**diary_entries 表**
```sql
CREATE TABLE diary_entries (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,          -- 所属目录
  title TEXT NOT NULL,              -- 标题
  content TEXT,                     -- Markdown 内容
  file_path TEXT NOT NULL,          -- 文件路径（相对路径）
  word_count INTEGER DEFAULT 0,     -- 字数
  tags TEXT,                        -- 标签（JSON 数组）
  frontmatter TEXT,                 -- YAML frontmatter
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (folder_id) REFERENCES diary_folders(id) ON DELETE CASCADE
)
```

**diary_links 表**（双向链接关系）
```sql
CREATE TABLE diary_links (
  id TEXT PRIMARY KEY,
  source_entry_id TEXT NOT NULL,    -- 源日记 ID
  target_entry_id TEXT,             -- 目标日记 ID（NULL 表示外部链接）
  target_title TEXT NOT NULL,       -- 链接标题
  link_text TEXT,                   -- 链接文本（如 [[标题|显示文本]]）
  anchor TEXT,                      -- 锚点（如 #标题）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (target_entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE
)
```

**diary_attachments 表**
```sql
CREATE TABLE diary_attachments (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,           -- 所属日记
  file_name TEXT NOT NULL,          -- 文件名
  file_path TEXT NOT NULL,          -- 文件路径（相对路径）
  file_size INTEGER,                -- 文件大小
  mime_type TEXT,                   -- MIME 类型
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE
)
```

### 3.2 编辑器设计

#### 3.2.1 技术方案

基于现有 `MarkdownEditor.vue` 组件（使用 ByteMD），扩展以下功能：

| 功能 | 实现方案 |
|------|----------|
| 数学公式 | `@bytemd/plugin-math` (KaTeX) |
| 图表 | `@bytemd/plugin-mermaid` |
| 双向链接 | 自定义插件，识别 `[[标题]]` 语法 |
| 代码高亮 | 已有 `@bytemd/plugin-highlight` |

#### 3.2.2 编辑模式

1. **分屏模式**（默认）：左侧源码，右侧预览
2. **源码模式**：仅显示源码编辑
3. **阅读模式**：仅显示预览

#### 3.2.3 工具栏功能

| 按钮 | 功能 |
|------|------|
| 标题 | 插入 H1-H6 |
| 粗体 | **文本** |
| 斜体 | *文本* |
| 删除线 | ~~文本~~ |
| 链接 | [文本](URL) |
| 双向链接 | [[日记标题]] |
| 图片 | 上传图片 |
| 代码块 | ```language |
| 公式 | $公式$ 或 $$块公式$$ |
| 图表 | Mermaid 语法 |
| 表格 | 插入表格 |
| 列表 | 有序/无序列表 |

### 3.3 双向链接设计

#### 3.3.1 链接语法

```
[[日记标题]]              -- 链接到其他日记
[[日记标题#标题]]         -- 链接到日记中的特定标题
[[日记标题|显示文本]]     -- 自定义显示文本
```

#### 3.3.2 链接解析

```typescript
interface DiaryLink {
  type: 'internal' | 'external'
  targetId?: string           // 内部链接的目标日记 ID
  targetTitle: string         // 链接标题
  anchor?: string             // 锚点（如 #标题）
  displayText?: string        // 显示文本
}
```

#### 3.3.3 反向链接面板

在日记编辑页面右侧显示：
- 当前日记引用的其他日记
- 引用当前日记的其他日记
- 未创建的链接（红色显示）

### 3.4 附件管理设计

#### 3.4.1 附件存储

- 每个目录自动创建 `.assets` 子目录
- 上传附件自动保存到当前日记所在目录的 `.assets` 中
- 文件命名：`{timestamp}_{random}.{ext}`

#### 3.4.2 图片处理

1. 拖拽/粘贴图片 → 上传到 `.assets` 目录
2. Markdown 中插入：`![图片描述](.assets/xxx.png)`
3. 使用相对路径访问，确保移动目录后仍有效

#### 3.4.3 文件附件

- 支持任意文件类型
- Markdown 中链接：`[文件名](.assets/xxx.pdf)`

### 3.5 导出功能设计

#### 3.5.1 导出为 HTML

- 使用 `marked` 解析 Markdown
- 内置 CSS 样式
- 支持数学公式渲染（KaTeX）
- 支持图表渲染（Mermaid）
- 支持代码高亮

#### 3.5.2 导出为 PDF

- 使用 Electron 的 `webContents.printToPDF`
- A4 纹张，适合打印
- 支持页边距和打印选项配置

#### 3.5.3 导出为 Word

- 复用现有 `markdown-to-docx.ts`
- 转换 Markdown 为 .docx 格式

### 3.6 知识库集成设计

#### 3.6.1 导出到知识库

- 选择目标知识库
- 将日记内容添加为知识库文档
- 保留标题、标签等元数据

#### 3.6.2 数据流

```
日记条目 → 提取内容 → 调用 knowledge-base:add-document → 完成
```

---

## 四、界面设计

### 4.1 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│  日记管理                                        [新建] [设置]   │
├────────────────┬────────────────────────────────────────────────┤
│                │                                                │
│   目录树       │              日记列表 / 编辑区                 │
│                │                                                │
│   ├ 2024年     │  ┌──────────────────────────────────────────┐ │
│   │ ├ 01月     │  │ 日记标题                    2024-01-01   │ │
│   │ └ 02月     │  ├──────────────────────────────────────────┤ │
│   ├ 读书笔记   │  │                                          │ │
│   └ 工作日志   │  │  Markdown 编辑器                         │ │
│                │  │                                          │ │
│   [+新建目录]  │  │                                          │ │
│                │  └──────────────────────────────────────────┘ │
│                │                                                │
└────────────────┴────────────────────────────────────────────────┘
```

### 4.2 页面状态

1. **未选择目录**：显示引导提示
2. **已选择目录，未选择日记**：显示日记列表
3. **已选择日记**：显示编辑器

### 4.3 日记列表视图

```
┌─────────────────────────────────────────────────────────────────┐
│  当前目录：2024年 / 01月                     [新建日记] [搜索]   │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 📅 2024-01-15 周一                                         │ │
│  │ 今天完成了很多工作，主要是一些文档的编写...                  │ │
│  │ 标签: #工作 #文档                                          │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ 📅 2024-01-14 周日                                         │ │
│  │ 周末休息，看了一部电影...                                   │ │
│  │ 标签: #生活                                                │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 五、技术架构

### 5.1 模块结构

```
src/
├── main/
│   ├── services/
│   │   ├── diary.service.ts           # 日记核心服务
│   │   └── diary-export.service.ts    # 导出服务
│   ├── database/repositories/
│   │   ├── diary-folder.repository.ts
│   │   ├── diary-entry.repository.ts
│   │   ├── diary-link.repository.ts
│   │   └── diary-attachment.repository.ts
│   └── ipc/handlers/
│       └── diary.handler.ts
├── renderer/
│   └── src/
│       ├── views/
│       │   └── Diary.vue              # 日记主页面
│       └── components/
│           └── diary/
│               ├── DiarySidebar.vue   # 目录侧边栏
│               ├── DiaryList.vue      # 日记列表
│               ├── DiaryEditor.vue    # 日记编辑器
│               ├── BacklinksPanel.vue # 反向链接面板
│               └── ExportDialog.vue   # 导出对话框
└── shared/
    └── types/
        └── diary.types.ts
```

### 5.2 依赖清单

需要新增的依赖：

```json
{
  "@bytemd/plugin-math": "^1.22.0",
  "@bytemd/plugin-mermaid": "^1.22.0",
  "katex": "^0.16.9",
  "mermaid": "^10.0.0"
}
```

### 5.3 IPC 通道设计

| 通道 | 功能 | 参数 |
|------|------|------|
| `diary:list-folders` | 获取目录树 | parentId? |
| `diary:create-folder` | 创建目录 | { name, parentId } |
| `diary:update-folder` | 更新目录 | { id, name } |
| `diary:delete-folder` | 删除目录 | id |
| `diary:list-entries` | 获取日记列表 | folderId |
| `diary:get-entry` | 获取日记详情 | id |
| `diary:create-entry` | 创建日记 | { folderId, title, content? } |
| `diary:update-entry` | 更新日记 | { id, title?, content? } |
| `diary:delete-entry` | 删除日记 | id |
| `diary:move-entry` | 移动日记 | { id, targetFolderId } |
| `diary:search` | 搜索日记 | { keyword, folderId? } |
| `diary:upload-attachment` | 上传附件 | { entryId, file } |
| `diary:get-backlinks` | 获取反向链接 | entryId |
| `diary:export-html` | 导出 HTML | { entryId, outputPath? } |
| `diary:export-pdf` | 导出 PDF | { entryId, outputPath? } |
| `diary:export-docx` | 导出 Word | { entryId, outputPath? } |
| `diary:export-to-kb` | 导出到知识库 | { entryId, knowledgeBaseId } |

---

## 六、实现计划

### Phase 1: 基础框架（预计 2-3 天）

1. 创建数据库表和 Repository
2. 实现基础 IPC 通道
3. 创建前端页面骨架
4. 实现目录管理功能

### Phase 2: 编辑器核心（预计 3-4 天）

1. 扩展 MarkdownEditor 组件
2. 添加数学公式和图表支持
3. 实现编辑模式切换
4. 实现附件上传和管理
5. 实现 .assets 目录管理

### Phase 3: 双向链接（预计 2-3 天）

1. 实现链接语法解析
2. 实现链接数据库存储
3. 实现反向链接面板
4. 实现链接预览功能

### Phase 4: 导出功能（预计 2 天）

1. 实现 HTML 导出
2. 实现 PDF 导出
3. 实现 Word 导出
4. 实现知识库集成导出

### Phase 5: 优化完善（预计 1-2 天）

1. 搜索功能
2. 标签管理
3. UI 优化
4. 性能优化

---

## 七、验证方案

### 7.1 功能测试清单

- [ ] 创建/重命名/删除目录
- [ ] 创建/编辑/删除日记
- [ ] Markdown 渲染正确
- [ ] 数学公式渲染正确
- [ ] 图表渲染正确
- [ ] 图片上传和显示
- [ ] 文件附件管理
- [ ] 双向链接创建和解析
- [ ] 反向链接显示正确
- [ ] 导出 HTML/PDF/Word
- [ ] 导出到知识库

### 7.2 性能测试

- 大量日记列表加载性能
- 大文件编辑器性能
- 搜索响应时间

---

## 八、关键文件清单

| 文件路径 | 操作 |
|----------|------|
| `src/shared/types/diary.types.ts` | 新建 |
| `src/main/database/repositories/diary-*.repository.ts` | 新建 (4个) |
| `src/main/services/diary.service.ts` | 新建 |
| `src/main/services/diary-export.service.ts` | 新建 |
| `src/main/ipc/handlers/diary.handler.ts` | 新建 |
| `src/main/database/index.ts` | 修改（注册 Repository） |
| `src/main/ipc/index.ts` | 修改（注册 Handler） |
| `src/preload/index.ts` | 修改（暴露 API） |
| `src/renderer/src/views/Diary.vue` | 新建 |
| `src/renderer/src/components/diary/*.vue` | 新建 (5个) |
| `src/renderer/src/router/index.ts` | 修改（添加路由） |
| `package.json` | 修改（新增依赖） |

---

## 九、风险与依赖

### 9.1 技术风险

1. **Mermaid 渲染性能**：大型图表可能影响渲染速度
2. **双向链接解析**：需要精确的正则表达式匹配
3. **文件系统同步**：目录移动时需更新所有关联路径

### 9.2 外部依赖

- ByteMD 生态系统稳定性
- KaTeX 渲染引擎兼容性
- Mermaid 版本兼容性

---

## 十、设计决策总结

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 存储位置 | App userData 目录 | 与知识库数据并列，统一管理 |
| PDF 导出 | Electron printToPDF | 简单可靠，无需额外依赖 |
| 实现范围 | 完整实现 | PRD 已规划完整，一次性交付 |