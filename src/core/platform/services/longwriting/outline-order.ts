/**
 * 大纲"文档序章号"原语（复核修复 P1-1）
 * @module core/platform/services/longwriting/outline-order
 *
 * 背景：lw_outlines.orderIndex 是「兄弟序」——每父节点内编号（getNextOrderIndex
 * 按 parentId 取 MAX+1），这是树形 UI 的正确语义。但「第几章」需要的是**文档序**
 * （卷→章→节 DFS 遍历，兄弟按 orderIndex 升序）。旧实现各自把全项目节点按
 * orderIndex **扁平排序**推章号：单卷扁平树碰巧正确，多卷树从第二卷起全局排序
 * 交错、含节树把节混进章——一致性规则 R1-R9 的时间线、章节图谱流水线的
 * chapterNumber、逐章门禁全部受累。
 *
 * 本模块是章号的唯一权威：所有需要「第 N 章」的消费方一律经由此处。
 * 纯函数（无 IO），便于单测；调用方传入 lwOutlines.getByProjectId 的扁平列表。
 *
 * 「可写节点」= nodeType 为 chapter 或 section：与 saveChapter 按 outlineId 存正文
 * 的语义一致（章可直挂正文也可挂节，两者都是生成/保存目标）。单卷扁平章树的
 * 编号结果与旧扁平排序完全一致（无回归）。
 */

export interface OutlineNodeLike {
  id: string
  parentId?: string | null
  nodeType?: string
  orderIndex?: number | null
}

const WRITABLE_NODE_TYPES = new Set(['chapter', 'section'])

/** 是否为可写节点（章/节——正文按 outlineId 挂载的目标） */
export function isWritableOutlineNode(node: OutlineNodeLike): boolean {
  return WRITABLE_NODE_TYPES.has(node.nodeType ?? '')
}

export interface OutlineDocOrder {
  /** 可写节点 id → 文档序章号（1 起） */
  leafNumbers: Map<string, number>
  /** 文档序全量节点（父先于子，兄弟按 orderIndex；含卷，供顺序消费） */
  ordered: OutlineNodeLike[]
}

/**
 * 按文档序（DFS）为大纲节点编号。
 * 节点数为 O(n)，DFS 为 O(n)；孤儿节点（parentId 指向不存在节点）按根处理，
 * 兄弟排序键缺省按 0（稳定排序保创建顺序由调用方排序质量决定）。
 */
export function buildOutlineDocOrder(nodes: OutlineNodeLike[]): OutlineDocOrder {
  const byId = new Map<string, OutlineNodeLike>()
  for (const n of nodes) byId.set(n.id, n)

  const childrenOf = new Map<string, OutlineNodeLike[]>()
  const roots: OutlineNodeLike[] = []
  for (const n of nodes) {
    const parentKey = n.parentId && byId.has(n.parentId) ? n.parentId : ''
    if (parentKey) {
      const list = childrenOf.get(parentKey) ?? []
      list.push(n)
      childrenOf.set(parentKey, list)
    } else {
      roots.push(n)
    }
  }
  const byOrder = (a: OutlineNodeLike, b: OutlineNodeLike) =>
    (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
  roots.sort(byOrder)
  for (const list of childrenOf.values()) list.sort(byOrder)

  const ordered: OutlineNodeLike[] = []
  const leafNumbers = new Map<string, number>()
  let leafNo = 0
  const visit = (node: OutlineNodeLike): void => {
    ordered.push(node)
    if (isWritableOutlineNode(node)) {
      leafNo += 1
      leafNumbers.set(node.id, leafNo)
    }
    for (const child of childrenOf.get(node.id) ?? []) visit(child)
  }
  for (const root of roots) visit(root)

  return { leafNumbers, ordered }
}

/**
 * 取某大纲节点的章号；非可写节点（卷）或未知 id 返回 null——
 * 调用方按业务语义兜底（多数场景兜 1）。
 */
export function outlineChapterNumber(
  order: OutlineDocOrder,
  outlineId: string,
): number | null {
  return order.leafNumbers.get(outlineId) ?? null
}
