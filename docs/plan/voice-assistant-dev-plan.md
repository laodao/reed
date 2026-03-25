# 语音助手模块开发计划

## 1. 开发概述

### 1.1 开发目标
实现语音助手模块，包含文本转语音(TTS)、语音转文本(STT)、语音复刻三大功能。

### 1.2 技术栈
- 后端：Electron Main Process + TypeScript
- 前端：Vue 3 + TypeScript + Element Plus
- 数据库：SQLite (better-sqlite3)
- AI服务：复用现有Provider配置体系

## 2. 开发阶段

### 阶段一：基础架构与文本转语音 (TTS)

#### 2.1.1 数据库设计
- [ ] 创建 `voice_records` 表
- [ ] 创建 `cloned_voices` 表
- [ ] 创建 TranslationRepository 和 ClonedVoiceRepository

#### 2.1.2 后端服务
- [ ] 创建 `VoiceService` 服务类
- [ ] 实现 `getProviders()` - 获取支持的语音提供商
- [ ] 实现 `getVoices()` - 获取可用发音人列表
- [ ] 实现 `generateSpeech()` - 文本转语音核心逻辑

#### 2.1.3 IPC 通信
- [ ] 创建 `voice.handler.ts` IPC处理器
- [ ] 注册 IPC 通道
- [ ] 在 preload 中暴露 API

#### 2.1.4 前端实现
- [ ] 创建 `useVoice.ts` composable
- [ ] 创建 `Voice.vue` 主页面
- [ ] 创建 `TextToSpeech.vue` 组件
- [ ] 创建 `VoiceSidebar.vue` 历史记录侧边栏
- [ ] 集成到路由和导航

### 阶段二：语音转文本 (STT)

#### 2.2.1 后端服务
- [ ] 实现 `recognizeSpeech()` - 语音识别核心逻辑
- [ ] 支持录音识别和文件上传识别
- [ ] 实现实时转写事件推送

#### 2.2.2 前端实现
- [ ] 创建 `SpeechToText.vue` 组件
- [ ] 实现录音功能（使用 MediaRecorder API）
- [ ] 实现文件上传功能
- [ ] 实现实时转写显示

### 阶段三：语音复刻

#### 2.3.1 后端服务
- [ ] 实现 `cloneVoice()` - 创建复刻声音
- [ ] 实现 `getClonedVoices()` - 获取复刻声音列表
- [ ] 实现 `deleteClonedVoice()` - 删除复刻声音
- [ ] 实现训练进度事件推送

#### 2.3.2 前端实现
- [ ] 创建 `VoiceClone.vue` 组件
- [ ] 实现样本录制功能
- [ ] 实现样本上传功能
- [ ] 实现训练进度显示
- [ ] 在TTS中集成复刻声音选择

### 阶段四：测试与优化

- [ ] 功能测试
- [ ] 错误处理完善
- [ ] UI/UX优化

## 3. 文件结构

```
src/
├── main/
│   ├── database/
│   │   └── repositories/
│   │       ├── voice.repository.ts      # 语音记录仓库
│   │       └── cloned-voice.repository.ts # 复刻声音仓库
│   ├── ipc/
│   │   └── handlers/
│   │       └── voice.handler.ts         # 语音IPC处理器
│   └── services/
│       └── voice.service.ts             # 语音服务
├── preload/
│   └── index.ts                         # 添加语音API
├── renderer/
│   └── src/
│       ├── composables/
│       │   └── useVoice.ts              # 语音composable
│       ├── components/
│       │   └── voice/
│       │       ├── TextToSpeech.vue     # 文本转语音
│       │       ├── SpeechToText.vue     # 语音转文本
│       │       ├── VoiceClone.vue       # 语音复刻
│       │       └── VoiceSidebar.vue     # 历史记录
│       └── views/
│           └── Voice.vue                # 语音助手主页
└── shared/
    └── types/
        └── voice.types.ts               # 语音类型定义
```

## 4. 当前任务

### 第一阶段：基础架构与TTS

**Step 1: 创建类型定义**
- 创建 `src/shared/types/voice.types.ts`

**Step 2: 创建数据库表和仓库**
- 在 DatabaseManager 中添加语音相关表
- 创建 `VoiceRepository` 和 `ClonedVoiceRepository`

**Step 3: 创建语音服务**
- 创建 `VoiceService` 类
- 实现 TTS 相关方法

**Step 4: 创建IPC处理器**
- 创建 `voice.handler.ts`
- 注册 IPC 通道

**Step 5: 更新preload**
- 添加语音相关 API

**Step 6: 创建前端组件**
- 创建 `useVoice.ts` composable
- 创建语音相关组件
- 集成到路由

## 5. 实施计划

从 Step 1 开始，逐步完成各阶段开发工作。