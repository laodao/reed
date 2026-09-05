/**
 * 默认 VLM shot 推断器（spec 2026-05-09 ep-redesign §3.2 D5 · P-22）
 *
 * 把代表帧 + shot 时长喂给 VLM，让 LLM 推断镜头语言字段。
 * VLM 使用简化枚举，输出后通过映射转换为标准枚举。
 *
 * 用 callVLM helper 调用 vision 模型；prompt 强约束 JSON 输出便于解析。
 */

import { promises as fs } from 'node:fs'
import { callVLM, parseJsonString, extractJsonFromResponse } from '../narrative/ai/_helpers'
import type { ParsedShot } from '@core/database/entities/episode-production/reference-video-analysis.entity'
import type { ShotType, CameraAngle, CameraMovement } from '@shared/types/episode-production/narrative.types'
import { VLM_SHOT_TYPE_MAP } from '@shared/types/episode-production/narrative.types'

/**
 * VLM 专用系统提示词
 * @description VLM 模型使用简化枚举，便于视觉理解
 */
const SYSTEM_PROMPT = `你是专业短剧分镜助手。给你一张视频代表帧，请分析并输出该镜头的镜头语言字段。

## 输出字段说明

### shotType（景别）
从以下选项中选择最匹配的一个：
- big_close_up: 大特写（局部脸部/眼睛/手部细节）
- close_up: 特写（完整面部，展示表情）
- medium: 中景（腰部以上，展示互动）
- long: 远景（人物全身，展示动作）
- wide: 大全景（环境为主，人物较小）

### cameraAngle（角度）
从以下选项中选择：
- eye_level: 平视（客观中立）
- high: 俯拍（从上往下，显渺小）
- low: 仰拍（从下往上，显高大）
- overhead: 顶部俯视（鸟瞰视角）
- dutch: 斜角（倾斜，不安感）

### cameraMovement（运镜）
从以下选项中选择：
- static: 固定（无运动）
- push: 推进（靠近主体）
- pull: 拉远（远离主体）
- pan: 横摇（水平移动）
- track: 跟拍（跟随主体移动）
- handheld: 手持（晃动，纪实感）

### frameDescription
用一句中文描述画面内容（25 字以内）

### emotion
镜头氛围/情绪，2-4 个字（如"紧张"、"温馨"、"悬疑"）

## 输出格式
输出纯 JSON，不要包含其他内容：
{
  "shotType": "景别值",
  "cameraAngle": "角度值",
  "cameraMovement": "运镜值",
  "frameDescription": "画面描述",
  "emotion": "情绪"
}`

/**
 * VLM 运镜到标准运镜的映射
 */
const VLM_MOVEMENT_MAP: Record<string, CameraMovement> = {
  'static': 'static',
  'push': 'dolly_in',
  'pull': 'dolly_out',
  'pan': 'pan_left', // 默认左摇，实际方向需结合画面判断
  'track': 'truck_right', // 默认右移，实际方向需结合画面判断
  'handheld': 'handheld',
}

/**
 * VLM 角度到标准角度的映射
 */
const VLM_ANGLE_MAP: Record<string, CameraAngle> = {
  'eye_level': 'eye_level',
  'high': 'high',
  'low': 'low',
  'overhead': 'birds_eye',
  'dutch': 'dutch',
}

/**
 * 把图文件转 base64 data URL（VLM 调用所需）。
 */
async function fileToDataUrl(framePath: string): Promise<string> {
  const buf = await fs.readFile(framePath)
  const ext = (framePath.split('.').pop() ?? '').toLowerCase()
  const mime =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

/**
 * 创建一个 vlmInfer 函数（绑定 providerConfigId / modelId）。
 *
 * 调用方:
 *   const vlmInfer = createVlmShotInferrer({ modelId: 'qwen-vl-max' })
 *   await analysisService.analyze({ ..., vlmInfer })
 */
export function createVlmShotInferrer(opts: {
  providerConfigId?: string
  modelId?: string
} = {}): (framePath: string, durationSec: number) => Promise<Partial<ParsedShot>> {
  return async (framePath: string, durationSec: number) => {
    const dataUrl = await fileToDataUrl(framePath)
    const userPrompt = `镜头时长 ${durationSec.toFixed(1)} 秒。请分析这张代表帧并按 schema 输出 JSON。`

    const response = await callVLM(
      userPrompt,
      dataUrl,
      SYSTEM_PROMPT,
      1024,
      opts.providerConfigId,
      opts.modelId,
    )

    let parsed: any
    try {
      parsed = extractJsonFromResponse(response)
    } catch {
      parsed = parseJsonString(response)
    }

    // 将 VLM 输出映射为标准枚举
    const rawShotType = typeof parsed.shotType === 'string' ? parsed.shotType : undefined
    const rawAngle = typeof parsed.cameraAngle === 'string' ? parsed.cameraAngle : undefined
    const rawMovement = typeof parsed.cameraMovement === 'string' ? parsed.cameraMovement : undefined

    return {
      shotType: rawShotType ? (VLM_SHOT_TYPE_MAP[rawShotType] ?? 'medium') : undefined,
      cameraAngle: rawAngle ? (VLM_ANGLE_MAP[rawAngle] ?? 'eye_level') : undefined,
      cameraMovement: rawMovement ? (VLM_MOVEMENT_MAP[rawMovement] ?? 'static') : undefined,
      frameDescription: typeof parsed.frameDescription === 'string' ? parsed.frameDescription : undefined,
      emotion: typeof parsed.emotion === 'string' ? parsed.emotion : undefined,
    }
  }
}
