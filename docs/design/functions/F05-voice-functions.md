# M05 - 语音转换模块功能设计

## F05-01 文本转语音 (TTS)

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F05-01 |
| 功能名称 | 文本转语音 |
| 优先级 | P0 |
| 描述 | 将文本转换为语音 |

### 界面
```
┌─────────────────────────────────────────────────────────────────────────┐
│  文本转语音 (TTS)                                                        │
│  ────────────────────────────────────────────────────────────────────  │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │ 输入要转换的文本...                                                ││
│  │                                                                    ││
│  │ 你好，这是一段测试文本。                                           ││
│  │ 支持多行输入，最多5000字。                                         ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  音色: [小云 - 甜美女声 ▼]    语速: [正常 ▼]    格式: [MP3 ▼]          │
│                                                                          │
│  [转换]  [播放]  [下载]                                                 │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │ 🔊 播放器                                                          ││
│  │ ▶ ━━━━━━━━━━━━━━━○━━━━ 0:30 / 1:45                               ││
│  └────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 函数
```typescript
/**
 * 文本转语音
 * @param request - TTS请求
 * @returns Promise<TtsResponse>
 */
async function textToSpeech(request: TtsRequest): Promise<TtsResponse>

interface TtsRequest {
  text: string           // 要转换的文本（最多5000字）
  voiceId: string        // 音色ID
  speed?: number         // 语速 0.5-2.0，默认1.0
  format?: 'mp3' | 'wav' // 输出格式
}

interface TtsResponse {
  success: boolean
  audioUrl?: string      // 音频URL
  localPath?: string     // 本地路径
  duration?: number      // 时长（秒）
}
```

---

## F05-02 语音转文本 (ASR)

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F05-02 |
| 功能名称 | 语音转文本 |
| 优先级 | P0 |
| 描述 | 将语音转换为文本 |

### 界面
```
┌─────────────────────────────────────────────────────────────────────────┐
│  语音转文本 (ASR)                                                        │
│  ────────────────────────────────────────────────────────────────────  │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │                                                                    ││
│  │                    点击录音或上传音频                              ││
│  │                                                                    ││
│  │                           🎤                                       ││
│  │                                                                    ││
│  │              [开始录音]          [上传音频]                        ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  识别结果:                                                               │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │ 这是从语音识别出的文字...                                          ││
│  └────────────────────────────────────────────────────────────────────┘│
│  [识别] [复制] [清空]                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 函数
```typescript
/**
 * 语音转文本
 * @param request - ASR请求
 * @returns Promise<AsrResponse>
 */
async function speechToText(request: AsrRequest): Promise<AsrResponse>

interface AsrRequest {
  audioPath: string      // 音频文件路径
  language?: string      // 语言（可选，自动检测）
}

interface AsrResponse {
  success: boolean
  text: string           // 识别的文字
  duration: number       // 音频时长
  confidence?: number    // 置信度
}
```

---

## F05-03 音色选择

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F05-03 |
| 功能名称 | 音色选择 |
| 优先级 | P0 |
| 描述 | 选择不同的语音音色 |

### 界面
```
┌─────────────────────────────────────────────┐
│  选择音色                                    │
├─────────────────────────────────────────────┤
│  🔍 搜索: [                ]                │
│                                              │
│  ○ 小云 - 甜美女声        [▶ 试听]         │
│  ● 小刚 - 磁性男声        [▶ 试听]         │
│  ○ 小美 - 温柔女声        [▶ 试听]         │
│  ○ 老王 - 沉稳男声        [▶ 试听]         │
│  ○ 小杰 - 活力男声        [▶ 试听]         │
├─────────────────────────────────────────────┤
│                    [取消]  [确定]            │
└─────────────────────────────────────────────┘
```

### 函数
```typescript
/**
 * 获取音色列表
 * @param provider - 提供商（可选）
 * @returns Promise<Voice[]>
 */
async function getVoices(provider?: string): Promise<Voice[]>

interface Voice {
  id: string
  name: string
  gender: 'male' | 'female'
  language: string
  previewUrl?: string     // 试听URL
  provider: string
}
```

---

## F05-04 音频播放

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F05-04 |
| 功能名称 | 音频播放 |
| 优先级 | P0 |
| 描述 | 播放生成的语音 |

### 组件
```vue
<!-- AudioPlayer.vue -->
<template>
  <div class="audio-player">
    <button @click="togglePlay">{{ isPlaying ? '⏸' : '▶' }}</button>
    <div class="progress-bar">
      <div class="progress" :style="{ width: progress + '%' }"></div>
    </div>
    <span class="time">{{ currentTime }} / {{ duration }}</span>
  </div>
</template>
```

### 函数
```typescript
/**
 * 播放音频
 * @param audioPath - 音频路径或URL
 */
function play(audioPath: string): void

/**
 * 暂停播放
 */
function pause(): void

/**
 * 跳转到指定位置
 * @param time - 时间（秒）
 */
function seek(time: number): void

/**
 * 设置播放速度
 * @param speed - 速度 0.5-2.0
 */
function setPlaybackRate(speed: number): void
```
