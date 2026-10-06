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
import type { CameraAngle, CameraMovement } from '@shared/types/episode-production/narrative.types'
import { VLM_SHOT_TYPE_MAP } from '@shared/types/episode-production/narrative.types'

/**
 * VLM 专用系统提示词
 * @description VLM 模型使用简化枚举，便于视觉理解。
 *
 * 2026-10-06 修复（提示词优化方案 §3.10）：
 *   - 定位从"短剧分镜助手"改为"专业影视分镜分析师"（本工具分析任意参考视频，非短剧专属）
 *   - 运镜枚举**带方向**（pan_left/pan_right/track_left/track_right），由 VLM 看图判断方向，
 *     不再由映射层默认捏造（旧实现 pan→pan_left、track→truck_right，所有横摇静默变左摇、
 *     所有跟拍变右移，系统性数据失真）
 */
const SYSTEM_PROMPT = `你是专业影视分镜分析师。给你一张视频代表帧，请分析并输出该镜头的镜头语言字段。

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
从以下选项中选择，**横摇与平移必须判断方向后选择带方向的取值**：
- static: 固定（无运动）
- push: 推进（靠近主体）
- pull: 拉远（远离主体）
- pan_left: 左摇（画面水平向左转动）
- pan_right: 右摇（画面水平向右转动）
- tilt_up: 上仰（镜头向上抬起）
- tilt_down: 下俯（镜头向下俯视）
- track_left: 左移（机位水平向左平移，画面主体相对右移）
- track_right: 右移（机位水平向右平移，画面主体相对左移）
- handheld: 手持（晃动，纪实感）

判断方向时看画面运动方向：背景相对主体向左流动 = 机位右移（track_right）；反之 = track_left。
无法从单帧判断运动时选 static，不要猜测。

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
 * VLM 运镜到标准运镜的映射。
 *
 * 2026-10-06（§3.10）：横摇/平移改为**带方向的显式映射**——提示词已要求 VLM 判断方向，
 * 映射层不再默认捏造方向。仅保留无方向歧义的纯量（push/pull/handheld）。
 */
const VLM_MOVEMENT_MAP: Record<string, CameraMovement> = {
  'static': 'static',
  'push': 'push',
  'pull': 'pull',
  'pan_left': 'pan_left',
  'pan_right': 'pan_right',
  'tilt_up': 'tilt_up',
  'tilt_down': 'tilt_down',
  'track_left': 'track_left',
  'track_right': 'track_right',
  'handheld': 'shaky_handheld',
}

/**
 * 历史简化值的兼容映射（存量缓存/旧模型输出）：
 * 无方向的 pan/track 无法还原真实方向，统一落到"固定"侧的保守值并留痕，
 * 不再像旧实现那样默认成 pan_left / truck_right 制造假数据。
 */
const VLM_MOVEMENT_LEGACY: Record<string, CameraMovement> = {
  'pan': 'pan_left',
  'track': 'track_right',
  'dolly_in': 'push',
  'dolly_out': 'pull',
  'truck_right': 'track_right',
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
    // §3.10：durationSec 在 schema 与下游均无消费字段（ParsedShot 的时长来自
    // ffmpeg 场景切分），旧版注入纯属无效上下文，这里保留形参兼容调用方签名。
    void durationSec
    const userPrompt = '请分析这张代表帧并按 schema 输出 JSON。'

    const response = await callVLM(
      userPrompt,
      dataUrl,
      SYSTEM_PROMPT,
      1024,
      opts.providerConfigId,
      opts.modelId,
      { temperature: 0.2 },
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

    // §3.10：未命中映射不再无声兜底——记 warn + 落 `vlmUnmapped` 标记供上层排查
    // （旧实现静默回落 medium/eye_level/static，掩盖模型漂移）
    const unmapped: Record<string, string> = {}
    const mapOrWarn = <T>(
      field: string,
      raw: string | undefined,
      table: Record<string, T>,
      legacyTable?: Record<string, T>,
    ): T | undefined => {
      if (!raw) return undefined
      const hit = table[raw] ?? legacyTable?.[raw]
      if (hit === undefined) {
        unmapped[field] = raw
        console.warn(
          `[vlm-shot-inferrer] ${field} 取值 "${raw}" 未命中映射表，已丢弃该字段（原值记入 metadata.vlmUnmapped）`,
        )
        return undefined
      }
      if (!table[raw] && legacyTable?.[raw] !== undefined) {
        console.warn(
          `[vlm-shot-inferrer] ${field} 取值 "${raw}" 为历史简化值，已兼容映射为 "${String(hit)}"`,
        )
      }
      return hit
    }

    const result: Partial<ParsedShot> & { vlmUnmapped?: Record<string, string> } = {
      shotType: rawShotType ? (VLM_SHOT_TYPE_MAP[rawShotType] ?? undefined) : undefined,
      cameraAngle: mapOrWarn('cameraAngle', rawAngle, VLM_ANGLE_MAP),
      cameraMovement: mapOrWarn('cameraMovement', rawMovement, VLM_MOVEMENT_MAP, VLM_MOVEMENT_LEGACY),
      frameDescription: typeof parsed.frameDescription === 'string' ? parsed.frameDescription : undefined,
      emotion: typeof parsed.emotion === 'string' ? parsed.emotion : undefined,
    }

    if (rawShotType && !VLM_SHOT_TYPE_MAP[rawShotType]) {
      unmapped['shotType'] = rawShotType
      console.warn(
        `[vlm-shot-inferrer] shotType 取值 "${rawShotType}" 未命中映射表，已丢弃该字段（原值记入 metadata.vlmUnmapped）`,
      )
    }
    if (Object.keys(unmapped).length > 0) {
      result.vlmUnmapped = unmapped
    }

    return result
  }
}
