/**
 * 默认 VLM shot 推断器（spec 2026-05-09 ep-redesign §3.2 D5 · P-22）
 *
 * 把代表帧 + shot 时长喂给 VLM，让 LLM 推断：
 *   - shotType（big_close_up / close_up / medium / long / wide）
 *   - cameraAngle（eye_level / high / low / overhead / dutch）
 *   - cameraMovement（static / push / pull / pan / track / handheld）
 *   - frameDescription（中文一句话画面描述）
 *   - emotion（紧张 / 温馨 / 悬疑 / ...）
 *
 * 用 callVLM helper 调用 vision 模型；prompt 强约束 JSON 输出便于解析。
 */

import { promises as fs } from 'node:fs'
import { callVLM, parseJsonString, extractJsonFromResponse } from '../narrative/ai/_helpers'
import type { ParsedShot } from '@core/database/entities/episode-production/reference-video-analysis.entity'

const SYSTEM_PROMPT = `你是专业短剧分镜助手。给你一张视频代表帧，你需要按下面 JSON schema 输出该镜头的镜头语言字段。

字段含义:
- shotType: 'big_close_up' | 'close_up' | 'medium' | 'long' | 'wide'
  big_close_up=大特写(局部脸/眼睛), close_up=特写(整张脸), medium=中景(腰部以上), long=远景(全身), wide=大全景(环境)
- cameraAngle: 'eye_level' | 'high' | 'low' | 'overhead' | 'dutch'
  eye_level=平视, high=俯拍, low=仰拍, overhead=顶部俯视, dutch=斜角
- cameraMovement: 'static' | 'push' | 'pull' | 'pan' | 'track' | 'handheld'
  static=固定, push=推进, pull=拉远, pan=横摇, track=跟拍, handheld=手持晃动
- frameDescription: 中文一句话画面描述（25 字以内）
- emotion: 镜头氛围/情绪，2-4 字（如"紧张"、"温馨"、"悬疑"）

输出严格 JSON，不要额外解释:
{ "shotType": "...", "cameraAngle": "...", "cameraMovement": "...", "frameDescription": "...", "emotion": "..." }`

/**
 * 把图文件转 base64 data URL（VLM 调用所需）。
 * MIME 类型从扩展名推断，简单覆盖 jpg / png / webp。
 */
async function fileToDataUrl(framePath: string): Promise<string> {
  const buf = await fs.readFile(framePath)
  const ext = (framePath.split('.').pop() ?? '').toLowerCase()
  const mime =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    'image/jpeg'  // jpg / jpeg / 默认
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

    return {
      shotType: typeof parsed.shotType === 'string' ? parsed.shotType : undefined,
      cameraAngle: typeof parsed.cameraAngle === 'string' ? parsed.cameraAngle : undefined,
      cameraMovement: typeof parsed.cameraMovement === 'string' ? parsed.cameraMovement : undefined,
      frameDescription: typeof parsed.frameDescription === 'string' ? parsed.frameDescription : undefined,
      emotion: typeof parsed.emotion === 'string' ? parsed.emotion : undefined,
    }
  }
}
