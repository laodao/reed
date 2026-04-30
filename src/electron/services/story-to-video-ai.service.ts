/**
 * 剧集制作 AI 服务
 * @module services/story-to-video-ai.service
 * @description 处理剧集制作模块的 AI 生成功能
 */

import { BrowserWindow } from 'electron'
import { getDatabaseManager } from '../database'
import { createProvider } from '@core/providers'
import { PROVIDER_TEMPLATES } from '@core/services/provider-template.service'
import { SecureStorageService } from './secure-storage.service'
import type { ProviderTemplate, UserProviderConfig, ChatContext } from '@shared/types'
import type {
  SceneScript,
  Storyboard,
  Dialogue,
  ActionDescription,
  SceneCharacter,
  ShotType,
  CameraAngle,
  CameraMovement,
  TransitionConfig,
  StoryboardCharacter,
  FullScriptGenerationResult,
  GeneratedScene,
  UploadedCharacter,
  UploadedLocation,
  UploadedItem
} from '@shared/types/story-to-video.types'

/**
 * 生成任务类型
 */
export type StoryToVideoTask =
  | 'script'       // 剧本生成
  | 'scenes'       // 场景拆分
  | 'storyboard'   // 分镜生成

/**
 * 剧本生成结果
 */
export interface ScriptGenerationResult {
  synopsis: string
  scenes: SceneGenerationResult[]
}

/**
 * 场景生成结果
 */
export interface SceneGenerationResult {
  sceneNumber: number
  location: string
  locationType: 'interior' | 'exterior' | 'mixed'
  timeOfDay: string
  weather?: string
  sceneDescription: string
  mood: string
  lighting?: string
  characters: SceneCharacter[]
  originalText: string
  narration: string
  dialogues: Dialogue[]
  actions: ActionDescription[]
}

/**
 * 分镜生成结果
 */
export interface StoryboardGenerationResult {
  storyboards: StoryboardResult[]
}

/**
 * 分镜结果
 */
export interface StoryboardResult {
  shotNumber: number
  shotType: ShotType
  cameraAngle: CameraAngle
  cameraMovement: CameraMovement
  movementDuration?: number
  frameDescription: string
  subject?: string
  composition?: string
  duration: number
  transition: TransitionConfig
  narrationId?: string
  dialogueIds: string[]
  actionIds: string[]
  characters: StoryboardCharacter[]
}

/**
 * 流式生成事件
 */
export interface GenerationStreamEvent {
  type: 'start' | 'content' | 'done' | 'error'
  content?: string
  data?: any
  error?: string
}

// ==================== AI 提示词模板 ====================

/**
 * 剧本生成提示词（完整专业剧本格式）
 */
const SCRIPT_GENERATION_PROMPT = `你是一位拥有10年以上一线影视工业经验的职业编剧，精通三幕剧结构、人物弧光设计、视觉化叙事与标准剧本格式。请将以下小说章节内容转换为专业的视频剧本。

## 输出要求

请输出三部分内容，每部分使用特定分隔符标记：

### 第一部分：章节梗概
使用 ===SYNOPSIS=== 作为开始标记，===SYNOPSIS_END=== 作为结束标记。
内容为 50-100 字的章节梗概。

### 第二部分：完整剧本正文
使用 ===SCRIPT=== 作为开始标记，===SCRIPT_END=== 作为结束标记。
输出标准剧本格式的完整正文，严格遵循以下格式规范：

**场景标题格式**：
INT./EXT. 地点 - 时间（全大写，左对齐，独占一行）
示例：
INT. 办公室 - 日
EXT. 城市街道 - 夜

**动作描写格式**：
现在时态，仅写摄影机可拍、录音设备可录的内容。每段不超过4行。
示例：
阳光透过落地窗洒进来。李明坐在电脑前，眉头紧锁。

**角色对白格式**：
角色名单独一行，全大写，居中（使用空格居中）。
对白在角色名下方，居中排版。
括号提示仅用于必要表演指示，置于角色名与对白之间。
示例：
                    李明
          （自言自语）
    这个方案还是不对...

**转场标记**：
CUT TO: / FADE OUT. 等转场标记右对齐。

### 第三部分：结构化场景数据
使用 ===SCENES_JSON=== 作为开始标记，===SCENES_JSON_END=== 作为结束标记。
输出 JSON 格式的结构化场景数据，用于系统处理。

## 剧本格式要求

1. 严禁使用 Markdown 格式（如加粗、斜体、列表、代码块）
2. 仅使用纯文本标准剧本缩进与换行
3. 严格遵循"展示而非告知"原则，对白精炼且富含潜台词
4. 节奏精准符合影视工业要求

## 场景拆分原则

1. 地点变化应拆分为新场景
2. 时间跳跃应拆分为新场景
3. 主要角色组合变化可考虑拆分
4. 情感氛围显著变化可拆分
5. 每个场景应有明确的视觉焦点

## JSON 场景数据格式

在 ===SCENES_JSON=== 和 ===SCENES_JSON_END=== 之间输出：

{
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "地点名称",
      "locationType": "interior",
      "timeOfDay": "morning",
      "weather": "sunny",
      "sceneDescription": "详细场景描述，必须包含以下要素：1.空间布局（房间形状、大小、出入口方位）2.主要陈设（家具位置、装饰物品）3.环境细节（材质、色调、风格）4.关键视觉元素（窗户、灯光、特色物品的位置）。例如：'一间约30平米的办公室，长方形布局。入口在南墙左侧，靠北墙是一排落地窗。中央放置一张深棕色实木办公桌，桌上有电脑、台灯和文件堆。东侧墙边有一套黑色皮质沙发和茶几。整体色调偏冷，墙面是浅灰色，地毯深蓝色。天花板上有一盏吸顶灯，目前关闭，只有桌上的台灯亮着。'",
      "mood": "氛围",
      "lighting": "光线描述（光源位置、明暗分布、色温）",
      "characters": [
        {
          "characterId": "使用提供的角色ID",
          "characterName": "角色名称",
          "position": "center",
          "expression": "表情",
          "action": "动作",
          "outfit": "服装描述",
          "props": ["道具"]
        }
      ],
      "originalText": "原文片段",
      "narration": "旁白文本",
      "dialogues": [
        {
          "id": "dlg_1",
          "characterId": "角色ID",
          "characterName": "角色名称",
          "text": "对话内容",
          "emotion": "情感",
          "volume": "normal",
          "pace": "normal",
          "pause": 0
        }
      ],
      "actions": [
        {
          "id": "act_1",
          "characterId": "角色ID",
          "description": "动作描述",
          "timing": "before",
          "duration": 2
        }
      ]
    }
  ]
}

## 可用角色列表

{characters}

## 章节内容

{chapterContent}

## 输出示例

===SYNOPSIS===
李明在公司加班时发现项目方案存在重大漏洞，他陷入纠结是否要上报。

===SYNOPSIS_END===

===SCRIPT===
INT. 办公室 - 夜

办公室里只有几盏台灯亮着。李明独自坐在电脑前，屏幕上的数据报表闪烁着异常的红光。

                    李明
          （揉着眼睛）
    这个数据不对...

他打开另一份文件，对比着两边的数字。眉头越皱越紧。

                    李明
          （拿起电话，又放下）
    算了...明天再说吧。

                                              CUT TO:

INT. 走廊 - 夜

李明走出办公室，走廊里空无一人。他的脚步声在寂静的空间里回响。

                    李明
          （自言自语）
    如果现在不说，后果会更严重...

他停下脚步，转身看向办公室的方向。

                                              CUT TO:

===SCRIPT_END===

===SCENES_JSON===
{
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "办公室",
      "locationType": "interior",
      "timeOfDay": "night",
      "sceneDescription": "办公室里只有几盏台灯亮着，李明独自坐在电脑前",
      "mood": "紧张",
      "lighting": "昏暗台灯光",
      "characters": [
        {
          "characterId": "char_1",
          "characterName": "李明",
          "expression": "疲惫",
          "action": "揉眼睛"
        }
      ],
      "narration": "",
      "dialogues": [
        {
          "id": "dlg_1",
          "characterId": "char_1",
          "characterName": "李明",
          "text": "这个数据不对...",
          "emotion": "困惑"
        },
        {
          "id": "dlg_2",
          "characterId": "char_1",
          "characterName": "李明",
          "text": "算了...明天再说吧。",
          "emotion": "犹豫"
        }
      ],
      "actions": [
        {
          "id": "act_1",
          "description": "打开另一份文件对比",
          "timing": "before"
        }
      ]
    },
    {
      "sceneNumber": 2,
      "location": "走廊",
      "locationType": "interior",
      "timeOfDay": "night",
      "sceneDescription": "走廊里空无一人，李明的脚步声回响",
      "mood": "孤独",
      "characters": [
        {
          "characterId": "char_1",
          "characterName": "李明",
          "expression": "纠结",
          "action": "停下脚步转身"
        }
      ],
      "dialogues": [
        {
          "id": "dlg_3",
          "characterId": "char_1",
          "characterName": "李明",
          "text": "如果现在不说，后果会更严重...",
          "emotion": "下定决心"
        }
      ]
    }
  ]
}
===SCENES_JSON_END===`

/**
 * 角色识别提示词（从上传的长文中识别角色）
 */
const CHARACTER_IDENTIFICATION_PROMPT = `你是一位专业的文学分析师和剧本编剧，擅长从文本中识别和分析角色。请从以下文本中识别出所有重要的角色。

## 输出要求

请输出 JSON 格式的角色列表，严格遵循以下格式：

{
  "characters": [
    {
      "name": "角色名称",
      "description": "角色的简要描述，包括外貌、性格特点、身份等",
      "role": "角色定位，可选值：protagonist（主角）、supporting（配角）、antagonist（反派）、minor（次要角色）"
    }
  ]
}

## 识别原则

1. **主角识别**：故事的核心人物，推动主要情节发展，出场频率最高
2. **配角识别**：与主角有重要互动，对情节有显著影响但非核心
3. **反派识别**：与主角对立的角色，制造冲突或障碍
4. **次要角色识别**：短暂出场但有名字或特定身份的角色
5. **忽略**：无名无姓的路人、群体描述（如"村民们"）不计入

## 分析文本

{textContent}

## 输出

请直接输出 JSON 格式的结果，不要添加任何额外的文字说明。`

/**
 * 地点识别提示词
 */
const LOCATION_IDENTIFICATION_PROMPT = `你是一位专业的文学分析师和剧本编剧，擅长从文本中识别和分析场景地点。请从以下文本中识别出所有重要的地点。

## 输出要求

请输出 JSON 格式的地点列表，严格遵循以下格式：

{
  "locations": [
    {
      "name": "地点名称",
      "description": "地点的简要描述，包括环境特征、氛围、主要元素等",
      "type": "地点类型，可选值：city（城市）、village（村庄）、mountain（山脉）、palace（宫殿）、forest（森林）、sea（海域）、building（建筑）、other（其他）"
    }
  ]
}

## 识别原则

1. **主要地点**：故事发生的主要场景，多次出现或重要事件发生地
2. **次要地点**：短暂出现但有名称或特征的地点
3. **忽略**：模糊的空间描述（如"远方"、"某处"）不计入
4. **合并**：同一地点的不同描述应合并为一个条目

## 分析文本

{textContent}

## 输出

请直接输出 JSON 格式的结果，不要添加任何额外的文字说明。`

/**
 * 物品识别提示词
 */
const ITEM_IDENTIFICATION_PROMPT = `你是一位专业的文学分析师和剧本编剧，擅长从文本中识别和分析关键物品。请从以下文本中识别出所有重要的物品。

## 输出要求

请输出 JSON 格式的物品列表，严格遵循以下格式：

{
  "items": [
    {
      "name": "物品名称",
      "description": "物品的简要描述，包括外观、功能、重要性等",
      "type": "物品类型，可选值：weapon（武器）、artifact（神器）、medicine（丹药）、manual（秘籍）、token（信物）、other（其他）"
    }
  ]
}

## 识别原则

1. **关键物品**：推动情节发展、具有特殊意义或主角使用的物品
2. **次要物品**：有名称或特殊描述的物品
3. **忽略**：普通日常用品、无特殊意义的物品不计入
4. **合并**：同一物品的不同描述应合并为一个条目

## 分析文本

{textContent}

## 输出

请直接输出 JSON 格式的结果，不要添加任何额外的文字说明。`

/**
 * 场景拆分提示词
 */
const SCENE_SPLIT_PROMPT = `你是一个专业的视频脚本分析师。请将以下小说章节内容拆分为多个场景。

## 拆分原则

1. 地点变化应拆分为新场景
2. 时间跳跃应拆分为新场景
3. 主要角色组合变化应考虑拆分
4. 情感氛围显著变化可拆分
5. 每个场景应有明确的视觉焦点

## 输出格式（必须严格遵循）

\`\`\`json
{
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "地点名称",
      "locationType": "exterior",
      "timeOfDay": "morning",
      "weather": "sunny",
      "sceneDescription": "详细场景描述，包含：空间布局（形状、大小、出入口方位）、主要陈设（家具位置、装饰）、环境细节（材质、色调）、关键视觉元素（窗户、灯光位置）",
      "mood": "氛围",
      "lighting": "光线描述（光源位置、明暗分布）",
      "characters": ["角色名1", "角色名2"],
      "keyEvents": ["事件描述"],
      "originalText": "原文片段",
      "narration": "旁白文本",
      "dialogues": [
        {"character": "角色名", "text": "对话内容", "emotion": "情感"}
      ]
    }
  ]
}
\`\`\`

## 章节内容

{chapterContent}`

/**
 * 分镜生成提示词（批量生成模式）
 */
const STORYBOARD_GENERATION_PROMPT = `你是一个专业的影视导演和分镜师。请根据以下场景剧本设计分镜。

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
- pan_left: 左摇
- pan_right: 右摇
- tilt_up: 上仰
- tilt_down: 下俯
- dolly_in: 推镜头
- dolly_out: 拉镜头
- zoom_in: 变焦推进
- zoom_out: 变焦拉远
- crane_up: 升镜头
- crane_down: 降镜头
- tracking_left: 左移
- tracking_right: 右移
- handheld: 手持晃动
- steadicam: 稳定器跟随

### 镜头角度（cameraAngle）
- eye_level: 平视 - 客观中立
- high: 俯拍 - 显渺小或弱势
- low: 仰拍 - 显高大或强势
- dutch: 荷兰角 - 不安或混乱
- birds_eye: 鸟瞰 - 全局视角
- worms_eye: 虫视 - 极度仰拍

### 转场类型（transition.type）
- cut: 硬切
- fade: 淡入淡出
- dissolve: 叠化
- wipe: 划像
- slide: 滑动
- zoom: 缩放转场
- iris: 圈入圈出
- whip: 甩镜头转场

## 分镜设计原则

1. **开场**：通常用远景或全景建立场景
2. **对话**：常用中景或近景，交替使用正反打
3. **情感**：近景或特写强调情感
4. **动作**：全景或中景展示动作
5. **转场**：考虑前后分镜的衔接
6. **节奏**：快节奏用短镜头，慢节奏用长镜头

## 输出格式（必须严格遵循）

\`\`\`json
{
  "storyboards": [
    {
      "shotNumber": 1,
      "shotType": "long",
      "cameraAngle": "eye_level",
      "cameraMovement": "static",
      "frameDescription": "画面详细描述",
      "subject": "画面主体",
      "composition": "构图说明",
      "duration": 5,
      "transition": {
        "type": "fade",
        "duration": 500,
        "easing": "ease_out"
      },
      "narrationId": "旁白ID（如有）",
      "dialogueIds": ["dlg_1"],
      "actionIds": ["act_1"],
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

{sceneScript}`

/**
 * 单个分镜生成提示词（逐个生成模式）
 */
const SINGLE_STORYBOARD_GENERATION_PROMPT = `你是一个专业的影视导演和分镜师。请为以下场景设计第 {shotNumber} 个分镜。

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
- pan_left: 左摇
- pan_right: 右摇
- tilt_up: 上仰
- tilt_down: 下俯
- dolly_in: 推镜头
- dolly_out: 拉镜头
- zoom_in: 变焦推进
- zoom_out: 变焦拉远
- crane_up: 升镜头
- crane_down: 降镜头
- tracking_left: 左移
- tracking_right: 右移
- handheld: 手持晃动
- steadicam: 稳定器跟随

### 镜头角度（cameraAngle）
- eye_level: 平视 - 客观中立
- high: 俯拍 - 显渺小或弱势
- low: 仰拍 - 显高大或强势
- dutch: 荷兰角 - 不安或混乱
- birds_eye: 鸟瞰 - 全局视角
- worms_eye: 虫视 - 极度仰拍

### 转场类型（transition.type）
- cut: 硬切
- fade: 淡入淡出
- dissolve: 叠化
- wipe: 划像
- slide: 滑动
- zoom: 缩放转场
- iris: 圈入圈出
- whip: 甩镜头转场

## 分镜设计原则

1. **开场镜头（shotNumber=1）**：用远景或全景建立场景，展示环境和空间关系
2. **对话镜头**：常用中景或近景，交替使用正反打
3. **情感镜头**：近景或特写强调情感变化
4. **动作镜头**：全景或中景展示动作细节
5. **转场设计**：考虑与前后分镜的衔接
6. **节奏控制**：快节奏用短镜头（2-3秒），慢节奏用长镜头（5-8秒）

## 上下文信息

{contextInfo}

## 场景剧本

{sceneScript}

## 任务要求

请设计第 {shotNumber} 个分镜，输出单个分镜的JSON格式：

\`\`\`json
{
  "shotNumber": {shotNumber},
  "shotType": "选择合适的景别",
  "cameraAngle": "选择合适的镜头角度",
  "cameraMovement": "选择合适的镜头运动",
  "movementDuration": "镜头运动持续时间（毫秒，如推镜头需要3000）",
  "frameDescription": "详细的画面描述，包括场景元素、人物位置、表情动作、光影效果",
  "subject": "画面主要焦点/主体",
  "composition": "构图方式，如三分构图、中心构图、对称构图等",
  "duration": "镜头持续时间（秒）",
  "transition": {
    "type": "转场类型",
    "duration": 500,
    "easing": "ease_out"
  },
  "narrationId": "如需旁白，填写旁白ID",
  "dialogueIds": ["如需对话，填写对话ID列表"],
  "actionIds": ["如需动作，填写动作ID列表"],
  "characters": [
    {
      "characterId": "角色ID",
      "position": { "x": 50, "y": 50, "scale": 1 },
      "expression": "表情描述",
      "action": "动作描述",
      "facing": "front/left/right/back"
    }
  ]
}
\`\`\`

**注意**：
- 根据镜头编号和场景内容选择合适的镜头类型
- frameDescription 必须足够详细，包含画面所有关键元素
- 如果场景有对话或旁白，需要在 dialogueIds 或 narrationId 中关联对应的ID`

/**
 * 剧集制作 AI 服务
 */
export class StoryToVideoAIService {
  private static instance: StoryToVideoAIService

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): StoryToVideoAIService {
    if (!StoryToVideoAIService.instance) {
      StoryToVideoAIService.instance = new StoryToVideoAIService()
    }
    return StoryToVideoAIService.instance
  }

  /**
   * 获取提供商配置
   */
  private async getProviderConfig(providerConfigId?: string): Promise<{
    config: UserProviderConfig
    template: ProviderTemplate
    apiKey: string
  } | null> {
    const dbManager = getDatabaseManager()
    if (!dbManager.providerConfigs) {
      return null
    }

    let config: UserProviderConfig | null = null

    // 如果指定了提供商配置 ID，优先使用
    if (providerConfigId) {
      config = await dbManager.providerConfigs.getById(providerConfigId)
    }

    // 如果没有指定或找不到，尝试获取默认提供商
    if (!config) {
      config = await dbManager.providerConfigs.getDefault()
    }

    // 如果没有默认，获取第一个启用的
    if (!config) {
      const enabledConfigs = await dbManager.providerConfigs.getEnabled()
      if (enabledConfigs.length > 0) {
        config = enabledConfigs[0]
      }
    }

    if (!config || !config.apiKey) {
      return null
    }

    // 获取模板
    const template = PROVIDER_TEMPLATES.find(t => t.id === config!.templateId)
    if (!template) {
      return null
    }

    // 解密 API 密钥
    const secureStorage = SecureStorageService.getInstance()
    if (!secureStorage.isInitialized()) {
      await secureStorage.initialize()
    }
    const apiKey = secureStorage.decrypt(config.apiKey)

    return { config, template, apiKey }
  }

  /**
   * 调用 AI 生成
   */
  private async callAI(
    prompt: string,
    systemPrompt: string,
    maxTokens: number = 8192,
    providerConfigId?: string,
    modelId?: string
  ): Promise<string> {
    const providerInfo = await this.getProviderConfig(providerConfigId)
    if (!providerInfo) {
      throw new Error('未配置 AI 提供商，请先在设置中添加提供商配置')
    }

    const { config, template, apiKey } = providerInfo

    // 确定使用的模型
    const effectiveModelId = modelId || config.defaultModel

    // 创建 Provider 实例
    const provider = createProvider(
      template.id,
      {
        apiKey,
        baseUrl: config.baseUrl,
        defaultModel: effectiveModelId
      },
      template,
      config
    )

    // 构建消息上下文
    const context: ChatContext = {
      systemPrompt: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    }

    // 调用 AI（非流式）
    const result = await provider.chatSync(context, { maxTokens })

    console.log('[StoryToVideoAI] AI 调用完成, maxTokens:', maxTokens)

    if (!result.success) {
      throw new Error(result.error || 'AI 调用失败')
    }

    return result.content || ''
  }

  /**
   * 从 AI 响应中提取 JSON
   */
  private extractJsonFromResponse(response: string): any {
    console.log('[StoryToVideoAI] AI 响应长度:', response.length)
    console.log('[StoryToVideoAI] AI 响应前500字符:', response.substring(0, 500))

    // 清理响应内容
    let cleanedResponse = response.trim()

    // 尝试提取 ```json ... ``` 中的内容
    const jsonMatch = cleanedResponse.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      try {
        return this.parseJsonString(jsonMatch[1].trim())
      } catch (e) {
        console.warn('[StoryToVideoAI] 解析 ```json``` 块失败:', e)
      }
    }

    // 尝试提取 ``` ... ``` 中的内容
    const codeMatch = cleanedResponse.match(/```\s*([\s\S]*?)\s*```/)
    if (codeMatch) {
      try {
        return this.parseJsonString(codeMatch[1].trim())
      } catch (e) {
        console.warn('[StoryToVideoAI] 解析 ``` 块失败:', e)
      }
    }

    // 尝试直接解析整个响应
    try {
      return this.parseJsonString(cleanedResponse)
    } catch (e) {
      // 尝试找到第一个 { 和最后一个 }
      const start = cleanedResponse.indexOf('{')
      const end = cleanedResponse.lastIndexOf('}')
      if (start !== -1 && end !== -1 && end > start) {
        try {
          const jsonStr = cleanedResponse.substring(start, end + 1)
          console.log('[StoryToVideoAI] 尝试解析提取的 JSON，长度:', jsonStr.length)
          return this.parseJsonString(jsonStr)
        } catch (e2) {
          console.error('[StoryToVideoAI] 解析提取的 JSON 失败:', e2)
          console.error('[StoryToVideoAI] 提取的 JSON 前1000字符:', cleanedResponse.substring(start, Math.min(start + 1000, end + 1)))
        }
      }

      // 输出更详细的错误信息
      console.error('[StoryToVideoAI] 无法解析 AI 响应为 JSON 格式')
      console.error('[StoryToVideoAI] 响应内容（前2000字符）:', cleanedResponse.substring(0, 2000))
      throw new Error('无法解析 AI 响应为 JSON 格式，请检查 AI 模型是否支持 JSON 输出')
    }
  }

  /**
   * 解析 JSON 字符串，处理常见格式问题
   */
  private parseJsonString(jsonStr: string): any {
    // 移除可能存在的注释（JSON 不支持注释，但有些 AI 会添加）
    let cleaned = jsonStr
      // 移除单行注释
      .replace(/\/\/.*$/gm, '')
      // 移除多行注释
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // 移除尾随逗号（JSON 不支持）
      .replace(/,(\s*[}\]])/g, '$1')
      // 修复可能被转义的引号问题
      .replace(/\\'/g, "'")
      // 将中文引号转换为标准双引号（AI 经常在内容中使用中文引号）
      .replace(/"/g, '"')
      .replace(/"/g, '"')

    return JSON.parse(cleaned)
  }

  /**
   * 从完整剧本响应中提取三部分内容
   */
  private extractFullScriptFromResponse(response: string): FullScriptGenerationResult {
    console.log('[StoryToVideoAI] 解析完整剧本响应，长度:', response.length)

    let synopsis = ''
    let scriptContent = ''
    let scenes: GeneratedScene[] = []

    // 提取梗概
    const synopsisMatch = response.match(/===SYNOPSIS===\s*([\s\S]*?)\s*===SYNOPSIS_END===/)
    if (synopsisMatch) {
      synopsis = synopsisMatch[1].trim()
      console.log('[StoryToVideoAI] 提取到梗概，长度:', synopsis.length)
    }

    // 提取剧本正文
    const scriptMatch = response.match(/===SCRIPT===\s*([\s\S]*?)\s*===SCRIPT_END===/)
    if (scriptMatch) {
      scriptContent = scriptMatch[1].trim()
      console.log('[StoryToVideoAI] 提取到剧本正文，长度:', scriptContent.length)
    }

    // 提取 JSON 场景数据
    const scenesMatch = response.match(/===SCENES_JSON===\s*([\s\S]*?)\s*===SCENES_JSON_END===/)
    if (scenesMatch) {
      try {
        const scenesData = this.parseJsonString(scenesMatch[1].trim())
        if (scenesData.scenes && Array.isArray(scenesData.scenes)) {
          scenes = this.convertSceneDataToGeneratedScenes(scenesData.scenes)
          console.log('[StoryToVideoAI] 提取到场景数据，场景数:', scenes.length)
        }
      } catch (e) {
        console.error('[StoryToVideoAI] 解析场景 JSON 失败:', e)
        // 尝试备用解析方法
        const jsonMatch = response.match(/===SCENES_JSON===\s*```json\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          try {
            const scenesData = this.parseJsonString(jsonMatch[1].trim())
            if (scenesData.scenes && Array.isArray(scenesData.scenes)) {
              scenes = this.convertSceneDataToGeneratedScenes(scenesData.scenes)
            }
          } catch (e2) {
            console.error('[StoryToVideoAI] 备用解析方法也失败:', e2)
          }
        }
      }
    }

    // 验证必需字段
    if (!synopsis) {
      console.warn('[StoryToVideoAI] 未找到梗概，尝试从 JSON 提取')
      // 尝试从 JSON 中提取
      const fallbackMatch = response.match(/===SCENES_JSON===\s*([\s\S]*?)\s*===SCENES_JSON_END===/)
      if (fallbackMatch) {
        try {
          const data = this.parseJsonString(fallbackMatch[1].trim())
          if (data.synopsis) {
            synopsis = data.synopsis
          }
        } catch (e) {
          // 忽略
        }
      }
    }

    if (!scriptContent) {
      console.warn('[StoryToVideoAI] 未找到剧本正文')
    }

    if (scenes.length === 0) {
      console.warn('[StoryToVideoAI] 未找到场景数据')
    }

    return {
      synopsis,
      scriptContent,
      scenes
    }
  }

  /**
   * 将 AI 返回的场景数据转换为 GeneratedScene 格式
   */
  private convertSceneDataToGeneratedScenes(sceneData: any[]): GeneratedScene[] {
    return sceneData.map((scene, index) => {
      const generatedScene: GeneratedScene = {
        sceneNumber: scene.sceneNumber || index + 1,
        location: scene.location || '未知地点',
        locationType: scene.locationType || 'interior',
        timeOfDay: scene.timeOfDay || 'morning',
        weather: scene.weather,
        sceneDescription: scene.sceneDescription || '',
        mood: scene.mood || '',
        lighting: scene.lighting,
        characters: (scene.characters || []).map((char: any) => ({
          characterId: char.characterId || '',
          characterName: char.characterName || '未知角色',
          portraitId: char.portraitId,
          position: char.position || 'center',
          expression: char.expression,
          action: char.action,
          outfit: char.outfit,
          props: char.props || []
        })),
        originalText: scene.originalText || '',
        narration: scene.narration || '',
        dialogues: (scene.dialogues || []).map((dlg: any, dlgIndex: number) => ({
          id: dlg.id || `dlg_${Date.now()}_${dlgIndex}`,
          characterId: dlg.characterId || '',
          characterName: dlg.characterName || '未知角色',
          text: dlg.text || '',
          emotion: dlg.emotion,
          volume: dlg.volume || 'normal',
          pace: dlg.pace || 'normal',
          pause: dlg.pause || 0
        })),
        actions: (scene.actions || []).map((act: any, actIndex: number) => ({
          id: act.id || `act_${Date.now()}_${actIndex}`,
          characterId: act.characterId,
          description: act.description || '',
          timing: act.timing || 'before',
          duration: act.duration
        }))
      }
      return generatedScene
    })
  }

  /**
   * 生成完整剧本（包含正文和结构化数据）
   */
  async generateFullScript(
    chapterContent: string,
    characters: Array<{ id: string; name: string; description?: string }>,
    providerConfigId?: string,
    modelId?: string
  ): Promise<FullScriptGenerationResult> {
    // 构建角色列表
    const characterList = characters.map(c =>
      `- ID: ${c.id}, 名称: ${c.name}${c.description ? `, 描述: ${c.description}` : ''}`
    ).join('\n')

    // 替换提示词中的变量
    const prompt = SCRIPT_GENERATION_PROMPT
      .replace('{characters}', characterList)
      .replace('{chapterContent}', chapterContent)

    const systemPrompt = '你是一位拥有10年以上一线影视工业经验的职业编剧。请严格按照要求的格式输出，不要添加任何额外的开场白或结束语。直接输出标记分隔的三部分内容。'

    // 使用更大的 maxTokens 以容纳完整剧本
    const response = await this.callAI(prompt, systemPrompt, 16000, providerConfigId, modelId)

    // 解析响应
    const result = this.extractFullScriptFromResponse(response)

    // 验证结果
    if (!result.synopsis) {
      console.warn('[StoryToVideoAI] 生成的剧本缺少梗概')
    }
    if (!result.scriptContent) {
      throw new Error('生成的剧本缺少剧本正文，请检查 AI 模型是否支持长文本输出')
    }
    if (result.scenes.length === 0) {
      console.warn('[StoryToVideoAI] 生成的剧本缺少结构化场景数据')
    }

    return result
  }

  /**
   * 生成剧本
   */
  async generateScript(
    chapterContent: string,
    characters: Array<{ id: string; name: string; description?: string }>,
    providerConfigId?: string,
    modelId?: string
  ): Promise<ScriptGenerationResult> {
    // 构建角色列表
    const characterList = characters.map(c =>
      `- ID: ${c.id}, 名称: ${c.name}${c.description ? `, 描述: ${c.description}` : ''}`
    ).join('\n')

    // 替换提示词中的变量
    const prompt = SCRIPT_GENERATION_PROMPT
      .replace('{characters}', characterList)
      .replace('{chapterContent}', chapterContent)

    const systemPrompt = '你是一个专业的影视编剧，擅长将小说转换为视频剧本。请严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await this.callAI(prompt, systemPrompt, 8192, providerConfigId, modelId)
    const result = this.extractJsonFromResponse(response)

    // 验证结果格式
    if (!result.synopsis || !Array.isArray(result.scenes)) {
      throw new Error('生成的剧本格式不正确，缺少必要字段')
    }

    return result as ScriptGenerationResult
  }

  /**
   * 拆分场景
   */
  async splitScenes(
    chapterContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ scenes: SceneGenerationResult[] }> {
    // 替换提示词中的变量
    const prompt = SCENE_SPLIT_PROMPT.replace('{chapterContent}', chapterContent)

    const systemPrompt = '你是一个专业的视频脚本分析师。请严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await this.callAI(prompt, systemPrompt, 4096, providerConfigId, modelId)
    const result = this.extractJsonFromResponse(response)

    if (!Array.isArray(result.scenes)) {
      throw new Error('生成的场景格式不正确')
    }

    return result
  }

  /**
   * 生成分镜（批量模式 - 已弃用，建议使用逐个生成模式）
   * @deprecated 建议使用 generateStoryboardsIncremental 方法
   */
  async generateStoryboard(
    sceneScript: SceneScript,
    providerConfigId?: string,
    modelId?: string
  ): Promise<StoryboardGenerationResult> {
    // 构建场景剧本描述
    const sceneDescription = `
场景 ${sceneScript.sceneNumber}: ${sceneScript.location}
地点类型: ${sceneScript.locationType}
时间: ${sceneScript.timeOfDay}
天气: ${sceneScript.weather || '未指定'}
场景描述: ${sceneScript.sceneDescription}
氛围: ${sceneScript.mood}
光线: ${sceneScript.lighting || '未指定'}

出场角色:
${sceneScript.characters.map(c => `- ${c.characterName}: 表情(${c.expression || '无'}), 动作(${c.action || '无'})`).join('\n')}

旁白: ${sceneScript.narration}

对话:
${sceneScript.dialogues.map(d => `- ${d.characterName}: "${d.text}" (${d.emotion || '普通'})`).join('\n')}

动作:
${sceneScript.actions.map(a => `- ${a.description}`).join('\n')}
`

    // 替换提示词中的变量
    const prompt = STORYBOARD_GENERATION_PROMPT.replace('{sceneScript}', sceneDescription)

    const systemPrompt = '你是一个专业的影视导演和分镜师。请严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await this.callAI(prompt, systemPrompt, 4096, providerConfigId, modelId)
    const result = this.extractJsonFromResponse(response)

    if (!Array.isArray(result.storyboards)) {
      throw new Error('生成的分镜格式不正确')
    }

    return result as StoryboardGenerationResult
  }

  /**
   * 分析场景，确定需要的分镜数量和类型
   */
  async analyzeSceneStoryboardNeeds(
    sceneScript: SceneScript,
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ shotCount: number; shotTypes: string[]; notes: string }> {
    const sceneDescription = `
场景 ${sceneScript.sceneNumber}: ${sceneScript.location}
地点类型: ${sceneScript.locationType}
时间: ${sceneScript.timeOfDay}
场景描述: ${sceneScript.sceneDescription}
氛围: ${sceneScript.mood}

出场角色: ${sceneScript.characters.map(c => c.characterName).join(', ')}

旁白长度: ${sceneScript.narration?.length || 0} 字符
对话数量: ${sceneScript.dialogues.length} 条
动作数量: ${sceneScript.actions.length} 个
`

    const prompt = `分析以下场景，确定需要多少个分镜镜头来完整呈现这个场景。

请考虑：
1. 场景开场需要建立镜头（远景或全景）
2. 每段重要对话需要对应的镜头（通常是中景或近景的正反打）
3. 情感高潮需要特写镜头
4. 重要动作需要展示镜头
5. 场景结尾可能需要结束镜头

场景信息：
${sceneDescription}

请输出JSON格式：
{
  "shotCount": 需要的分镜总数,
  "shotTypes": ["每个镜头的建议类型，如：long/medium/close等"],
  "notes": "简要说明分镜安排的理由"
}`

    const systemPrompt = '你是一个专业的影视导演。请根据场景内容分析分镜需求，严格按照 JSON 格式输出。'

    const response = await this.callAI(prompt, systemPrompt, 1024, providerConfigId, modelId)
    const result = this.extractJsonFromResponse(response)

    return {
      shotCount: result.shotCount || 5,
      shotTypes: result.shotTypes || [],
      notes: result.notes || ''
    }
  }

  /**
   * 生成单个分镜
   */
  async generateSingleStoryboard(
    sceneScript: SceneScript,
    shotNumber: number,
    previousStoryboards: StoryboardResult[] = [],
    providerConfigId?: string,
    modelId?: string
  ): Promise<StoryboardResult> {
    // 构建场景剧本描述
    const sceneDescription = `
场景 ${sceneScript.sceneNumber}: ${sceneScript.location}
地点类型: ${sceneScript.locationType}
时间: ${sceneScript.timeOfDay}
天气: ${sceneScript.weather || '未指定'}
场景描述: ${sceneScript.sceneDescription}
氛围: ${sceneScript.mood}
光线: ${sceneScript.lighting || '未指定'}

出场角色:
${sceneScript.characters.map(c => `- ID: ${c.characterId}, 名称: ${c.characterName}, 表情(${c.expression || '无'}), 动作(${c.action || '无'})`).join('\n')}

旁白: ${sceneScript.narration || '无'}
旁白ID: narration_${sceneScript.sceneNumber}

对话:
${sceneScript.dialogues.map(d => `- ID: ${d.id}, 角色: ${d.characterName}, 内容: "${d.text}", 情感: ${d.emotion || '普通'}`).join('\n')}

动作:
${sceneScript.actions.map(a => `- ID: ${a.id}, 描述: ${a.description}`).join('\n')}
`

    // 构建上下文信息
    let contextInfo = ''
    if (shotNumber === 1) {
      contextInfo = '这是场景的第一个镜头（开场镜头），需要建立场景环境，展示空间关系和人物位置。'
    } else if (previousStoryboards.length > 0) {
      const lastStoryboard = previousStoryboards[previousStoryboards.length - 1]
      contextInfo = `上一个镜头（第${lastStoryboard.shotNumber}号）：
- 景别: ${lastStoryboard.shotType}
- 角度: ${lastStoryboard.cameraAngle}
- 运镜: ${lastStoryboard.cameraMovement}
- 主体: ${lastStoryboard.subject || '未指定'}
- 持续时间: ${lastStoryboard.duration}秒

请考虑镜头的衔接和变化，避免重复使用相同的镜头设置，除非有特殊需要。`
    }

    // 替换提示词中的变量
    const prompt = SINGLE_STORYBOARD_GENERATION_PROMPT
      .replace(/{shotNumber}/g, String(shotNumber))
      .replace('{sceneScript}', sceneDescription)
      .replace('{contextInfo}', contextInfo)

    const systemPrompt = '你是一个专业的影视导演和分镜师。请严格按照 JSON 格式输出单个分镜，不要添加任何额外的文字说明或数组包裹。'

    const response = await this.callAI(prompt, systemPrompt, 2048, providerConfigId, modelId)
    const result = this.extractJsonFromResponse(response)

    // 验证结果
    if (!result.shotType || !result.cameraAngle || !result.frameDescription) {
      throw new Error('生成的分镜缺少必要字段')
    }

    // 确保 shotNumber 正确
    result.shotNumber = shotNumber

    // 验证并修正 dialogueIds
    // 如果 dialogueIds 为空或包含占位符文本，尝试从场景对话中匹配
    if (!result.dialogueIds || !Array.isArray(result.dialogueIds) || result.dialogueIds.length === 0) {
      result.dialogueIds = []
    } else {
      // 过滤掉占位符文本，只保留实际的对话 ID
      const validDialogueIds = sceneScript.dialogues.map(d => d.id)
      result.dialogueIds = result.dialogueIds.filter((id: string) => validDialogueIds.includes(id))
    }

    // 验证并修正 actionIds
    if (!result.actionIds || !Array.isArray(result.actionIds)) {
      result.actionIds = []
    } else {
      const validActionIds = sceneScript.actions.map(a => a.id)
      result.actionIds = result.actionIds.filter((id: string) => validActionIds.includes(id))
    }

    return result as StoryboardResult
  }

  /**
   * 逐个生成分镜（推荐使用此方法）
   * 每个分镜单独生成，任务更小更稳定，可以提供更好的进度反馈
   */
  async generateStoryboardsIncremental(
    sceneScript: SceneScript,
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (shotNumber: number, total: number, storyboard?: StoryboardResult) => void
  ): Promise<StoryboardGenerationResult> {
    // 第一步：分析场景需要的分镜数量
    const analysis = await this.analyzeSceneStoryboardNeeds(sceneScript, providerConfigId, modelId)
    const shotCount = analysis.shotCount

    console.log(`[StoryToVideoAI] 场景 ${sceneScript.sceneNumber} 需要 ${shotCount} 个分镜`)
    console.log(`[StoryToVideoAI] 分镜类型建议: ${analysis.shotTypes.join(', ')}`)
    console.log(`[StoryToVideoAI] 分析说明: ${analysis.notes}`)

    // 第二步：逐个生成分镜
    const storyboards: StoryboardResult[] = []

    for (let i = 1; i <= shotCount; i++) {
      if (onProgress) {
        onProgress(i, shotCount)
      }

      try {
        const storyboard = await this.generateSingleStoryboard(
          sceneScript,
          i,
          storyboards,
          providerConfigId,
          modelId
        )
        storyboards.push(storyboard)

        if (onProgress) {
          onProgress(i, shotCount, storyboard)
        }

        console.log(`[StoryToVideoAI] 成功生成第 ${i} 个分镜`)
      } catch (error) {
        console.error(`[StoryToVideoAI] 生成第 ${i} 个分镜失败:`, error)
        // 继续尝试生成下一个分镜
      }
    }

    // 如果没有成功生成任何分镜，尝试使用旧方法
    if (storyboards.length === 0) {
      console.warn('[StoryToVideoAI] 逐个生成失败，尝试使用批量生成')
      return await this.generateStoryboard(sceneScript, providerConfigId, modelId)
    }

    // 后处理：智能分配对话到各个分镜
    // 如果 AI 没有正确分配对话，我们根据分镜数量平均分配
    this.distributeDialoguesToStoryboards(sceneScript, storyboards)

    return { storyboards }
  }

  /**
   * 智能分配对话到各个分镜
   * 如果分镜的 dialogueIds 为空，则根据对话数量平均分配
   */
  private distributeDialoguesToStoryboards(sceneScript: SceneScript, storyboards: StoryboardResult[]): void {
    const dialogues = sceneScript.dialogues
    console.log(`[StoryToVideoAI] distributeDialoguesToStoryboards: 对话数=${dialogues.length}, 分镜数=${storyboards.length}`)

    if (dialogues.length === 0 || storyboards.length === 0) return

    // 检查是否所有分镜的 dialogueIds 都为空
    const totalAssigned = storyboards.reduce((sum, sb) => sum + (sb.dialogueIds?.length || 0), 0)
    console.log(`[StoryToVideoAI] totalAssigned=${totalAssigned}`)

    if (totalAssigned === 0 && dialogues.length > 0) {
      console.log('[StoryToVideoAI] AI 未分配对话，进行智能分配')

      // 计算每个分镜应该分配的对话数量
      const dialoguesPerShot = Math.ceil(dialogues.length / storyboards.length)

      let dialogueIndex = 0
      for (let i = 0; i < storyboards.length && dialogueIndex < dialogues.length; i++) {
        const count = Math.min(dialoguesPerShot, dialogues.length - dialogueIndex)
        storyboards[i].dialogueIds = dialogues
          .slice(dialogueIndex, dialogueIndex + count)
          .map(d => d.id)
        dialogueIndex += count
        console.log(`[StoryToVideoAI] 分镜 ${i + 1} 分配了 ${count} 条对话:`, storyboards[i].dialogueIds)
      }

      console.log(`[StoryToVideoAI] 已将 ${dialogues.length} 条对话分配到 ${storyboards.length} 个分镜`)
    }
  }

  /**
   * 批量生成分镜（逐场景生成，每个场景使用逐个分镜生成模式）
   */
  async generateStoryboards(
    scenes: SceneScript[],
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (sceneIndex: number, total: number, shotProgress?: { current: number; total: number }) => void
  ): Promise<Map<string, StoryboardGenerationResult>> {
    const results = new Map<string, StoryboardGenerationResult>()

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]

      if (onProgress) {
        onProgress(i, scenes.length)
      }

      try {
        // 使用逐个分镜生成模式
        const result = await this.generateStoryboardsIncremental(
          scene,
          providerConfigId,
          modelId,
          (shotNumber, shotTotal, storyboard) => {
            if (onProgress) {
              onProgress(i, scenes.length, { current: shotNumber, total: shotTotal })
            }
          }
        )
        results.set(scene.id, result)
        console.log(`[StoryToVideoAI] 场景 ${scene.sceneNumber} 生成了 ${result.storyboards.length} 个分镜`)
      } catch (error) {
        console.error(`生成场景 ${scene.sceneNumber} 的分镜失败:`, error)
        // 继续处理其他场景
      }
    }

    return results
  }

  /**
   * 从上传的长文中识别角色
   * @param textContent 上传的长文内容（仅分析前 5000 字以提高效率）
   * @param providerConfigId AI 提供商配置 ID
   * @param modelId 模型 ID
   * @returns 识别的角色列表
   */
  async identifyCharacters(
    textContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<UploadedCharacter[]> {
    // 仅分析前 5000 字以提高效率
    const textToAnalyze = textContent.substring(0, 5000)

    // 替换提示词中的变量
    const prompt = CHARACTER_IDENTIFICATION_PROMPT.replace('{textContent}', textToAnalyze)

    const systemPrompt = '你是一位专业的文学分析师。请从文本中识别角色，严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await this.callAI(prompt, systemPrompt, 2048, providerConfigId, modelId)
    const result = this.extractJsonFromResponse(response)

    // 验证结果格式
    if (!result.characters || !Array.isArray(result.characters)) {
      console.warn('[StoryToVideoAI] 角色识别结果格式不正确，返回空数组')
      return []
    }

    // 转换为 UploadedCharacter 格式
    const characters: UploadedCharacter[] = result.characters.map((char: any) => ({
      name: char.name || '未知角色',
      description: char.description,
      role: char.role
    }))

    console.log(`[StoryToVideoAI] 从上传长文中识别了 ${characters.length} 个角色`)
    return characters
  }

  /**
   * 从上传的长文中识别地点
   * @param textContent 上传的长文内容
   * @param providerConfigId 可选的提供商配置ID
   * @param modelId 可选的模型ID
   * @returns 识别的地点列表
   */
  async identifyLocations(
    textContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<UploadedLocation[]> {
    // 仅分析前 5000 字以提高效率
    const textToAnalyze = textContent.substring(0, 5000)

    // 替换提示词中的变量
    const prompt = LOCATION_IDENTIFICATION_PROMPT.replace('{textContent}', textToAnalyze)

    const systemPrompt = '你是一位专业的文学分析师。请从文本中识别地点，严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await this.callAI(prompt, systemPrompt, 2048, providerConfigId, modelId)
    const result = this.extractJsonFromResponse(response)

    // 验证结果格式
    if (!result.locations || !Array.isArray(result.locations)) {
      console.warn('[StoryToVideoAI] 地点识别结果格式不正确，返回空数组')
      return []
    }

    // 转换为 UploadedLocation 格式
    const locations: UploadedLocation[] = result.locations.map((loc: any) => ({
      name: loc.name || '未知地点',
      description: loc.description,
      type: loc.type
    }))

    console.log(`[StoryToVideoAI] 从上传长文中识别了 ${locations.length} 个地点`)
    return locations
  }

  /**
   * 从上传的长文中识别物品
   * @param textContent 上传的长文内容
   * @param providerConfigId 可选的提供商配置ID
   * @param modelId 可选的模型ID
   * @returns 识别的物品列表
   */
  async identifyItems(
    textContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<UploadedItem[]> {
    // 仅分析前 5000 字以提高效率
    const textToAnalyze = textContent.substring(0, 5000)

    // 替换提示词中的变量
    const prompt = ITEM_IDENTIFICATION_PROMPT.replace('{textContent}', textToAnalyze)

    const systemPrompt = '你是一位专业的文学分析师。请从文本中识别物品，严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await this.callAI(prompt, systemPrompt, 2048, providerConfigId, modelId)
    const result = this.extractJsonFromResponse(response)

    // 验证结果格式
    if (!result.items || !Array.isArray(result.items)) {
      console.warn('[StoryToVideoAI] 物品识别结果格式不正确，返回空数组')
      return []
    }

    // 转换为 UploadedItem 格式
    const items: UploadedItem[] = result.items.map((item: any) => ({
      name: item.name || '未知物品',
      description: item.description,
      type: item.type
    }))

    console.log(`[StoryToVideoAI] 从上传长文中识别了 ${items.length} 个物品`)
    return items
  }
}