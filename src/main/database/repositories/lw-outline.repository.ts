/**
 * 长文写作大纲仓库
 * @module database/repositories/lw-outline.repository
 */

import Database from 'better-sqlite3'
import {
  StoryOutline,
  CreateOutlineRequest,
  UpdateOutlineRequest
} from '../../../shared/types/longwriting.types'

export class LwOutlineRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有大纲节点
   */
  getByProjectId(projectId: string): StoryOutline[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_outlines WHERE project_id = ? ORDER BY order_index ASC, created_at ASC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapToOutline)
  }

  /**
   * 获取树形大纲结构
   */
  getTreeByProjectId(projectId: string): StoryOutline[] {
    const allNodes = this.getByProjectId(projectId)
    return this.buildTree(allNodes)
  }

  /**
   * 根据 ID 获取大纲节点
   */
  getById(id: string): StoryOutline | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_outlines WHERE id = ?
    `)
    const row = stmt.get(id) as any
    return row ? this.mapToOutline(row) : null
  }

  /**
   * 获取子节点
   */
  getChildren(parentId: string): StoryOutline[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_outlines WHERE parent_id = ? ORDER BY order_index ASC
    `)
    const rows = stmt.all(parentId) as any[]
    return rows.map(this.mapToOutline)
  }

  /**
   * 创建大纲节点
   */
  create(data: CreateOutlineRequest): StoryOutline {
    const id = this.generateId()
    const now = Date.now()
    const level = data.parentId ? this.calculateLevel(data.parentId) : 1
    const orderIndex = this.getNextOrderIndex(data.projectId, data.parentId)

    const stmt = this.db.prepare(`
      INSERT INTO lw_story_outlines (
        id, project_id, parent_id, name, level, node_type, summary,
        involved_characters, involved_locations, status, estimated_words, order_index,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `)

    stmt.run(
      id, data.projectId, data.parentId || null, data.name, level,
      data.nodeType, data.summary || '', JSON.stringify(data.involvedCharacters || []),
      JSON.stringify(data.involvedLocations || []), data.estimatedWords || 0, orderIndex,
      now, now
    )

    return {
      id,
      projectId: data.projectId,
      parentId: data.parentId,
      name: data.name,
      level,
      nodeType: data.nodeType,
      summary: data.summary || '',
      involvedCharacters: data.involvedCharacters || [],
      involvedLocations: data.involvedLocations || [],
      status: 'pending',
      estimatedWords: data.estimatedWords || 0,
      orderIndex,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新大纲节点
   */
  update(id: string, data: UpdateOutlineRequest): StoryOutline | null {
    const outline = this.getById(id)
    if (!outline) return null

    const updates: string[] = []
    const values: any[] = []

    const fieldMap: Record<string, any> = {
      name: data.name,
      summary: data.summary,
      involved_characters: data.involvedCharacters ? JSON.stringify(data.involvedCharacters) : undefined,
      involved_locations: data.involvedLocations ? JSON.stringify(data.involvedLocations) : undefined,
      status: data.status,
      estimated_words: data.estimatedWords
    }

    for (const [field, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        updates.push(`${field} = ?`)
        values.push(value)
      }
    }

    if (updates.length === 0) return outline

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_story_outlines SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 更新排序索引
   */
  updateOrder(id: string, orderIndex: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE lw_story_outlines SET order_index = ?, updated_at = ? WHERE id = ?
    `)
    const result = stmt.run(orderIndex, Date.now(), id)
    return result.changes > 0
  }

  /**
   * 移动节点（更改父节点）
   */
  moveTo(id: string, newParentId: string | null): boolean {
    const outline = this.getById(id)
    if (!outline) return false

    const newLevel = newParentId ? this.calculateLevel(newParentId) + 1 : 1
    const newOrderIndex = this.getNextOrderIndex(outline.projectId, newParentId)

    const stmt = this.db.prepare(`
      UPDATE lw_story_outlines SET parent_id = ?, level = ?, order_index = ?, updated_at = ? WHERE id = ?
    `)
    const result = stmt.run(newParentId, newLevel, newOrderIndex, Date.now(), id)
    return result.changes > 0
  }

  /**
   * 删除大纲节点（及其子节点）
   */
  delete(id: string): boolean {
    // 先删除子节点
    const children = this.getChildren(id)
    for (const child of children) {
      this.delete(child.id)
    }

    // 删除当前节点
    const stmt = this.db.prepare('DELETE FROM lw_story_outlines WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 计算节点层级
   */
  private calculateLevel(parentId: string): number {
    const parent = this.getById(parentId)
    return parent ? parent.level : 0
  }

  /**
   * 获取下一个排序索引
   */
  private getNextOrderIndex(projectId: string, parentId: string | null): number {
    const stmt = this.db.prepare(`
      SELECT MAX(order_index) as max_index FROM lw_story_outlines
      WHERE project_id = ? AND parent_id ${parentId ? '= ?' : 'IS NULL'}
    `)
    const result = parentId
      ? stmt.get(projectId, parentId) as any
      : stmt.get(projectId) as any
    return (result?.max_index || 0) + 1
  }

  /**
   * 构建树形结构
   */
  private buildTree(nodes: StoryOutline[]): StoryOutline[] {
    const nodeMap = new Map<string, StoryOutline>()
    const rootNodes: StoryOutline[] = []

    // 先创建映射
    for (const node of nodes) {
      nodeMap.set(node.id, { ...node, children: [] } as any)
    }

    // 构建树
    for (const node of nodes) {
      const currentNode = nodeMap.get(node.id)!
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)! as any
        if (!parent.children) parent.children = []
        parent.children.push(currentNode)
      } else {
        rootNodes.push(currentNode)
      }
    }

    return rootNodes
  }

  private generateId(): string {
    return `outline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private mapToOutline(row: any): StoryOutline {
    return {
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id,
      name: row.name,
      level: row.level,
      nodeType: row.node_type,
      summary: row.summary || '',
      involvedCharacters: this.parseJsonArray(row.involved_characters),
      involvedLocations: this.parseJsonArray(row.involved_locations),
      status: row.status,
      estimatedWords: row.estimated_words || 0,
      orderIndex: row.order_index || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private parseJsonArray(jsonStr: string | null): string[] {
    if (!jsonStr) return []
    try {
      return JSON.parse(jsonStr)
    } catch {
      return []
    }
  }
}