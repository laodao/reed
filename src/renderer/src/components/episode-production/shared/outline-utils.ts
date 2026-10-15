/**
 * 大纲树/级联选择工具
 * 拆自 VideoProjectEditor.vue，供各组件复用
 */

/**
 * 大纲树节点
 */
export interface OutlineTreeNode {
  id: string
  name: string
  nodeType: 'volume' | 'chapter' | 'section'
  orderIndex: number
  children?: OutlineTreeNode[]
  volumeOrder?: number
  volumeName?: string
  volumePosition?: number
  chapterOrder?: number
  chapterName?: string
  chapterPosition?: number
  sectionPosition?: number
}

/**
 * 树形组件 props 配置
 */
export const outlineTreeProps = {
  children: 'children',
  label: 'name'
}

/**
 * 级联选择器 props 配置
 */
export const outlineCascaderProps = {
  value: 'id',
  label: 'name',
  children: 'children',
  checkStrictly: false,
  emitPath: false
}

/**
 * 将原始大纲数据转换为树形结构
 * 使用位置序号（从1开始）而非数据库 orderIndex
 */
export function buildOutlineTree(outlines: any[]): OutlineTreeNode[] {
  const volumes: any[] = outlines.filter(o => o.nodeType === 'volume').sort((a, b) => a.orderIndex - b.orderIndex)
  const chaptersData: any[] = outlines.filter(o => o.nodeType === 'chapter').sort((a, b) => a.orderIndex - b.orderIndex)
  const sections: any[] = outlines.filter(o => o.nodeType === 'section').sort((a, b) => a.orderIndex - b.orderIndex)

  const tree: OutlineTreeNode[] = []

  let volumeNumber = 0
  for (const volume of volumes) {
    volumeNumber++
    const volumeNode: OutlineTreeNode = {
      id: volume.id,
      name: volume.name,
      nodeType: 'volume',
      orderIndex: volume.orderIndex,
      volumePosition: volumeNumber,
      children: []
    }

    const volumeChapters = chaptersData.filter(c => c.parentId === volume.id)
    let chapterNumber = 0
    for (const chapter of volumeChapters) {
      chapterNumber++
      const chapterNode: OutlineTreeNode = {
        id: chapter.id,
        name: chapter.name,
        nodeType: 'chapter',
        orderIndex: chapter.orderIndex,
        volumeOrder: volumeNumber,
        volumeName: volume.name,
        chapterPosition: chapterNumber,
        children: []
      }

      const chapterSections = sections.filter(s => s.parentId === chapter.id)
      let sectionNumber = 0
      for (const section of chapterSections) {
        sectionNumber++
        const sectionNode: OutlineTreeNode = {
          id: section.id,
          name: section.name,
          nodeType: 'section',
          orderIndex: section.orderIndex,
          volumeOrder: volumeNumber,
          volumeName: volume.name,
          chapterOrder: chapterNumber,
          chapterName: chapter.name,
          sectionPosition: sectionNumber
        }
        chapterNode.children!.push(sectionNode)
      }

      volumeNode.children!.push(chapterNode)
    }

    tree.push(volumeNode)
  }

  // 处理没有卷的情况，直接是章节
  if (volumes.length === 0 && chaptersData.length > 0) {
    let chapterNumber = 0
    for (const chapter of chaptersData) {
      chapterNumber++
      const chapterNode: OutlineTreeNode = {
        id: chapter.id,
        name: chapter.name,
        nodeType: 'chapter',
        orderIndex: chapter.orderIndex,
        chapterPosition: chapterNumber,
        children: []
      }

      const chapterSections = sections.filter(s => s.parentId === chapter.id)
      let sectionNumber = 0
      for (const section of chapterSections) {
        sectionNumber++
        const sectionNode: OutlineTreeNode = {
          id: section.id,
          name: section.name,
          nodeType: 'section',
          orderIndex: section.orderIndex,
          chapterOrder: chapterNumber,
          chapterName: chapter.name,
          sectionPosition: sectionNumber
        }
        chapterNode.children!.push(sectionNode)
      }

      tree.push(chapterNode)
    }
  }

  return tree
}

/**
 * 级联选择器数据：只保留节级别可选，卷/章作为分组
 */
export function buildOutlineCascaderData(tree: OutlineTreeNode[]): any[] {
  return tree.map(volume => ({
    id: volume.id,
    name: volume.name,
    nodeType: volume.nodeType,
    children: volume.children?.map(chapter => ({
      id: chapter.id,
      name: chapter.name,
      nodeType: chapter.nodeType,
      children: chapter.children
        ?.filter(section => section.nodeType === 'section')
        .map(section => ({
          id: section.id,
          name: section.name,
          nodeType: section.nodeType,
          volumeOrder: section.volumeOrder,
          volumeName: section.volumeName,
          chapterOrder: section.chapterOrder,
          chapterName: section.chapterName,
          sectionPosition: section.sectionPosition
        }))
    }))
  }))
}

/**
 * 在树中查找指定 id 的节点
 */
export function findOutlineNode(nodes: OutlineTreeNode[], id: string): OutlineTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findOutlineNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * 过滤大纲节点（用于树形搜索）
 */
export function filterOutlineNode(value: string, data: OutlineTreeNode): boolean {
  if (!value) return true
  return data.name.toLowerCase().includes(value.toLowerCase())
}
