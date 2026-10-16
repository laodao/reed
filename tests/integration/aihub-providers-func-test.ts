/**
 * AI Hub 图像/视频 Provider 功能测试（需本地 ai-hub + mock 上游运行）
 *
 * 用法：
 *   AIHUB_GATEWAY=http://127.0.0.1:8081 AIHUB_IDENTITY=xx@xx.com AIHUB_PASSWORD=xxx \
 *     npx tsx -r tsconfig-paths/register tests/integration/aihub-providers-func-test.ts
 *
 * 覆盖（P2/P3 验收）：
 * - AihubImageProvider：t2i 全链路（提交→轮询→URL 提取，适配器内同步化）
 * - AihubVideoProvider：t2v 提交 + getTaskStatus 轮询到 completed + URL 提取
 * - 401 错误映射（坏 token → [AIHUB_SESSION_EXPIRED] + 不误触会话清理的独立实例）
 */
import type {
  ImageProviderConfig,
  VideoProviderConfig,
} from '@shared/types/image-provider.types'
import type { VideoProviderConfig as VProviderConfig } from '@shared/types/video-provider.types'
import { AihubImageProvider } from '@core/platform/providers/image/aihub-image.provider'
import { AihubVideoProvider } from '@core/platform/providers/video/aihub-video.provider'
import { aihubRequest } from '@core/platform/aihub/aihub-client'
import type { AihubAccountTokenResponse } from '@core/platform/aihub/aihub.types'

const GATEWAY = process.env.AIHUB_GATEWAY ?? 'http://127.0.0.1:8081'
const IDENTITY = process.env.AIHUB_IDENTITY ?? ''
const PASSWORD = process.env.AIHUB_PASSWORD ?? ''

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    console.log(`  ❌ ${name}${detail ? ` —— ${detail}` : ''}`)
  }
}

async function login(): Promise<string> {
  const data = await aihubRequest<AihubAccountTokenResponse>({
    gatewayUrl: GATEWAY,
    path: '/api/account/login',
    method: 'POST',
    body: { identity: IDENTITY, password: PASSWORD }
  })
  return data.token
}

async function main(): Promise<void> {
  console.log(`[aihub-func-test] 网关 ${GATEWAY}`)
  if (!IDENTITY || !PASSWORD) {
    console.error('缺少 AIHUB_IDENTITY / AIHUB_PASSWORD 环境变量')
    process.exit(1)
  }
  const jwt = await login()
  console.log('[aihub-func-test] 登录成功，JWT 已获取')

  // ==================== 图像（t2i，适配器内同步化） ====================
  console.log('\n== AihubImageProvider.generateImage（t2i 全链路） ==')
  const imageProvider = new AihubImageProvider({
    id: 'func-test',
    apiKey: jwt,
    baseUrl: `${GATEWAY}/v1`
  } as ImageProviderConfig)
  const t0 = Date.now()
  const imgRes = await imageProvider.generateImage({
    model: 'poc-image',
    prompt: '一只在雪地里奔跑的猫',
    width: 1024,
    height: 1024,
    count: 1
  } as never)
  const imgMs = Date.now() - t0
  check('图像生成 success', imgRes.success === true, imgRes.error)
  check(
    '返回图片 URL（同步形态，无 taskId）',
    Array.isArray(imgRes.images) && imgRes.images.length > 0 && !!imgRes.images![0]!.url && !imgRes.taskId,
    JSON.stringify(imgRes.images?.map((i) => i.url?.slice(0, 60)))
  )
  console.log(`  （耗时 ${imgMs}ms，含适配器内部轮询）`)

  // ==================== 视频（t2v 提交 + 轮询） ====================
  console.log('\n== AihubVideoProvider.generateVideo + getTaskStatus（t2v） ==')
  const videoProvider = new AihubVideoProvider({
    id: 'func-test',
    apiKey: jwt,
    baseUrl: `${GATEWAY}/v1`
  } as unknown as VProviderConfig as VideoProviderConfig)
  const submit = await videoProvider.generateVideo({
    model: 'poc-video',
    prompt: '一只奔跑的猫',
    duration: 5
  } as never)
  check('视频任务提交 success + taskId', submit.success === true && !!submit.taskId, submit.error)

  if (submit.taskId) {
    const deadline = Date.now() + 120_000
    let final: Awaited<ReturnType<typeof videoProvider.getTaskStatus>> | null = null
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000))
      const st = await videoProvider.getTaskStatus(submit.taskId)
      if (st.status === 'completed' || st.status === 'failed') {
        final = st
        break
      }
    }
    check('视频任务到终态 completed', final?.status === 'completed', `status=${final?.status} err=${final?.error}`)
    check('视频结果含 URL', !!final?.video?.url, final?.video?.url?.slice(0, 80))
  }

  // ==================== 401 错误映射 ====================
  console.log('\n== 401 错误映射（坏 token） ==')
  const badProvider = new AihubImageProvider({
    id: 'func-test-bad',
    apiKey: 'invalid-jwt',
    baseUrl: `${GATEWAY}/v1`
  } as ImageProviderConfig)
  const badRes = await badProvider.generateImage({
    model: 'poc-image',
    prompt: 'test',
    width: 512,
    height: 512
  } as never)
  check('401 → [AIHUB_SESSION_EXPIRED] 前缀', badRes.success === false && badRes.error?.startsWith('[AIHUB_SESSION_EXPIRED]'), badRes.error?.slice(0, 80))

  console.log(`\n[aihub-func-test] 通过 ${passed} / 失败 ${failed}`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('[aihub-func-test] 异常:', e)
  process.exit(1)
})

/** VideoProviderConfig 从 image types 复用命名，保持与 provider 构造一致 */
type VideoProviderConfig = {
  id: string
  apiKey: string
  baseUrl?: string
  customHeaders?: Record<string, string>
  customParams?: Record<string, unknown>
}
