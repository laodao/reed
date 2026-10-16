# 长文转剧集视频功能设计方案

## 一、产品概述

### 1.1 功能目标

将长文写作模块中的小说内容，自动转换为视频剧集，实现"文字到视频"的自动化生产流程。

### 1.2 核心价值

- **自动化**：减少人工干预，AI 自动完成场景拆分、图像生成、配音、合成
- **一致性**：保持角色外观、场景风格在整部剧集中的一致性
- **可控性**：用户可以在每个环节审核和调整，确保质量

### 1.3 目标用户

- 使用长文写作模块创作小说的用户
- 需要将文字作品转化为视频内容的创作者

---

## 二、整体架构

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         剧集制作模块 (StoryToVideo)                      │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   项目管理   │  │   场景拆分   │  │   资产管理   │  │   视频合成  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   角色绑定   │  │   图像生成   │  │   音频生成   │  │   导出发布  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│  长文写作模块  │         │  人像设计模块  │         │  图像生成服务  │
│  (现有)       │         │  (现有)       │         │  (现有)       │
└───────────────┘         └───────────────┘         └───────────────┘
```

### 2.2 制作层级

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          制作层级结构                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  长文项目                                                                │
│      │                                                                   │
│      ▼                                                                   │
│  章节 (Chapter)                                                          │
│      │                                                                   │
│      ▼                                                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 剧本 (Script) ← 长文转剧本的结果                                   │  │
│  │   包含：场景描述、对话、动作指导、情感标注                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│      │                                                                   │
│      ▼                                                                   │
│  场景 (Scene) - 同一地点/时间的连续镜头                                  │
│      │                                                                   │
│      ▼                                                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 分镜 (Storyboard/Shot) - 单个镜头                                  │  │
│  │   包含：景别、镜头运动、角度、画面内容、时长                       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│      │                                                                   │
│      ▼                                                                   │
│  帧画面 (Frame) - 分镜的具体画面（静态图片）                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 数据流

```
长文项目 → 章节选择 → 剧本生成 → 场景划分 → 分镜设计 → 帧画面生成 → 音频生成 → 视频合成 → 导出
              │           │           │           │           │           │
              ▼           ▼           ▼           ▼           ▼           ▼
         关联角色    AI转剧本    场景拆分    镜头语言    图像生成    TTS配音
                      对话提取    地点绑定    转场设计    角色形象    背景音乐
                      动作指导    时间天气    景别设置
```

---

## 三、核心模块设计

### 3.1 剧集项目管理

#### 3.1.1 数据结构

```typescript
/**
 * 剧集项目
 */
interface VideoProject {
  id: string
  name: string
  longWritingProjectId: string  // 关联的长文项目
  status: 'draft' | 'producing' | 'completed'
  config: VideoProjectConfig
  createdAt: number
  updatedAt: number
}

/**
 * 剧集项目配置
 */
interface VideoProjectConfig {
  // 视频设置
  resolution: '1080p' | '720p' | '4k'
  aspectRatio: '16:9' | '9:16' | '1:1'
  fps: 24 | 30 | 60

  // 音频设置
  defaultNarratorVoice: string    // 默认旁白声音
  defaultCharacterVoice: string   // 默认角色声音
  backgroundMusicEnabled: boolean
  backgroundMusicVolume: number   // 0-100

  // 图像设置
  imageProviderId: string         // 图像生成提供商
  imageModelId: string            // 图像模型
  imageStyle: string              // 图像风格（写实/动漫/插画等）

  // 默认镜头设置
  defaultShotDuration: number     // 默认分镜时长（秒）
  defaultTransitionType: TransitionType  // 默认转场类型
  defaultTransitionDuration: number      // 默认转场时长（毫秒）
}

/**
 * 转场类型
 */
type TransitionType =
  | 'cut'         // 硬切
  | 'fade'        // 淡入淡出
  | 'dissolve'    // 溶解
  | 'wipe'        // 擦除
  | 'slide'       // 滑动
  | 'zoom'        // 缩放
  | 'iris'        // 光圈
  | 'whip'        // 甩镜

/**
 * 景别类型
 */
type ShotType =
  | 'extreme_long'   // 大远景 - 展示宏大环境
  | 'long'           // 远景 - 展示完整场景
  | 'full'           // 全景 - 人物全身
  | 'medium'         // 中景 - 人物膝盖以上
  | 'medium_close'   // 中近景 - 人物腰部以上
  | 'close'          // 近景 - 人物胸部以上
  | 'extreme_close'  // 特写 - 人物面部或局部
  | 'detail'         // 大特写 - 极小细节

/**
 * 镜头运动
 */
type CameraMovement =
  | 'static'       // 固定
  | 'pan_left'     // 左摇
  | 'pan_right'    // 右摇
  | 'tilt_up'      // 上仰
  | 'tilt_down'    // 下俯
  | 'dolly_in'     // 推镜
  | 'dolly_out'    // 拉镜
  | 'truck_left'   // 左移
  | 'truck_right'  // 右移
  | 'zoom_in'      // 变焦推进
  | 'zoom_out'     // 变焦拉远
  | 'crane_up'     // 升镜
  | 'crane_down'   // 降镜
  | 'handheld'     // 手持晃动
  | 'orbit'        // 环绕

/**
 * 镜头角度
 */
type CameraAngle =
  | 'eye_level'    // 平视
  | 'high'         // 俯拍
  | 'low'          // 仰拍
  | 'dutch'        // 荷兰角（倾斜）
  | 'birds_eye'    // 鸟瞰
  | 'worms_eye'    // 虫视（极低角度）
```

### 3.2 剧本模块

#### 3.2.1 数据结构

```typescript
/**
 * 剧本（章节级别）
 */
interface EpisodeScript {
  id: string
  projectId: string
  outlineId: string              // 关联的长文大纲节点
  status: 'pending' | 'generating' | 'reviewing' | 'approved'

  // 剧本内容
  synopsis: string               // 章节梗概
  scenes: SceneScript[]          // 场景剧本列表

  // 元信息
  totalDuration: number          // 预计总时长（秒）
  characterAppearances: string[] // 出场角色ID列表

  createdAt: number
  updatedAt: number
}

/**
 * 场景剧本
 */
interface SceneScript {
  id: string
  episodeScriptId: string
  sceneNumber: number

  // 场景信息
  location: string               // 地点名称
  locationType: 'interior' | 'exterior' | 'mixed'  // 内景/外景
  timeOfDay: 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'dawn' | 'dusk'
  weather?: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy' | 'stormy'

  // 场景描述
  sceneDescription: string       // 场景视觉描述
  mood: string                   // 氛围：紧张/温馨/悲伤等
  lighting?: string              // 光线描述

  // 出场角色
  characters: SceneCharacter[]

  // 内容
  originalText: string           // 原文片段
  narration: string              // 旁白文本
  dialogues: Dialogue[]          // 对话列表
  actions: ActionDescription[]   // 动作描述

  // 分镜列表
  storyboards: Storyboard[]

  createdAt: number
  updatedAt: number
}

/**
 * 场景中的角色
 */
interface SceneCharacter {
  characterId: string            // 长文写作中的角色ID
  characterName: string          // 角色名称
  portraitId?: string            // 绑定的人像ID

  // 角色状态
  position?: 'left' | 'center' | 'right' | 'foreground' | 'background'
  expression?: string            // 表情
  action?: string                // 当前动作
  outfit?: string                // 服装描述
  props?: string[]               // 道具
}

/**
 * 动作描述
 */
interface ActionDescription {
  id: string
  characterId?: string           // 执行动作的角色（空表示群像动作）
  description: string            // 动作描述
  timing: 'before' | 'during' | 'after'  // 动作时机（相对于对话）
  duration?: number              // 预计时长（秒）
}

/**
 * 对话
 */
interface Dialogue {
  id: string
  characterId: string
  characterName: string
  text: string                   // 对话内容
  emotion?: string               // 情感
  volume?: 'normal' | 'loud' | 'whisper'  // 音量
  pace?: 'normal' | 'fast' | 'slow'       // 语速
  pause?: number                 // 停顿（毫秒）

  // 配音信息
  voiceId?: string               // 指定的声音ID
  audioAsset?: AudioAsset        // 生成的音频资产
}

/**
 * 旁白
 */
interface Narration {
  id: string
  text: string
  emotion?: string
  voiceId?: string
  audioAsset?: AudioAsset
}
```

### 3.3 分镜模块

#### 3.3.1 数据结构

```typescript
/**
 * 分镜（Storyboard / Shot）
 */
interface Storyboard {
  id: string
  sceneScriptId: string
  shotNumber: number             // 分镜序号

  // 镜头语言
  shotType: ShotType             // 景别
  cameraAngle: CameraAngle       // 角度
  cameraMovement: CameraMovement // 镜头运动
  movementDuration?: number      // 运动时长（秒）

  // 画面内容
  frameDescription: string       // 画面描述
  subject?: string               // 主体
  composition?: string           // 构图描述

  // 角色信息
  characters: StoryboardCharacter[]

  // 关联内容
  narrationId?: string           // 关联旁白ID
  dialogueIds: string[]          // 关联对话ID列表
  actionIds: string[]            // 关联动作ID列表

  // 画面资产
  frameImage?: ImageAsset        // 帧画面图片

  // 时长
  duration: number               // 分镜时长（秒）

  // 转场设置
  transition: TransitionConfig

  createdAt: number
  updatedAt: number
}

/**
 * 分镜中的角色
 */
interface StoryboardCharacter {
  characterId: string
  position: {
    x: number                    // 相对位置 0-100
    y: number
    scale: number                // 缩放比例
  }
  expression?: string
  action?: string
  facing?: 'front' | 'left' | 'right' | 'back' | 'three_quarter_left' | 'three_quarter_right'
}

/**
 * 转场配置
 */
interface TransitionConfig {
  type: TransitionType
  duration: number               // 转场时长（毫秒）
  direction?: 'left' | 'right' | 'up' | 'down'  // 滑动/擦除方向
  easing?: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out'
  color?: string                 // 淡入淡出颜色（hex）
}

/**
 * 图像资产
 */
interface ImageAsset {
  id: string
  type: 'generated' | 'uploaded'
  provider?: string              // 生成提供商
  model?: string                 // 生成模型
  prompt: string                 // 生成提示词
  negativePrompt?: string        // 负面提示词
  imagePath: string              // 图片路径
  thumbnailPath?: string         // 缩略图路径
  width: number
  height: number
  metadata?: Record<string, any>
  createdAt: number
}

/**
 * 音频资产
 */
interface AudioAsset {
  id: string
  type: 'narration' | 'dialogue' | 'music' | 'sfx' | 'ambient'
  text?: string                  // 文本内容（TTS用）
  voiceId?: string               // 声音ID
  audioPath: string              // 音频路径
  duration: number               // 时长（毫秒）
  volume: number                 // 音量 0-100
  fadeIn?: number                // 淡入（毫秒）
  fadeOut?: number               // 淡出（毫秒）
  createdAt: number
}
```

### 3.4 剧集项目管理

#### 3.4.1 数据结构

```typescript
/**
 * 剧集（对应一个章节）
 */
interface VideoEpisode {
  id: string
  projectId: string
  outlineId: string              // 关联的长文大纲节点
  episodeNumber: number          // 剧集序号
  title: string
  status: 'pending' | 'scripting' | 'storyboarding' | 'producing' | 'reviewing' | 'completed'
  duration: number               // 时长（秒）

  // 关联剧本
  scriptId?: string

  // 音轨
  audioTracks: AudioTrack[]

  createdAt: number
  updatedAt: number
}

/**
 * 音轨
 */
interface AudioTrack {
  id: string
  episodeId: string
  type: 'narration' | 'dialogue' | 'music' | 'sfx' | 'ambient'
  name: string
  audios: AudioAsset[]
  volume: number                 // 音量 0-100
  muted: boolean
  solo: boolean
}

### 3.5 角色形象绑定

#### 3.5.1 数据结构

```typescript
/**
 * 角色形象绑定
 */
interface CharacterBinding {
  id: string
  projectId: string
  longWritingCharacterId: string  // 长文写作角色ID
  portraitId?: string             // 人像设计ID

  // 如果没有人像，使用配置生成
  generateConfig?: {
    baseDescription: string       // 基础描述
    styleReference?: string       // 风格参考图
    additionalPrompts?: string    // 额外提示词
  }

  // 声音配置
  voiceConfig: {
    voiceId: string               // 声音ID
    speed: number                 // 语速
    pitch: number                 // 音调
  }

  createdAt: number
  updatedAt: number
}
```

### 3.6 AI 剧本生成服务

#### 3.6.1 剧本生成流程

```
章节原文 → AI 分析 → 剧本生成 → 用户审核 → 确认
              │           │
              ▼           ▼
         识别关键点   场景划分
         提取角色     对话生成
         情感分析     动作描写
                      旁白生成
```

#### 3.6.2 剧本生成 Prompt

```typescript
const SCRIPT_GENERATION_PROMPT = `
你是一个专业的影视编剧。请将以下小说章节内容转换为专业的视频剧本。

## 输出要求

请输出 JSON 格式的剧本，包含以下内容：

1. **章节梗概**：50-100字概括本章内容
2. **场景列表**：按地点和时间划分场景
3. **每个场景包含**：
   - 地点名称和类型（内景/外景）
   - 时间（早晨/中午/下午/傍晚/夜晚）
   - 天气（可选）
   - 场景描述（视觉呈现）
   - 氛围（紧张/温馨/悲伤等）
   - 出场角色及其状态
   - 对话列表（含情感标注）
   - 旁白（用于场景衔接和背景说明）
   - 动作描述

## 拆分原则

1. **地点变化**应拆分为新场景
2. **时间跳跃**应拆分为新场景
3. **主要角色组合变化**可考虑拆分
4. **情感氛围显著变化**可拆分
5. 每个场景应有明确的**视觉焦点**

## 对话处理原则

1. 保留原文关键对话，可适当润色
2. 为每句对话标注情感
3. 标注说话时的动作或表情
4. 适当添加停顿和节奏控制

## 输出格式

\`\`\`json
{
  "synopsis": "章节梗概",
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "青云山脚",
      "locationType": "exterior",
      "timeOfDay": "morning",
      "weather": "sunny",
      "sceneDescription": "青石山路，两旁古树参天，晨光透过树叶洒落",
      "mood": "宁静",
      "lighting": "柔和的晨光",
      "characters": [
        {
          "characterId": "角色ID",
          "characterName": "李逍遥",
          "position": "center",
          "expression": "若有所思",
          "action": "独自站立",
          "outfit": "青色长衫"
        }
      ],
      "originalText": "原文片段...",
      "narration": "旁白文本",
      "dialogues": [
        {
          "characterId": "角色ID",
          "characterName": "李逍遥",
          "text": "对话内容",
          "emotion": "疑惑",
          "volume": "normal",
          "pace": "normal"
        }
      ],
      "actions": [
        {
          "characterId": "角色ID",
          "description": "抬头望向远方",
          "timing": "before",
          "duration": 2
        }
      ]
    }
  ]
}
\`\`\`

## 章节内容

{chapterContent}
`
```

### 3.7 AI 分镜设计服务

#### 3.7.1 分镜设计流程

```
场景剧本 → AI 分析 → 分镜生成 → 用户审核 → 确认
              │           │
              ▼           ▼
         内容分析     景别选择
         节奏把控     镜头运动
         情感匹配     转场设计
```

#### 3.7.2 分镜生成 Prompt

```typescript
const STORYBOARD_GENERATION_PROMPT = `
你是一个专业的影视导演和分镜师。请根据以下场景剧本设计分镜。

## 镜头语言说明

### 景别（shotType）
- extreme_long: 大远景 - 展示宏大环境，交代地理位置
- long: 远景 - 展示完整场景，人物较小
- full: 全景 - 人物全身，展示动作
- medium: 中景 - 人物膝盖以上，展示互动
- medium_close: 中近景 - 人物腰部以上，常用对话场景
- close: 近景 - 人物胸部以上，展示表情
- extreme_close: 特写 - 人物面部，展示情感
- detail: 大特写 - 极小细节，强调重点

### 镜头运动（cameraMovement）
- static: 固定镜头
- pan_left/pan_right: 左右摇镜
- tilt_up/tilt_down: 上下仰俯
- dolly_in/dolly_out: 推拉镜头
- zoom_in/zoom_out: 变焦
- crane_up/crane_down: 升降镜头
- handheld: 手持晃动，增加紧张感

### 镜头角度（cameraAngle）
- eye_level: 平视 - 客观中立
- high: 俯拍 - 显渺小或弱势
- low: 仰拍 - 显高大或强势
- dutch: 荷兰角 - 不安或混乱
- birds_eye: 鸟瞰 - 全局视角

## 分镜设计原则

1. **开场**：通常用远景或全景建立场景
2. **对话**：常用中景或近景，交替使用正反打
3. **情感**：近景或特写强调情感
4. **动作**：全景或中景展示动作
5. **转场**：考虑前后分镜的衔接

## 输出格式

\`\`\`json
{
  "storyboards": [
    {
      "shotNumber": 1,
      "shotType": "long",
      "cameraAngle": "eye_level",
      "cameraMovement": "static",
      "frameDescription": "画面描述",
      "subject": "主体",
      "composition": "构图说明",
      "duration": 5,
      "transition": {
        "type": "fade",
        "duration": 500,
        "easing": "ease_out"
      },
      "narrationId": "旁白ID（如有）",
      "dialogueIds": ["对话ID列表"],
      "actionIds": ["动作ID列表"],
      "characters": [
        {
          "characterId": "角色ID",
          "position": { "x": 50, "y": 50, "scale": 1 },
          "expression": "表情",
          "action": "动作",
          "facing": "front"
        }
      ]
    }
  ]
}
\`\`\`

## 场景剧本

{sceneScript}
`
```

### 3.8 场景拆分服务（简化版）

#### 3.8.1 拆分流程

```
章节原文 → AI分析 → 场景划分 → 场景细化 → 用户审核 → 确认
              │           │
              ▼           ▼
         识别关键点   分配场景内容
         情感变化     提取角色动作
         地点转换     生成对话
```

#### 3.8.2 AI 拆分 Prompt 设计

```typescript
const SCENE_SPLIT_PROMPT = `
你是一个专业的视频脚本分析师。请将以下小说章节内容拆分为多个场景。

拆分原则：
1. 地点变化应拆分为新场景
2. 时间跳跃应拆分为新场景
3. 主要角色组合变化应考虑拆分
4. 情感氛围显著变化可拆分
5. 每个场景应有明确的视觉焦点

请输出 JSON 格式：
{
  "scenes": [
    {
      "sceneNumber": 1,
      "originalText": "原文片段",
      "sceneDescription": "场景视觉描述",
      "location": "地点名称",
      "timeOfDay": "时间",
      "mood": "氛围",
      "characters": ["角色1", "角色2"],
      "keyEvents": ["事件描述"],
      "dialogues": [
        {"character": "角色名", "text": "对话内容"}
      ],
      "narration": "旁白文本"
    }
  ]
}

章节内容：
{chapterContent}
`
```

### 3.5 图像生成服务

#### 3.5.1 一致性保证策略

```
┌─────────────────────────────────────────────────────────────┐
│                    图像一致性保证流程                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 角色形象锚定                                             │
│     ┌─────────┐                                              │
│     │ 角色设定 │ ──→ 生成角色参考图 ──→ 提取特征embedding    │
│     └─────────┘                                              │
│                                                              │
│  2. 场景风格锚定                                             │
│     ┌─────────┐                                              │
│     │ 场景设定 │ ──→ 生成场景参考图 ──→ 统一风格              │
│     └─────────┘                                              │
│                                                              │
│  3. 生成时注入                                               │
│     ┌─────────────┐                                          │
│     │ 新场景Prompt │ + 角色特征 + 场景风格 → 最终Prompt       │
│     └─────────────┘                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 3.5.2 Prompt 生成策略

```typescript
/**
 * 构建图像生成 Prompt
 */
function buildImagePrompt(
  scene: VideoScene,
  characterBindings: CharacterBinding[],
  styleConfig: StyleConfig
): string {
  const parts: string[] = []

  // 1. 风格前缀
  parts.push(styleConfig.stylePrefix)  // 如 "cinematic, high quality, 8k"

  // 2. 场景描述
  parts.push(scene.sceneScript.sceneDescription)

  // 3. 角色描述
  for (const char of scene.sceneScript.characters) {
    const binding = characterBindings.find(b => b.characterId === char.characterId)
    if (binding?.generateConfig) {
      parts.push(binding.generateConfig.baseDescription)
    }
    if (char.expression) parts.push(`${char.expression} expression`)
    if (char.action) parts.push(char.action)
  }

  // 4. 氛围和光线
  if (scene.sceneScript.mood) {
    parts.push(`${scene.sceneScript.mood} atmosphere`)
  }
  if (scene.sceneScript.timeOfDay) {
    parts.push(`${scene.sceneScript.timeOfDay} lighting`)
  }

  // 5. 质量后缀
  parts.push(styleConfig.qualitySuffix)

  return parts.join(', ')
}
```

### 3.6 音频生成服务

#### 3.6.1 TTS 服务集成

```typescript
/**
 * TTS 服务接口
 */
interface TTSService {
  // 生成语音
  generate(text: string, voiceId: string, options?: TTSOptions): Promise<AudioBuffer>

  // 获取可用声音列表
  getVoices(): Promise<Voice[]>
}

interface TTSOptions {
  speed?: number      // 语速 0.5-2.0
  pitch?: number      // 音调 -20 到 20
  emotion?: string    // 情感
}

interface Voice {
  id: string
  name: string
  gender: 'male' | 'female'
  language: string
  preview?: string    // 试听音频URL
}
```

#### 3.6.2 支持的 TTS 提供商

| 提供商 | 特点 | 声音质量 | 价格 |
|--------|------|----------|------|
| Edge TTS | 免费，微软云 | 高 | 免费 |
| Azure TTS | 微软官方，支持SSML | 极高 | 付费 |
| Volcengine TTS | 火山引擎，中文效果好 | 高 | 付费 |
| OpenAI TTS | OpenAI，英文效果好 | 高 | 付费 |

### 3.7 视频合成服务

#### 3.7.1 合成流程

```
┌─────────────────────────────────────────────────────────────┐
│                      视频合成流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  场景图片序列                                                │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                  │
│  │ 图片处理 │ ──→│ 添加转场 │ ──→│ 应用特效 │                  │
│  └─────────┘    └─────────┘    └─────────┘                  │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                  │
│  │ 添加字幕 │ ──→│ 音频合成 │ ──→│ 视频输出 │                  │
│  └─────────┘    └─────────┘    └─────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 3.7.2 FFmpeg 命令模板

```bash
# 基础视频合成
ffmpeg -y \
  -loop 1 -t {duration} -i {image_path} \      # 图片输入
  -i {audio_path} \                              # 音频输入
  -c:v libx264 -preset medium -crf 23 \         # 视频编码
  -c:a aac -b:a 128k \                          # 音频编码
  -pix_fmt yuv420p \                            # 像素格式
  -vf "scale=1920:1080,fps=30" \                # 缩放和帧率
  -shortest \                                    # 以最短为准
  {output_path}

# 添加字幕
ffmpeg -y \
  -i {video_path} \
  -vf "subtitles={srt_path}:force_style='Fontname=Microsoft YaHei,FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2'" \
  -c:a copy \
  {output_path}

# 添加转场效果
ffmpeg -y \
  -i {video1} -i {video2} \
  -filter_complex "[0:v][1:v]xfade=transition={effect}:duration=0.5:offset={offset}" \
  -c:a acrossfade \
  {output_path}
```

---

## 四、用户操作流程

### 4.1 创建剧集项目

```
1. 从长文写作项目入口，选择"制作剧集"
   ┌─────────────────────────────────────────┐
   │  长文项目详情                            │
   │  ┌─────────────────────────────────────┐│
   │  │ 项目：仙侠传说                       ││
   │  │ 章节：12章                          ││
   │  │                                     ││
   │  │ [开始写作] [制作剧集] ← 新增入口     ││
   │  └─────────────────────────────────────┘│
   └─────────────────────────────────────────┘

2. 配置剧集参数
   ┌─────────────────────────────────────────┐
   │  创建剧集项目                            │
   │                                         │
   │  项目名称：仙侠传说剧集                  │
   │                                         │
   │  视频设置：                              │
   │  ├─ 分辨率：[1080p ▼]                  │
   │  ├─ 宽高比：[16:9 ▼]                    │
   │  └─ 帧率：[30fps ▼]                     │
   │                                         │
   │  图像设置：                              │
   │  ├─ 风格：[古风仙侠 ▼]                  │
   │  └─ 提供商：[Stable Diffusion ▼]        │
   │                                         │
   │  音频设置：                              │
   │  ├─ 旁白声音：[选择声音 ▼]              │
   │  └─ 背景音乐：[开启]                    │
   │                                         │
   │  [取消] [创建并开始]                    │
   └─────────────────────────────────────────┘
```

### 4.2 角色形象绑定

```
   ┌─────────────────────────────────────────┐
   │  角色形象绑定                            │
   │                                         │
   │  ┌─────────────────────────────────────┐│
   │  │ 李逍遥（主角）                       ││
   │  │ ├─ 已关联人像：[李逍遥-标准形象]     ││
   │  │ │   ┌────┐                           ││
   │  │ │   │ 👤 │ 预览图                    ││
   │  │ │   └────┘                           ││
   │  │ ├─ 声音：[男声-青年-沉稳 ▼]          ││
   │  │ └─ [试听] [更换形象]                 ││
   │  └─────────────────────────────────────┘│
   │                                         │
   │  [上一步] [下一步：选择章节]            │
   └─────────────────────────────────────────┘
```

### 4.3 章节选择

```
   ┌─────────────────────────────────────────┐
   │  选择章节                                │
   │                                         │
   │  ☑ 第一章 相遇                          │
   │  ☑ 第二章 误会                          │
   │  ☐ 第三章 重逢                          │
   │  ...                                     │
   │                                         │
   │  已选择：2章                            │
   │                                         │
   │  [上一步] [生成剧本]                    │
   └─────────────────────────────────────────┘
```

### 4.4 剧本生成与编辑

```
1. AI 生成剧本
   ┌─────────────────────────────────────────┐
   │  正在生成剧本...                         │
   │                                         │
   │  ████████████░░░░░░░░ 60%               │
   │                                         │
   │  正在处理：第一章 相遇                   │
   │  已完成：2 个场景                        │
   └─────────────────────────────────────────┘

2. 剧本审核与编辑
   ┌─────────────────────────────────────────┐
   │  剧本编辑 - 第一章 相遇                  │
   │                                         │
   │  ┌─────────────────────────────────────┐│
   │  │ 场景1：青云山脚（外景·清晨）         ││
   │  │ ─────────────────────────            ││
   │  │ 场景描述：青石山路，两旁古树参天...  ││
   │  │ 氛围：宁静                           ││
   │  │ 出场：李逍遥                         ││
   │  │                                     ││
   │  │ 旁白：清晨的青云山脚，薄雾缭绕...    ││
   │  │                                     ││
   │  │ 对话：                               ││
   │  │ 李逍遥：（自语）今日便是...          ││
   │  │                                     ││
   │  │ [编辑] [拆分] [生成分镜]             ││
   │  └─────────────────────────────────────┘│
   │                                         │
   │  [重新生成] [确认剧本]                  │
   └─────────────────────────────────────────┘
```

### 4.5 分镜设计

```
1. AI 生成分镜
   ┌─────────────────────────────────────────┐
   │  正在生成分镜...                         │
   │                                         │
   │  场景1「青云山脚」                       │
   │  ████████░░░░░░░░ 40%                   │
   │                                         │
   │  已生成：3 个分镜                        │
   └─────────────────────────────────────────┘

2. 分镜时间线编辑
   ┌─────────────────────────────────────────┐
   │  分镜时间线 - 场景1 青云山脚             │
   │                                         │
   │  ┌───┬───┬───┬───┬───┬───┬───┬───┐     │
   │  │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │     │
   │  │远景│中景│近景│特写│中景│远景│   │   │     │
   │  │ 5s │ 4s │ 3s │ 2s │ 4s │ 6s │   │   │     │
   │  └───┴───┴───┴───┴───┴───┴───┴───┘     │
   │                                         │
   │  总时长：24秒                            │
   │                                         │
   │  [+添加分镜] [批量设置转场]             │
   └─────────────────────────────────────────┘

3. 单分镜编辑
   ┌─────────────────────────────────────────┐
   │  编辑分镜 #3                             │
   │                                         │
   │  镜头设置：                              │
   │  ├─ 景别：[近景 ▼]                      │
   │  ├─ 角度：[平视 ▼]                      │
   │  ├─ 运动：[推镜 ▼]                      │
   │  └─ 时长：[3] 秒                        │
   │                                         │
   │  画面描述：                              │
   │  ┌─────────────────────────────────────┐│
   │  │ 李逍遥的面部特写，眼神坚定           ││
   │  └─────────────────────────────────────┘│
   │                                         │
   │  转场设置：                              │
   │  ├─ 类型：[溶解 ▼]                      │
   │  └─ 时长：[500] 毫秒                    │
   │                                         │
   │  关联内容：                              │
   │  ☑ 旁白：「他抬头望向远方...」          │
   │  ☐ 对话：（无）                          │
   │                                         │
   │  [取消] [保存]                          │
   └─────────────────────────────────────────┘
```

### 4.6 资源生成

```
1. 批量生成面板
   ┌─────────────────────────────────────────┐
   │  资源生成                                │
   │                                         │
   │  生成状态：                              │
   │  ├─ 帧画面：12/20 (60%) ████░░░░        │
   │  ├─ 旁白：5/5 (100%) ████████           │
   │  ├─ 对话：8/8 (100%) ████████           │
   │  └─ 背景音乐：已完成                     │
   │                                         │
   │  当前任务：生成分镜 #6 帧画面            │
   │                                         │
   │  [暂停] [取消]                          │
   └─────────────────────────────────────────┘

2. 单个分镜预览
   ┌─────────────────────────────────────────┐
   │  分镜预览 #3                             │
   │                                         │
   │  ┌────────────────┐                     │
   │  │                │                     │
   │  │   [帧画面]     │ [重新生成]          │
   │  │                │ [编辑提示词]        │
   │  │                │                     │
   │  └────────────────┘                     │
   │                                         │
   │  音频预览：                              │
   │  ▶ 旁白：「他抬头望向远方...」           │
   │  ▶ 对话：李逍遥「...」                   │
   │                                         │
   │  时长：3秒 | 转场：溶解 0.5s            │
   │                                         │
   │  [上一个] [下一个]                      │
   └─────────────────────────────────────────┘
```

### 4.7 视频预览与导出

```
1. 剧集预览
   ┌─────────────────────────────────────────┐
   │  剧集预览 - 第一章 相遇                  │
   │                                         │
   │  ┌─────────────────────────────────────┐│
   │  │                                      ││
   │  │         [视频播放区域]               ││
   │  │                                      ││
   │  │           ▶️ ⏸️ ⏹️                   ││
   │  │      ◀━━━━━━━━━●━━━━▶ 02:35/05:20   ││
   │  └─────────────────────────────────────┘│
   │                                         │
   │  分镜列表：                              │
   │  [1.远景] [2.中景] [3.近景] [4.特写]... │
   │                                         │
   │  [返回编辑] [导出视频]                  │
   └─────────────────────────────────────────┘

2. 导出设置
   ┌─────────────────────────────────────────┐
   │  导出视频                                │
   │                                         │
   │  导出范围：                              │
   │  ○ 仅当前剧集（第一章）                  │
   │  ● 所有已完成剧集（2集）                 │
   │                                         │
   │  视频格式：[MP4 ▼]                      │
   │  视频质量：[高质量 ▼]                   │
   │                                         │
   │  保存位置：[/videos/仙侠传说/]          │
   │                                         │
   │  预计大小：约 150MB                      │
   │                                         │
   │  [取消] [开始导出]                      │
   └─────────────────────────────────────────┘
```

---

## 五、技术实现方案

### 5.1 目录结构

```
src/
├── main/
│   ├── services/
│   │   ├── story-to-video/
│   │   │   ├── index.ts                    # 服务入口
│   │   │   ├── script-generation.service.ts # 剧本生成服务
│   │   │   ├── storyboard.service.ts       # 分镜设计服务
│   │   │   ├── image-generation.service.ts  # 图像生成服务
│   │   │   ├── audio-generation.service.ts  # 音频生成服务
│   │   │   └── video-synthesis.service.ts   # 视频合成服务
│   │   └── tts.service.ts                  # TTS服务
│   ├── database/repositories/
│   │   ├── video-project.repository.ts
│   │   ├── video-episode.repository.ts
│   │   ├── episode-script.repository.ts
│   │   ├── scene-script.repository.ts
│   │   ├── storyboard.repository.ts
│   │   └── character-binding.repository.ts
│   └── ipc/handlers/
│       └── story-to-video.handler.ts
├── renderer/src/
│   ├── views/
│   │   └── StoryToVideo.vue                # 剧集制作主页面
│   └── components/story-to-video/
│       ├── VideoProjectList.vue            # 项目列表
│       ├── VideoProjectConfig.vue          # 项目配置
│       ├── CharacterBindingPanel.vue       # 角色绑定面板
│       ├── ChapterSelector.vue             # 章节选择器
│       ├── ScriptEditor.vue                # 剧本编辑器
│       ├── SceneEditor.vue                 # 场景编辑器
│       ├── StoryboardEditor.vue            # 分镜编辑器
│       ├── StoryboardTimeline.vue          # 分镜时间线
│       ├── ShotConfigPanel.vue             # 镜头配置面板
│       ├── TransitionConfig.vue            # 转场配置
│       ├── AssetPreview.vue                # 资产预览
│       ├── VideoPreview.vue                # 视频预览
│       └── ExportDialog.vue                # 导出对话框
└── shared/types/
    └── story-to-video.types.ts            # 类型定义
```

### 5.2 依赖项

```json
{
  "fluent-ffmpeg": "^2.1.2",    // 视频处理
  "@ffmpeg-installer/ffmpeg": "^1.1.0",  // FFmpeg二进制
  "edge-tts": "^1.0.1"          // Edge TTS（免费）
}
```

### 5.3 IPC 通道设计

| 通道 | 功能 | 参数 |
|------|------|------|
| **项目管理** |||
| `stv:createProject` | 创建剧集项目 | `{ name, longWritingProjectId, config }` |
| `stv:getProject` | 获取项目详情 | `projectId` |
| `stv:listProjects` | 获取项目列表 | `{ longWritingProjectId? }` |
| `stv:updateProject` | 更新项目配置 | `{ projectId, config }` |
| `stv:deleteProject` | 删除项目 | `projectId` |
| **剧集管理** |||
| `stv:createEpisode` | 创建剧集 | `{ projectId, outlineId }` |
| `stv:getEpisode` | 获取剧集详情 | `episodeId` |
| `stv:listEpisodes` | 获取剧集列表 | `projectId` |
| `stv:deleteEpisode` | 删除剧集 | `episodeId` |
| **剧本相关** |||
| `stv:generateScript` | 生成剧本 | `{ episodeId, chapterContent }` |
| `stv:getScript` | 获取剧本详情 | `scriptId` |
| `stv:updateScript` | 更新剧本 | `{ scriptId, data }` |
| `stv:updateScene` | 更新场景 | `{ sceneId, data }` |
| `stv:splitScene` | 拆分场景 | `{ sceneId, splitPoint }` |
| `stv:mergeScenes` | 合并场景 | `{ sceneIds }` |
| **分镜相关** |||
| `stv:generateStoryboards` | 生成分镜 | `{ sceneId }` |
| `stv:getStoryboard` | 获取分镜详情 | `storyboardId` |
| `stv:updateStoryboard` | 更新分镜 | `{ storyboardId, data }` |
| `stv:splitStoryboard` | 拆分分镜 | `{ storyboardId }` |
| `stv:mergeStoryboards` | 合并分镜 | `{ storyboardIds }` |
| `stv:reorderStoryboards` | 重排分镜 | `{ sceneId, storyboardIds }` |
| **角色绑定** |||
| `stv:bindCharacter` | 绑定角色形象 | `{ projectId, characterId, portraitId, voiceConfig }` |
| `stv:getCharacterBindings` | 获取角色绑定列表 | `projectId` |
| `stv:updateCharacterBinding` | 更新角色绑定 | `{ bindingId, data }` |
| **资源生成** |||
| `stv:generateFrameImage` | 生成帧画面 | `{ storyboardId }` |
| `stv:generateSceneImages` | 批量生成场景图片 | `{ sceneId }` |
| `stv:generateNarration` | 生成旁白音频 | `{ sceneId }` |
| `stv:generateDialogue` | 生成对话音频 | `{ dialogueId }` |
| `stv:generateSceneAudio` | 批量生成场景音频 | `{ sceneId }` |
| **预览与导出** |||
| `stv:previewEpisode` | 预览剧集 | `episodeId` |
| `stv:exportVideo` | 导出视频 | `{ episodeIds, format, quality, outputPath }` |
| `stv:getExportProgress` | 获取导出进度 | `taskId` |
| **工具接口** |||
| `stv:getVoices` | 获取可用声音列表 | - |
| `stv:estimateDuration` | 估算时长 | `{ episodeId }` |

---

## 六、一致性保证方案

### 6.1 角色一致性

```
┌─────────────────────────────────────────────────────────────┐
│                    角色一致性保证                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  方案一：人像绑定（推荐）                                    │
│  ├─ 从人像设计模块选择已有角色形象                          │
│  ├─ 使用人像的多角度图片作为参考                            │
│  └─ 生成时注入角色特征                                      │
│                                                              │
│  方案二：风格参考图                                          │
│  ├─ 生成角色标准形象图                                      │
│  ├─ 提取图像特征（使用IP-Adapter）                          │
│  └─ 后续生成参考特征图                                      │
│                                                              │
│  方案三：文字描述锚定                                        │
│  ├─ 详细描述角色外貌特征                                    │
│  ├─ 每次生成包含完整描述                                    │
│  └─ 适合风格化程度高的场景                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 场景风格一致性

```
┌─────────────────────────────────────────────────────────────┐
│                    场景风格一致性                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 项目级风格设置                                          │
│     ├─ 选择预设风格（古风/现代/科幻等）                     │
│     ├─ 上传风格参考图                                       │
│     └─ 设置风格关键词                                       │
│                                                              │
│  2. 地点风格绑定                                            │
│     ├─ 为重要地点生成参考图                                 │
│     ├─ 同一地点使用相同参考                                 │
│     └─ 时间变化调整光线描述                                 │
│                                                              │
│  3. 生成参数一致性                                          │
│     ├─ 固定 Seed（可选）                                    │
│     ├─ 统一采样参数                                         │
│     └─ 统一负面提示词                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 音频一致性

```
┌─────────────────────────────────────────────────────────────┐
│                    音频一致性                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 角色声音绑定                                            │
│     ├─ 每个角色绑定固定声音ID                               │
│     ├─ 设置角色专属语速、音调                               │
│     └─ 保持声音特性一致                                     │
│                                                              │
│  2. 旁白一致性                                              │
│     ├─ 全剧统一旁白声音                                     │
│     ├─ 保持旁白语速一致                                     │
│     └─ 情感起伏自然过渡                                     │
│                                                              │
│  3. 背景音乐一致性                                          │
│     ├─ 选择主题音乐                                         │
│     ├─ 各章节风格统一                                       │
│     └─ 音量平衡                                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、实现计划

### Phase 1: 基础框架（预计 3-4 天）

**目标**：搭建项目骨架，实现基础数据管理

1. **数据库表设计**
   - video_projects 表
   - video_episodes 表
   - episode_scripts 表
   - scene_scripts 表
   - storyboards 表
   - character_bindings 表

2. **类型定义**
   - 创建 `src/shared/types/story-to-video.types.ts`
   - 定义所有接口类型

3. **Repository 层**
   - VideoProjectRepository
   - VideoEpisodeRepository
   - EpisodeScriptRepository
   - SceneScriptRepository
   - StoryboardRepository
   - CharacterBindingRepository

4. **IPC 通道**
   - 基础 CRUD 通道
   - 数据库初始化

5. **前端骨架**
   - 路由配置
   - 页面布局
   - 状态管理

### Phase 2: 剧本生成（预计 3-4 天）

**目标**：实现长文到剧本的 AI 转换

1. **剧本生成服务**
   - 实现 `ScriptGenerationService`
   - AI Prompt 设计与优化
   - 结果解析与存储

2. **角色绑定界面**
   - 从长文项目导入角色
   - 关联人像设计
   - 配置声音

3. **剧本编辑器**
   - 场景列表展示
   - 场景内容编辑
   - 对话编辑
   - 旁白编辑
   - 场景拆分/合并

4. **剧本审核流程**
   - 预览功能
   - 修改建议
   - 确认提交

### Phase 3: 分镜设计（预计 3-4 天）

**目标**：实现场景到分镜的专业设计

1. **分镜生成服务**
   - 实现 `StoryboardGenerationService`
   - 镜头语言 AI Prompt
   - 景别/运动/角度智能推荐

2. **分镜编辑器**
   - 分镜列表（时间线视图）
   - 镜头参数配置
   - 画面描述编辑
   - 转场设置

3. **分镜预览**
   - 静态分镜预览
   - 镜头运动动画预览
   - 时长计算

4. **分镜管理**
   - 拆分/合并分镜
   - 调整顺序
   - 复制/删除

### Phase 4: 资源生成（预计 3-4 天）

**目标**：实现图像和音频生成

1. **图像生成服务**
   - 集成现有图像生成服务
   - Prompt 构建（融入镜头语言）
   - 批量生成队列
   - 一致性保证策略

2. **TTS 服务集成**
   - Edge TTS 集成（免费）
   - 角色声音配置
   - 批量生成
   - 音频格式转换

3. **资产管理系统**
   - 图像资产存储
   - 音频资产存储
   - 缩略图生成
   - 资产预览

4. **批量生成优化**
   - 并行生成
   - 进度显示
   - 错误重试
   - 取消机制

### Phase 5: 视频合成（预计 2-3 天）

**目标**：实现视频合成与导出

1. **FFmpeg 服务**
   - 集成 fluent-ffmpeg
   - 图片转视频
   - 音频合成
   - 字幕叠加

2. **转场效果**
   - 实现各种转场类型
   - xfade 滤镜配置
   - 自定义转场

3. **视频预览**
   - 分段预览
   - 整体预览
   - 时间线调整

4. **导出功能**
   - 格式选择
   - 质量设置
   - 进度显示
   - 文件管理

### Phase 6: 优化完善（预计 2 天）

**目标**：完善用户体验和性能

1. **性能优化**
   - 生成队列优化
   - 缓存策略
   - 内存管理

2. **用户体验**
   - 操作引导
   - 快捷键
   - 撤销/重做

3. **错误处理**
   - 友好错误提示
   - 自动保存
   - 恢复机制

4. **测试与文档**
   - 单元测试
   - 集成测试
   - 用户文档

---

## 八、风险与应对

### 8.1 技术风险

| 风险 | 影响 | 应对方案 |
|------|------|----------|
| AI 图像生成不一致 | 角色外观变化大 | 使用人像绑定 + 风格参考图 |
| FFmpeg 安装问题 | 视频合成失败 | 使用 @ffmpeg-installer 自动安装 |
| TTS 服务不稳定 | 配音缺失 | 支持多 TTS 提供商切换 |
| 长时间生成 | 用户体验差 | 异步处理 + 进度通知 |

### 8.2 质量风险

| 风险 | 影响 | 应对方案 |
|------|------|----------|
| 场景拆分不合理 | 剧情不连贯 | AI拆分 + 人工审核调整 |
| 图片质量差 | 视频效果差 | 多模型支持 + 提示词优化 |
| 配音不自然 | 观感下降 | 多声音选择 + 参数调整 |

---

## 九、后续扩展

1. **更多视频特效**：转场动画、滤镜、特效
2. **更多 TTS 支持**：Azure、OpenAI、火山引擎
3. **视频模板**：预设风格模板快速生成
4. **批量处理**：整部小说一键生成
5. **云端渲染**：使用云服务加速生成