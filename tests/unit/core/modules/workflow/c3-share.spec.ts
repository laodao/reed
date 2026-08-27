/**
 * C3 分享（免登录独立页）服务测试：enableShare / disableShare / getByShareToken
 * @module tests/workflow/c3-share
 */
import { describe, it, expect } from 'vitest'
import { WorkflowDefinitionService } from '@core/modules/workflow/workflow-definition.service'
import { createNodeRegistry } from '@core/modules/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/modules/workflow/nodes/control-nodes'
import { TASK_NODE_HANDLERS } from '@core/modules/workflow/nodes/task-nodes'

// ---- 内存假仓库 ----
class MemRepo {
  rows: Map<string, any> = new Map()
  async getById(id: string) { return this.rows.get(id) ?? null }
  async update(id: string, patch: any) {
    const row = this.rows.get(id)
    if (!row) return null
    Object.assign(row, patch)
    return { ...row }
  }
  async findByShareToken(token: string) {
    return [...this.rows.values()].find((r: any) => r.shareToken === token && r.publishedVersion > 0) ?? null
  }
}

function setup() {
  const repo = new MemRepo()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS])
  const service = new WorkflowDefinitionService(repo as any, registry)
  return { repo, service }
}

describe('C3 分享：enableShare / disableShare', () => {
  it('已发布定义启用分享 → 返回 64 位 hex 明文令牌；落库只存 sha256 hash（不明文）', async () => {
    const { repo, service } = setup()
    repo.rows.set('d1', { id: 'd1', name: 'wf', publishedVersion: 3, shareToken: null, shareTokenHash: null })
    const r1 = await service.enableShare('d1')
    expect(r1!.shareToken).toMatch(/^[0-9a-f]{64}$/)
    // 明文只出现在响应；库中 share_token 为 null、share_token_hash 为 sha256
    expect(repo.rows.get('d1').shareToken).toBeNull()
    expect(repo.rows.get('d1').shareTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(repo.rows.get('d1').shareTokenHash).not.toBe(r1!.shareToken)
  })

  it('重复启用 → 轮换新令牌（旧令牌立即失效）', async () => {
    const { repo, service } = setup()
    repo.rows.set('d1', { id: 'd1', name: 'wf', publishedVersion: 3, shareToken: null, shareTokenHash: null })
    const r1 = await service.enableShare('d1')
    const firstHash = repo.rows.get('d1').shareTokenHash
    const r2 = await service.enableShare('d1')
    expect(r2!.shareToken).not.toBe(r1!.shareToken)
    expect(repo.rows.get('d1').shareTokenHash).not.toBe(firstHash) // 轮换 → 新 hash
  })

  it('未发布定义不可分享', async () => {
    const { repo, service } = setup()
    repo.rows.set('d2', { id: 'd2', name: 'wf', publishedVersion: 0, shareToken: null })
    await expect(service.enableShare('d2')).rejects.toThrow('发布')
  })

  it('停止分享清除令牌 hash 与历史明文 → 历史链接立即失效', async () => {
    const { repo, service } = setup()
    repo.rows.set('d3', { id: 'd3', name: 'wf', publishedVersion: 1, shareToken: 'tok_abc', shareTokenHash: 'h'.repeat(64), userId: 'u1' })
    await service.disableShare('d3')
    expect(repo.rows.get('d3').shareToken).toBeNull()
    expect(repo.rows.get('d3').shareTokenHash).toBeNull()
    expect(await repo.findByShareToken('tok_abc')).toBeNull()
  })
})

describe('C3 分享：getByShareToken 形态守卫', () => {
  it('非法形态令牌直接 null（不查库，防注入/滥用）', async () => {
    const { service } = setup()
    expect(await service.getByShareToken('')).toBeNull()
    expect(await service.getByShareToken("'; DROP TABLE--")).toBeNull()
  })

  it('合法令牌查已发布定义', async () => {
    const { repo, service } = setup()
    repo.rows.set('d4', { id: 'd4', name: 'wf', publishedVersion: 2, shareToken: 'a'.repeat(64), userId: 'u9' })
    const found = await service.getByShareToken('a'.repeat(64))
    expect(found).toMatchObject({ id: 'd4', userId: 'u9' })
  })
})
