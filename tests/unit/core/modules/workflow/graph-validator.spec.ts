/**
 * 工作流图校验器测试
 * @module tests/workflow/graph-validator
 * @description 覆盖：基础结构（缺/多 start、边引用、未知类型）、环检测（loop-back 豁免）、
 *              可达性警告、条件分支约束、审核节点出边、fail 出边唯一性、config 必填
 */
import { describe, it, expect } from 'vitest'
import { validateGraph } from '@core/modules/workflow/engine/graph-validator'
import type { WorkflowGraph, WorkflowNode, WorkflowEdgeKind } from '@shared/types/workflow.types'

/** 构造普通节点的辅助函数 */
function makeNode(
  id: string,
  type: WorkflowNode['type'],
  overrides: Partial<WorkflowNode> = {}
): WorkflowNode {
  const base: WorkflowNode = {
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    config: {} as WorkflowNode['config'],
  }
  return { ...base, ...overrides }
}

/** 构造 condition 节点的合法配置 */
function makeConditionConfig(): any {
  return {
    branches: [
      {
        branchId: 'br1',
        label: '分支一',
        conditions: [{ left: '{{llm1.score}}', operator: 'gt', right: '0.5' }],
      },
    ],
    noMatchPolicy: 'fallback',
    fallbackBranchId: 'br1',
  }
}

/** 构造图的辅助函数 */
function makeGraph(
  nodes: WorkflowNode[],
  edges: Array<{ source: string; target: string; kind?: WorkflowEdgeKind; branchId?: string }>
): WorkflowGraph {
  return {
    version: 1,
    nodes,
    edges: edges.map((e, i) => ({
      id: `e${i}`,
      sourceNodeId: e.source,
      targetNodeId: e.target,
      kind: e.kind ?? 'normal',
      branchId: e.branchId,
    })),
  }
}

describe('validateGraph 基础结构', () => {
  it('合法的线性图通过校验', () => {
    const graph = makeGraph(
      [makeNode('start', 'start'), makeNode('llm1', 'llm-chat'), makeNode('end', 'end')],
      [{ source: 'start', target: 'llm1' }, { source: 'llm1', target: 'end' }]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('缺少 start 节点报错', () => {
    const graph = makeGraph(
      [makeNode('llm1', 'llm-chat'), makeNode('end', 'end')],
      [{ source: 'llm1', target: 'end' }]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('start'))).toBe(true)
  })

  it('多个 start 节点报错', () => {
    const graph = makeGraph(
      [makeNode('s1', 'start'), makeNode('s2', 'start'), makeNode('end', 'end')],
      [{ source: 's1', target: 'end' }, { source: 's2', target: 'end' }]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('start'))).toBe(true)
  })

  it('边引用不存在的节点报错', () => {
    const graph = makeGraph(
      [makeNode('start', 'start'), makeNode('end', 'end')],
      [{ source: 'start', target: 'ghost' }]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('ghost'))).toBe(true)
  })

  it('未知节点类型报错', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('x1', 'nonexistent-type' as any),
        makeNode('end', 'end'),
      ],
      [{ source: 'start', target: 'x1' }, { source: 'x1', target: 'end' }]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('nonexistent-type'))).toBe(true)
  })
})

describe('validateGraph 环检测', () => {
  it('普通节点形成的环报错', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('a', 'llm-chat'),
        makeNode('b', 'llm-chat'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'a' },
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' }, // 环
        { source: 'b', target: 'end' },
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('环'))).toBe(true)
  })

  it('loop-back 边指向循环节点被豁免（合法）', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('loop1', 'loop', {
          config: { listExpression: '{{start.items}}' } as any,
        }),
        makeNode('body', 'llm-chat'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'loop1' },
        { source: 'loop1', target: 'body', kind: 'loop-body' },
        { source: 'body', target: 'loop1', kind: 'loop-back' },
        { source: 'loop1', target: 'end', kind: 'loop-done' },
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(true)
  })

  it('loop-back 边指向非循环节点报错', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('loop1', 'loop', { config: { listExpression: '{{start.items}}' } as any }),
        makeNode('body', 'llm-chat'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'loop1' },
        { source: 'loop1', target: 'body', kind: 'loop-body' },
        { source: 'body', target: 'end', kind: 'loop-back' }, // 指向 end 而不是 loop 节点
        { source: 'loop1', target: 'end', kind: 'loop-done' },
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
  })

  it('loop 节点必须有 loop-body 和 loop-done 出边', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('loop1', 'loop', { config: { listExpression: '{{start.items}}' } as any }),
        makeNode('body', 'llm-chat'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'loop1' },
        { source: 'loop1', target: 'body', kind: 'loop-body' },
        { source: 'body', target: 'loop1', kind: 'loop-back' },
        // 缺 loop-done 出边
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('loop-done'))).toBe(true)
  })
})

describe('validateGraph 可达性', () => {
  it('不可达节点产生警告（不阻断）', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('llm1', 'llm-chat'),
        makeNode('end', 'end'),
        makeNode('orphan', 'llm-chat'), // 无入边
      ],
      [{ source: 'start', target: 'llm1' }, { source: 'llm1', target: 'end' }]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(true)
    expect(result.warnings.some(w => w.includes('orphan'))).toBe(true)
  })
})

describe('validateGraph 条件分支约束', () => {
  it('condition 节点必须有 branch 出边', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('cond1', 'condition', { config: makeConditionConfig() }),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'cond1' },
        { source: 'cond1', target: 'end', kind: 'normal' }, // 用了 normal 而不是 branch
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('cond1'))).toBe(true)
  })

  it('branch 出边必须带 branchId 且在 config.branches 中声明', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('cond1', 'condition', { config: makeConditionConfig() }),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'cond1' },
        { source: 'cond1', target: 'end', kind: 'branch', branchId: 'brX' }, // 未声明
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('brX'))).toBe(true)
  })

  it('condition 合法多路分支通过', () => {
    const config = makeConditionConfig()
    config.branches.push({
      branchId: 'br2',
      label: '分支二',
      conditions: [{ left: '{{llm1.score}}', operator: 'lte', right: '0.5' }],
    })
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('cond1', 'condition', { config }),
        makeNode('a', 'llm-chat'),
        makeNode('b', 'llm-chat'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'cond1' },
        { source: 'cond1', target: 'a', kind: 'branch', branchId: 'br1' },
        { source: 'cond1', target: 'b', kind: 'branch', branchId: 'br2' },
        { source: 'a', target: 'end' },
        { source: 'b', target: 'end' },
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(true)
  })

  it('声明的分支没有连接出边报错（防运行时静默吞分支）', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('cond1', 'condition', {
          config: {
            branches: [
              { branchId: 'br1', label: '一', conditions: [{ left: 'a', operator: 'eq', right: 'b' }] },
              { branchId: 'br2', label: '二', conditions: [{ left: 'a', operator: 'ne', right: 'b' }] }, // 未连线
            ],
            noMatchPolicy: 'fail',
          },
        }),
        makeNode('a', 'llm-chat'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'cond1' },
        { source: 'cond1', target: 'a', kind: 'branch', branchId: 'br1' },
        { source: 'a', target: 'end' },
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('br2'))).toBe(true)
  })

  it('fallback 分支没有出边报错', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('cond1', 'condition', {
          config: {
            branches: [
              { branchId: 'br1', label: '一', conditions: [{ left: 'a', operator: 'eq', right: 'b' }] },
              { branchId: 'fb', label: '兜底', conditions: [] },
            ],
            noMatchPolicy: 'fallback',
            fallbackBranchId: 'fb',
          },
        }),
        makeNode('a', 'llm-chat'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'cond1' },
        { source: 'cond1', target: 'a', kind: 'branch', branchId: 'br1' },
        { source: 'a', target: 'end' },
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('fb'))).toBe(true)
  })

  it('同一 branchId 不允许接多条出边（显式并行原则）', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('cond1', 'condition', { config: makeConditionConfig() }),
        makeNode('a', 'llm-chat'),
        makeNode('b', 'llm-chat'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'cond1' },
        { source: 'cond1', target: 'a', kind: 'branch', branchId: 'br1' },
        { source: 'cond1', target: 'b', kind: 'branch', branchId: 'br1' }, // 重复 branchId
        { source: 'a', target: 'end' },
        { source: 'b', target: 'end' },
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
  })
})

describe('validateGraph 节点出边约束', () => {
  it('human-review 必须有 approve 出边', () => {
    const graph = makeGraph(
      [makeNode('start', 'start'), makeNode('rev1', 'human-review'), makeNode('end', 'end')],
      [
        { source: 'start', target: 'rev1' },
        { source: 'rev1', target: 'end', kind: 'normal' }, // 缺 approve
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('rev1'))).toBe(true)
  })

  it('human-review 有 approve（可选 reject）出边合法', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('rev1', 'human-review'),
        makeNode('ok', 'llm-chat'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'rev1' },
        { source: 'rev1', target: 'ok', kind: 'approve' },
        { source: 'rev1', target: 'end', kind: 'reject' },
        { source: 'ok', target: 'end' },
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(true)
  })

  it('fail 出边最多一条', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('llm1', 'llm-chat'),
        makeNode('f1', 'llm-chat'),
        makeNode('f2', 'llm-chat'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'llm1' },
        { source: 'llm1', target: 'end' },
        { source: 'llm1', target: 'f1', kind: 'fail' },
        { source: 'llm1', target: 'f2', kind: 'fail' }, // 第二条 fail
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('fail'))).toBe(true)
  })

  it('普通节点（如 llm-chat）不允许 approve 出边', () => {
    const graph = makeGraph(
      [makeNode('start', 'start'), makeNode('llm1', 'llm-chat'), makeNode('end', 'end')],
      [
        { source: 'start', target: 'llm1' },
        { source: 'llm1', target: 'end', kind: 'approve' },
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
  })

  it('非 parallel 节点不允许多条 normal 出边（显式并行原则）', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('llm1', 'llm-chat'),
        makeNode('a', 'llm-chat'),
        makeNode('b', 'llm-chat'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'llm1' },
        { source: 'llm1', target: 'a' },
        { source: 'llm1', target: 'b' }, // 第二条 normal 出边
        { source: 'a', target: 'end' },
        { source: 'b', target: 'end' },
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
  })

  it('parallel 节点允许多条 normal 出边（扇出合法）', () => {
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('p1', 'parallel'),
        makeNode('a', 'llm-chat'),
        makeNode('b', 'llm-chat'),
        makeNode('m1', 'parallel-merge'),
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'p1' },
        { source: 'p1', target: 'a' },
        { source: 'p1', target: 'b' },
        { source: 'a', target: 'm1' },
        { source: 'b', target: 'm1' },
        { source: 'm1', target: 'end' },
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(true)
  })

  it('start 节点不允许有入边', () => {
    const graph = makeGraph(
      [makeNode('start', 'start'), makeNode('llm1', 'llm-chat'), makeNode('end', 'end')],
      [
        { source: 'start', target: 'llm1' },
        { source: 'llm1', target: 'end' },
        { source: 'llm1', target: 'start' }, // 入边回到 start
      ]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
  })
})

describe('validateGraph 循环体边界（body 子图语义）', () => {
  /** 构造合法循环骨架图：start → loop(loop1) ⇄ body → end(loop-done) */
  function makeLoopGraph(
    extraEdges: Array<{ source: string; target: string; kind?: any }> = [],
    bodyNodes: WorkflowNode[] = []
  ) {
    return makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('loop1', 'loop', { config: { listExpression: '{{start.items}}' } as any }),
        makeNode('body', 'llm-chat'),
        ...bodyNodes,
        makeNode('end', 'end'),
      ],
      [
        { source: 'start', target: 'loop1' },
        { source: 'loop1', target: 'body', kind: 'loop-body' },
        { source: 'body', target: 'loop1', kind: 'loop-back' },
        { source: 'loop1', target: 'end', kind: 'loop-done' },
        ...extraEdges,
      ]
    )
  }

  it('循环体内节点出边逃逸到循环外报错', () => {
    // body 直接连 end（非 loop-back），无法判断 end 是每迭代执行还是循环后执行
    const graph = makeLoopGraph([{ source: 'body', target: 'end', kind: 'normal' }])
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('逃逸') || e.includes('循环体'))).toBe(true)
  })

  it('嵌套循环报错（V1 不支持）', () => {
    const graph = makeLoopGraph(
      [{ source: 'body', target: 'loop2', kind: 'normal' }],
      [makeNode('loop2', 'loop', { config: { listExpression: '{{start.items}}' } as any })]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('嵌套'))).toBe(true)
  })
})
