# 语音助手模块开发进度 (2026-03-24)

## 已完成功能

### 1. 基础架构完成 ✅

**数据库层：**
- `voice_records` 表 - 存储语音历史记录
- `cloned_voices` 表 - 存储复刻声音
- `VoiceRepository` - 语音记录数据访问层
- `ClonedVoiceRepository` - 复刻声音数据访问层

**IPC 层：**
- `voice.handler.ts` - 语音相关 IPC 处理器
- 已注册所有语音相关 IPC 通道
- Preload 中暴露完整语音 API

**类型定义：**
- `voice.types.ts` - 完整的类型定义

### 2. TTS 功能实现 ✅

**新增文件：**
- `src/main/voice-providers/base-voice-provider.ts` - 语音 Provider 基类
- `src/main/voice-providers/dashscope-tts-provider.ts` - DashScope TTS 实现

**VoiceService 更新：**
- 集成 DashScopeTTSProvider
- `generateSpeech` 方法调用真正的 TTS API
- 音频文件保存为 MP3 格式

**发音人列表：**
- 支持中文发音人（龙小春、龙婉、龙悦等）
- 支持英文发音人（Stella、Bella）
- 支持复刻声音显示

### 3. 音频协议注册 ✅

**主进程更新：**
- 注册 `local-file://` 协议用于音频文件播放
- 与 `local-image://` 协议类似，支持本地音频文件访问

### 4. 前端组件完成 ✅

**已创建组件：**
- `Voice.vue` - 语音助手主页面
- `TextToSpeech.vue` - 文本转语音组件
- `SpeechToText.vue` - 语音转文本组件
- `VoiceSidebar.vue` - 历史记录侧边栏
- `useVoice.ts` - 语音功能 composable

**路由配置：**
- `/voice` 路由已配置

---

## 待完成功能

### 1. STT 功能（语音转文本）
- [ ] 创建 DashScope STT Provider
- [ ] 实现语音识别 API 调用
- [ ] 支持录音识别
- [ ] 支持文件上传识别

### 2. 语音复刻功能
- [ ] 实现声音样本上传
- [ ] 实现声音复刻训练
- [ ] 管理复刻声音

### 3. 功能优化
- [ ] 音频时长计算
- [ ] 错误处理优化
- [ ] UI/UX 改进

---

## 文件变更总结

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/main/index.ts` | 修改 | 添加 local-file 协议注册 |
| `src/main/services/voice.service.ts` | 修改 | 集成 DashScope TTS Provider |
| `src/main/voice-providers/base-voice-provider.ts` | 新增 | 语音 Provider 基类 |
| `src/main/voice-providers/dashscope-tts-provider.ts` | 新增 | DashScope TTS 实现 |

---

## 测试要点

- [ ] TTS 文本转语音功能
- [ ] 发音人选择
- [ ] 语速/音调/音量调节
- [ ] 音频播放
- [ ] 历史记录保存和显示

---

## 注意事项

1. DashScope TTS API 需要 API Key 配置
2. 音频文件保存在用户数据目录的 `voice/tts/` 子目录下
3. 当前使用 CosyVoice 模型 (`cosyvoice-v1`)