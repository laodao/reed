/**
 * 待审批项单测（用户要求 2026-09-20：章法产物 → 审批界面确认 → 继续）
 * createChapterReviewApproval：建单 / 同章 pending 复用不堆叠；
 * decideApproval：通过/驳回落终态、已决不可再决、未知 id 返回 null；
 * 标记工具：approvalMarker / extractApprovalMarkers / stripApprovalMarkers。
 */
import { describe, it, expect } from 'vitest'
import { createChapterReviewApproval, decideApproval } from '@core/packs/longwriting/story-room/room-approvals'
import { approvalMarker, extractApprovalMarkers, stripApprovalMarkers } from '@shared/types/story-room.types'

function makeDb(initialRoom: Record<string, unknown> = {}) {
  const project: any = { id: 'p1', name: 'x', type: 'story', stage: 'writing', progress: 0, wizardState: { room: { turnNo: 3, ...initialRoom } } }
  const db = {
    lwProjects: {
      getById: async () => ({ ...project, wizardState: JSON.parse(JSON.stringify(project.wizardState)) }),
      update: async (_id: string, patch: any) => {
        project.wizardState = patch.wizardState
        return { ...project }
      },
    },
  }
  return db
}

const payload = (outlineId = 'o1') => ({
  outlineId,
  chapterNo: 1,
  chapterTitle: '第1章·雪麓下山',
  wordCount: 2321,
  runId: 'wfrun_x',
  postCheck: { passed: false, report: 'R8×3' },
  storyCheck: { ran: true, attractive: true, verdict: '吸引人' },
})

describe('createChapterReviewApproval', () => {
  it('建单：pending、标题带章节名、payload 原样入账', async () => {
    const db = makeDb()
    const { approval } = await createChapterReviewApproval(db, 'p1', payload())
    expect(approval).not.toBeNull()
    expect(approval!.status).toBe('pending')
    expect(approval!.title).toContain('第1章·雪麓下山')
    expect(approval!.payload.runId).toBe('wfrun_x')
    expect(approval!.id).toMatch(/^apr_/)
  })

  it('同一章重复建单复用 pending 单（更新 payload），不堆叠', async () => {
    const db = makeDb()
    await createChapterReviewApproval(db, 'p1', payload())
    const second = await createChapterReviewApproval(db, 'p1', payload())
    expect(second.approvals.filter((a) => a.status === 'pending')).toHaveLength(1)
    expect(second.approvals).toHaveLength(1)
    expect(second.approval!.payload.wordCount).toBe(2321)
  })

  it('不同章各自建单', async () => {
    const db = makeDb()
    await createChapterReviewApproval(db, 'p1', payload('o1'))
    const { approvals } = await createChapterReviewApproval(db, 'p1', payload('o2'))
    expect(approvals).toHaveLength(2)
  })
})

describe('decideApproval', () => {
  it('通过：落 approved + decidedAt + note；审批单保留终态供回看', async () => {
    const db = makeDb()
    const { approval } = await createChapterReviewApproval(db, 'p1', payload())
    const decided = await decideApproval(db, 'p1', approval!.id, 'approve', '整体可以，修一下令牌剧透')
    expect(decided!.status).toBe('approved')
    expect(decided!.decidedAt).toBeGreaterThan(0)
    expect(decided!.note).toContain('令牌')
  })

  it('驳回：落 rejected；已决单不可再次决定（返回 null）', async () => {
    const db = makeDb()
    const { approval } = await createChapterReviewApproval(db, 'p1', payload())
    await decideApproval(db, 'p1', approval!.id, 'reject', '开头太突兀')
    const again = await decideApproval(db, 'p1', approval!.id, 'approve')
    expect(again).toBeNull()
  })

  it('未知 id 返回 null，不抛错', async () => {
    const db = makeDb()
    expect(await decideApproval(db, 'p1', 'apr_nope', 'approve')).toBeNull()
  })
})

describe('审批标记', () => {
  it('marker 可被提取与剥离（全角/半角冒号兼容，空字符串安全）', () => {
    const id = 'apr_1789898403823_9'
    const text = `两段结论如上。\n${approvalMarker(id)}\n`
    expect(extractApprovalMarkers(text)).toEqual([id])
    expect(stripApprovalMarkers(text)).not.toContain('待审批')
    expect(extractApprovalMarkers('')).toEqual([])
    expect(extractApprovalMarkers('[待审批：apr_x]')).toEqual(['apr_x'])
    expect(stripApprovalMarkers('没有标记的正文')).toBe('没有标记的正文')
  })

  it('重复标记去重保序', () => {
    expect(extractApprovalMarkers('[待审批:a] 中间 [待审批:b] 再 [待审批:a]')).toEqual(['a', 'b'])
  })
})
