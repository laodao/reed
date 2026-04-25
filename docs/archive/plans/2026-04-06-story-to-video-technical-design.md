# 长文转剧集视频功能技术设计文档

## 一、系统架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              渲染进程 (Vue3)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  VideoProjectList.vue          VideoProjectEditor.vue                       │
│  (项目列表页)                   (项目编辑页)                                 │
│       │                              │                                      │
│       │         ┌────────────────────┼────────────────────┐                │
│       │         │                    │                    │                │
│       ▼         ▼                    ▼                    ▼                │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                    StoryToVideoStore (Pinia)                     │       │
│  │  - projects, episodes, scenes, storyboards                       │       │
│  │  - currentProject, currentEpisode, currentScene                  │       │
│  │  - characterBindings, loading, generating                        │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │ IPC
┌────────────────────────────────────┼────────────────────────────────────────┐
│                              主进程 (Electron)                               │
├────────────────────────────────────┼────────────────────────────────────────┤
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                  StoryToVideoHandler (IPC处理器)                 │       │
│  │  - handleGenerateScript                                          │       │
│  │  - handleGenerateStoryboards                                     │       │
│  │  - handleGenerateSceneImages                                     │       │
│  │  - handleSynthesizeVideo                                         │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │StoryToVideo  │    │StoryToVideo  │    │VideoSynthesis│                  │
│  │AIService     │    │ResourceService│   │Service       │                  │
│  │(AI生成)      │    │(素材生成)    │    │(视频合成)    │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                      DatabaseManager                             │       │
│  │  - videoProjects, videoEpisodes, episodeScripts                  │       │
│  │  - sceneScripts, storyboards, characterBindings                  │       │
│  │  - imageAssets, sceneCharacters, sceneDialogues                  │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │   SQLite     │
                              │  (the_bot.db)│
                              └──────────────┘
```

### 1.2 模块职责

| 模块 | 层级 | 职责 |
|------|------|------|
| VideoProjectList | 渲染层 | 项目列表展示、创建入口 |
| VideoProjectEditor | 渲染层 | 项目编辑主界面，包含标签页 |
| StoryToVideoStore | 状态层 | 管理所有状态，提供Action方法 |
| StoryToVideoHandler | IPC层 | 处理渲染进程请求，调用服务 |
| StoryToVideoAIService | 服务层 | AI剧本生成、分镜生成 |
| StoryToVideoResourceService | 服务层 | 图像生成、音频生成 |
| VideoSynthesisService | 服务层 | 视频合成、导出 |
| DatabaseManager | 数据层 | 数据库操作、仓库管理 |

---

## 二、数据库设计

### 2.1 表结构（遵循第三范式）

#### 2.1.1 核心表

```sql
-- 项目表
CREATE TABLE video_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  long_writing_project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft/producing/completed
  config TEXT NOT NULL DEFAULT '{}',     -- JSON: VideoProjectConfig
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (long_writing_project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
);

-- 剧集表
CREATE TABLE video_episodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  outline_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  duration INTEGER DEFAULT 0,
  script_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
);

-- 剧本表
CREATE TABLE episode_scripts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  outline_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  synopsis TEXT,
  script_content TEXT,           -- 完整剧本正文
  script_format TEXT DEFAULT 'standard',
  total_duration INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id) REFERENCES video_episodes(id) ON DELETE CASCADE
);

-- 场景剧本表
CREATE TABLE scene_scripts (
  id TEXT PRIMARY KEY,
  episode_script_id TEXT NOT NULL,
  scene_number INTEGER NOT NULL,
  location TEXT NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'exterior',
  time_of_day TEXT NOT NULL DEFAULT 'morning',
  weather TEXT,
  scene_description TEXT NOT NULL,
  mood TEXT,
  lighting TEXT,
  original_text TEXT,
  narration TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (episode_script_id) REFERENCES episode_scripts(id) ON DELETE CASCADE
);

-- 分镜表
CREATE TABLE storyboards (
  id TEXT PRIMARY KEY,
  scene_script_id TEXT NOT NULL,
  shot_number INTEGER NOT NULL,
  shot_type TEXT NOT NULL DEFAULT 'medium',
  camera_angle TEXT NOT NULL DEFAULT 'eye_level',
  camera_movement TEXT NOT NULL DEFAULT 'static',
  movement_duration REAL,
  frame_description TEXT NOT NULL,
  subject TEXT,
  composition TEXT,
  characters TEXT NOT NULL DEFAULT '[]',  -- JSON: StoryboardCharacter[]
  narration_id TEXT,
  dialogue_ids TEXT NOT NULL DEFAULT '[]',
  action_ids TEXT NOT NULL DEFAULT '[]',
  frame_image TEXT,                       -- JSON: ImageAsset
  duration REAL NOT NULL DEFAULT 3,
  transition TEXT NOT NULL DEFAULT '{}',  -- JSON: TransitionConfig
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (scene_script_id) REFERENCES scene_scripts(id) ON DELETE CASCADE
);

-- 角色绑定表
CREATE TABLE character_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  long_writing_character_id TEXT NOT NULL,
  portrait_id TEXT,
  generate_config TEXT,                    -- JSON
  voice_config TEXT NOT NULL,              -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (portrait_id) REFERENCES portrait_characters(id) ON DELETE SET NULL
);
```

#### 2.1.2 资产表

```sql
-- 图像资产表
CREATE TABLE image_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,                      -- generated/uploaded
  provider TEXT,
  model TEXT,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  image_path TEXT NOT NULL,
  thumbnail_path TEXT,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  metadata TEXT,                           -- JSON
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
);

-- 音频资产表
CREATE TABLE audio_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,                      -- narration/dialogue/music/sfx/ambient
  text TEXT,
  voice_id TEXT,
  audio_path TEXT NOT NULL,
  duration INTEGER NOT NULL,
  volume INTEGER DEFAULT 100,
  fade_in INTEGER,
  fade_out INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
);
```

### 2.2 数据关系图

```
video_projects
├── character_bindings
│   └── (通过 long_writing_character_id 关联长文角色)
│
├── video_episodes
│   └── episode_scripts
│       └── scene_scripts
│           ├── scene_characters
│           │   └── scene_props
│           ├── scene_dialogues
│           ├── scene_actions
│           └── storyboards
│               ├── storyboard_characters
│               ├── storyboard_dialogue_links
│               └── storyboard_action_links
│
├── image_assets
└── audio_assets
```

---

## 三、IPC 接口设计

### 3.1 通道定义

```typescript
// src/shared/types/ipc.types.ts

export interface StoryToVideoIPC {
  // 项目管理
  'story-to-video:listProjects': (longWritingProjectId?: string) => Promise<IPCResponse<VideoProject[]>>
  'story-to-video:getProject': (projectId: string) => Promise<IPCResponse<VideoProject>>
  'story-to-video:createProject': (name: string, longWritingProjectId: string, config: VideoProjectConfig) => Promise<IPCResponse<VideoProject>>
  'story-to-video:updateProject': (projectId: string, data: Partial<VideoProject>) => Promise<IPCResponse<VideoProject>>
  'story-to-video:deleteProject': (projectId: string) => Promise<IPCResponse<void>>

  // 剧集管理
  'story-to-video:listEpisodes': (projectId: string) => Promise<IPCResponse<VideoEpisode[]>>
  'story-to-video:createEpisode': (projectId: string, outlineId: string, episodeNumber: number, title: string) => Promise<IPCResponse<VideoEpisode>>
  'story-to-video:deleteEpisode': (episodeId: string) => Promise<IPCResponse<void>>

  // 剧本管理
  'story-to-video:getScript': (scriptId: string) => Promise<IPCResponse<EpisodeScript>>
  'story-to-video:updateScript': (scriptId: string, data: Partial<EpisodeScript>) => Promise<IPCResponse<EpisodeScript>>
  'story-to-video:generateScript': (projectId: string, outlineId: string, providerConfigId?: string, modelId?: string) => Promise<IPCResponse<{ script: EpisodeScript; scenes: SceneScript[] }>>

  // 场景管理
  'story-to-video:listScenes': (episodeScriptId: string) => Promise<IPCResponse<SceneScript[]>>
  'story-to-video:updateScene': (sceneId: string, data: Partial<SceneScript>) => Promise<IPCResponse<SceneScript>>

  // 分镜管理
  'story-to-video:listStoryboards': (sceneScriptId: string) => Promise<IPCResponse<Storyboard[]>>
  'story-to-video:updateStoryboard': (storyboardId: string, data: Partial<Storyboard>) => Promise<IPCResponse<Storyboard>>
  'story-to-video:generateStoryboards': (scriptId: string, providerConfigId?: string, modelId?: string) => Promise<IPCResponse<Storyboard[]>>

  // 角色绑定
  'story-to-video:getCharacterBindings': (projectId: string) => Promise<IPCResponse<CharacterBinding[]>>
  'story-to-video:bindCharacter': (projectId: string, longWritingCharacterId: string, portraitId?: string, voiceConfig?: any, generateConfig?: any) => Promise<IPCResponse<CharacterBinding>>
  'story-to-video:updateCharacterBinding': (bindingId: string, data: Partial<CharacterBinding>) => Promise<IPCResponse<CharacterBinding>>
  'story-to-video:deleteCharacterBinding': (bindingId: string) => Promise<IPCResponse<void>>

  // 素材生成
  'story-to-video:generateSceneImages': (sceneId: string, styleName: string, providerConfigId?: string, modelId?: string) => Promise<IPCResponse<Storyboard[]>>
  'story-to-video:generateAudio': (sceneId: string) => Promise<IPCResponse<{ narrationPath?: string; dialogueCount: number }>>

  // 视频合成
  'story-to-video:synthesizeSceneVideo': (sceneId: string, quality: string) => Promise<IPCResponse<{ outputPath: string; duration: number }>>
  'story-to-video:exportVideo': (sourcePath: string, outputPath: string, quality: string) => Promise<IPCResponse<{ outputPath: string }>>
}
```

### 3.2 进度通知通道

```typescript
// 图像生成进度
'story-to-video:image-progress': (event: IpcRendererEvent, data: { sceneId: string; index: number; total: number }) => void

// 音频生成进度
'story-to-video:audio-progress': (event: IpcRendererEvent, data: { sceneId: string; type: string; index: number; total: number }) => void

// 视频合成进度
'story-to-video:synthesis-progress': (event: IpcRendererEvent, data: { sceneId: string; phase: string; progress: number }) => void
```

---

## 四、服务层设计

### 4.1 StoryToVideoAIService

**职责**：AI内容生成（剧本、分镜）

```typescript
// src/main/services/story-to-video-ai.service.ts

export class StoryToVideoAIService {
  private static instance: StoryToVideoAIService

  // ==================== 剧本生成 ====================

  /**
   * 生成完整剧本
   * @param chapterContent 章节内容
   * @param characters 角色列表
   * @param providerConfigId 提供商配置ID
   * @param modelId 模型ID
   * @returns 剧本生成结果
   */
  async generateFullScript(
    chapterContent: string,
    characters: Character[],
    providerConfigId?: string,
    modelId?: string
  ): Promise<FullScriptGenerationResult | null> {
    // 1. 构建提示词
    const prompt = this.buildScriptPrompt(chapterContent, characters)

    // 2. 调用AI模型
    const response = await this.callAI(prompt, providerConfigId, modelId)

    // 3. 解析响应（分离正文和JSON）
    return this.parseScriptResponse(response)
  }

  // ==================== 分镜生成 ====================

  /**
   * 生成分镜
   * @param scene 场景剧本
   * @param characterBindings 角色绑定
   * @param providerConfigId 提供商配置ID
   * @param modelId 模型ID
   * @returns 分镜列表
   */
  async generateStoryboards(
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    providerConfigId?: string,
    modelId?: string
  ): Promise<GeneratedStoryboard[]> {
    // 1. 构建分镜提示词
    const prompt = this.buildStoryboardPrompt(scene, characterBindings)

    // 2. 调用AI模型
    const response = await this.callAI(prompt, providerConfigId, modelId)

    // 3. 解析JSON响应
    return this.parseStoryboardResponse(response)
  }

  // ==================== 私有方法 ====================

  private buildScriptPrompt(chapterContent: string, characters: Character[]): string {
    // 使用 SCRIPT_GENERATION_PROMPT 模板
  }

  private buildStoryboardPrompt(scene: SceneScript, bindings: CharacterBinding[]): string {
    // 使用 STORYBOARD_GENERATION_PROMPT 模板
  }

  private parseScriptResponse(response: string): FullScriptGenerationResult {
    // 解析 ===SYNOPSIS===, ===SCRIPT===, ===SCENES_JSON=== 标记
  }

  private parseStoryboardResponse(response: string): GeneratedStoryboard[] {
    // 解析JSON数组
  }
}
```

### 4.2 StoryToVideoResourceService

**职责**：素材生成（图像、音频）

```typescript
// src/main/services/story-to-video-resource.service.ts

export class StoryToVideoResourceService {
  private static instance: StoryToVideoResourceService

  // ==================== 图像生成 ====================

  /**
   * 构建图像Prompt
   */
  buildImagePrompt(
    storyboard: Storyboard,
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    styleConfig: StyleConfig
  ): string {
    // 组装：风格 + 场景 + 分镜描述 + 角色 + 镜头语言
  }

  /**
   * 生成分镜画面
   */
  async generateStoryboardImage(
    window: BrowserWindow,
    storyboard: Storyboard,
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    styleName: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<ImageAsset | null> {
    // 1. 构建Prompt
    // 2. 调用 ImageService.generateImage
    // 3. 返回 ImageAsset
  }

  /**
   * 批量生成画面（带进度回调）
   */
  async generateStoryboardImages(
    window: BrowserWindow,
    storyboards: Storyboard[],
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    styleName: string,
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (index: number, total: number) => void
  ): Promise<Map<string, ImageAsset>> {
    // 遍历生成分镜画面，发送进度事件
  }

  // ==================== 音频生成 ====================

  /**
   * 生成旁白音频
   */
  async generateNarrationAudio(
    window: BrowserWindow,
    text: string,
    voiceConfig: VoiceConfig,
    outputDir: string
  ): Promise<string | null> {
    // 调用 VoiceService.generateSpeech
  }

  /**
   * 生成对话音频
   */
  async generateDialogueAudio(
    window: BrowserWindow,
    text: string,
    characterId: string,
    characterBindings: CharacterBinding[],
    outputDir: string
  ): Promise<string | null> {
    // 根据角色绑定配置调用TTS
  }
}
```

### 4.3 VideoSynthesisService（待开发）

**职责**：视频合成、导出

```typescript
// src/main/services/video-synthesis.service.ts (新建)

export class VideoSynthesisService {
  private static instance: VideoSynthesisService

  /**
   * 合成场景视频
   */
  async synthesizeSceneVideo(
    window: BrowserWindow,
    scene: SceneScript,
    storyboards: Storyboard[],
    outputDir: string,
    quality: string,
    onProgress?: (phase: string, progress: number) => void
  ): Promise<{ outputPath: string; duration: number }> {
    // 1. 准备图像序列
    // 2. 准备音频文件
    // 3. 调用FFmpeg合成
    // 4. 返回输出路径
  }

  /**
   * 导出视频
   */
  async exportVideo(
    sourcePath: string,
    outputPath: string,
    quality: string
  ): Promise<{ outputPath: string }> {
    // 转码导出
  }

  /**
   * 使用FFmpeg合成视频
   */
  private async runFFmpeg(
    imageSequence: string[],
    audioFiles: string[],
    outputPath: string,
    config: VideoConfig
  ): Promise<void> {
    // 构建FFmpeg命令
    // ffmpeg -framerate 30 -i img%03d.png -i audio.mp3 -c:v libx264 -c:a aac output.mp4
  }
}
```

---

## 五、AI 提示词设计

### 5.1 剧本生成提示词

```typescript
const SCRIPT_GENERATION_PROMPT = `你是一位专业的影视剧本编剧，精通三幕剧结构、视觉化叙事与标准剧本格式。

请根据以下小说章节内容，生成专业的影视剧本。

## 章节内容
{{chapterContent}}

## 角色列表
{{characters}}

## 输出要求

请严格按照以下格式输出，包含三个部分：

===SYNOPSIS===
[章节梗概，50-100字，概述本章主要情节]
===SYNOPSIS_END===

===SCRIPT===
[完整剧本正文，使用标准剧本格式]

格式要求：
- 场景标题：INT./EXT. 地点 - 时间（如：INT. 办公室 - 日）
- 动作描写：现在时态，仅写可见可听内容
- 角色名：居中，全大写
- 对白：居中缩进
- 括号提示：角色名下方，小括号，用于语气/动作提示

示例：
INT. 办公室 - 日

阳光透过落地窗洒进来。李明坐在电脑前，眉头紧锁。

                    李明
          （自言自语）
    这个方案还是不对...

                                              CUT TO:
===SCRIPT_END===

===SCENES_JSON===
[JSON数组，包含结构化场景数据，用于系统处理]
[
  {
    "sceneNumber": 1,
    "location": "办公室",
    "locationType": "interior",
    "timeOfDay": "morning",
    "sceneDescription": "阳光透过落地窗洒进来...",
    "mood": "紧张",
    "characters": [
      {
        "characterId": "char_001",
        "characterName": "李明",
        "expression": "眉头紧锁",
        "action": "坐在电脑前"
      }
    ],
    "narration": "",
    "dialogues": [
      {
        "id": "dial_001",
        "characterId": "char_001",
        "characterName": "李明",
        "text": "这个方案还是不对...",
        "emotion": "困惑"
      }
    ],
    "actions": []
  }
]
===SCENES_JSON_END===
`
```

### 5.2 分镜生成提示词

```typescript
const STORYBOARD_GENERATION_PROMPT = `你是一位专业的分镜师，精通镜头语言和视觉叙事。

请根据以下场景剧本，将其拆分为专业的分镜镜头。

## 场景信息
- 地点：{{location}}
- 时间：{{timeOfDay}}
- 氛围：{{mood}}
- 场景描述：{{sceneDescription}}

## 出场角色
{{characters}}

## 场景内容
### 旁白
{{narration}}

### 对话
{{dialogues}}

### 动作
{{actions}}

## 输出要求

请输出JSON数组，每个元素代表一个分镜镜头：

\`\`\`json
[
  {
    "shotNumber": 1,
    "shotType": "long",           // 景别: extreme_long/long/full/medium/medium_close/close/extreme_close/detail
    "cameraAngle": "eye_level",   // 角度: eye_level/high/low/dutch/birds_eye/worms_eye
    "cameraMovement": "static",   // 运动: static/pan_left/pan_right/tilt_up/tilt_down/dolly_in/dolly_out/zoom_in/zoom_out
    "movementDuration": null,     // 运动时长（秒）
    "frameDescription": "远景展示办公室全貌，李明坐在角落的工位上",
    "subject": "李明",
    "composition": "中心构图",
    "characters": [
      {
        "characterId": "char_001",
        "position": { "x": 50, "y": 50, "scale": 1.0 },
        "expression": "困惑",
        "action": "坐在电脑前",
        "facing": "front"
      }
    ],
    "dialogueIds": [],
    "actionIds": [],
    "duration": 3,                // 镜头时长（秒）
    "transition": {
      "type": "cut",              // 转场类型: cut/fade/dissolve/wipe/slide/zoom
      "duration": 0
    }
  }
]
\`\`\`

## 镜头设计原则

1. **景别选择**：
   - 远景：展示环境，建立场景
   - 全景：展示人物全身和周围环境
   - 中景：展示人物腰部以上，适合对话
   - 近景：展示人物胸部以上，表现情感
   - 特写：展示面部表情或细节

2. **角度选择**：
   - 平视：客观、中立
   - 俯拍：渺小、无力
   - 仰拍：强大、威严
   - 荷兰角：不安、紧张

3. **运镜选择**：
   - 固定：稳定、观察
   - 推镜：聚焦、强调
   - 拉镜：揭示、结束
   - 摇镜：跟随、展示

4. **时长计算**：
   - 远景/全景：3-5秒
   - 中景：2-4秒
   - 近景/特写：2-3秒
   - 有对白的镜头：根据对白长度 + 1秒

5. **节奏控制**：
   - 紧张场景：短镜头、快切
   - 情感场景：长镜头、慢切
   - 动作场景：多变角度、快节奏

请确保生成的分镜能够完整呈现场景内容，并符合影视制作的行业标准。
`
```

---

## 六、前端组件设计

### 6.1 组件树

```
VideoProjectEditor.vue
├── EditorHeader.vue (顶部导航)
│   ├── BackButton
│   ├── ProjectTitle
│   ├── ModelSelector
│   └── SettingsButton
│
├── LeftPanel (剧集列表)
│   └── EpisodeList.vue
│       ├── EpisodeItem
│       └── AddEpisodeButton
│
├── CenterPanel (编辑区)
│   ├── TabBar
│   ├── ScriptTab.vue
│   │   ├── SceneNavSidebar.vue (场景导航)
│   │   ├── ScriptContentArea.vue (剧本正文)
│   │   └── SynopsisCollapse.vue (章节梗概)
│   │
│   ├── CharacterBindingTab.vue
│   │   ├── BindingList
│   │   ├── BindingItem
│   │   └── BindCharacterDialog.vue
│   │
│   └── StoryboardTab.vue (待开发)
│       ├── SceneSelector
│       ├── StoryboardList
│       └── StoryboardEditDialog.vue
│
└── RightPanel (分镜面板)
    └── StoryboardPanel.vue
        ├── StoryboardItem
        ├── GenerateImagesDialog.vue
        └── SynthesisDialog.vue
```

### 6.2 核心组件设计

#### 6.2.1 ScriptTab.vue

```vue
<template>
  <div class="script-tab">
    <!-- 左侧场景导航 -->
    <SceneNavSidebar
      :scenes="store.scenes"
      :current-index="currentSceneIndex"
      @select="scrollToScene"
    >
      <template #header>
        <el-button @click="generateScript" :loading="store.generating">
          AI 生成剧本
        </el-button>
      </template>
    </SceneNavSidebar>

    <!-- 右侧剧本正文 -->
    <ScriptContentArea
      ref="scriptContentRef"
      :script="store.currentScript"
      :scenes="store.scenes"
      :current-scene-index="currentSceneIndex"
    />

    <!-- 底部梗概 -->
    <el-collapse>
      <el-collapse-item title="章节梗概">
        <el-input
          v-model="synopsis"
          type="textarea"
          @blur="saveSynopsis"
        />
      </el-collapse-item>
    </el-collapse>
  </div>
</template>
```

#### 6.2.2 StoryboardTab.vue (待开发)

```vue
<template>
  <div class="storyboard-tab">
    <!-- 场景选择器 -->
    <div class="scene-selector">
      <el-select v-model="selectedSceneId" @change="onSceneChange">
        <el-option
          v-for="scene in store.scenes"
          :key="scene.id"
          :label="`场景${scene.sceneNumber}: ${scene.location}`"
          :value="scene.id"
        />
      </el-select>
    </div>

    <!-- 分镜操作栏 -->
    <div class="storyboard-actions">
      <el-button @click="generateStoryboards" :loading="store.generating">
        生成分镜
      </el-button>
      <el-button @click="showGenerateImagesDialog = true" :disabled="!hasStoryboards">
        生成画面
      </el-button>
      <el-button type="primary" @click="synthesizeVideo" :disabled="!hasAllImages">
        合成视频
      </el-button>
    </div>

    <!-- 分镜列表 -->
    <div class="storyboard-list">
      <StoryboardItem
        v-for="storyboard in store.storyboards"
        :key="storyboard.id"
        :storyboard="storyboard"
        @edit="editStoryboard"
      />
    </div>

    <!-- 对话框 -->
    <GenerateImagesDialog v-model="showGenerateImagesDialog" />
    <StoryboardEditDialog v-model="showEditDialog" :storyboard="editingStoryboard" />
  </div>
</template>
```

### 6.3 状态管理

```typescript
// src/renderer/src/stores/story-to-video.ts

export const useStoryToVideoStore = defineStore('storyToVideo', () => {
  // ==================== 状态 ====================

  // 项目相关
  const projects = ref<VideoProject[]>([])
  const currentProject = ref<VideoProject | null>(null)

  // 剧集相关
  const episodes = ref<VideoEpisode[]>([])
  const currentEpisode = ref<VideoEpisode | null>(null)

  // 剧本相关
  const currentScript = ref<EpisodeScript | null>(null)
  const scenes = ref<SceneScript[]>([])

  // 分镜相关
  const currentScene = ref<SceneScript | null>(null)
  const storyboards = ref<Storyboard[]>([])

  // 角色绑定
  const characterBindings = ref<CharacterBinding[]>([])

  // UI状态
  const loading = ref(false)
  const generating = ref(false)
  const error = ref<string | null>(null)

  // 模型选择
  const selectedProviderConfigId = ref<string | null>(null)
  const selectedModelId = ref<string | null>(null)

  // ==================== Actions ====================

  // ... 现有 actions ...

  // 分镜生成
  async function generateStoryboards(scriptId: string): Promise<Storyboard[] | null> {
    generating.value = true
    try {
      const response = await window.electronAPI.storyToVideo.generateStoryboards(
        scriptId,
        selectedProviderConfigId.value || undefined,
        selectedModelId.value || undefined
      )
      if (response.success && response.data) {
        storyboards.value = response.data
        return response.data
      }
      return null
    } finally {
      generating.value = false
    }
  }

  // 画面生成
  async function generateSceneImages(
    sceneId: string,
    styleName: string,
    onProgress?: (index: number, total: number) => void
  ): Promise<Storyboard[] | null> {
    // ... 实现细节
  }

  // 视频合成
  async function synthesizeSceneVideo(
    sceneId: string,
    onProgress?: (phase: string, progress: number) => void
  ): Promise<{ outputPath: string; duration: number } | null> {
    // ... 实现细节
  }

  return {
    // 状态
    projects, currentProject, episodes, currentEpisode,
    currentScript, scenes, currentScene, storyboards,
    characterBindings, loading, generating, error,

    // Actions
    // ... 所有 actions
  }
})
```

---

## 七、视频合成流程设计

### 7.1 合成流程图

```
用户点击"合成视频"
        │
        ▼
┌─────────────────────────────┐
│ 1. 检查素材完整性           │
│   - 所有分镜是否有画面      │
│   - 音频是否已生成          │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ 2. 准备素材                 │
│   - 收集图像文件路径        │
│   - 收集音频文件路径        │
│   - 创建临时目录            │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ 3. 计算时间轴               │
│   - 每个分镜的开始/结束时间 │
│   - 音频对齐时间点          │
│   - 转场时间                │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ 4. 生成FFmpeg命令           │
│   - 图像序列输入            │
│   - 音频混合                │
│   - 转场效果                │
│   - 输出格式                │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ 5. 执行FFmpeg               │
│   - 发送进度事件            │
│   - 监控执行状态            │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ 6. 后处理                   │
│   - 清理临时文件            │
│   - 生成缩略图              │
│   - 更新数据库状态          │
└─────────────────────────────┘
        │
        ▼
    返回输出路径
```

### 7.2 FFmpeg 命令模板

```bash
# 基础合成命令
ffmpeg -y \
  -framerate 30 \
  -i "image_%03d.png" \
  -i "audio_narration.wav" \
  -i "audio_dialogue_001.wav" \
  -i "audio_dialogue_002.wav" \
  -filter_complex "\
    [0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v]; \
    [1:a][2:a][3:a]concat=n=3:v=0:a=1[a]" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 192k \
  -t 60 \
  "output.mp4"

# 带转场的合成
ffmpeg -y \
  -loop 1 -t 3 -i "scene1.png" \
  -loop 1 -t 3 -i "scene2.png" \
  -filter_complex "\
    [0:v]fade=t=out:st=2.5:d=0.5[v0]; \
    [1:v]fade=t=in:st=0:d=0.5,fade=t=out:st=2.5:d=0.5[v1]; \
    [v0][v1]concat=n=2:v=1:a=0[outv]" \
  -map "[outv]" \
  -c:v libx264 \
  "output_with_transition.mp4"
```

### 7.3 素材目录结构

```
{dataPath}/video_projects/{projectId}/
├── episodes/
│   └── {episodeId}/
│       ├── script/
│       │   └── script.txt
│       ├── scenes/
│       │   └── {sceneId}/
│       │       ├── images/
│       │       │   ├── shot_001.png
│       │       │   ├── shot_002.png
│       │       │   └── ...
│       │       ├── audio/
│       │       │   ├── narration.wav
│       │       │   ├── dialogue_001.wav
│       │       │   └── ...
│       │       └── output/
│       │           └── scene_video.mp4
│       └── output/
│           └── episode_video.mp4
├── assets/
│   ├── images/
│   └── audio/
└── config.json
```

---

## 八、错误处理与边界情况

### 8.1 错误类型

| 错误类型 | 场景 | 处理方式 |
|----------|------|----------|
| AI生成失败 | 网络错误、API限制、内容过滤 | 提示用户重试，记录错误日志 |
| 图像生成失败 | API限制、参数错误 | 跳过当前分镜，继续生成其他 |
| 音频生成失败 | TTS服务不可用 | 提示用户检查语音配置 |
| 视频合成失败 | FFmpeg执行错误、磁盘空间不足 | 提示具体错误，提供重试选项 |
| 数据解析失败 | AI输出格式不正确 | 尝试重新解析，提示用户重新生成 |

### 8.2 边界情况处理

1. **空内容处理**：
   - 章节内容为空 → 提示用户
   - 场景无对白 → 生成纯画面镜头

2. **角色未绑定**：
   - 生成画面时使用通用描述
   - 对话音频使用默认声音

3. **素材缺失**：
   - 分镜无画面 → 显示占位图
   - 音频未生成 → 静音处理

4. **长时间处理**：
   - 批量生成时显示进度条
   - 支持取消操作

---

## 九、性能优化

### 9.1 前端优化

1. **虚拟列表**：分镜列表使用虚拟滚动
2. **懒加载**：图像预览按需加载
3. **防抖节流**：输入操作防抖处理
4. **状态缓存**：已加载数据不重复请求

### 9.2 后端优化

1. **并发控制**：图像生成队列控制并发数
2. **缓存机制**：AI响应缓存，避免重复生成
3. **增量保存**：生成过程中增量保存数据
4. **资源清理**：定期清理临时文件

---

## 十、数据库规范化迁移方案

### 10.1 问题分析

当前数据库设计存在以下违反第三范式的问题：

| 表名 | 问题字段 | 问题描述 | 违反原则 |
|------|----------|----------|----------|
| episode_scripts | scenes | JSON存储场景列表，与scene_scripts表冗余 | 数据冗余 |
| episode_scripts | character_appearances | JSON存储角色ID列表，可通过查询获取 | 数据冗余 |
| video_episodes | audio_tracks | JSON存储音轨列表，已有audio_tracks表 | 非原子性 |
| scene_scripts | characters | JSON存储角色信息，已有scene_characters表 | 非原子性 |
| scene_scripts | dialogues | JSON存储对话列表，已有scene_dialogues表 | 非原子性 |
| scene_scripts | actions | JSON存储动作列表，已有scene_actions表 | 非原子性 |
| storyboards | characters | JSON存储角色信息，已有storyboard_characters表 | 非原子性 |
| storyboards | dialogue_ids | JSON存储对话ID引用，已有关联表 | 非原子性 |
| storyboards | action_ids | JSON存储动作ID引用，已有关联表 | 非原子性 |
| storyboards | frame_image | JSON存储完整图像资产，应使用外键 | 非原子性 |
| storyboards | transition | JSON存储转场配置，应拆分为独立字段 | 非原子性 |
| character_bindings | generate_config | JSON存储生成配置 | 非原子性 |
| character_bindings | voice_config | JSON存储声音配置 | 非原子性 |

### 10.2 迁移策略

**原则**：渐进式迁移，确保数据安全

1. 先添加新字段/新表
2. 迁移数据到新结构
3. 更新代码使用新结构
4. 确认无误后移除旧字段

### 10.3 迁移步骤

#### 步骤1：storyboards 表重构

```sql
-- 添加新字段
ALTER TABLE storyboards ADD COLUMN transition_type TEXT DEFAULT 'cut';
ALTER TABLE storyboards ADD COLUMN transition_duration INTEGER DEFAULT 500;
ALTER TABLE storyboards ADD COLUMN transition_direction TEXT;
ALTER TABLE storyboards ADD COLUMN transition_easing TEXT DEFAULT 'ease_out';
ALTER TABLE storyboards ADD COLUMN transition_color TEXT;
ALTER TABLE storyboards ADD COLUMN frame_image_id TEXT REFERENCES image_assets(id) ON DELETE SET NULL;

-- 迁移 transition JSON 数据
-- 需要在代码中执行，读取JSON并更新到新字段

-- 移除旧字段（在确认迁移成功后）
-- ALTER TABLE storyboards DROP COLUMN transition;
-- ALTER TABLE storyboards DROP COLUMN frame_image;
-- ALTER TABLE storyboards DROP COLUMN characters;
-- ALTER TABLE storyboards DROP COLUMN dialogue_ids;
-- ALTER TABLE storyboards DROP COLUMN action_ids;
```

#### 步骤2：character_bindings 表重构

```sql
-- 添加新字段
ALTER TABLE character_bindings ADD COLUMN voice_id TEXT;
ALTER TABLE character_bindings ADD COLUMN voice_speed REAL DEFAULT 1.0;
ALTER TABLE character_bindings ADD COLUMN voice_pitch REAL DEFAULT 1.0;
ALTER TABLE character_bindings ADD COLUMN base_description TEXT;
ALTER TABLE character_bindings ADD COLUMN style_reference TEXT;
ALTER TABLE character_bindings ADD COLUMN additional_prompts TEXT;

-- 迁移数据（代码中执行）

-- 移除旧字段（确认后）
-- ALTER TABLE character_bindings DROP COLUMN generate_config;
-- ALTER TABLE character_bindings DROP COLUMN voice_config;
```

#### 步骤3：移除冗余JSON字段

```sql
-- episode_scripts 表
ALTER TABLE episode_scripts DROP COLUMN scenes;
ALTER TABLE episode_scripts DROP COLUMN character_appearances;

-- video_episodes 表
ALTER TABLE video_episodes DROP COLUMN audio_tracks;

-- scene_scripts 表（数据已迁移到子表）
ALTER TABLE scene_scripts DROP COLUMN characters;
ALTER TABLE scene_scripts DROP COLUMN dialogues;
ALTER TABLE scene_scripts DROP COLUMN actions;
```

### 10.4 迁移代码实现

```typescript
// src/main/database/index.ts

/**
 * 规范化数据库结构（符合第三范式）
 */
private normalizeDatabaseSchema(): void {
  if (!this.db) return

  // 检查是否已规范化
  const normalizedKey = 'database_normalized_v1'
  const normalized = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(normalizedKey)
  if (normalized) return

  console.log('[DatabaseManager] 开始规范化数据库结构...')

  try {
    // 1. 重构 storyboards 表
    this.normalizeStoryboardsTable()

    // 2. 重构 character_bindings 表
    this.normalizeCharacterBindingsTable()

    // 3. 移除冗余字段
    this.removeRedundantJsonFields()

    // 标记完成
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(normalizedKey, Date.now().toString())
    console.log('[DatabaseManager] 数据库结构规范化完成')
  } catch (error) {
    console.error('[DatabaseManager] 数据库规范化失败:', error)
    throw error
  }
}

/**
 * 规范化 storyboards 表
 */
private normalizeStoryboardsTable(): void {
  if (!this.db) return

  // 检查并添加新字段
  const columns = this.db.prepare("PRAGMA table_info(storyboards)").all() as { name: string }[]
  const columnNames = columns.map(c => c.name)

  if (!columnNames.includes('transition_type')) {
    this.db.exec('ALTER TABLE storyboards ADD COLUMN transition_type TEXT DEFAULT "cut"')
  }
  if (!columnNames.includes('transition_duration')) {
    this.db.exec('ALTER TABLE storyboards ADD COLUMN transition_duration INTEGER DEFAULT 500')
  }
  if (!columnNames.includes('transition_direction')) {
    this.db.exec('ALTER TABLE storyboards ADD COLUMN transition_direction TEXT')
  }
  if (!columnNames.includes('transition_easing')) {
    this.db.exec('ALTER TABLE storyboards ADD COLUMN transition_easing TEXT DEFAULT "ease_out"')
  }
  if (!columnNames.includes('transition_color')) {
    this.db.exec('ALTER TABLE storyboards ADD COLUMN transition_color TEXT')
  }
  if (!columnNames.includes('frame_image_id')) {
    this.db.exec('ALTER TABLE storyboards ADD COLUMN frame_image_id TEXT REFERENCES image_assets(id) ON DELETE SET NULL')
  }

  // 迁移现有数据
  const storyboards = this.db.prepare('SELECT id, transition, frame_image FROM storyboards').all() as any[]

  for (const sb of storyboards) {
    // 迁移 transition
    if (sb.transition) {
      try {
        const transition = JSON.parse(sb.transition)
        this.db.prepare(`
          UPDATE storyboards
          SET transition_type = ?, transition_duration = ?, transition_direction = ?, transition_easing = ?, transition_color = ?
          WHERE id = ?
        `).run(
          transition.type || 'cut',
          transition.duration || 500,
          transition.direction || null,
          transition.easing || 'ease_out',
          transition.color || null,
          sb.id
        )
      } catch (e) {
        console.warn('[DatabaseManager] 迁移 transition 失败:', sb.id, e)
      }
    }

    // 迁移 frame_image（暂时保留JSON，后续处理）
    // frame_image_id 需要关联到 image_assets 表
  }
}

/**
 * 规范化 character_bindings 表
 */
private normalizeCharacterBindingsTable(): void {
  if (!this.db) return

  const columns = this.db.prepare("PRAGMA table_info(character_bindings)").all() as { name: string }[]
  const columnNames = columns.map(c => c.name)

  // 添加新字段
  if (!columnNames.includes('voice_id')) {
    this.db.exec('ALTER TABLE character_bindings ADD COLUMN voice_id TEXT')
  }
  if (!columnNames.includes('voice_speed')) {
    this.db.exec('ALTER TABLE character_bindings ADD COLUMN voice_speed REAL DEFAULT 1.0')
  }
  if (!columnNames.includes('voice_pitch')) {
    this.db.exec('ALTER TABLE character_bindings ADD COLUMN voice_pitch REAL DEFAULT 1.0')
  }
  if (!columnNames.includes('base_description')) {
    this.db.exec('ALTER TABLE character_bindings ADD COLUMN base_description TEXT')
  }
  if (!columnNames.includes('style_reference')) {
    this.db.exec('ALTER TABLE character_bindings ADD COLUMN style_reference TEXT')
  }
  if (!columnNames.includes('additional_prompts')) {
    this.db.exec('ALTER TABLE character_bindings ADD COLUMN additional_prompts TEXT')
  }

  // 迁移数据
  const bindings = this.db.prepare('SELECT id, voice_config, generate_config FROM character_bindings').all() as any[]

  for (const binding of bindings) {
    if (binding.voice_config) {
      try {
        const voiceConfig = JSON.parse(binding.voice_config)
        this.db.prepare(`
          UPDATE character_bindings
          SET voice_id = ?, voice_speed = ?, voice_pitch = ?
          WHERE id = ?
        `).run(
          voiceConfig.voiceId || null,
          voiceConfig.speed || 1.0,
          voiceConfig.pitch || 1.0,
          binding.id
        )
      } catch (e) {
        console.warn('[DatabaseManager] 迁移 voice_config 失败:', binding.id, e)
      }
    }

    if (binding.generate_config) {
      try {
        const genConfig = JSON.parse(binding.generate_config)
        this.db.prepare(`
          UPDATE character_bindings
          SET base_description = ?, style_reference = ?, additional_prompts = ?
          WHERE id = ?
        `).run(
          genConfig.baseDescription || null,
          genConfig.styleReference || null,
          genConfig.additionalPrompts || null,
          binding.id
        )
      } catch (e) {
        console.warn('[DatabaseManager] 迁移 generate_config 失败:', binding.id, e)
      }
    }
  }
}
```

### 10.5 规范化后的表结构

#### storyboards 表（规范化后）

```sql
CREATE TABLE storyboards (
  id TEXT PRIMARY KEY,
  scene_script_id TEXT NOT NULL,
  shot_number INTEGER NOT NULL,
  shot_type TEXT NOT NULL DEFAULT 'medium',
  camera_angle TEXT NOT NULL DEFAULT 'eye_level',
  camera_movement TEXT NOT NULL DEFAULT 'static',
  movement_duration REAL,
  frame_description TEXT NOT NULL,
  subject TEXT,
  composition TEXT,
  duration REAL NOT NULL DEFAULT 3,
  -- 转场配置（拆分为独立字段）
  transition_type TEXT NOT NULL DEFAULT 'cut',
  transition_duration INTEGER NOT NULL DEFAULT 500,
  transition_direction TEXT,
  transition_easing TEXT DEFAULT 'ease_out',
  transition_color TEXT,
  -- 外键关联
  frame_image_id TEXT REFERENCES image_assets(id) ON DELETE SET NULL,
  narration_audio_id TEXT REFERENCES audio_assets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (scene_script_id) REFERENCES scene_scripts(id) ON DELETE CASCADE
);
```

#### character_bindings 表（规范化后）

```sql
CREATE TABLE character_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  long_writing_character_id TEXT NOT NULL,
  portrait_id TEXT REFERENCES portrait_characters(id) ON DELETE SET NULL,
  -- 声音配置（拆分为独立字段）
  voice_id TEXT,
  voice_speed REAL DEFAULT 1.0,
  voice_pitch REAL DEFAULT 1.0,
  -- 生成配置（拆分为独立字段）
  base_description TEXT,
  style_reference TEXT,
  additional_prompts TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
);
```

---

## 十一、开发计划

### 11.1 阶段划分

| 阶段 | 内容 | 预计工作量 | 优先级 |
|------|------|------------|--------|
| 阶段0 | 数据库规范化迁移 | 0.5天 | P0 |
| 阶段3 | 分镜设计与生成 | 2-3天 | P0 |
| 阶段4 | 素材生成 | 1-2天 | P1 |
| 阶段5 | 视频合成 | 2-3天 | P1 |

### 11.2 开发顺序

0. **数据库规范化（优先）**
   - [ ] 实现 normalizeDatabaseSchema 迁移方法
   - [ ] 拆分 storyboards.transition 为独立字段
   - [ ] 拆分 character_bindings.voice_config 为独立字段
   - [ ] 更新 Repository 层适配新字段
   - [ ] 测试迁移流程

1. **分镜生成**
   - [ ] 编写分镜生成提示词
   - [ ] 实现 StoryToVideoAIService.generateStoryboards
   - [ ] 添加 IPC 处理器
   - [ ] 实现分镜列表显示
   - [ ] 实现分镜编辑对话框

2. **素材生成**
   - [ ] 完善图像生成进度回调
   - [ ] 实现音频生成流程
   - [ ] 添加素材管理界面

3. **视频合成**
   - [ ] 实现 VideoSynthesisService
   - [ ] 添加 FFmpeg 依赖
   - [ ] 实现合成进度回调
   - [ ] 实现视频预览播放器
   - [ ] 实现导出功能

---

## 十二、测试要点

### 12.1 单元测试

- [ ] 剧本解析函数测试
- [ ] 分镜解析函数测试
- [ ] Prompt 构建函数测试
- [ ] FFmpeg 命令生成测试

### 12.2 集成测试

- [ ] 完整剧本生成流程
- [ ] 分镜生成流程
- [ ] 画面生成流程
- [ ] 视频合成流程

### 12.3 边界测试

- [ ] 超长章节处理
- [ ] 大量角色处理
- [ ] 网络异常处理
- [ ] 磁盘空间不足处理