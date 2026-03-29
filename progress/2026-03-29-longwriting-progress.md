# 长文写作模块开发进度

## 已完成

### 基础架构
- [x] 数据库表设计（lw_projects, lw_story_overviews, lw_characters, lw_backgrounds, lw_locations, lw_skills, lw_items, lw_materials, lw_outlines, lw_chapters, lw_chapter_versions, lw_character_relations）
- [x] Repository 层实现
- [x] Service 层实现
- [x] IPC 处理器注册
- [x] Preload API 暴露

### 前端组件
- [x] 故事类型 - 6 个阶段组件
- [x] 评论类型 - 3 个阶段组件
- [x] 所有组件连接真实 IPC

### AI 生成功能
- [x] LongWritingAIService 服务创建
- [x] 故事概要生成
- [x] 角色建议生成
- [x] 技能物品建议生成
- [x] 大纲建议生成（故事类型）
- [x] 大纲建议生成（评论类型）
- [x] 章节内容生成
- [x] 段落内容生成
- [x] 流式生成支持
- [x] IPC 处理器注册
- [x] Preload API 暴露
- [x] **修复 eventId 不匹配问题** - 前端传递 eventId 给后端

### 前端集成 AI 生成
- [x] 更新组件使用真实 AI API
- [x] 添加生成进度显示
- [x] 添加取消生成功能

### 人像关联功能
- [x] 从人像模块获取项目列表
- [x] 人像预览图显示（CharacterStage.vue）
- [x] 关联/取消关联人像

### 素材处理功能
- [x] MaterialProcessorService 服务创建
- [x] 文件内容提取（txt, md）
- [x] PDF/DOCX 提取占位实现
- [x] 网页内容抓取（HTTP + HTML 解析）
- [x] IPC 处理器注册（processMaterial）
- [x] Preload API 暴露（processMaterial）
- [x] 前端异步处理调用（processMaterialAsync）

### 导出功能
- [x] IPC 处理器（exportMarkdown, exportWord, getExportData）
- [x] Preload API 暴露
- [x] 导出对话框组件（ExportDialog.vue）
- [x] StoryEditor 集成导出功能
- [x] CommentEditor 集成导出功能
- [x] Markdown 格式化导出数据
- [x] Word 文档生成

### 模型选择功能
- [x] OverviewStage 添加模型选择下拉框
- [x] 按提供商分组显示模型
- [x] 支持搜索过滤
- [x] 显示模型特性图标（深度思考、联网搜索、工具调用）
- [x] 后端支持接收模型参数
- [x] AI 服务支持自定义模型

## 待完成

### 素材处理优化
- [ ] PDF 内容提取（需安装 pdf-parse 库）
- [ ] DOCX 内容提取（需安装 mammoth 库）

### 其他功能
- [ ] 其他阶段组件添加模型选择
- [ ] 自动保存优化
- [ ] 端到端测试

## 问题修复记录

### 2026-03-29: eventId 不匹配导致前端无法接收 AI 生成结果
**问题**：AI 生成调用成功，但前端一直显示"生成中"，没有收到结果。
**原因**：前端生成的 eventId 为 `overview-${projectId}-${timestamp}`，而 IPC 处理器又创建了新的 eventId `story-overview-${timestamp}`，导致前端监听的频道和服务发送的频道不匹配。
**解决方案**：修改所有 AI 生成 API，让前端传递 eventId 给后端，后端使用前端传递的 eventId。
**修改文件**：
- `src/preload/index.ts` - 所有 generate 方法第一个参数改为 eventId
- `src/main/ipc/handlers/longwriting.handler.ts` - IPC 处理器接收 eventId
- 前端所有生成组件 - 传递 currentEventId.value 给 API