# M05 - 语音转换模块设计

## 1. 模块概述

| 属性 | 值 |
|-----|-----|
| 模块编号 | M05 |
| 模块名称 | 语音转换 |
| 模块代码 | voice |
| 优先级 | P1 |
| 描述 | 提供语音合成（TTS）和语音识别（ASR）功能 |

## 2. 功能列表

| 功能编号 | 功能名称 | 功能描述 | 优先级 |
|---------|---------|---------|-------|
| F05-01 | 文本转语音 | 将文本转换为语音 | P0 |
| F05-02 | 语音转文本 | 将语音转换为文本 | P0 |
| F05-03 | 音色选择 | 选择不同的语音音色 | P0 |
| F05-04 | 语速调节 | 调整语音播放速度 | P1 |
| F05-05 | 音频播放 | 播放生成的语音 | P0 |
| F05-06 | 音频下载 | 下载生成的音频文件 | P1 |

## 3. 界面设计

### 3.1 语音转换页面布局

```
┌─────────────────────────────────────────────────────────────────────────┐
│  语音转换                                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────┐  ┌──────────────────────────────────┐│
│  │  文本转语音 (TTS)             │  │  语音转文本 (ASR)                 ││
│  │  ──────────────────────────── │  │  ──────────────────────────────── ││
│  │                              │  │                                   ││
│  │  输入要转换的文本...          │  │  ┌──────────────────────────────┐││
│  │                              │  │  │                              │││
│  │                              │  │  │    点击录音或上传音频        │││
│  │                              │  │  │                              │││
│  │                              │  │  │         🎤                  │││
│  │                              │  │  │                              │││
│  │                              │  │  └──────────────────────────────┘││
│  │                              │  │                                   ││
│  │  音色: [小云 ▼]              │  │  识别结果:                        ││
│  │  语速: [正常 ▼]              │  │  ┌──────────────────────────────┐││
│  │  格式: [MP3 ▼]               │  │  │ 这是从语音识别出的文字...    │││
│  │                              │  │  │                              │││
│  │  [转换]  [播放]  [下载]      │  │  └──────────────────────────────┘││
│  │                              │  │                                   ││
│  │  ┌────────────────────────┐  │  │  [录音] [上传] [识别] [复制]     ││
│  │  │ 🔊 播放器              │  │  │                                   ││
│  │  │ ▶ ━━━━━━━━━○ 0:30     │  │  │                                   ││
│  │  └────────────────────────┘  │  │                                   ││
│  └──────────────────────────────┘  └──────────────────────────────────┘│
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 音色选择对话框

```
┌─────────────────────────────────────────────┐
│  选择音色                                    │
├─────────────────────────────────────────────┤
│                                              │
│  搜索: [                ]                    │
│                                              │
│  ○ 小云 - 甜美女声        [试听]            │
│  ○ 小刚 - 磁性男声        [试听]            │
│  ● 小美 - 温柔女声        [试听]            │
│  ○ 小杰 - 活力男声        [试听]            │
│  ○ 老王 - 沉稳男声        [试听]            │
│                                              │
├─────────────────────────────────────────────┤
│                    [取消]  [确定]            │
└─────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 数据结构

```typescript
// TTS请求
interface TtsRequest {
  text: string                  // 要转换的文本
  voiceId: string               // 音色ID
  speed?: number                // 语速（0.5-2.0）
  format?: 'mp3' | 'wav' | 'pcm'  // 输出格式
  provider?: string             // 提供商
}

// TTS响应
interface TtsResponse {
  success: boolean
  audioUrl?: string             // 音频URL
  localPath?: string            // 本地路径
  duration?: number             // 时长（秒）
  error?: string                // 错误信息
}

// ASR请求
interface AsrRequest {
  audioPath: string             // 音频文件路径
  language?: string             // 语言
  provider?: string             // 提供商
}

// ASR响应
interface AsrResponse {
  success: boolean
  text?: string                 // 识别的文字
  duration?: number             // 音频时长
  error?: string                // 错误信息
}

// 音色信息
interface Voice {
  id: string                    // 音色ID
  name: string                  // 显示名称
  gender: 'male' | 'female'     // 性别
  language: string              // 语言
  previewUrl?: string           // 试听URL
  provider: string              // 提供商
}

// 语音提供商
interface VoiceProvider {
  id: string                    // 提供商ID
  name: string                  // 显示名称
  voices: Voice[]               // 可用音色
  configured: boolean           // 是否已配置
}
```

### 4.2 数据库表

```sql
-- 语音记录表
CREATE TABLE voice_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('tts', 'asr')),
  provider TEXT NOT NULL,
  input_text TEXT,              -- TTS的输入文本
  output_text TEXT,             -- ASR的输出文本
  audio_path TEXT,              -- 音频文件路径
  voice_id TEXT,                -- TTS使用的音色
  duration REAL,                -- 时长
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_voice_created_at ON voice_records(created_at DESC);
```

## 5. IPC接口设计

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| voice:get-voices | GET | provider?: string | { success, voices: Voice[] } | 获取音色列表 |
| voice:tts | TTS | request: TtsRequest | { success, ...TtsResponse } | 文本转语音 |
| voice:asr | ASR | request: AsrRequest | { success, ...AsrResponse } | 语音转文本 |
| voice:list | GET | page?, pageSize? | { success, records, total } | 获取历史记录 |

## 6. 文件结构

```
src/
├── main/
│   ├── database/
│   │   └── repositories/
│   │       └── voice.repository.ts        # 语音数据访问
│   ├── ipc/
│   │   └── handlers/
│   │       └── voice.handler.ts           # 语音IPC处理
│   ├── services/
│   │   └── voice.service.ts               # 语音服务
│   └── providers/
│       └── voice/
│           ├── base-voice-provider.ts     # 语音提供商基类
│           ├── volcengine-tts-provider.ts # 火山引擎TTS
│           └── volcengine-asr-provider.ts # 火山引擎ASR
├── renderer/
│   └── src/
│       ├── views/
│       │   └── VoiceView.vue              # 语音转换页面
│       ├── stores/
│       │   └── voice.ts                   # 语音状态管理
│       └── components/
│           └── voice/
│               ├── TtsPanel.vue           # TTS面板
│               ├── AsrPanel.vue           # ASR面板
│               ├── VoiceSelector.vue      # 音色选择器
│               └── AudioPlayer.vue        # 音频播放器
└── shared/
    └── types/
        └── voice.types.ts                 # 语音类型定义
```

## 7. 核心流程

### 7.1 文本转语音流程

```
用户输入文本
    │
    ▼
选择音色和语速
    │
    ▼
点击"转换"按钮
    │
    ▼
调用 voice:tts IPC
    │
    ▼
主进程接收请求
    │
    ├── 检查API密钥
    │
    ▼
调用TTS Provider API
    │
    ▼
获取音频数据
    │
    ▼
保存到本地
    │
    ▼
保存记录到数据库
    │
    ▼
返回音频信息
    │
    ▼
前端显示播放器
```

### 7.2 语音转文本流程

```
用户录音或上传音频
    │
    ▼
点击"识别"按钮
    │
    ▼
调用 voice:asr IPC
    │
    ▼
主进程接收请求
    │
    ├── 检查API密钥
    │
    ▼
读取音频文件
    │
    ▼
调用ASR Provider API
    │
    ▼
获取识别结果
    │
    ▼
保存记录到数据库
    │
    ▼
返回识别文本
    │
    ▼
前端显示结果
```

## 8. 错误处理

| 错误场景 | 错误码 | 错误信息 | 处理方式 |
|---------|-------|---------|---------|
| 文本为空 | E501 | 请输入要转换的文本 | 前端提示 |
| 文本过长 | E502 | 文本长度超过限制（最多5000字） | 前端提示 |
| 音频为空 | E503 | 请录音或上传音频 | 前端提示 |
| 音频格式不支持 | E504 | 不支持的音频格式 | 前端提示 |
| API密钥未配置 | E505 | 请先配置语音服务的API密钥 | 弹窗提示 |
| 转换失败 | E506 | 转换失败：{原因} | 弹窗提示 |

## 9. 测试要点

### 9.1 功能测试
- [ ] 文本转语音
- [ ] 语音转文本
- [ ] 音色选择和试听
- [ ] 语速调节
- [ ] 音频播放
- [ ] 音频下载

### 9.2 边界测试
- [ ] 空文本处理
- [ ] 超长文本处理
- [ ] 大音频文件处理
- [ ] 录音权限处理
