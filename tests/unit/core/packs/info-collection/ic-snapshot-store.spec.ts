/**
 * 快照文件存储单测（ic-snapshot-store）
 * @module tests/unit/core/packs/info-collection/ic-snapshot-store.spec
 *
 * 钉死：html+markdown 双段格式（marker 配套服务层解析）、相对 dataPath 路径、
 * 目录逃逸防护（../ 与前缀不符拒读）、fail-soft（读不到返回 null 不抛）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerPathProvider } from '@core/interfaces/path.interface'
import { IcSnapshotFileStore, IC_SNAPSHOT_MARKDOWN_MARKER } from '@core/packs/info-collection/services/ic-snapshot-store'

let dataDir = ''
const store = new IcSnapshotFileStore()

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'ic-snap-test-'))
  registerPathProvider(() => ({
    getUserDataPath: () => dataDir,
    getAppDataPath: () => dataDir,
    getTempPath: () => dataDir,
    getDataPath: () => dataDir,
    getSubDirectories: () => ({}) as never,
    getSubDirectoryPath: () => dataDir,
    toAssetUrl: () => '',
  }))
})

afterAll(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

describe('IcSnapshotFileStore', () => {
  it('写入返回相对 dataPath 路径；读回含 html+marker+markdown 三段', async () => {
    const rel = await store.write('p1', 'src-1', '<html>正文HTML</html>', '提取后的正文')
    expect(rel).toMatch(/^info-collection[/\\]snapshots[/\\]\d{6}[/\\]src-1\.snapshot$/)
    const raw = await store.read(rel!)
    expect(raw).toContain('<html>正文HTML</html>')
    expect(raw).toContain(IC_SNAPSHOT_MARKDOWN_MARKER)
    // 服务层解析约定：marker 之后是 markdown 段
    expect(raw!.split(IC_SNAPSHOT_MARKDOWN_MARKER)[1]).toBe('提取后的正文')
  })

  it('目录逃逸拒绝：../ 与非快照前缀 → null（防任意文件读）', async () => {
    expect(await store.read('../secret.txt')).toBeNull()
    expect(await store.read('assets/img/a.png')).toBeNull()
    expect(await store.read('info-collection/other/x.snapshot')).toBeNull()
  })

  it('读不存在的快照 → null（fail-soft 不抛）', async () => {
    expect(await store.read('info-collection/snapshots/209901/ghost.snapshot')).toBeNull()
  })
})
