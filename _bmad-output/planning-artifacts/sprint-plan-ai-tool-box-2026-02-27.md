# Sprint计划 - AI工具箱

**日期：** 2026-02-27
**Scrum Master：** Daoge
**项目级别：** 2（中型）
**策略：** MVP优先

---

## 执行摘要

本文档定义了AI工具箱项目的Sprint计划，采用MVP优先策略，在4周内交付核心功能。

**关键指标：**
- 总故事数：14（MVP范围）
- 总故事点：62
- 计划Sprint数：2
- 团队容量：30点/Sprint
- 目标完成日期：2026-03-27

---

## 团队配置

| 项目 | 配置 |
|------|------|
| 团队规模 | 1人 |
| 经验水平 | 高级 |
| Sprint长度 | 2周 |
| 工作日/Sprint | 10天 |
| 高效工时/天 | 6小时 |
| 容量/Sprint | 30点 |

---

## 故事清单

### STORY-001: 项目初始化与基础架构

**Epic:** EPIC-005 系统基础设施
**优先级:** Must Have
**点数:** 5
**Sprint:** 1

**用户故事:**
> 作为开发者，我想要初始化项目并搭建基础架构，以便后续功能开发

**验收标准:**
- [ ] Electron + Vue3 + Vite项目初始化
- [ ] TypeScript配置完成
- [ ] 目录结构按架构文档创建
- [ ] ESLint + Prettier配置
- [ ] 基础构建脚本可用
- [ ] electron-vite配置完成

**技术说明:**
- 使用 `npm create electron-vite` 初始化
- 按架构文档创建目录结构
- 配置 `electron.vite.config.ts`

**依赖:** 无

---

### STORY-002: 数据库初始化

**Epic:** EPIC-005 系统基础设施
**优先级:** Must Have
**点数:** 3
**Sprint:** 1

**用户故事:**
> 作为开发者，我想要初始化SQLite数据库，以便应用可以存储数据

**验收标准:**
- [ ] better-sqlite3集成
- [ ] 数据库初始化脚本
- [ ] 数据库迁移机制
- [ ] Repository基础类
- [ ] 测试连接成功

**技术说明:**
- 使用 better-sqlite3
- 数据库文件存储在 `app.getPath('userData')`
- 实现 DatabaseManager 类

**依赖:** STORY-001

---

### STORY-003: IPC通信基础

**Epic:** EPIC-005 系统基础设施
**优先级:** Must Have
**点数:** 3
**Sprint:** 1

**用户故事:**
> 作为开发者，我想要建立IPC通信机制，以便渲染进程和主进程可以通信

**验收标准:**
- [ ] Preload脚本配置
- [ ] contextBridge安全暴露
- [ ] IPC Handler基础框架
- [ ] 类型安全的IPC调用
- [ ] 示例IPC通道测试通过

**技术说明:**
- 在 `src/preload/index.ts` 中使用 contextBridge
- 创建 `src/main/ipc/` 目录存放handlers
- 在 `src/shared/types/ipc.types.ts` 定义类型

**依赖:** STORY-001

---

### STORY-004: 安全存储实现

**Epic:** EPIC-005 系统基础设施
**优先级:** Must Have
**点数:** 5
**Sprint:** 1

**用户故事:**
> 作为用户，我想要安全地存储API密钥，以便我的密钥不会被泄露

**验收标准:**
- [ ] AES-256-GCM加密实现
- [ ] PBKDF2密钥派生
- [ ] API密钥加密存储到数据库
- [ ] API密钥解密读取
- [ ] 单元测试通过

**技术说明:**
- 使用 Node.js crypto 模块
- 从 machine-id 派生加密密钥
- 实现 SecureStorage 类
- 存储：encrypted_data + iv + auth_tag

**依赖:** STORY-002

---

### STORY-005: 主界面布局

**Epic:** EPIC-005 系统基础设施
**优先级:** Must Have
**点数:** 5
**Sprint:** 1

**用户故事:**
> 作为用户，我想要看到清晰的主界面布局，以便我可以方便地使用各个功能

**验收标准:**
- [ ] 侧边栏导航（功能模块列表）
- [ ] 主内容区域
- [ ] 顶部导航栏（模型切换、设置）
- [ ] 深色/浅色主题切换
- [ ] 响应式布局基础

**技术说明:**
- 使用 Element Plus / Naive UI 组件
- 实现 AppSidebar, AppHeader, AppMain 组件
- 使用 Pinia 管理 settings store
- CSS变量实现主题切换

**依赖:** STORY-001, STORY-003

---

### STORY-006: Provider抽象层

**Epic:** EPIC-001 AI对话核心系统
**优先级:** Must Have
**点数:** 5
**Sprint:** 1

**用户故事:**
> 作为开发者，我想要实现Provider抽象层，以便可以统一管理多个AI提供商

**验收标准:**
- [ ] IAIProvider接口定义
- [ ] BaseProvider抽象类
- [ ] ProviderManager实现
- [ ] 提供商注册机制
- [ ] 类型定义完整

**技术说明:**
- 接口定义在 `src/shared/types/provider.types.ts`
- 基类实现 `src/main/providers/base.provider.ts`
- 管理器 `src/main/providers/provider.manager.ts`

**依赖:** STORY-003, STORY-004

---

### STORY-007: 通义千问Provider

**Epic:** EPIC-001 AI对话核心系统
**优先级:** Must Have
**点数:** 5
**Sprint:** 1

**用户故事:**
> 作为用户，我想要使用通义千问进行对话，以便获得AI回答

**验收标准:**
- [ ] QwenProvider实现
- [ ] 流式响应支持（SSE）
- [ ] 连接测试功能
- [ ] 错误处理和重试
- [ ] 集成到ProviderManager

**技术说明:**
- API端点: `https://dashscope.aliyuncs.com/api/v1`
- 支持模型: qwen-turbo, qwen-plus, qwen-max
- 使用 fetch API + ReadableStream 处理流式响应

**依赖:** STORY-006

---

### STORY-009: 对话界面

**Epic:** EPIC-001 AI对话核心系统
**优先级:** Must Have
**点数:** 8
**Sprint:** 2

**用户故事:**
> 作为用户，我想要在对话界面中与AI交流，以便获得我需要的信息

**验收标准:**
- [ ] 消息列表展示（用户/助手消息）
- [ ] 消息输入框
- [ ] 流式响应实时显示
- [ ] Markdown渲染
- [ ] 代码语法高亮
- [ ] 消息复制功能
- [ ] 模型选择器

**技术说明:**
- 组件: ChatMessage, ChatInput, ChatList
- 使用 marked 或 markdown-it 渲染Markdown
- 使用 highlight.js 或 Prism.js 代码高亮
- IPC调用: `dialog:send`, `dialog:stream`

**依赖:** STORY-005, STORY-007

---

### STORY-010: 角色预设系统

**Epic:** EPIC-001 AI对话核心系统
**优先级:** Must Have
**点数:** 5
**Sprint:** 2

**用户故事:**
> 作为用户，我想要选择不同的AI角色，以便获得专业领域的帮助

**验收标准:**
- [ ] 角色列表展示
- [ ] 预设角色数据（10+个）
- [ ] 角色选择功能
- [ ] 系统提示词注入
- [ ] 角色创建/编辑（基础版）

**技术说明:**
- 数据存储在 roles 表
- 预设角色JSON文件
- 组件: RoleSelector, RoleCard
- IPC: `role:list`, `role:create`

**依赖:** STORY-002, STORY-009

---

### STORY-012: OCR识别

**Epic:** EPIC-003 文档处理与转换工具
**优先级:** Must Have
**点数:** 5
**Sprint:** 2

**用户故事:**
> 作为用户，我想要识别图片中的文字，以便将图片内容转换为可编辑文本

**验收标准:**
- [ ] Tesseract.js集成
- [ ] 图片上传功能（拖拽支持）
- [ ] 中英文识别支持
- [ ] 识别结果展示
- [ ] 结果复制和导出
- [ ] 识别历史记录

**技术说明:**
- 使用 Tesseract.js（纯JS实现）
- 支持格式: JPG, PNG, BMP
- 组件: OcrView, ImageUploader, ResultDisplay
- IPC: `ocr:recognize`

**依赖:** STORY-005

---

### STORY-014: 文本转语音（TTS）

**Epic:** EPIC-003 文档处理与转换工具
**优先级:** Must Have
**点数:** 5
**Sprint:** 2

**用户故事:**
> 作为用户，我想要将文本转换为语音，以便听取内容

**验收标准:**
- [ ] 火山引擎豆包语音API集成
- [ ] 多种声音选择
- [ ] 语速调节
- [ ] 音频播放器
- [ ] 音频下载
- [ ] 文本输入区域

**技术说明:**
- API: 火山引擎TTS API
- 实现 DoubaoTtsProvider
- 组件: TtsView, VoiceSelector, AudioPlayer
- IPC: `voice:tts`

**依赖:** STORY-004, STORY-005

---

### STORY-016: 多语言翻译

**Epic:** EPIC-003 文档处理与转换工具
**优先级:** Must Have
**点数:** 3
**Sprint:** 2

**用户故事:**
> 作为用户，我想要翻译文本，以便理解其他语言的内容

**验收标准:**
- [ ] 翻译API集成（Google/百度/DeepL）
- [ ] 语言选择（源语言/目标语言）
- [ ] 原文/译文对照显示
- [ ] 结果复制
- [ ] 翻译历史记录

**技术说明:**
- 选择一个翻译API实现
- 组件: TranslateView, LanguageSelector
- IPC: `translate:text`

**依赖:** STORY-005

---

### STORY-017: 图像生成基础

**Epic:** EPIC-002 多媒体内容生成
**优先级:** Must Have
**点数:** 5（简化版）
**Sprint:** 2

**用户故事:**
> 作为用户，我想要通过提示词生成图像，以便创建我需要的图片

**验收标准:**
- [ ] 通义万项API集成
- [ ] 提示词输入
- [ ] 基础参数设置（尺寸）
- [ ] 生成状态显示
- [ ] 图像预览
- [ ] 图像保存到本地
- [ ] 生成历史列表

**技术说明:**
- 实现 QwenImageProvider
- API: 通义万项图像生成API
- 组件: ImageView, PromptInput, ImageGallery
- IPC: `image:generate`, `image:list`

**依赖:** STORY-004, STORY-005

---

## Sprint分配

### Sprint 1（第1-2周）- 基础架构 + AI对话核心

**Sprint目标:** 完成项目基础架构和核心AI对话能力

**时间范围:** 2026-02-27 ~ 2026-03-12

| Story ID | 名称 | 点数 | 状态 |
|----------|------|------|------|
| STORY-001 | 项目初始化与基础架构 | 5 | 未开始 |
| STORY-002 | 数据库初始化 | 3 | 未开始 |
| STORY-003 | IPC通信基础 | 3 | 未开始 |
| STORY-004 | 安全存储实现 | 5 | 未开始 |
| STORY-005 | 主界面布局 | 5 | 未开始 |
| STORY-006 | Provider抽象层 | 5 | 未开始 |
| STORY-007 | 通义千问Provider | 5 | 未开始 |

**Sprint 1 统计:**
- 总点数: 31
- 容量: 30
- 利用率: 103%
- 风险: 中（轻微超载）

**Sprint 1 交付物:**
- ✅ 可运行的Electron应用
- ✅ 安全的API密钥存储
- ✅ 基础UI框架
- ✅ AI对话能力（通义千问）

---

### Sprint 2（第3-4周）- 对话完善 + 文档处理 + 图像生成

**Sprint目标:** 完善对话功能，添加文档处理和图像生成能力

**时间范围:** 2026-03-13 ~ 2026-03-27

| Story ID | 名称 | 点数 | 状态 |
|----------|------|------|------|
| STORY-009 | 对话界面 | 8 | 未开始 |
| STORY-010 | 角色预设系统 | 5 | 未开始 |
| STORY-012 | OCR识别 | 5 | 未开始 |
| STORY-014 | 文本转语音（TTS） | 5 | 未开始 |
| STORY-016 | 多语言翻译 | 3 | 未开始 |
| STORY-017 | 图像生成基础 | 5 | 未开始 |

**Sprint 2 统计:**
- 总点数: 31
- 容量: 30
- 利用率: 103%
- 风险: 中（轻微超载）

**Sprint 2 交付物:**
- ✅ 完整的对话界面
- ✅ 角色预设系统
- ✅ OCR文字识别
- ✅ 文本转语音
- ✅ 多语言翻译
- ✅ 图像生成

---

## Epic追溯矩阵

| Epic ID | Epic名称 | 故事 | 总点数 | Sprint |
|---------|----------|------|--------|--------|
| EPIC-005 | 系统基础设施 | STORY-001, 002, 003, 004, 005 | 21 | 1 |
| EPIC-001 | AI对话核心系统 | STORY-006, 007, 009, 010 | 23 | 1-2 |
| EPIC-003 | 文档处理与转换工具 | STORY-012, 014, 016 | 13 | 2 |
| EPIC-002 | 多媒体内容生成 | STORY-017 | 5 | 2 |
| EPIC-004 | 知识管理与智能搜索 | (延后到v1.1) | - | - |

---

## 功能需求覆盖

| FR ID | FR名称 | Story | Sprint |
|-------|--------|-------|--------|
| FR-001 | 多模型支持 | STORY-006, 007 | 1 |
| FR-002 | 对话界面 | STORY-009 | 2 |
| FR-003 | 角色预设系统 | STORY-010 | 2 |
| FR-005 | 图像生成 | STORY-017 | 2 |
| FR-007 | OCR识别 | STORY-012 | 2 |
| FR-008 | 文本转语音 | STORY-014 | 2 |
| FR-010 | 多语言翻译 | STORY-016 | 2 |
| FR-015 | 用户设置与配置 | STORY-004, 005 | 1 |
| FR-016 | 跨平台桌面应用 | STORY-001 | 1 |
| FR-004 | 对话历史管理 | (v1.1) | - |
| FR-006 | 流程化创作 | (v1.1) | - |
| FR-009 | 语音转文本 | (v1.1) | - |
| FR-011 | 知识库创建 | (v1.1) | - |
| FR-012 | 知识库集成 | (v1.1) | - |
| FR-013 | 网络搜索 | (v1.1) | - |
| FR-014 | MCP协议 | (v1.1) | - |

**MVP覆盖率:** 9/16 FR (56%)

---

## 风险与缓解

### 高风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Sprint轻微超载(103%) | 可能延期 | 保持每日进度跟踪，必要时调整范围 |
| 首次使用Electron | 技术风险 | 提前研究文档，Sprint 1预留学习时间 |

### 中风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 第三方API稳定性 | 功能不可用 | 实现重试机制，提供清晰错误提示 |
| API密钥安全实现复杂 | 延期 | 参考成熟方案，简化首次实现 |

### 低风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| UI组件库选择 | 样式调整 | 选择熟悉的组件库(Element Plus) |
| 代码高亮实现 | 功能完善 | 使用成熟库(highlight.js) |

---

## 依赖关系

### 技术依赖
- Node.js 20+
- npm / pnpm
- Git

### 外部服务依赖
- 通义千问 API（对话）
- 通义万项 API（图像）
- 火山引擎 API（TTS）
- 翻译 API（待选）

### 账号/密钥
- 阿里云账号（通义千问/万项）
- 火山引擎账号（TTS）
- 翻译API账号

---

## 完成定义（Definition of Done）

故事被视为完成的标准：

- [ ] 代码已实现并提交到Git
- [ ] 单元测试编写并通过
- [ ] 代码已自我审查
- [ ] 功能在开发环境验证通过
- [ ] 验收标准全部满足
- [ ] 无明显的Bug或问题
- [ ] 相关文档已更新（如需要）

---

## 下一步行动

### 立即行动

1. **开始Sprint 1**
   - 运行 `/dev-story STORY-001` 开始第一个故事

2. **准备API密钥**
   - 注册通义千问账号
   - 获取API密钥

3. **开发环境准备**
   - 确保Node.js 20+已安装
   - 确保Git已配置

### Sprint节奏

- Sprint长度: 2周
- 每日检查: 进度跟踪
- Sprint评审: 第2周周五
- Sprint回顾: 第2周周五

---

## v1.1版本规划（后续迭代）

以下功能计划在v1.1版本实现：

| Story ID | 名称 | 点数 |
|----------|------|------|
| STORY-008 | 其他AI Provider | 5 |
| STORY-011 | 对话历史管理 | 3 |
| STORY-013 | OCR批量处理 | 3 |
| STORY-015 | 语音转文本 | 5 |
| STORY-018 | 多图像Provider | 5 |
| STORY-019 | 视频生成 | 5 |
| STORY-020 | 流程化创作 | 5 |
| STORY-021 | 知识库创建 | 5 |
| STORY-022 | 知识库集成 | 5 |
| STORY-023 | 网络搜索 | 3 |

**v1.1预估:** 44点（约1.5个Sprint）

---

**本计划使用BMAD Method v6 - Phase 4 (实施规划) 创建**

*继续: 运行 `/dev-story STORY-001` 开始第一个故事*
