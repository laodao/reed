/**
 * 孤儿参考图清扫测试（评审 #57）
 * @description 临时目录模拟 asset-images/：被引用保留、新文件保留、孤儿删除、
 *              目录不存在不报错。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { MainImageUploadService } from '@core/modules/episode-production/assets/services/main-image-upload.service'
import type { IPathProvider } from '@core/interfaces/path.interface'

let tmpDir: string

function makeSvc(imagePaths: string[]): MainImageUploadService {
  const pathProvider: IPathProvider = { getDataPath: () => tmpDir } as unknown as IPathProvider
  const imageService = { listAllImagePaths: async () => imagePaths } as any
  return new MainImageUploadService(pathProvider, imageService)
}

async function touchRef(name: string, mtimeMs: number): Promise<void> {
  const abs = path.join(tmpDir, 'asset-images', name)
  await fs.writeFile(abs, 'x')
  await fs.utimes(abs, new Date(mtimeMs), new Date(mtimeMs))
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orphan-sweep-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('sweepOrphanReferenceFiles（评审#57）', () => {
  it('孤儿（超 24h 且无引用）删除；被引用保留；新文件保留', async () => {
    const old = Date.now() - 25 * 60 * 60 * 1000
    const fresh = Date.now() - 1000
    await fs.mkdir(path.join(tmpDir, 'asset-images'), { recursive: true })
    await touchRef('ref-1-old.png', old)             // 孤儿 → 删
    await touchRef('ref-2-fresh.png', fresh)          // 太新 → 留
    await touchRef('ref-3-referenced.png', old)       // 被 asset_images 引用 → 留
    await touchRef('main-4.png', old)                 // 非 ref- 前缀 → 不在扫描范围

    const svc = makeSvc(['asset-images/ref-3-referenced.png'])
    const r = await svc.sweepOrphanReferenceFiles()
    expect(r.scanned).toBe(3)
    expect(r.deleted).toEqual(['asset-images/ref-1-old.png'])
    const remain = await fs.readdir(path.join(tmpDir, 'asset-images'))
    expect(remain.sort()).toEqual(['main-4.png', 'ref-2-fresh.png', 'ref-3-referenced.png'])
  })

  it('asset-images 目录不存在 → 0 扫描不报错', async () => {
    const svc = makeSvc([])
    const r = await svc.sweepOrphanReferenceFiles()
    expect(r).toEqual({ scanned: 0, deleted: [] })
  })
})
