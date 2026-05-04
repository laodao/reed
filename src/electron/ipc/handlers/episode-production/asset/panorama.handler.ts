/**
 * episode-production · 360 全景 + 视角截图（spec §4.5.10） · IPC handler
 * @module electron/ipc/handlers/episode-production/asset/panorama.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * P3c Task 4 新增 channel（ep:asset:panorama:* · 走 PanoramaGeneratorService / PanoramaSnapshotService）。
 *
 * **重要 · TODO(P3c 后续)**：generate handler 注入的 PanoramaImageGenerator 是 stub 占位 ——
 *   调 generate 直接抛错。真实接入要 wire 到 dashscope panorama / SDXL panorama LoRA 等
 *   2:1 等距投影专用 provider，签名复杂、含 provider 选择，留给 P3c 后续 task 完成；
 *   当前阶段只先把 IPC 契约打通，service 编排逻辑已稳定。
 *   uploadFor / createSnapshot / list / delete 走真实路径，不依赖 imageGen。
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import {
  PanoramaGeneratorService,
  type PanoramaImageGenerator,
  type GenerateForInput,
  type UploadForInput,
} from '@core/modules/episode-production/assets/services/panorama-generator.service'
import {
  PanoramaSnapshotService,
  type SnapshotFileWriter,
  type CreateSnapshotInput,
} from '@core/modules/episode-production/assets/services/panorama-snapshot.service'
import {
  PanoramaUploadService,
  PanoramaUploadValidationError,
} from '@core/modules/episode-production/assets/services/panorama-upload.service'

/**
 * Stub PanoramaImageGenerator：调用 generate 直接抛错。
 * TODO(P3c 后续)：替换为真实 dashscope panorama / SDXL panorama LoRA 适配器。
 */
const stubPanoramaGen: PanoramaImageGenerator = {
  async generate(_opts) {
    throw new Error(
      '360 全景 AI 生成 API 待 P3c 后续接入（dashscope panorama / SDXL panorama LoRA 适配）',
    )
  },
}

/**
 * 真实 SnapshotFileWriter：把 base64 字节落到 `<dataPath>/<targetDir>/<fileName>`，
 * 自动 mkdir -p 父目录，返回完整绝对路径。
 */
const realWriter: SnapshotFileWriter = {
  async writeBase64Image(opts) {
    const dataPath = getPathProvider().getDataPath()
    const fullDir = path.join(dataPath, opts.targetDir)
    await fs.mkdir(fullDir, { recursive: true })
    const fullPath = path.join(fullDir, opts.fileName)
    await fs.writeFile(fullPath, Buffer.from(opts.base64, 'base64'))
    return fullPath
  },
}

/** 截图相对落盘目录（相对 dataPath） */
const SNAPSHOTS_DIR = 'panoramas'

/** 取 DataSource；未初始化则抛错 */
function requireDataSource() {
  const db = getCoreDatabaseManager()
  if (!db.dataSource) {
    throw new Error('数据库未初始化')
  }
  return db.dataSource
}

function imageSvc(): AssetImageService {
  return new AssetImageService(requireDataSource())
}

function genSvc(): PanoramaGeneratorService {
  return new PanoramaGeneratorService(imageSvc(), stubPanoramaGen)
}

function snapshotSvc(): PanoramaSnapshotService {
  return new PanoramaSnapshotService(imageSvc(), realWriter, SNAPSHOTS_DIR)
}

function uploadSvc(): PanoramaUploadService {
  return new PanoramaUploadService(getPathProvider(), genSvc())
}

/** 统一异常包装：捕获 throw 转成 IpcResponse */
async function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  try {
    const data = await fn()
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

export function registerPanoramaHandlers(): void {
  // 360 全景：列表 / 生成 / 上传 / 删除
  ipcBridge.handle(
    'ep:asset:panorama:list',
    async (_event: any, locationBindingId: string) =>
      wrap(() => genSvc().listForLocation(locationBindingId)),
  )

  ipcBridge.handle(
    'ep:asset:panorama:generate',
    async (_event: any, input: GenerateForInput) =>
      wrap(() => genSvc().generateFor(input)),
  )

  ipcBridge.handle(
    'ep:asset:panorama:upload',
    async (_event: any, input: UploadForInput) =>
      wrap(() => genSvc().uploadFor(input)),
  )

  // 文件上传（接 base64 字节流）：核心走 PanoramaUploadService，做完整校验 + 落盘 + 落表
  ipcBridge.handle(
    'ep:asset:panorama:upload-file',
    async (
      _event: any,
      input: {
        fileName: string
        base64: string
        locationBindingId: string
        label?: string | null
      },
    ) =>
      wrap(async () => {
        try {
          return await uploadSvc().upload({
            buffer: Buffer.from(input.base64, 'base64'),
            fileName: input.fileName,
            locationBindingId: input.locationBindingId,
            label: input.label ?? null,
          })
        } catch (e) {
          if (e instanceof PanoramaUploadValidationError) {
            throw new Error(`[${e.code}] ${e.message}`)
          }
          throw e
        }
      }),
  )

  ipcBridge.handle(
    'ep:asset:panorama:delete',
    async (_event: any, id: string) =>
      wrap(async () => {
        await genSvc().deletePanorama(id)
        return { deleted: true }
      }),
  )

  // 视角截图：创建 / 列表 / 删除
  ipcBridge.handle(
    'ep:asset:panorama:create-snapshot',
    async (_event: any, input: CreateSnapshotInput) =>
      wrap(() => snapshotSvc().createSnapshot(input)),
  )

  ipcBridge.handle(
    'ep:asset:panorama:list-snapshots',
    async (_event: any, locationBindingId: string) =>
      wrap(() => snapshotSvc().listSnapshotsForLocation(locationBindingId)),
  )

  ipcBridge.handle(
    'ep:asset:panorama:delete-snapshot',
    async (_event: any, id: string) =>
      wrap(async () => {
        await snapshotSvc().deleteSnapshot(id)
        return { deleted: true }
      }),
  )
}
