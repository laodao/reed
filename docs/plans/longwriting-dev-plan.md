# 长文写作功能开发计划

## 开发策略

**核心原则**：先界面后逻辑
1. 第一阶段：完成所有 UI 界面，确定交互细节
2. 第二阶段：实现业务逻辑和 AI 集成

**理由**：
- 界面复杂，先确定 UI/UX 再开发逻辑避免返工
- 界面可以先让用户验证交互流程
- 业务逻辑依赖界面确认后的数据结构

---

## 界面清单

### 1. 项目管理界面

| 页面 | 文件路径 | 说明 |
|------|----------|------|
| 项目列表页 | `views/LongWriting.vue` | 显示项目列表，新建/编辑/删除项目 |
| 新建项目对话框 | `components/longwriting/CreateProjectDialog.vue` | 选择类型、输入名称 |

### 2. 故事类编辑界面

| 页面 | 文件路径 | 说明 |
|------|----------|------|
| 故事编辑主页 | `views/StoryEditor.vue` | 顶部阶段导航，内容区域 |
| 概要设计页 | `components/longwriting/story/OverviewStage.vue` | 故事概要设计 |
| 背景设定页 | `components/longwriting/story/BackgroundStage.vue` | 时代背景+地点设定 |
| 角色设定页 | `components/longwriting/story/CharacterStage.vue` | 角色列表+编辑 |
| 角色编辑对话框 | `components/longwriting/story/CharacterEditDialog.vue` | 角色信息编辑 |
| 人像关联对话框 | `components/longwriting/story/PortraitLinkDialog.vue` | 关联人像形象 |
| 技能物品页 | `components/longwriting/story/SkillItemStage.vue` | 技能+物品设定 |
| 大纲设计页 | `components/longwriting/story/OutlineStage.vue` | 大纲树形结构 |
| 章节编辑页 | `components/longwriting/story/ChapterEditor.vue` | 章节内容编辑 |
| 版本历史对话框 | `components/longwriting/story/VersionHistoryDialog.vue` | 版本对比 |

### 3. 评论类编辑界面

| 页面 | 文件路径 | 说明 |
|------|----------|------|
| 评论编辑主页 | `views/CommentEditor.vue` | 顶部阶段导航，内容区域 |
| 主题素材页 | `components/longwriting/comment/TopicStage.vue` | 主题+素材管理 |
| 素材管理对话框 | `components/longwriting/comment/MaterialDialog.vue` | 添加/查看素材 |
| 大纲设计页 | `components/longwriting/comment/OutlineStage.vue` | 大纲结构 |
| 章节编辑页 | `components/longwriting/comment/ChapterEditor.vue` | 章节内容编辑 |

### 4. 设定集与导出界面

| 页面 | 文件路径 | 说明 |
|------|----------|------|
| 设定集预览页 | `views/SettingPreview.vue` | 卡片展示 |
| 角色卡片 | `components/longwriting/preview/CharacterCard.vue` | 角色信息+人像 |
| 地点卡片 | `components/longwriting/preview/LocationCard.vue` | 地点信息 |
| 技能卡片 | `components/longwriting/preview/SkillCard.vue` | 技能信息 |
| 物品卡片 | `components/longwriting/preview/ItemCard.vue` | 物品信息 |
| 导出对话框 | `components/longwriting/ExportDialog.vue` | 导出格式选择 |

### 5. 公共组件

| 组件 | 文件路径 | 说明 |
|------|----------|------|
| AI 协作对话 | `components/longwriting/common/AiChatPanel.vue` | AI 对话交互 |
| 大纲树组件 | `components/longwriting/common/OutlineTree.vue` | 树形大纲展示 |
| @ 引用输入框 | `components/longwriting/common/ReferenceInput.vue` | 支持 @ 引用的编辑器 |
| 阶段进度条 | `components/longwriting/common/StageProgress.vue` | 显示当前阶段 |

---

## 开发阶段规划

### 阶段一：基础设施（预计 1 天）

**目标**：搭建项目骨架

**任务**：
1. 创建数据库表结构
2. 创建类型定义文件
3. 创建 Repository 层
4. 创建 Service 层骨架
5. 创建 IPC 处理器骨架
6. 添加路由配置
7. 添加导航菜单入口

**文件清单**：
```
src/shared/types/longwriting.types.ts          # 类型定义
src/main/database/migrations/                  # 数据库迁移
src/main/database/repositories/                # Repository 层
src/main/services/longwriting.service.ts       # Service 骨架
src/main/ipc/handlers/longwriting.handler.ts   # IPC 处理器
src/renderer/src/router/index.ts               # 路由配置
```

---

### 阶段二：项目管理界面（预计 1 天）

**目标**：完成项目列表和创建流程

**界面**：
- 项目列表页
- 新建项目对话框

**功能**：
- 显示项目列表（Mock 数据）
- 创建项目对话框
- 项目卡片展示（类型、阶段、进度）
- 编辑项目名称
- 删除项目确认

**文件清单**：
```
src/renderer/src/views/LongWriting.vue
src/renderer/src/components/longwriting/CreateProjectDialog.vue
```

---

### 阶段三：故事类概要设计界面（预计 1 天）

**目标**：完成概要设计阶段界面

**界面**：
- 故事编辑主页框架
- 概要设计页
- AI 协作对话组件

**功能**：
- 阶段导航切换
- 故事类型选择
- 概要表单输入
- AI 对话面板
- 确认锁定按钮

**文件清单**：
```
src/renderer/src/views/StoryEditor.vue
src/renderer/src/components/longwriting/story/OverviewStage.vue
src/renderer/src/components/longwriting/common/AiChatPanel.vue
src/renderer/src/components/longwriting/common/StageProgress.vue
```

---

### 阶段四：背景与地点界面（预计 1 天）

**目标**：完成背景设定阶段界面

**界面**：
- 背景设定页
- 地点卡片列表
- 地点编辑对话框

**功能**：
- 时代背景表单
- 地点列表展示
- 添加/编辑/删除地点
- AI 协作对话

**文件清单**：
```
src/renderer/src/components/longwriting/story/BackgroundStage.vue
src/renderer/src/components/longwriting/story/LocationEditDialog.vue
```

---

### 阶段五：角色设定界面（预计 2 天）

**目标**：完成角色设定阶段界面（含人像联动）

**界面**：
- 角色设定页
- 角色编辑对话框
- 人像关联对话框
- 角色关系设置

**功能**：
- 角色列表卡片展示
- 角色信息编辑表单
- 角色关系设置
- 关联人像形象（选择人物列表）
- 预览人像多角度
- 跳转人像设计创建

**文件清单**：
```
src/renderer/src/components/longwriting/story/CharacterStage.vue
src/renderer/src/components/longwriting/story/CharacterEditDialog.vue
src/renderer/src/components/longwriting/story/PortraitLinkDialog.vue
src/renderer/src/components/longwriting/story/CharacterRelationDialog.vue
```

---

### 阶段六：技能物品界面（预计 1 天）

**目标**：完成技能物品设定阶段界面

**界面**：
- 技能物品页
- 技能编辑对话框
- 物品编辑对话框

**功能**：
- 技能列表展示
- 技能编辑（名称、类型、等级、描述）
- 关联角色
- 物品列表展示
- 物品编辑
- 关联持有者

**文件清单**：
```
src/renderer/src/components/longwriting/story/SkillItemStage.vue
src/renderer/src/components/longwriting/story/SkillEditDialog.vue
src/renderer/src/components/longwriting/story/ItemEditDialog.vue
```

---

### 阶段七：大纲设计界面（预计 2 天）

**目标**：完成大纲设计阶段界面

**界面**：
- 大纲设计页
- 大纲树组件
- 大纲节点编辑

**功能**：
- 大纲树形展示（支持嵌套）
- 添加卷/章/节
- 编辑节点信息（概要、涉及角色、地点）
- 删除节点
- 拖拽调整顺序
- AI 生成大纲对话

**文件清单**：
```
src/renderer/src/components/longwriting/story/OutlineStage.vue
src/renderer/src/components/longwriting/common/OutlineTree.vue
src/renderer/src/components/longwriting/story/OutlineNodeEditDialog.vue
```

---

### 阶段八：章节编辑界面（预计 2 天）

**目标**：完成章节编辑和版本管理界面

**界面**：
- 章节编辑页
- @ 引用输入框
- 版本历史对话框
- 版本对比组件

**功能**：
- 章节正文编辑
- @ 引用高亮和提示
- 生成内容按钮
- 手动编辑
- 保存版本
- 版本列表
- 版本对比（差异高亮）
- 版本回退
- 版本锁定

**文件清单**：
```
src/renderer/src/components/longwriting/story/ChapterEditor.vue
src/renderer/src/components/longwriting/common/ReferenceInput.vue
src/renderer/src/components/longwriting/story/VersionHistoryDialog.vue
src/renderer/src/components/longwriting/story/VersionCompareDialog.vue
```

---

### 阶段九：评论类界面（预计 1.5 天）

**目标**：完成评论类写作界面

**界面**：
- 评论编辑主页
- 主题素材页
- 素材管理对话框
- 大纲设计页
- 章节编辑页

**功能**：
- 主题表单输入
- 素材上传（文件/网址/手动）
- 素材列表
- 大纲设计
- 章节编辑（复用故事类组件）

**文件清单**：
```
src/renderer/src/views/CommentEditor.vue
src/renderer/src/components/longwriting/comment/TopicStage.vue
src/renderer/src/components/longwriting/comment/MaterialDialog.vue
src/renderer/src/components/longwriting/comment/OutlineStage.vue
src/renderer/src/components/longwriting/comment/ChapterEditor.vue
```

---

### 阶段十：设定集预览与导出界面（预计 2 天）

**目标**：完成设定集预览和导出功能

**界面**：
- 设定集预览页
- 角色卡片
- 地点卡片
- 技能卡片
- 物品卡片
- 导出对话框

**功能**：
- 设定卡片展示
- 卡片展开/折叠
- 筛选显示
- 点击卡片跳转编辑
- 选择导出范围
- 选择导出格式（TXT/MD/PDF/长图）
- 导出按钮

**文件清单**：
```
src/renderer/src/views/SettingPreview.vue
src/renderer/src/components/longwriting/preview/SettingPreview.vue
src/renderer/src/components/longwriting/preview/CharacterCard.vue
src/renderer/src/components/longwriting/preview/LocationCard.vue
src/renderer/src/components/longwriting/preview/SkillCard.vue
src/renderer/src/components/longwriting/preview/ItemCard.vue
src/renderer/src/components/longwriting/preview/OverviewCard.vue
src/renderer/src/components/longwriting/ExportDialog.vue
```

---

### 阶段十一：业务逻辑实现（预计 5 天）

**目标**：实现所有业务逻辑和 AI 集成

**任务**：
1. 项目管理逻辑（CRUD）
2. 故事概要生成（AI 集成）
3. 背景地点设定逻辑
4. 角色设定逻辑（含人像联动）
5. 技能物品设定逻辑
6. 大纲生成逻辑（AI 集成）
7. 章节生成逻辑（AI 集成 + @ 引用解析）
8. 版本管理逻辑
9. 素材管理逻辑（网址抓取）
10. 设定集预览逻辑
11. 导出逻辑（TXT/MD/PDF/长图）

---

## 时间估算

| 阶段 | 工作内容 | 预计时间 |
|------|----------|----------|
| 阶段一 | 基础设施 | 1 天 |
| 阶段二 | 项目管理界面 | 1 天 |
| 阶段三 | 概要设计界面 | 1 天 |
| 阶段四 | 背景与地点界面 | 1 天 |
| 阶段五 | 角色设定界面 | 2 天 |
| 阶段六 | 技能物品界面 | 1 天 |
| 阶段七 | 大纲设计界面 | 2 天 |
| 阶段八 | 章节编辑界面 | 2 天 |
| 阶段九 | 评论类界面 | 1.5 天 |
| 阶段十 | 设定集预览与导出 | 2 天 |
| 阶段十一 | 业务逻辑实现 | 5 天 |
| **合计** | | **19.5 天** |

---

## 技术要点

### 1. 大纲树组件

使用递归组件实现嵌套结构，支持拖拽排序。

```vue
<template>
  <div class="outline-node">
    <div class="node-content">
      <span class="drag-handle">⋮⋮</span>
      <span class="node-name">{{ node.name }}</span>
      <span class="node-status">{{ node.status }}</span>
    </div>
    <div class="node-children" v-if="node.children">
      <OutlineNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
      />
    </div>
  </div>
</template>
```

### 2. @ 引用输入框

自定义编辑器组件，监听 @ 输入，弹出引用列表。

```typescript
// 监听 @ 输入
onInput(event) {
  const text = event.target.value
  const cursorPos = event.target.selectionStart

  // 查找 @ 符号
  const atIndex = text.lastIndexOf('@', cursorPos - 1)
  if (atIndex !== -1) {
    const query = text.substring(atIndex + 1, cursorPos)
    this.showReferencePopup(query)
  }
}
```

### 3. 版本对比

使用 `diff-match-patch` 库实现文本差异对比。

```typescript
import { diff_match_patch } from 'diff-match-patch'

function compareVersions(v1: string, v2: string) {
  const dmp = new diff_match_patch()
  const diffs = dmp.diff_main(v1, v2)
  dmp.diff_cleanupSemantic(diffs)
  return diffs // [[DIFF_DELETE, "删除"], [DIFF_INSERT, "插入"], [DIFF_EQUAL, "相同"]]
}
```

### 4. 长图导出

使用 `html2canvas` 将设定卡片渲染为图片，然后拼接成长图。

```typescript
import html2canvas from 'html2canvas'

async function exportAsLongImage(element: HTMLElement) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true
  })
  return canvas.toDataURL('image/png')
}
```

### 5. PDF 导出

使用 `jspdf` 库生成 PDF。

```typescript
import { jsPDF } from 'jspdf'

async function exportAsPDF(content: string, title: string) {
  const doc = new jsPDF()
  doc.setFont('helvetica')
  doc.text(content, 10, 10)
  doc.save(`${title}.pdf`)
}
```

---

## 风险点

1. **AI 生成质量**：AI 生成的概要、大纲、章节质量可能不稳定
   - 解决：提供多轮对话修改，支持手动编辑

2. **@ 引用解析**：复杂文本中的 @ 引用可能解析不准确
   - 解决：使用正则表达式，提供引用列表辅助

3. **版本存储**：大量版本数据可能占用存储空间
   - 解决：限制版本数量（20 个），定期清理

4. **网址抓取**：部分网站可能无法抓取
   - 解决：失败重试，提示用户手动粘贴

---

**文档版本**：v1.0
**创建日期**：2026-03-28
**作者**：AI Assistant