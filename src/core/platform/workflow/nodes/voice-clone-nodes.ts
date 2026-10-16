/**
 * 语音复刻节点（voice-clone）
 * @module core/platform/workflow/nodes/voice-clone-nodes
 * @description 上传样本音频训练专属音色（DashScope CosyVoice，长任务）：
 *              - 样本时长用 ffprobe 自动探测（10-20s 校验交给 VoiceCloneService）
 *              - waitForCompletion=true（默认）：轮询训练状态到 ready/failed（同 kb-ingest 模式）
 *              - waitForCompletion=false：提交即成功，输出 clonedVoiceId（下游自行刷新）
 *              输出 voiceId 可直接接 tts 节点合成。
 *
 *              架构铁律：节点是服务的薄适配器——全部逻辑委托 VoiceCloneService。
 */

import { spawn } from 'child_process'
import { resolveAssetPath } from '@core/utils/asset-path'
import { VoiceCloneService } from '../../services/voice-clone.service'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { workflowRuntimeParams } from '@shared/utils/workflow-runtime-params'
import { pollUntil } from '../engine/async-utils'

/** 训练完成状态（VoiceCloneService 终态语义） */
const CLONE_READY = 'ready'
const CLONE_FAILED = 'failed'

/** ffprobe 探测音频时长（秒）；失败抛错 */
function probeAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let ffprobePath: string
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ffprobePath = require('@ffprobe-installer/ffprobe').path
    } catch (e) {
      reject(new Error('ffprobe 未安装（无法探测音频时长）'))
      return
    }
    const proc = spawn(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath,
    ], { stdio: ['ignore', 'ignore', 'pipe'], shell: false })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe 探测失败 exit=${code}: ${stderr.slice(-200)}`))
        return
      }
      try {
        const meta = JSON.parse(stdout)
        const sec = Number(meta?.format?.duration ?? 0)
        if (!Number.isFinite(sec) || sec <= 0) {
          reject(new Error('无法解析音频时长'))
          return
        }
        resolve(sec)
      } catch (e) {
        reject(new Error('ffprobe 输出解析失败'))
      }
    })
  })
}

const voiceCloneNode: WorkflowNodeHandler = {
  type: 'voice-clone',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'clonedVoiceId', type: 'string', desc: '复刻记录 ID' },
    { key: 'voiceId', type: 'string', desc: '训练完成后的音色 ID（tts 节点引用）' },
    { key: 'status', type: 'string', desc: 'ready / training / failed' },
    { key: 'name', type: 'string', desc: '音色名' },
  ],
  validateConfig(config) {
    const cfg = config as { samplePath?: string; name?: string; prefix?: string }
    const errors: string[] = []
    if (stringifyValue(cfg.samplePath).trim() === '') errors.push('样本音频路径不能为空')
    if (stringifyValue(cfg.name).trim() === '') errors.push('音色名称不能为空')
    const prefix = stringifyValue(cfg.prefix)
    // 格式约束仅校验静态值（模板值运行时解析后由服务层校验）
    if (prefix && !prefix.includes('{{') && !/^[a-z0-9]{1,10}$/.test(prefix)) {
      errors.push('voice_id 前缀仅允许小写字母数字、≤10 字符')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      samplePath: string
      name: string
      prefix?: string
      language?: string
      waitForCompletion?: boolean
    }
    const samplePath = stringifyValue(cfg.samplePath).trim()
    const name = stringifyValue(cfg.name).trim()
    const prefix = stringifyValue(cfg.prefix).trim()
    const language = stringifyValue(cfg.language).trim() || undefined

    const absPath = resolveAssetPath(samplePath)
    // 时长自动探测（10-20s 校验由 VoiceCloneService.validateCloneRequest 统一做，
    // 避免规则两处写死漂移——此处仅探测并透传 durationSec）
    const durationSec = await probeAudioDuration(absPath)

    const resp = await VoiceCloneService.cloneVoice({
      name,
      samplePath: absPath,
      sampleDurationSec: durationSec,
      prefix: prefix || undefined,
      language: language as never,
    })
    if (!resp.success || !resp.data) {
      return { status: 'failed', error: `语音复刻失败: ${resp.error ?? '未知错误'}` }
    }
    const record = resp.data

    // 提交即成功模式：返回 clonedVoiceId，训练在后台进行
    if (cfg.waitForCompletion === false) {
      return {
        status: 'succeeded',
        output: {
          clonedVoiceId: record.id,
          voiceId: record.voiceId ?? '',
          status: record.status,
          name: record.name,
        },
      }
    }

    // 等待训练完成（轮询刷新状态，同 kb-ingest waitForCompletion 模式）
    const done = await pollUntil(
      async () => {
        const st = await VoiceCloneService.refreshClonedVoiceStatus(record.id)
        if (!st.success) throw new Error(st.error ?? '刷新复刻状态失败')
        const row = st.data
        if (!row) return undefined
        ctx.emitProgress(row.status === CLONE_READY ? 100 : 50, row.status)
        if (row.status === CLONE_READY || row.status === CLONE_FAILED) return row
        return undefined
      },
      {
        intervalMs: workflowRuntimeParams().polling.voiceCloneIntervalMs,
        timeoutMs: workflowRuntimeParams().polling.voiceCloneWaitTimeoutMs,
        signal: ctx.signal,
      }
    )
    if (done.status === CLONE_FAILED) {
      return {
        status: 'failed',
        error: `语音复刻失败: ${done.errorMessage ?? '训练失败'}`,
        retryable: false,
      }
    }
    return {
      status: 'succeeded',
      output: {
        clonedVoiceId: done.id,
        voiceId: done.voiceId ?? '',
        status: done.status,
        name: done.name,
      },
    }
  },
}

/** 语音复刻节点集合 */
export const VOICE_CLONE_NODE_HANDLERS: WorkflowNodeHandler[] = [voiceCloneNode]
