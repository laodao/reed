# 系统架构文档 - AI工具箱

**日期：** 2026-02-27
**架构师：** Daoge
**版本：** 1.0
**项目类型：** 桌面应用
**项目级别：** 级别2（中型）
**状态：** ✅ 已审批

---

## 文档概述

本文档定义了AI工具箱项目的系统架构。它为实施提供技术蓝图，覆盖PRD中的所有功能需求和非功能需求。

**相关文档：**
- 产品需求文档：`_bmad-output/planning-artifacts/prd-ai-tool-box-2026-02-26.md`
- 产品简报：`_bmad-output/planning-artifacts/product-brief-ai-tool-box-2026-02-26.md`

---

## 执行摘要

AI工具箱采用**纯Electron架构**，结合Vue3前端和Node.js主进程，实现跨平台桌面应用。核心设计包括：

1. **Provider抽象层** - 统一接口支持多个AI服务提供商
2. **本地优先架构** - 所有数据存储在本地，无需云端依赖
3. **模块化设计** - 各AI能力独立模块，便于扩展和维护
4. **安全存储** - API密钥使用AES-256加密存储

---

## 架构驱动因素

这些需求对架构决策有重大影响：

| # | NFR | 需求 | 架构影响 |
|---|-----|------|----------|
| 1 | NFR-003 | API密钥安全存储 | AES-256-GCM加密，不明文存储 |
| 2 | NFR-012 | 跨平台一致性 | Electron统一抽象层 |
| 3 | NFR-001 | 响应时间 < 5秒启动 | 代码分割、延迟加载、异步处理 |
| 4 | NFR-005 | 网络安全 | HTTPS + 证书验证 |
| 5 | NFR-006 | 错误处理与恢复 | 重试机制、状态恢复 |
| 6 | NFR-014 | 插件/扩展支持 | Provider接口、插件架构 |

**用户优先级：**
- 可扩展性（插件系统、自定义模型提供商）
- 跨平台（Windows/Linux/Mac一致体验）

---

## 系统概览

### 高层架构

**架构模式：** 纯Electron架构 + 模块化主进程

**选择理由：**
- 更简单的部署（单一应用包）
- 更低的资源占用
- 更快的启动速度
- 跨平台一致性更好
- 无需管理独立的后端服务进程

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      ELECTRON APPLICATION                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              RENDERER PROCESS (Vue3 UI)                  │   │
│  │  ┌─────────┬─────────┬─────────┬─────────┬─────────┐   │   │
│  │  │ 对话    │ 图像    │ 视频    │ OCR     │ 语音    │   │   │
│  │  │ 页面    │ 页面    │ 页面    │ 页面    │ 页面    │   │   │
│  │  └─────────┴─────────┴─────────┴─────────┴─────────┘   │   │
│  │                    Pinia State Store                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │ IPC (contextBridge)                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                MAIN PROCESS (Node.js)                    │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │              IPC Handler Layer                   │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │           Service Layer (TypeScript)             │    │   │
│  │  │  Dialog │ Image │ OCR │ Voice │ Knowledge │ ... │    │   │
│  │  │  Service│Service│Svc  │Service│  Service  │     │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │       Provider Abstraction Layer (关键!)         │    │   │
│  │  │  ┌────────────────────────────────────────┐     │    │   │
│  │  │  │       IAIProvider Interface            │     │    │   │
│  │  │  └────────────────────────────────────────┘     │    │   │
│  │  │  通义千问 │ 豆包 │ GLM │ DeepSeek │ Ollama     │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │       Data Layer (SQLite + File System)          │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Native Modules (Optional)                   │   │
│  │  Tesseract.js (OCR) │ Whisper.js (STT)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────┼─────────────────────────────────────┐
│                    外部 AI APIs                                  │
│  通义千问 │ 豆包 │ GLM │ DeepSeek │ 火山引擎 │ 智谱 │ Ollama   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技术栈

### 前端技术

**选择：** Vue 3 + TypeScript + Vite

**理由：**
- Vue3 Composition API提供更好的代码组织和复用
- TypeScript提供类型安全，减少运行时错误
- Vite提供极速的开发体验和HMR
- 中文社区活跃，文档完善

**UI组件库：** Element Plus / Naive UI

**理由：**
- 中文友好，组件丰富
- 支持深色/浅色主题
- 良好的TypeScript支持

**状态管理：** Pinia

**理由：**
- Vue3官方推荐
- 轻量级，TypeScript友好
- 更简单的API设计

**样式方案：** TailwindCSS + SCSS

**理由：**
- TailwindCSS快速开发
- SCSS支持复杂样式逻辑
- 主题切换支持

### 主进程技术

**选择：** Node.js + TypeScript

**理由：**
- 与前端技术栈统一
- 丰富的npm生态系统
- TypeScript提供类型安全
- 可与渲染进程共享类型定义

**构建工具：** electron-vite

**理由：**
- 基于Vite，开发体验好
- 专为Electron优化
- 支持主进程、渲染进程、preload脚本分别构建

### 数据存储

**数据库：** SQLite (better-sqlite3)

**理由：**
- 嵌入式数据库，无需额外服务
- 高性能，适合本地应用
- 支持事务，数据一致性好
- 单文件存储，便于备份

**配置存储：** electron-store

**理由：**
- 类型安全的配置管理
- 自动持久化
- 支持默认值

### 安全技术

**加密：** Node.js crypto模块

**算法：** AES-256-GCM

**理由：**
- Node.js原生支持，无需额外依赖
- AES-256-GCM提供加密和完整性验证
- 行业标准，安全可靠

**密钥派生：** PBKDF2 / scrypt

**理由：**
- 防止暴力破解
- 基于机器ID派生，确保密钥唯一性

### 第三方服务集成

| 服务类型 | 提供商 | 用途 |
|----------|--------|------|
| 对话AI | 通义千问、豆包、GLM、DeepSeek | AI对话 |
| 本地模型 | Ollama | 本地AI对话 |
| 图像生成 | 通义万项、火山引擎、智谱 | AI绘图 |
| 视频生成 | 火山引擎 | AI视频 |
| 语音合成 | 火山引擎豆包语音 | TTS |
| 语音识别 | 火山引擎豆包语音 | STT |
| OCR | Tesseract.js | 本地文字识别 |
| 翻译 | Google翻译、百度翻译、DeepL | 多语言翻译 |

### 开发与部署工具

| 类别 | 工具 | 用途 |
|------|------|------|
| 版本控制 | Git | 代码管理 |
| 包管理 | npm / pnpm | 依赖管理 |
| 代码质量 | ESLint + Prettier | 代码规范 |
| 单元测试 | Vitest | 测试框架 |
| E2E测试 | Playwright | 端到端测试 |
| 构建 | electron-builder | 应用打包 |
| CI/CD | GitHub Actions | 自动化构建发布 |

---

## 系统组件

### 组件概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        ELECTRON APP                             │
├─────────────────────────────────────────────────────────────────┤
│  RENDERER PROCESS (Vue3)                                        │
│  ├── 1. UI Shell (布局、导航、主题)                              │
│  ├── 2. Dialog Module (对话界面、角色选择、历史管理)              │
│  ├── 3. Image Module (图像生成、流程化创作)                      │
│  ├── 4. Video Module (视频生成、创作流程)                        │
│  ├── 5. OCR Module (图片识别、批量处理)                          │
│  ├── 6. Voice Module (TTS/STT、音频处理)                        │
│  ├── 7. Knowledge Module (知识库管理、搜索)                      │
│  └── 8. Settings Module (配置、API密钥管理)                      │
├─────────────────────────────────────────────────────────────────┤
│  MAIN PROCESS (Node.js/TypeScript)                              │
│  ├── IPC Handlers (进程间通信)                                   │
│  ├── AI Provider Manager (多模型统一管理)                        │
│  ├── Dialog Service (对话业务逻辑)                               │
│  ├── Image Service (图像生成逻辑)                                │
│  ├── Video Service (视频生成逻辑)                                │
│  ├── OCR Service (文字识别逻辑)                                  │
│  ├── Voice Service (语音转换逻辑)                                │
│  ├── Knowledge Service (知识库逻辑)                              │
│  ├── Search Service (网络搜索逻辑)                               │
│  ├── Database Manager (SQLite操作)                              │
│  └── Secure Storage (加密存储)                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 核心组件详细设计

#### 组件1: UI Shell

**用途：** 应用主框架，提供布局、导航和主题管理

**职责：**
- 应用主布局（侧边栏 + 主内容区）
- 导航菜单
- 主题切换（深色/浅色）
- 全局通知和提示
- 窗口控制（最小化、最大化、关闭）

**接口：**
- Vue组件props/events
- Pinia store

**依赖：**
- Element Plus / Naive UI
- Pinia (settings store)

**覆盖FR：** FR-015, NFR-008

---

#### 组件2: Dialog Module

**用途：** AI对话功能模块

**职责：**
- 对话界面展示
- 消息输入和发送
- 流式响应展示
- 角色选择
- 对话历史管理
- Markdown渲染
- 代码高亮

**接口：**
- IPC: `dialog:*` 通道
- Pinia: dialog store

**依赖：**
- IPC Service
- Markdown渲染器
- 代码高亮库

**覆盖FR：** FR-001, FR-002, FR-003, FR-004

---

#### 组件3: AI Provider Manager

**用途：** 统一管理所有AI服务提供商

**职责：**
- 提供商注册和管理
- 提供商选择和切换
- 连接状态监控
- API密钥管理
- 请求路由

**接口：**
```typescript
interface IProviderManager {
  register(provider: IAIProvider): void;
  get(name: string): IAIProvider | undefined;
  listByType(type: ProviderType): IAIProvider[];
  testConnection(name: string): Promise<boolean>;
}
```

**依赖：**
- Secure Storage
- 各具体Provider实现

**覆盖FR：** FR-001

---

#### 组件4: Secure Storage

**用途：** 安全存储敏感数据

**职责：**
- API密钥加密存储
- 密钥派生
- 加密/解密操作
- 内存中的密钥缓存

**接口：**
```typescript
interface ISecureStorage {
  storeApiKey(provider: string, key: string): Promise<void>;
  getApiKey(provider: string): Promise<string | null>;
  deleteApiKey(provider: string): Promise<void>;
  listProviders(): Promise<string[]>;
}
```

**依赖：**
- Node.js crypto
- SQLite

**覆盖FR：** FR-015, NFR-003

---

#### 组件5: Database Manager

**用途：** 数据库操作封装

**职责：**
- SQLite连接管理
- 数据库初始化和迁移
- CRUD操作封装
- 事务支持
- 查询优化

**接口：**
- Repository模式接口
- 事务接口

**依赖：**
- better-sqlite3

**覆盖：** 所有需要数据持久化的FR

---

## 数据架构

### 数据模型

```typescript
// 用户
interface User {
  id: string;
  name: string;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

// API密钥（加密存储）
interface ApiKey {
  id: string;
  provider: string;           // 'qwen' | 'doubao' | 'glm' | ...
  encryptedKey: string;       // AES-256加密
  endpoint?: string;          // 自定义端点
  isActive: boolean;
  createdAt: Date;
}

// 对话
interface Conversation {
  id: string;
  title: string;
  roleId: string;
  modelProvider: string;
  modelName: string;
  messages: Message[];
  knowledgeBaseIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// 消息
interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens?: number;
  createdAt: Date;
}

// 角色预设
interface Role {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  avatar?: string;
  isPreset: boolean;
  createdAt: Date;
}

// 知识库
interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documents: Document[];
  embeddingProvider?: string;
  createdAt: Date;
}

// 文档
interface Document {
  id: string;
  knowledgeBaseId: string;
  title: string;
  content: string;
  filePath?: string;
  fileType: string;
  createdAt: Date;
}

// 生成图像
interface GeneratedImage {
  id: string;
  prompt: string;
  negativePrompt?: string;
  provider: string;
  model: string;
  filePath: string;
  fileSize: number;
  metadata: Record<string, any>;
  createdAt: Date;
}

// 生成视频
interface GeneratedVideo {
  id: string;
  prompt: string;
  provider: string;
  model: string;
  filePath: string;
  fileSize: number;
  duration: number;
  metadata: Record<string, any>;
  createdAt: Date;
}
```

### 数据库设计

```sql
-- 用户设置
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT,
  preferences TEXT,  -- JSON格式
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API密钥（加密存储）
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  encrypted_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  endpoint TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 角色预设
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,
  avatar TEXT,
  is_preset BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 对话
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  role_id TEXT,
  model_provider TEXT,
  model_name TEXT,
  knowledge_base_ids TEXT,  -- JSON数组
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 消息
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- 知识库
CREATE TABLE knowledge_bases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  embedding_provider TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 文档
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  knowledge_base_id TEXT NOT NULL,
  title TEXT,
  content TEXT,
  file_path TEXT,
  file_type TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

-- 文档块（用于RAG）
CREATE TABLE document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding BLOB,  -- 向量嵌入
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- 生成图像
CREATE TABLE generated_images (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  provider TEXT,
  model TEXT,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  metadata TEXT,  -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 生成视频
CREATE TABLE generated_videos (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  duration REAL,
  width INTEGER,
  height INTEGER,
  metadata TEXT,  -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 翻译历史
CREATE TABLE translation_history (
  id TEXT PRIMARY KEY,
  source_text TEXT NOT NULL,
  target_text TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  provider TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- OCR历史
CREATE TABLE ocr_history (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  recognized_text TEXT NOT NULL,
  engine TEXT NOT NULL,
  language TEXT,
  confidence REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX idx_documents_kb ON documents(knowledge_base_id);
CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_images_created ON generated_images(created_at DESC);
CREATE INDEX idx_videos_created ON generated_videos(created_at DESC);
```

### 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                         数据流                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户操作 (Renderer)                                            │
│       │                                                         │
│       ▼                                                         │
│  IPC调用 (contextBridge)                                        │
│       │                                                         │
│       ▼                                                         │
│  IPC Handler (Main)                                             │
│       │                                                         │
│       ▼                                                         │
│  Service Layer ─────────────────────────────┐                  │
│       │                                      │                  │
│       ▼                                      ▼                  │
│  Provider Layer                        Cache Layer              │
│  (调用外部API)                         (内存缓存)               │
│       │                                      │                  │
│       ▼                                      ▼                  │
│  Response ──────────────────────────> Data Layer               │
│                                           (SQLite)              │
│                                              │                  │
│                                              ▼                  │
│                                        File System              │
│                                        (图片/视频/文档)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## IPC API设计

### API架构

**通信方式：** Electron IPC (Inter-Process Communication)

**安全模型：**
- 使用contextBridge安全暴露API
- 渲染进程无直接Node.js访问权限
- 所有输入验证在主进程进行

### IPC通道定义

```typescript
// ========== AI 对话 ==========
'dialog:send'              // 发送消息，返回流式响应
'dialog:create'            // 创建新对话
'dialog:delete'            // 删除对话
'dialog:list'              // 列出对话列表
'dialog:get'               // 获取对话详情
'dialog:get-history'       // 获取对话历史
'dialog:update-title'      // 更新对话标题
'dialog:export'            // 导出对话

// ========== 图像生成 ==========
'image:generate'           // 生成图像
'image:list'               // 列出历史
'image:delete'             // 删除图像
'image:get-providers'      // 获取可用提供商
'image:get-models'         // 获取可用模型

// ========== 视频生成 ==========
'video:generate'           // 生成视频
'video:list'               // 列出历史
'video:delete'             // 删除视频
'video:get-status'         // 获取生成状态
'video:get-providers'      // 获取可用提供商

// ========== OCR ==========
'ocr:recognize'            // 识别单张图片
'ocr:batch-recognize'      // 批量识别
'ocr:get-engines'          // 获取可用引擎
'ocr:get-history'          // 获取识别历史

// ========== 语音 ==========
'voice:tts'                // 文本转语音
'voice:stt'                // 语音转文本
'voice:get-voices'         // 获取可用声音
'voice:get-history'        // 获取转换历史

// ========== 翻译 ==========
'translate:text'           // 翻译文本
'translate:get-languages'  // 获取支持语言
'translate:get-history'    // 获取翻译历史

// ========== 知识库 ==========
'kb:create'                // 创建知识库
'kb:delete'                // 删除知识库
'kb:list'                  // 列出知识库
'kb:get'                   // 获取知识库详情
'kb:add-document'          // 添加文档
'kb:remove-document'       // 移除文档
'kb:search'                // 搜索知识库

// ========== 网络 ==========
'search:web'               // 网络搜索
'search:get-providers'     // 获取可用搜索引擎

// ========== 角色 ==========
'role:list'                // 列出角色
'role:get'                 // 获取角色详情
'role:create'              // 创建角色
'role:update'              // 更新角色
'role:delete'              // 删除角色

// ========== 设置 ==========
'settings:get'             // 获取所有设置
'settings:set'             // 保存设置
'settings:reset'           // 重置设置

// ========== API密钥 ==========
'api-key:set'              // 设置API密钥
'api-key:delete'           // 删除API密钥
'api-key:list'             // 列出已配置的密钥（不返回密钥值）
'api-key:test'             // 测试API连接

// ========== 文件 ==========
'file:open'                // 打开文件对话框
'file:save'                // 保存文件对话框
'file:open-external'       // 用系统应用打开
'file:show-in-folder'      // 在文件管理器中显示
'file:get-default-path'    // 获取默认保存路径

// ========== 应用 ==========
'app:get-version'          // 获取应用版本
'app:check-update'         // 检查更新
'app:quit'                 // 退出应用
'app:open-logs'            // 打开日志目录
```

### Preload脚本示例

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

// 类型定义
export interface ElectronAPI {
  dialog: {
    send: (conversationId: string, message: string) => Promise<void>;
    create: (roleId?: string) => Promise<Conversation>;
    // ...
  };
  image: {
    generate: (request: ImageRequest) => Promise<ImageResponse>;
    // ...
  };
  // ...
}

// 暴露API到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  dialog: {
    send: (conversationId: string, message: string) =>
      ipcRenderer.invoke('dialog:send', conversationId, message),
    create: (roleId?: string) =>
      ipcRenderer.invoke('dialog:create', roleId),
    // ...
  },
  image: {
    generate: (request: ImageRequest) =>
      ipcRenderer.invoke('image:generate', request),
    // ...
  },
  // ...

  // 流式响应支持
  onDialogStream: (callback: (chunk: string) => void) => {
    ipcRenderer.on('dialog:stream', (_event, chunk) => callback(chunk));
    return () => ipcRenderer.removeAllListeners('dialog:stream');
  },
});
```

---

## Provider抽象层

### 接口定义

```typescript
// src/shared/types/provider.types.ts

// 提供商类型
type ProviderType = 'chat' | 'image' | 'video' | 'voice' | 'embedding' | 'translate';

// 提供商能力
interface ProviderCapabilities {
  streaming: boolean;           // 支持流式响应
  maxTokens: number;           // 最大token数
  supportedModels: string[];   // 支持的模型
  features: string[];          // 特殊功能
}

// 对话请求
interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

// 对话响应
interface ChatResponse {
  content: string;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// 图像请求
interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  model: string;
  width?: number;
  height?: number;
  numImages?: number;
}

// 图像响应
interface ImageResponse {
  images: GeneratedImage[];
  revisedPrompt?: string;
}

// 视频请求
interface VideoRequest {
  prompt: string;
  model: string;
  duration?: number;
  width?: number;
  height?: number;
}

// 视频响应
interface VideoResponse {
  videoUrl?: string;
  localPath?: string;
  duration: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

// AI提供商接口
interface IAIProvider {
  readonly name: string;
  readonly type: ProviderType;
  readonly displayName: string;

  // 能力检测
  getCapabilities(): ProviderCapabilities;

  // 连接测试
  testConnection(): Promise<boolean>;

  // 对话（流式）
  chat?(request: ChatRequest): AsyncGenerator<ChatResponse>;

  // 对话（非流式）
  chatSync?(request: ChatRequest): Promise<ChatResponse>;

  // 图像生成
  generateImage?(request: ImageRequest): Promise<ImageResponse>;

  // 视频生成
  generateVideo?(request: VideoRequest): Promise<VideoResponse>;

  // 设置API密钥
  setApiKey(key: string): void;

  // 设置端点
  setEndpoint?(endpoint: string): void;
}
```

### 基础实现

```typescript
// src/main/providers/base.provider.ts

abstract class BaseProvider implements IAIProvider {
  abstract readonly name: string;
  abstract readonly type: ProviderType;
  abstract readonly displayName: string;

  protected apiKey?: string;
  protected endpoint?: string;

  abstract getCapabilities(): ProviderCapabilities;
  abstract testConnection(): Promise<boolean>;

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  // 通用HTTP请求方法
  protected async request<T>(
    url: string,
    options: RequestInit
  ): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new ProviderError(
        `Request failed: ${response.status}`,
        response.status
      );
    }

    return response.json();
  }
}
```

### 具体实现示例

```typescript
// src/main/providers/chat/qwen.provider.ts

class QwenProvider extends BaseProvider {
  readonly name = 'qwen';
  readonly type = 'chat' as const;
  readonly displayName = '通义千问';

  private readonly defaultEndpoint = 'https://dashscope.aliyuncs.com/api/v1';

  getCapabilities(): ProviderCapabilities {
    return {
      streaming: true,
      maxTokens: 6000,
      supportedModels: [
        'qwen-turbo',
        'qwen-plus',
        'qwen-max',
        'qwen-max-longcontext',
      ],
      features: ['function-calling', 'vision'],
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.chatSync({
        model: 'qwen-turbo',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 10,
      });
      return true;
    } catch {
      return false;
    }
  }

  async *chat(request: ChatRequest): AsyncGenerator<ChatResponse> {
    const response = await fetch(
      `${this.endpoint || this.defaultEndpoint}/services/aigc/text-generation/generation`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-SSE': 'enable',
        },
        body: JSON.stringify({
          model: request.model,
          input: {
            messages: request.messages,
          },
          parameters: {
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens,
            incremental_output: true,
          },
        }),
      }
    );

    // 解析SSE流式响应
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = JSON.parse(line.slice(5));
          yield {
            content: data.output?.text || '',
            finishReason: data.output?.finish_reason,
          };
        }
      }
    }
  }

  async chatSync(request: ChatRequest): Promise<ChatResponse> {
    let fullContent = '';
    let finishReason: string | undefined;

    for await (const chunk of this.chat(request)) {
      fullContent += chunk.content;
      finishReason = chunk.finishReason;
    }

    return {
      content: fullContent,
      finishReason,
    };
  }
}
```

### Provider管理器

```typescript
// src/main/providers/provider.manager.ts

class ProviderManager {
  private providers: Map<string, IAIProvider> = new Map();
  private secureStorage: ISecureStorage;

  constructor(secureStorage: ISecureStorage) {
    this.secureStorage = secureStorage;
  }

  // 注册提供商
  register(provider: IAIProvider): void {
    this.providers.set(provider.name, provider);
  }

  // 获取提供商
  get(name: string): IAIProvider | undefined {
    return this.providers.get(name);
  }

  // 按类型列出
  listByType(type: ProviderType): IAIProvider[] {
    return Array.from(this.providers.values())
      .filter(p => p.type === type);
  }

  // 列出所有
  listAll(): IAIProvider[] {
    return Array.from(this.providers.values());
  }

  // 初始化提供商（加载API密钥）
  async initializeProvider(name: string): Promise<boolean> {
    const provider = this.providers.get(name);
    if (!provider) return false;

    const apiKey = await this.secureStorage.getApiKey(name);
    if (apiKey) {
      provider.setApiKey(apiKey);
      return true;
    }
    return false;
  }

  // 测试连接
  async testConnection(name: string): Promise<boolean> {
    const provider = this.providers.get(name);
    if (!provider) return false;

    await this.initializeProvider(name);
    return provider.testConnection();
  }
}

// 初始化所有提供商
const providerManager = new ProviderManager(secureStorage);

// 注册对话提供商
providerManager.register(new QwenProvider());
providerManager.register(new DoubaoProvider());
providerManager.register(new GLMProvider());
providerManager.register(new DeepSeekProvider());
providerManager.register(new OllamaProvider());

// 注册图像提供商
providerManager.register(new QwenImageProvider());
providerManager.register(new VolcengineImageProvider());
providerManager.register(new ZhipuImageProvider());

// 注册视频提供商
providerManager.register(new VolcengineVideoProvider());

// 注册语音提供商
providerManager.register(new DoubaoVoiceProvider());
```

---

## 非功能需求覆盖

### NFR-001: 响应时间

**需求：**
- 应用启动时间 < 5秒
- UI操作响应时间 < 200ms（95%的操作）
- AI对话首字响应时间 < 3秒

**架构解决方案：**

1. **快速启动**
   - Vite代码分割，按需加载
   - 延迟加载非关键模块
   - SQLite预热连接池

2. **UI响应**
   - 主进程异步处理
   - WebWorker处理计算密集任务（OCR、向量计算）
   - 虚拟列表处理大量数据

3. **AI响应**
   - 流式响应，首字优先返回
   - 连接复用
   - 请求队列管理

**验证方法：**
- 启动时间：在三个平台上测量
- UI响应：Performance API测量
- AI响应：记录首字延迟

---

### NFR-002: 并发处理

**需求：**
- 支持同时进行多个对话
- 支持后台生成图像/视频时不阻塞UI
- 支持批量文件处理

**架构解决方案：**

1. **任务队列**
   ```typescript
   import PQueue from 'p-queue';

   const imageQueue = new PQueue({ concurrency: 2 });
   const videoQueue = new PQueue({ concurrency: 1 });
   ```

2. **后台处理**
   - 主进程独立于渲染进程
   - 任务状态通过IPC同步

3. **批量处理**
   - 支持批量上传
   - 进度追踪
   - 可取消操作

---

### NFR-003: API密钥安全存储

**需求：**
- API密钥加密存储在本地
- 不在日志中输出API密钥
- 不在网络请求中暴露API密钥（除了必要的API调用）

**架构解决方案：**

```typescript
// 加密存储实现
class SecureStorage {
  private algorithm = 'aes-256-gcm';

  // 从机器ID派生密钥
  private deriveKey(): Buffer {
    const machineId = this.getMachineId();
    const salt = crypto.randomBytes(16);

    return crypto.pbkdf2Sync(
      machineId,
      salt,
      100000,  // 迭代次数
      32,      // 密钥长度
      'sha512'
    );
  }

  // 加密
  encrypt(plaintext: string): EncryptedData {
    const key = this.deriveKey();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(
      this.algorithm,
      key,
      iv
    );

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  // 解密
  decrypt(data: EncryptedData): string {
    const key = this.deriveKey();

    const decipher = crypto.createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(data.iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(data.authTag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(data.encrypted, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
```

---

### NFR-004: 数据隐私

**需求：**
- 对话历史仅存储在用户本地设备
- 不收集用户使用数据
- 生成的图像/视频仅保存在用户本地

**架构解决方案：**
- 所有数据存储在本地SQLite
- 文件存储在用户指定目录
- 无云端同步功能
- 提供数据导出和清除功能

---

### NFR-005: 网络安全

**需求：**
- 所有API调用使用HTTPS
- 验证API服务器证书
- 处理网络异常和超时

**架构解决方案：**
- 使用Node.js原生fetch或axios
- 启用证书验证
- 请求超时设置（默认30秒）
- 网络错误处理和重试

---

### NFR-006: 错误处理与恢复

**需求：**
- API调用失败时显示清晰的错误信息
- 支持重试机制
- 网络断开时不丢失用户输入
- 应用崩溃后能恢复上次状态

**架构解决方案：**

```typescript
// 重试装饰器
function withRetry(
  maxRetries: number = 3,
  delay: number = 1000
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let lastError: Error;

      for (let i = 0; i < maxRetries; i++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          lastError = error;
          if (i < maxRetries - 1) {
            await sleep(delay * Math.pow(2, i)); // 指数退避
          }
        }
      }

      throw lastError;
    };
  };
}

// 状态恢复
class StateRecovery {
  async saveState(state: AppState): Promise<void> {
    await this.db.saveCheckpoint(state);
  }

  async recoverState(): Promise<AppState | null> {
    return this.db.loadCheckpoint();
  }
}
```

---

### NFR-008: 界面友好性

**需求：**
- 遵循各平台的设计规范
- 提供清晰的功能导航
- 支持深色/浅色主题
- 支持界面语言切换

**架构解决方案：**
- Element Plus / Naive UI组件库
- CSS变量实现主题切换
- vue-i18n国际化
- 响应式布局

---

### NFR-010: 日志记录

**需求：**
- 记录应用运行日志
- 记录API调用日志（不含敏感信息）
- 记录错误和异常
- 支持日志级别配置

**架构解决方案：**

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(app.getPath('userData'), 'logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: path.join(app.getPath('userData'), 'logs', 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// 敏感信息过滤
logger.add(new winston.transports.Console({
  format: winston.format.printf((info) => {
    // 移除API密钥等敏感信息
    const sanitized = sanitizeMessage(info.message);
    return `[${info.timestamp}] ${info.level}: ${sanitized}`;
  }),
}));
```

---

### NFR-012: 跨平台一致性

**需求：**
- Windows 10/11 完全支持
- macOS 10.15+ 完全支持
- 主流Linux发行版完全支持
- 三个平台功能完全一致

**架构解决方案：**
- Electron统一跨平台API
- 平台特定代码隔离
- electron-builder多平台构建
- 三个平台充分测试

---

### NFR-013: 系统资源占用

**需求：**
- 空闲时内存占用 < 200MB
- CPU空闲占用 < 5%
- 安装包大小 < 200MB

**架构解决方案：**
- 延迟加载非关键模块
- 内存缓存大小限制
- 图片压缩和缩略图
- 安装包优化（排除开发依赖）

---

### NFR-014: 插件/扩展支持

**需求：**
- 架构设计支持插件系统
- 提供扩展点API
- 支持自定义模型提供商

**架构解决方案：**
- Provider接口设计
- 插件目录结构
- 配置驱动的Provider加载

```typescript
// 插件接口
interface IPlugin {
  name: string;
  version: string;
  providers: IAIProvider[];
  onActivate?(): Promise<void>;
  onDeactivate?(): Promise<void>;
}

// 插件管理器
class PluginManager {
  private plugins: Map<string, IPlugin> = new Map();

  async loadPlugin(pluginPath: string): Promise<void> {
    const plugin = await import(pluginPath);
    this.plugins.set(plugin.name, plugin);

    // 注册提供商
    for (const provider of plugin.providers) {
      providerManager.register(provider);
    }

    await plugin.onActivate?.();
  }
}
```

---

## 安全架构

### 认证与授权

由于是本地桌面应用，不需要传统的用户认证。安全重点在于：

1. **API密钥保护**
   - AES-256-GCM加密存储
   - 内存中不保留明文
   - 不在日志中输出

2. **IPC安全**
   - contextBridge安全暴露
   - 输入验证
   - 无直接Node.js访问

### 数据加密

```
┌─────────────────────────────────────────────────────────────────┐
│                     API密钥加密流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  输入: 明文API密钥                                              │
│       │                                                         │
│       ▼                                                         │
│  派生密钥: PBKDF2(machine-id + salt) → 256-bit key             │
│       │                                                         │
│       ▼                                                         │
│  生成IV: crypto.randomBytes(16)                                │
│       │                                                         │
│       ▼                                                         │
│  加密: AES-256-GCM(plaintext, key, iv)                         │
│       │                                                         │
│       ▼                                                         │
│  存储: { encrypted: base64, iv: base64, authTag: base64 }      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 安全最佳实践

1. **输入验证**
   - 验证所有用户输入
   - 防止注入攻击
   - 类型检查

2. **网络安全**
   - HTTPS only
   - 证书验证
   - 请求超时

3. **内容安全**
   - sandbox: true
   - nodeIntegration: false
   - contextIsolation: true

---

## 可扩展性与性能

### 扩展策略

1. **水平扩展**（不适用）
   - 本地桌面应用，无需水平扩展

2. **垂直扩展**
   - 利用多核CPU（WebWorker）
   - 内存缓存优化

3. **功能扩展**
   - Provider插件系统
   - 模块化组件设计

### 性能优化

1. **启动优化**
   - 代码分割
   - 延迟加载
   - 预热关键资源

2. **运行时优化**
   - 虚拟列表
   - 防抖/节流
   - 内存缓存

3. **存储优化**
   - SQLite索引
   - WAL模式
   - 定期清理

---

## 可靠性与可用性

### 高可用设计

- 本地应用，99.9%可用（取决于系统）
- 无单点故障
- 状态自动保存

### 灾难恢复

- 数据库自动备份
- 配置导出功能
- 数据恢复工具

### 监控与告警

- 错误日志
- 性能指标
- 崩溃报告

---

## 开发架构

### 代码组织

```
ai-tool-box/
├── src/
│   ├── main/           # Electron主进程
│   │   ├── index.ts    # 入口
│   │   ├── ipc/        # IPC处理器
│   │   ├── services/   # 业务服务
│   │   ├── providers/  # AI提供商
│   │   ├── database/   # 数据库
│   │   ├── storage/    # 存储
│   │   └── utils/      # 工具
│   ├── renderer/       # 渲染进程（Vue3）
│   │   ├── views/      # 页面
│   │   ├── components/ # 组件
│   │   ├── stores/     # 状态
│   │   └── i18n/       # 国际化
│   ├── shared/         # 共享代码
│   └── preload/        # Preload脚本
├── resources/          # 静态资源
├── build/              # 构建配置
└── tests/              # 测试
```

### 测试策略

| 类型 | 工具 | 目标 |
|------|------|------|
| 单元测试 | Vitest | 80%+覆盖率 |
| 组件测试 | Vue Test Utils | 关键组件100% |
| E2E测试 | Playwright | 核心流程 |
| 集成测试 | Vitest | Provider层 |

### CI/CD

```yaml
# GitHub Actions
name: Build & Release

on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm run package
```

---

## 部署架构

### 环境划分

| 环境 | 用途 | 配置 |
|------|------|------|
| Development | 开发 | 热更新、调试工具 |
| Production | 生产 | 优化构建、自动更新 |

### 构建产物

| 平台 | 格式 | 文件名 |
|------|------|--------|
| Windows | NSIS安装包 | AI-Tool-Box-Setup-{version}.exe |
| macOS | DMG | AI-Tool-Box-{version}.dmg |
| Linux | AppImage/DEB | AI-Tool-Box-{version}.AppImage |

### 自动更新

使用electron-updater实现：

```typescript
import { autoUpdater } from 'electron-updater';

autoUpdater.checkForUpdatesAndNotify();
```

---

## 需求追溯

### 功能需求覆盖

| FR ID | FR名称 | 主要组件 |
|-------|--------|----------|
| FR-001 | 多模型支持 | ProviderManager, providers/chat/* |
| FR-002 | 对话界面 | DialogView, ChatInput, MessageList |
| FR-003 | 角色预设系统 | RoleSelector, RoleRepository |
| FR-004 | 对话历史管理 | ConversationRepository, MessageList |
| FR-005 | 图像生成 | ImageView, providers/image/* |
| FR-006 | 流程化创作 | CreationWorkflow, CharacterManager |
| FR-007 | OCR识别 | OcrView, OcrService, Tesseract.js |
| FR-008 | TTS | VoiceView, providers/voice/* |
| FR-009 | STT | VoiceView, providers/voice/* |
| FR-010 | 翻译 | TranslateView, TranslateService |
| FR-011 | 知识库创建 | KnowledgeView, KnowledgeService |
| FR-012 | 知识库集成 | DialogView, RAGService |
| FR-013 | 网络搜索 | SearchService |
| FR-014 | MCP协议 | McpService (Could Have) |
| FR-015 | 用户设置 | SettingsView, SecureStorage |
| FR-016 | 跨平台 | Electron, electron-builder |

### 非功能需求覆盖

| NFR ID | NFR名称 | 架构解决方案 |
|--------|----------|--------------|
| NFR-001 | 响应时间 | Vite代码分割, 异步IPC, WebWorker |
| NFR-002 | 并发处理 | p-queue任务队列, 后台处理 |
| NFR-003 | API密钥安全 | AES-256-GCM加密, SecureStorage |
| NFR-004 | 数据隐私 | 本地SQLite, 无云同步 |
| NFR-005 | 网络安全 | HTTPS, 证书验证 |
| NFR-006 | 错误处理 | ErrorHandler, 重试机制 |
| NFR-007 | API监控 | Provider状态管理 |
| NFR-008 | 界面友好 | Element Plus, 主题系统 |
| NFR-009 | 可访问性 | 键盘快捷键, ARIA |
| NFR-010 | 日志记录 | winston, 日志轮转 |
| NFR-011 | 更新机制 | electron-updater |
| NFR-012 | 跨平台 | Electron, electron-builder |
| NFR-013 | 资源占用 | 延迟加载, 内存优化 |
| NFR-014 | 插件支持 | Provider接口, PluginManager |

---

## 权衡与决策日志

### 决策1: 纯Electron架构 vs Electron + Spring Boot

**选择：** 纯Electron架构

**权衡：**
- ✓ 获得：更简单的部署、更低的资源占用、更快的启动速度
- ✗ 失去：Java生态、可能更强的后端性能

**理由：** 对于桌面应用，简化和性能优先。TypeScript/Node.js足以满足需求。

---

### 决策2: SQLite vs 其他数据库

**选择：** SQLite

**权衡：**
- ✓ 获得：嵌入式、无需服务、高性能、单文件
- ✗ 失去：并发写入能力（但桌面应用不需要）

**理由：** 最适合本地桌面应用的数据存储方案。

---

### 决策3: Vue3 vs React

**选择：** Vue3

**权衡：**
- ✓ 获得：中文社区活跃、学习曲线平缓、Composition API
- ✗ 失去：React生态规模

**理由：** 项目主要面向中文用户，Vue生态更适合。

---

## 开放问题与风险

### 开放问题

1. **知识库RAG实现** - 使用哪个向量数据库？
   - 选项：sqlite-vec、chromadb-local、自定义实现
   - 建议：sqlite-vec（与SQLite集成）

2. **OCR引擎选择** - Tesseract.js性能是否满足？
   - 备选：调用系统OCR、PaddleOCR本地部署

3. **实时语音识别** - 是否支持？
   - 当前方案：仅支持文件上传
   - 未来：WebRTC + Whisper

### 风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| Electron内存占用高 | 中 | 中 | 延迟加载、内存优化 |
| 第三方API不稳定 | 中 | 高 | 多提供商支持、重试机制 |
| 跨平台兼容性问题 | 中 | 中 | 充分测试、平台隔离 |
| 4周时间线紧张 | 高 | 高 | 精细规划、优先级管理 |

---

## 未来考虑

1. **Web版本** - 架构已预留Vue3前端，可独立部署
2. **移动端** - 考虑React Native或Flutter
3. **企业版** - 团队协作、权限管理
4. **工作流编辑器** - 可视化拖拽式工作流

---

## 审批状态

**创建日期：** 2026-02-27
**创建者：** System Architect (BMAD Agent)
**审批者：** Daoge
**状态：** ⏳ 待审批

---

## 下一步

### Phase 4: Sprint规划与实施

运行 `/sprint-planning` 以：
- 将Epic分解为详细的用户故事
- 估算故事复杂度
- 规划Sprint迭代
- 按照此架构蓝图开始实施

**关键实施原则：**
1. 遵循本文档定义的组件边界
2. 按指定的方式实现NFR解决方案
3. 使用定义的技术栈
4. 严格遵循IPC API契约
5. 遵守安全和性能指南

---

**本文档使用BMAD Method v6 - Phase 3 (Solutioning) 创建**

*继续：运行 `/workflow-status` 查看进度和下一步推荐的工作流。*
