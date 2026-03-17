# 架构设计工作流记录

**项目：** ai-tool-box
**日期：** 2026-02-27
**参与者：** Daoge, System Architect (BMAD Agent)

---

## 1. 工作流概述

**目标：** 为AI工具箱设计系统架构，满足所有功能需求和非功能需求

**输入：**
- PRD文档：`_bmad-output/planning-artifacts/prd-ai-tool-box-2026-02-26.md`
- 产品简报：`_bmad-output/planning-artifacts/product-brief-ai-tool-box-2026-02-26.md`

**输出：**
- 架构文档：`_bmad-output/planning-artifacts/architecture-ai-tool-box-2026-02-27.md`

---

## 2. 架构驱动因素识别

用户选择的优先级：
1. **可扩展性** - 插件系统、自定义模型提供商支持
2. **跨平台** - Windows/Linux/Mac三平台一致体验

关键架构驱动因素：
- NFR-003: API密钥安全存储
- NFR-012: 跨平台一致性
- NFR-001: 响应时间要求
- NFR-005: 网络安全
- NFR-006: 错误处理与恢复
- NFR-014: 插件/扩展支持

---

## 3. 架构模式决策

### 3.1 初始建议
- 分层架构 + 提供者抽象（Electron UI + Spring Boot本地服务 + SQLite）

### 3.2 用户反馈
用户选择 **纯Electron架构**

### 3.3 最终决策
**架构模式：** 纯Electron架构 + 模块化主进程

**理由：**
- 更简单的部署（单一应用包）
- 更低的资源占用
- 更快的启动速度
- 跨平台一致性更好
- 无需管理独立的Java服务进程

**影响：**
- 放弃Java/Spring Boot后端
- 全部使用TypeScript/Node.js实现
- 业务逻辑在Electron主进程中

---

## 4. 技术栈决策

| 层级 | 技术 | 选择理由 |
|------|------|----------|
| 桌面框架 | Electron 28+ | 跨平台成熟方案，生态丰富 |
| UI框架 | Vue 3 + TypeScript | 响应式、组件化、类型安全 |
| 状态管理 | Pinia | Vue3官方推荐，轻量级 |
| UI组件 | Element Plus / Naive UI | 中文友好，组件丰富 |
| 样式 | TailwindCSS + SCSS | 快速开发，灵活定制 |
| 构建工具 | Vite + electron-vite | 快速热更新，现代化构建 |
| 主进程 | Node.js + TypeScript | 类型安全，与渲染进程共享类型 |
| 数据库 | SQLite (better-sqlite3) | 本地嵌入式数据库，高性能 |
| 配置存储 | electron-store | 类型安全的配置存储 |
| 加密 | crypto (Node.js native) | API密钥加密存储 |
| HTTP客户端 | axios / ky | API调用，拦截器支持 |
| OCR | Tesseract.js | 纯JS实现，无需外部依赖 |

---

## 5. 核心架构设计

### 5.1 系统概览

```
┌─────────────────────────────────────────────────────────────────┐
│                      ELECTRON APPLICATION                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              RENDERER PROCESS (Vue3 UI)                  │   │
│  │  对话模块 │ 图像模块 │ 视频模块 │ OCR模块 │ 语音模块    │   │
│  │                    Pinia State Store                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │ IPC (contextBridge)                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                MAIN PROCESS (Node.js)                    │   │
│  │  IPC Handler │ Service Layer │ Provider Abstraction     │   │
│  │  Data Layer (SQLite + File System)                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │ HTTPS
                    EXTERNAL AI APIs
```

### 5.2 Provider抽象层（关键设计）

```typescript
interface IAIProvider {
  name: string;
  type: 'chat' | 'image' | 'video' | 'embedding';
  getCapabilities(): ProviderCapabilities;
  testConnection(): Promise<boolean>;
  chat(request: ChatRequest): AsyncGenerator<ChatResponse>;
  generateImage(request: ImageRequest): Promise<ImageResponse>;
  generateVideo(request: VideoRequest): Promise<VideoResponse>;
}
```

支持的提供商：
- 对话：通义千问、豆包、GLM、DeepSeek、Ollama
- 图像：通义万项、火山引擎、智谱
- 视频：火山引擎
- 语音：火山引擎豆包语音

### 5.3 数据架构

数据库：SQLite
核心实体：
- User（用户设置）
- ApiKey（加密存储的API密钥）
- Conversation（对话）
- Message（消息）
- Role（角色预设）
- KnowledgeBase（知识库）
- GeneratedImage（生成图像记录）
- GeneratedVideo（生成视频记录）

### 5.4 IPC通信设计

关键IPC通道：
- `dialog:*` - 对话相关
- `image:*` - 图像生成相关
- `video:*` - 视频生成相关
- `ocr:*` - OCR识别相关
- `voice:*` - 语音转换相关
- `kb:*` - 知识库相关
- `settings:*` - 设置相关
- `api-key:*` - API密钥管理

---

## 6. 安全架构

### 6.1 API密钥加密存储

```
加密流程:
1. 用户输入API密钥
2. 使用PBKDF2派生256位密钥（基于machine-id + salt）
3. 使用AES-256-GCM加密
4. 存储加密后的密钥到SQLite（包含iv和auth_tag）
5. 运行时解密仅在内存中保留，不写入日志
```

### 6.2 IPC安全

- 使用contextBridge安全暴露API
- 验证所有来自渲染进程的输入
- 渲染进程无直接Node.js访问权限
- nodeIntegration: false
- sandbox: true

### 6.3 网络安全

- 所有外部API调用使用HTTPS
- 启用证书验证
- 请求超时设置
- 不在URL参数中传递敏感数据

---

## 7. 项目结构

```
ai-tool-box/
├── src/
│   ├── main/           # Electron主进程
│   │   ├── ipc/        # IPC处理器
│   │   ├── services/   # 业务服务
│   │   ├── providers/  # AI提供商实现
│   │   ├── database/   # 数据库层
│   │   ├── storage/    # 存储层
│   │   └── utils/      # 工具函数
│   ├── renderer/       # Electron渲染进程（Vue3）
│   │   ├── views/      # 页面组件
│   │   ├── components/ # 通用组件
│   │   ├── stores/     # Pinia状态管理
│   │   └── i18n/       # 国际化
│   ├── shared/         # 共享代码（类型定义）
│   └── preload/        # Preload脚本
├── resources/          # 静态资源
├── build/              # 构建配置
└── tests/              # 测试
```

---

## 8. 开发与部署

### 8.1 CI/CD

使用GitHub Actions：
- 支持Windows、macOS、Linux三平台构建
- 自动化测试
- 标签触发发布

### 8.2 测试策略

| 类型 | 工具 | 覆盖率目标 |
|------|------|-----------|
| 单元测试 | Vitest | 80%+ |
| 组件测试 | Vue Test Utils | 关键组件100% |
| E2E测试 | Playwright | 核心流程覆盖 |

---

## 9. 需求追溯

### 9.1 功能需求覆盖

所有16个功能需求都已分配到具体组件。

### 9.2 非功能需求覆盖

所有14个非功能需求都有对应的架构解决方案。

---

## 10. 决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 架构模式 | 纯Electron | 更简单、更轻量、更好的跨平台一致性 |
| 后端技术 | Node.js/TypeScript | 与前端技术栈统一，降低复杂度 |
| 数据库 | SQLite | 嵌入式、高性能、无需额外服务 |
| UI框架 | Vue3 | 响应式、组件化、中文生态好 |
| 构建工具 | Vite + electron-vite | 快速开发体验 |

---

## 11. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| Electron内存占用高 | 中 | 中 | 延迟加载、内存优化 |
| SQLite并发性能 | 低 | 低 | 使用WAL模式、连接池 |
| 第三方API稳定性 | 中 | 高 | 重试机制、多提供商支持 |
| 跨平台兼容性 | 中 | 中 | 充分测试、平台特定代码隔离 |

---

## 12. 下一步

1. 用户审批架构文档
2. 运行 `/sprint-planning` 开始Sprint规划
3. 创建详细的用户故事
4. 开始实现

---

**工作流状态：** 完成
**创建时间：** 2026-02-27
**最后更新：** 2026-02-27
