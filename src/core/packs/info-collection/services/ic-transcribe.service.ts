/**
 * 音频转写服务（多模态 M4，2026-10-09）
 * @module core/packs/info-collection/services/ic-transcribe.service
 *
 * 双通道（用户设置 `ic.transcription` 选择）：
 * - **cloud**：OpenAI 兼容 `/audio/transcriptions`（OpenAI / SiliconFlow / Groq 等同形端点）——
 *   baseUrl + apiKey + model 三项可配。
 * - **local**：ffmpeg 解码 16k 单声道 PCM → transformers.js（onnxruntime-node）跑 whisper
 *   （Xenova/whisper-tiny|base|small）。模型首用自动下载，缺省走 hf-mirror.com（国内可达），
 *   缓存在 dataPath/info-collection/models。
 *
 * 纪律：provider='off' 时如实返回未启用（管线标"待转写"，绝不编造文本）；
 * 长音频由调用方预算熔断；本地推理失败把原因带回（缺模型/内存不足等）。
 */
import type { IcTranscribeSettings } from '@shared/types/info-collection.types'

export const TRANSCRIBE_SETTINGS_KEY = 'ic.transcription'

export type { IcTranscribeSettings }

/** 读取用户转写设置（settings 表键值；未配置 = off） */
export async function readTranscribeConfig(): Promise<IcTranscribeSettings> {
  try {
    const { getCoreDatabaseManager } = await import('@core/database/database-manager.interface')
    const settings = getCoreDatabaseManager().settings
    if (!settings) return { provider: 'off' }
    const raw = (await settings.get(TRANSCRIBE_SETTINGS_KEY)) as IcTranscribeSettings | null
    if (!raw || typeof raw !== 'object') return { provider: 'off' }
    return raw
  } catch {
    return { provider: 'off' }
  }
}

export interface TranscribeResult {
  ok: boolean
  text?: string
  durationSec?: number
  provider?: 'local' | 'cloud'
  error?: string
}

/** 云端：OpenAI 兼容 /audio/transcriptions（multipart） */
async function transcribeCloud(
  cfg: NonNullable<IcTranscribeSettings['cloud']>,
  audioPath: string,
  language?: string,
): Promise<TranscribeResult> {
  if (!cfg.baseUrl || !cfg.apiKey) return { ok: false, error: '云端转写未配置 baseUrl/apiKey' }
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const buf = await fs.readFile(audioPath)
  const form = new FormData()
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
    flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/opus', wma: 'audio/x-ms-wma',
  }
  const ext = path.extname(audioPath).toLowerCase().replace('.', '') || 'mp3'
  form.append('file', new Blob([new Uint8Array(buf)], { type: mimeMap[ext] ?? 'audio/mpeg' }), `audio.${ext}`)
  form.append('model', cfg.model || 'whisper-1')
  if (language) form.append('language', language)
  form.append('response_format', 'json')
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(600_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, error: `云端转写 HTTP ${res.status}：${body.slice(0, 200)}` }
  }
  const json = (await res.json()) as { text?: string }
  const text = (json.text ?? '').trim()
  if (!text) return { ok: false, error: '云端转写返回空文本' }
  return { ok: true, text, provider: 'cloud' }
}

/** 本地：ffmpeg → 16k 单声道 PCM → transformers.js whisper */
async function transcribeLocal(
  cfg: NonNullable<IcTranscribeSettings['local']>,
  audioPath: string,
  language?: string,
): Promise<TranscribeResult> {
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const { runFfmpeg } = await import('@core/platform/workflow/nodes/ffmpeg-utils')
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ic-transcribe-'))
  const pcmPath = path.join(tmpDir, 'audio.pcm')
  try {
    await runFfmpeg(['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', '-f', 's16le', pcmPath])
    const pcm = await fs.readFile(pcmPath)
    if (pcm.length < 3200) return { ok: false, error: '音频过短或解码失败（<0.1 秒）' }
    const int16 = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2))
    const audio = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) audio[i] = int16[i] / 32768

    const { pipeline, env } = await import('@huggingface/transformers')
    // 模型镜像：缺省 hf-mirror.com（国内可达）；模型缓存到 dataPath，避免塞系统目录
    const { getPathProvider } = await import('@core/interfaces/path.interface')
    try {
      const modelsDir = path.join(getPathProvider().getDataPath(), 'info-collection', 'models')
      await fs.mkdir(modelsDir, { recursive: true })
      ;(env as { cacheDir?: string }).cacheDir = modelsDir
      if (cfg.mirror !== '') (env as { remoteHost?: string }).remoteHost = cfg.mirror || 'https://hf-mirror.com'
    } catch {
      /* 路径不可用时用包缺省（HF 官方源） */
    }
    const size = cfg.modelSize ?? 'base'
    const asr = await pipeline('automatic-speech-recognition', `Xenova/whisper-${size}`)
    const out = (await asr(audio, {
      language: language ?? 'chinese',
      task: 'transcribe',
    })) as { text?: string }
    const text = (out?.text ?? '').trim()
    if (!text) return { ok: false, error: '本地转写返回空文本' }
    return { ok: true, text, durationSec: Math.round(audio.length / 16000), provider: 'local' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** 按用户设置转写一个音频文件 */
export async function transcribeAudioFile(
  cfg: IcTranscribeSettings,
  audioPath: string,
  opts?: { language?: string },
): Promise<TranscribeResult> {
  if (cfg.provider === 'cloud') {
    if (!cfg.cloud) return { ok: false, error: '云端转写未配置' }
    return transcribeCloud(cfg.cloud, audioPath, opts?.language ?? cfg.language)
  }
  if (cfg.provider === 'local') {
    return transcribeLocal(cfg.local ?? {}, audioPath, opts?.language ?? cfg.language)
  }
  return { ok: false, error: '未启用音频转写' }
}
