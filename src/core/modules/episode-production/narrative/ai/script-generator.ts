/**
 * narrative/ai/script-generator
 * @module modules/episode-production/narrative/ai/script-generator
 * @description 剧本（章节梗概 + 场景拆分）生成器。
 *              拆自原 StoryToVideoAIService.generateFullScript / generateScript。
 */

import type {
  FullScriptGenerationResult,
  GeneratedScene
} from '@shared/types/episode-production'
import type { ScriptGenerationResult } from './types'
import { callAI, extractJsonFromResponse, parseJsonString } from './_helpers'

// ==================== 提示词模板 ====================

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

// ==================== 主类 ====================

/**
 * 剧本生成器
 * 负责将章节内容转换为剧本和结构化场景数据
 */
export class EpisodeScriptGenerator {
  private static instance: EpisodeScriptGenerator

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): EpisodeScriptGenerator {
    if (!EpisodeScriptGenerator.instance) {
      EpisodeScriptGenerator.instance = new EpisodeScriptGenerator()
    }
    return EpisodeScriptGenerator.instance
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 解析 JSON 字符串（委托给共享工具）
   */
  private parseJsonString(jsonStr: string): any {
    return parseJsonString(jsonStr)
  }

  /**
   * 从完整剧本响应中提取三部分内容
   */
  private extractFullScriptFromResponse(response: string): FullScriptGenerationResult {
    console.log('[EpisodeScriptGenerator] 解析完整剧本响应，长度:', response.length)

    let synopsis = ''
    let scriptContent = ''
    let scenes: GeneratedScene[] = []

    // 提取梗概
    const synopsisMatch = response.match(/===SYNOPSIS===\s*([\s\S]*?)\s*===SYNOPSIS_END===/)
    if (synopsisMatch) {
      synopsis = synopsisMatch[1].trim()
      console.log('[EpisodeScriptGenerator] 提取到梗概，长度:', synopsis.length)
    }

    // 提取剧本正文
    const scriptMatch = response.match(/===SCRIPT===\s*([\s\S]*?)\s*===SCRIPT_END===/)
    if (scriptMatch) {
      scriptContent = scriptMatch[1].trim()
      console.log('[EpisodeScriptGenerator] 提取到剧本正文，长度:', scriptContent.length)
    }

    // 提取 JSON 场景数据
    const scenesMatch = response.match(/===SCENES_JSON===\s*([\s\S]*?)\s*===SCENES_JSON_END===/)
    if (scenesMatch) {
      try {
        const scenesData = this.parseJsonString(scenesMatch[1].trim())
        if (scenesData.scenes && Array.isArray(scenesData.scenes)) {
          scenes = this.convertSceneDataToGeneratedScenes(scenesData.scenes)
          console.log('[EpisodeScriptGenerator] 提取到场景数据，场景数:', scenes.length)
        }
      } catch (e) {
        console.error('[EpisodeScriptGenerator] 解析场景 JSON 失败:', e)
        // 尝试备用解析方法
        const jsonMatch = response.match(/===SCENES_JSON===\s*```json\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          try {
            const scenesData = this.parseJsonString(jsonMatch[1].trim())
            if (scenesData.scenes && Array.isArray(scenesData.scenes)) {
              scenes = this.convertSceneDataToGeneratedScenes(scenesData.scenes)
            }
          } catch (e2) {
            console.error('[EpisodeScriptGenerator] 备用解析方法也失败:', e2)
          }
        }
      }
    }

    // 验证必需字段
    if (!synopsis) {
      console.warn('[EpisodeScriptGenerator] 未找到梗概，尝试从 JSON 提取')
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
      console.warn('[EpisodeScriptGenerator] 未找到剧本正文')
    }

    if (scenes.length === 0) {
      console.warn('[EpisodeScriptGenerator] 未找到场景数据')
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

  // ==================== 公开方法 ====================

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
    const response = await callAI(prompt, systemPrompt, 16000, providerConfigId, modelId)

    // 解析响应
    const result = this.extractFullScriptFromResponse(response)

    // 验证结果
    if (!result.synopsis) {
      console.warn('[EpisodeScriptGenerator] 生成的剧本缺少梗概')
    }
    if (!result.scriptContent) {
      throw new Error('生成的剧本缺少剧本正文，请检查 AI 模型是否支持长文本输出')
    }
    if (result.scenes.length === 0) {
      console.warn('[EpisodeScriptGenerator] 生成的剧本缺少结构化场景数据')
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

    const response = await callAI(prompt, systemPrompt, 8192, providerConfigId, modelId)
    const result = extractJsonFromResponse(response)

    // 验证结果格式
    if (!result.synopsis || !Array.isArray(result.scenes)) {
      throw new Error('生成的剧本格式不正确，缺少必要字段')
    }

    return result as ScriptGenerationResult
  }
}
