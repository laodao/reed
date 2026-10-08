/**
 * 信息搜集：快照文件存储（生产实现；主设计 §3 阶段 2"先保命再解析"）
 * @module core/packs/info-collection/services/ic-snapshot-store
 *
 * 落盘位置：<dataPath>/info-collection/snapshots/<yyyyMM>/<sourceId>.snapshot
 * 文件内容：原始 HTML + '===== IC-SNAPSHOT-MARKDOWN =====' 分隔 + 提取 markdown
 * ——与服务层 readSnapshotMarkdown 的解析约定配套（html 在前保真、md 在后供 kb 导入）。
 * DB 只存相对 dataPath 路径（随数据目录迁移安全，与资产同款约定）。
 * fail-soft：任何 IO 失败返回 null（快照缺失在质量报告如实体现，不阻断管线）。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createLogger } from '@core/utils/logger'
import { getPathProvider } from '@core/interfaces/path.interface'
import type { IcSnapshotStore } from './ic-deps'

const logger = createLogger('IcSnapshotStore')

/** 快照 markdown 分隔符（与 ic-collection.service.readSnapshotMarkdown 配套） */
export const IC_SNAPSHOT_MARKDOWN_MARKER = '\n===== IC-SNAPSHOT-MARKDOWN =====\n'

export class IcSnapshotFileStore implements IcSnapshotStore {
  /** 写入快照；返回相对 dataPath 路径（失败返回 null） */
  async write(projectId: string, sourceId: string, html: string, markdown: string): Promise<string | null> {
    try {
      const relDir = join('info-collection', 'snapshots', this.monthDir())
      const abs = join(this.root(), relDir)
      await mkdir(abs, { recursive: true })
      const rel = join(relDir, `${sourceId}.snapshot`)
      const content = `${html}${IC_SNAPSHOT_MARKDOWN_MARKER}${markdown}`
      await writeFile(join(abs, `${sourceId}.snapshot`), content, 'utf-8')
      void projectId
      return rel
    } catch (e) {
      logger.warn(`[ic] 快照写入失败（继续管线）：${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  /** 读取快照全文（html+marker+md 原样）；失败返回 null */
  async read(path: string): Promise<string | null> {
    try {
      // 防目录逃逸：仅允许 info-collection/snapshots/ 下的相对路径（与资产同款纪律）
      const normalized = path.replace(/\\/g, '/')
      if (normalized.includes('..') || !normalized.startsWith('info-collection/snapshots/')) return null
      const abs = join(this.root(), normalized)
      return await readFile(abs, 'utf-8')
    } catch (e) {
      logger.warn(`[ic] 快照读取失败：${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  private root(): string {
    return getPathProvider().getDataPath()
  }

  private monthDir(): string {
    const now = new Date()
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  }
}
