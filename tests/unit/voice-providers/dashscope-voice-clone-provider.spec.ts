/**
 * DashScopeVoiceCloneProvider 单元测试
 * @see src/core/voice-providers/dashscope-voice-clone-provider.ts
 *
 * 覆盖：
 * - constructor：apiKey 校验
 * - cloneVoice：prefix 校验、上传集成、enrollment payload、状态映射、错误传播
 * - queryCloneStatus：三种 DashScope 状态枚举映射、响应错误处理、preview 转发
 * - deleteClonedVoice：endpoint payload、错误传播
 * - 通用：X-DashScope-OssResourceResolve 头、Authorization 头、code != null 业务错误
 */
import { describe, it, expect } from 'vitest'
import {
  DashScopeVoiceCloneError,
  DashScopeVoiceCloneProvider,
} from '@core/voice-providers/dashscope-voice-clone-provider'
import {
  DashScopeOssUploader,
  DashScopeUploadError,
} from '@core/voice-providers/dashscope-oss-uploader'

/**
 * 构造一个 stub uploader：直接返回固定 oss URL，避免真碰 fetch。
 * 通过 patching prototype 是粗暴但简洁的方式 — 测试结束 vitest 自动隔离实例。
 */
function fakeUploader(ossUrl = 'oss://dashscope-instant/x/y/sample.wav') {
  const u = Object.create(
    DashScopeOssUploader.prototype,
  ) as DashScopeOssUploader
  ;(u as any).uploadFile = async () => ossUrl
  return u
}

/**
 * 构造一个 throw uploader 验证 cloneVoice 的上传错误路径。
 */
function failingUploader(error: Error) {
  const u = Object.create(
    DashScopeOssUploader.prototype,
  ) as DashScopeOssUploader
  ;(u as any).uploadFile = async () => {
    throw error
  }
  return u
}

/**
 * 收集 fetch 调用的 helper。返回 { fetchImpl, calls }，calls 顺序保留请求记录。
 *
 * responder：根据 body 的 input.action 分发响应。
 */
function collectingFetch(
  responder: (action: string, body: any) => Response,
) {
  const calls: Array<{
    url: string
    method: string
    headers: Record<string, string>
    body: any
  }> = []
  const fetchImpl: typeof fetch = async (input: any, init: any) => {
    const url = typeof input === 'string' ? input : input.url
    const headers = (init?.headers ?? {}) as Record<string, string>
    let body: any = init?.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        /* 保持原 string */
      }
    }
    calls.push({ url, method: init?.method ?? 'GET', headers, body })
    const action = body?.input?.action ?? ''
    return responder(action, body)
  }
  return { fetchImpl, calls }
}

describe('DashScopeVoiceCloneProvider', () => {
  describe('constructor', () => {
    it('apiKey 缺失抛错', () => {
      expect(() => new DashScopeVoiceCloneProvider('')).toThrow(/apiKey is required/)
      expect(() => new DashScopeVoiceCloneProvider('   ')).toThrow(/apiKey is required/)
    })

    it('暴露稳定的 PROVIDER_ID 和 DEFAULT_TARGET_MODEL', () => {
      expect(DashScopeVoiceCloneProvider.PROVIDER_ID).toBe('dashscope-voice-clone')
      expect(DashScopeVoiceCloneProvider.DEFAULT_TARGET_MODEL).toBe('cosyvoice-v3.5-plus')
      const p = new DashScopeVoiceCloneProvider('sk-test', {
        uploader: fakeUploader(),
      })
      expect(p.id).toBe('dashscope-voice-clone')
    })
  })

  describe('cloneVoice', () => {
    it('成功：上传 → POST create_voice → 返回 voiceId + targetModel + status', async () => {
      const { fetchImpl, calls } = collectingFetch((action) => {
        if (action !== 'create_voice') {
          return new Response('unexpected action', { status: 500 })
        }
        return new Response(
          JSON.stringify({
            request_id: 'req-x',
            output: {
              voice_id: 'cosyvoice-v3-plus-mine-abcdef12',
              status: 'DEPLOYING',
            },
          }),
          { status: 200 },
        )
      })
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader('oss://dashscope-instant/x/y/sample.wav'),
      })

      const result = await provider.cloneVoice({
        name: '我自己',
        samplePath: '/tmp/sample.wav',
        sampleDurationSec: 15,
        prefix: 'mine',
        language: 'zh',
      })

      expect(result.voiceId).toBe('cosyvoice-v3-plus-mine-abcdef12')
      expect(result.targetModel).toBe('cosyvoice-v3.5-plus')
      expect(result.status).toBe('training')

      // 验证 enrollment 请求 payload
      expect(calls).toHaveLength(1)
      const c = calls[0]
      expect(c.method).toBe('POST')
      expect(c.headers).toMatchObject({
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
        'X-DashScope-OssResourceResolve': 'enable',
      })
      expect(c.body).toEqual({
        model: 'voice-enrollment',
        input: {
          action: 'create_voice',
          target_model: 'cosyvoice-v3.5-plus',
          prefix: 'mine',
          url: 'oss://dashscope-instant/x/y/sample.wav',
          language_hints: ['zh'],
        },
      })
    })

    it('language 缺省时不带 language_hints', async () => {
      const { fetchImpl, calls } = collectingFetch(() =>
        new Response(
          JSON.stringify({
            output: { voice_id: 'cosyvoice-v3-plus-x-12345678', status: 'DEPLOYING' },
          }),
          { status: 200 },
        ),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      await provider.cloneVoice({
        name: 'x',
        samplePath: '/tmp/x.wav',
        sampleDurationSec: 12,
        prefix: 'x',
      })
      expect(calls[0].body.input).not.toHaveProperty('language_hints')
    })

    it('OK 状态映射为 ready（少数 provider 即时返回 OK）', async () => {
      const { fetchImpl } = collectingFetch(() =>
        new Response(
          JSON.stringify({
            output: { voice_id: 'cosyvoice-v3-plus-x-12345678', status: 'OK' },
          }),
          { status: 200 },
        ),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      const r = await provider.cloneVoice({
        name: 'x',
        samplePath: '/tmp/x.wav',
        sampleDurationSec: 15,
        prefix: 'x',
      })
      expect(r.status).toBe('ready')
    })

    it('prefix 不合法（含大写）抛 DashScopeVoiceCloneError', async () => {
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        uploader: fakeUploader(),
      })
      await expect(
        provider.cloneVoice({
          name: 'x',
          samplePath: '/tmp/x.wav',
          sampleDurationSec: 15,
          prefix: 'MyVoice',
        }),
      ).rejects.toMatchObject({
        name: 'DashScopeVoiceCloneError',
        action: 'create_voice',
      })
    })

    it('prefix 过长（>10）抛错', async () => {
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        uploader: fakeUploader(),
      })
      await expect(
        provider.cloneVoice({
          name: 'x',
          samplePath: '/tmp/x.wav',
          sampleDurationSec: 15,
          prefix: 'abcdefghijk', // 11 字符
        }),
      ).rejects.toMatchObject({
        name: 'DashScopeVoiceCloneError',
      })
    })

    it('prefix 含特殊字符抛错', async () => {
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        uploader: fakeUploader(),
      })
      await expect(
        provider.cloneVoice({
          name: 'x',
          samplePath: '/tmp/x.wav',
          sampleDurationSec: 15,
          prefix: 'my-voice',
        }),
      ).rejects.toMatchObject({
        action: 'create_voice',
      })
    })

    it('上传失败抛 stage=upload 错误，并保留 statusCode', async () => {
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        uploader: failingUploader(
          new DashScopeUploadError('凭证 401', 'policy', 401),
        ),
      })
      await expect(
        provider.cloneVoice({
          name: 'x',
          samplePath: '/tmp/x.wav',
          sampleDurationSec: 15,
          prefix: 'mine',
        }),
      ).rejects.toMatchObject({
        name: 'DashScopeVoiceCloneError',
        action: 'upload',
        statusCode: 401,
      })
    })

    it('enrollment HTTP 401 抛 statusCode=401', async () => {
      const { fetchImpl } = collectingFetch(() =>
        new Response('Unauthorized', { status: 401 }),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      await expect(
        provider.cloneVoice({
          name: 'x',
          samplePath: '/tmp/x.wav',
          sampleDurationSec: 15,
          prefix: 'mine',
        }),
      ).rejects.toMatchObject({
        action: 'create_voice',
        statusCode: 401,
      })
    })

    it('enrollment 409 prefix 冲突抛 statusCode=409', async () => {
      const { fetchImpl } = collectingFetch(
        () =>
          new Response('prefix already exists', {
            status: 409,
            statusText: 'Conflict',
          }),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      await expect(
        provider.cloneVoice({
          name: 'x',
          samplePath: '/tmp/x.wav',
          sampleDurationSec: 15,
          prefix: 'mine',
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
      })
    })

    it('响应 body code != null 时抛业务错误', async () => {
      const { fetchImpl } = collectingFetch(() =>
        new Response(
          JSON.stringify({
            request_id: 'req-x',
            code: 'InvalidParameter',
            message: 'audio too short',
          }),
          { status: 200 },
        ),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      await expect(
        provider.cloneVoice({
          name: 'x',
          samplePath: '/tmp/x.wav',
          sampleDurationSec: 15,
          prefix: 'mine',
        }),
      ).rejects.toMatchObject({
        action: 'create_voice',
        providerCode: 'InvalidParameter',
      })
    })

    it('响应缺 voice_id 抛错', async () => {
      const { fetchImpl } = collectingFetch(() =>
        new Response(
          JSON.stringify({
            request_id: 'req-x',
            output: { status: 'DEPLOYING' /* 缺 voice_id */ },
          }),
          { status: 200 },
        ),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      await expect(
        provider.cloneVoice({
          name: 'x',
          samplePath: '/tmp/x.wav',
          sampleDurationSec: 15,
          prefix: 'mine',
        }),
      ).rejects.toMatchObject({
        action: 'create_voice',
      })
    })

    it('网络错误抛 action=create_voice、无 statusCode', async () => {
      const fetchImpl: typeof fetch = async () => {
        throw new Error('ETIMEDOUT')
      }
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      const err = await provider
        .cloneVoice({
          name: 'x',
          samplePath: '/tmp/x.wav',
          sampleDurationSec: 15,
          prefix: 'mine',
        })
        .catch((e) => e)
      expect(err).toBeInstanceOf(DashScopeVoiceCloneError)
      expect((err as DashScopeVoiceCloneError).action).toBe('create_voice')
      expect((err as DashScopeVoiceCloneError).statusCode).toBeUndefined()
    })
  })

  describe('queryCloneStatus', () => {
    it('DEPLOYING → training', async () => {
      const { fetchImpl, calls } = collectingFetch(
        () =>
          new Response(
            JSON.stringify({
              output: { voice_id: 'vid', status: 'DEPLOYING' },
            }),
            { status: 200 },
          ),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      const r = await provider.queryCloneStatus('cosyvoice-v3-plus-mine-x')
      expect(r.status).toBe('training')
      expect(calls[0].body).toEqual({
        model: 'voice-enrollment',
        input: { action: 'query_voice', voice_id: 'cosyvoice-v3-plus-mine-x' },
      })
    })

    it('OK → ready，并透传 demo_audio', async () => {
      const { fetchImpl } = collectingFetch(
        () =>
          new Response(
            JSON.stringify({
              output: {
                voice_id: 'vid',
                status: 'OK',
                demo_audio: 'https://demo.example.com/preview.mp3',
              },
            }),
            { status: 200 },
          ),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      const r = await provider.queryCloneStatus('vid')
      expect(r.status).toBe('ready')
      expect(r.previewAudioUrl).toBe('https://demo.example.com/preview.mp3')
      expect(r.errorMessage).toBeUndefined()
    })

    it('UNDEPLOYED → failed，附带 error_message', async () => {
      const { fetchImpl } = collectingFetch(
        () =>
          new Response(
            JSON.stringify({
              output: { voice_id: 'vid', status: 'UNDEPLOYED' },
              message: 'audio quality too low',
            }),
            { status: 200 },
          ),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      const r = await provider.queryCloneStatus('vid')
      expect(r.status).toBe('failed')
      expect(r.errorMessage).toBe('audio quality too low')
    })

    it('未知中间态保守视为 training（让 scheduler 继续轮询）', async () => {
      const { fetchImpl } = collectingFetch(
        () =>
          new Response(
            JSON.stringify({
              output: { voice_id: 'vid', status: 'PENDING_REVIEW' },
            }),
            { status: 200 },
          ),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      expect((await provider.queryCloneStatus('vid')).status).toBe('training')
    })

    it('voice_status 字段（旧版）也被识别', async () => {
      const { fetchImpl } = collectingFetch(
        () =>
          new Response(
            JSON.stringify({
              output: { voice_id: 'vid', voice_status: 'OK' },
            }),
            { status: 200 },
          ),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      expect((await provider.queryCloneStatus('vid')).status).toBe('ready')
    })

    it('voiceId 为空字符串抛错', async () => {
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        uploader: fakeUploader(),
      })
      await expect(provider.queryCloneStatus('')).rejects.toMatchObject({
        action: 'query_voice',
      })
    })

    it('响应缺 status 字段抛错', async () => {
      const { fetchImpl } = collectingFetch(
        () =>
          new Response(
            JSON.stringify({ output: { voice_id: 'vid' /* 缺 status */ } }),
            { status: 200 },
          ),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      await expect(provider.queryCloneStatus('vid')).rejects.toMatchObject({
        action: 'query_voice',
      })
    })

    it('HTTP 404 voice 不存在抛 statusCode=404', async () => {
      const { fetchImpl } = collectingFetch(
        () => new Response('not found', { status: 404 }),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      await expect(provider.queryCloneStatus('vid')).rejects.toMatchObject({
        action: 'query_voice',
        statusCode: 404,
      })
    })
  })

  describe('deleteClonedVoice', () => {
    it('成功：POST delete_voice，无返回值', async () => {
      const { fetchImpl, calls } = collectingFetch(
        () => new Response(JSON.stringify({ request_id: 'req-x' }), { status: 200 }),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      await expect(provider.deleteClonedVoice('vid-123')).resolves.toBeUndefined()
      expect(calls[0].body).toEqual({
        model: 'voice-enrollment',
        input: { action: 'delete_voice', voice_id: 'vid-123' },
      })
      expect(calls[0].headers).toMatchObject({
        Authorization: 'Bearer sk-test',
        'X-DashScope-OssResourceResolve': 'enable',
      })
    })

    it('voiceId 为空抛错', async () => {
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        uploader: fakeUploader(),
      })
      await expect(provider.deleteClonedVoice('')).rejects.toMatchObject({
        action: 'delete_voice',
      })
    })

    it('网络错误抛 action=delete_voice', async () => {
      const fetchImpl: typeof fetch = async () => {
        throw new Error('ECONNRESET')
      }
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      await expect(provider.deleteClonedVoice('vid')).rejects.toMatchObject({
        action: 'delete_voice',
      })
    })

    it('500 错误透传 statusCode', async () => {
      const { fetchImpl } = collectingFetch(
        () => new Response('server error', { status: 500 }),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
      })
      await expect(provider.deleteClonedVoice('vid')).rejects.toMatchObject({
        statusCode: 500,
      })
    })
  })

  describe('endpoint URL 自定义', () => {
    it('支持注入国际端点', async () => {
      const { fetchImpl, calls } = collectingFetch(
        () =>
          new Response(
            JSON.stringify({
              output: { voice_id: 'vid', status: 'DEPLOYING' },
            }),
            { status: 200 },
          ),
      )
      const provider = new DashScopeVoiceCloneProvider('sk-test', {
        fetchImpl,
        uploader: fakeUploader(),
        endpointUrl:
          'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization',
      })
      await provider.cloneVoice({
        name: 'x',
        samplePath: '/tmp/x.wav',
        sampleDurationSec: 15,
        prefix: 'mine',
      })
      expect(calls[0].url).toBe(
        'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization',
      )
    })
  })
})
