/**
 * 层级信息构建器
 * @module services/chunk-splitter/hierarchy-builder
 * @description 为切分后的 chunks 添加层级信息
 */

import { SplitChunk } from './types'

/**
 * 层级信息构建器
 */
export class HierarchyBuilder {
  /**
   * 为子 chunks 添加层级信息（继承父 chunk）
   * @param subChunks 子 chunks
   * @param parentChunk 父 chunk
   * @returns 带层级信息的 chunks
   */
  build(subChunks: SplitChunk[], parentChunk: SplitChunk): SplitChunk[] {
    // 生成父 chunk ID 映射
    const parentId = this.generateParentId(parentChunk)

    return subChunks.map((chunk, index) => ({
      ...chunk,
      // 第一个子 chunk 继承父标题，其他无标题
      title: index === 0 ? parentChunk.title : undefined,
      // 层级递增
      level: parentChunk.level + 1,
      // 设置父 chunk ID
      parentChunkId: parentId,
      // 继承父 chunk 的层级路径，添加当前路径
      sectionPath: this.extendSectionPath(parentChunk.sectionPath, chunk.sectionPath),
      // 标记为子语义切分
      splitMethod: 'sub-semantic'
    }))
  }

  /**
   * 生成父 chunk ID（用于存储）
   */
  private generateParentId(chunk: SplitChunk): string {
    // 使用 chunk 的起始位置作为临时 ID
    // 在实际存储时，会使用真实的 chunk ID
    return `temp_${chunk.startOffset}_${chunk.endOffset}`
  }

  /**
   * 扩展层级路径
   */
  private extendSectionPath(parentPath: string[], childPath: string[]): string[] {
    // 如果 childPath 为空，返回 parentPath
    if (childPath.length === 0) {
      return parentPath
    }

    // 合并路径，去重
    const merged = [...parentPath]
    for (const section of childPath) {
      if (!merged.includes(section)) {
        merged.push(section)
      }
    }

    return merged
  }

  /**
   * 设置真实的父 chunk ID
   * @param chunks 所有 chunks
   * @param parentIdMap 临时 ID 到真实 ID 的映射
   */
  setRealParentIds(chunks: SplitChunk[], parentIdMap: Map<string, string>): SplitChunk[] {
    return chunks.map(chunk => {
      if (chunk.parentChunkId && parentIdMap.has(chunk.parentChunkId)) {
        return {
          ...chunk,
          parentChunkId: parentIdMap.get(chunk.parentChunkId)!
        }
      }
      return chunk
    })
  }
}