import { describe, expect, it } from 'vitest'
import {
  annotateRefsWithSlots,
  buildAssetRefPrompt,
  type SegmentAssetRef,
} from '@core/platform/episode-production/render/video/asset-ref-resolver'
import type { ReferenceBoardMember } from '@core/platform/episode-production/render/keyframe/reference-board.service'

function ref(name: string, kind: SegmentAssetRef['kind'] = 'character'): SegmentAssetRef {
  return {
    kind,
    bindingId: `b_${name}`,
    name,
    assetImageId: `img_${name}`,
    imagePath: `/tmp/${name}.png`,
  }
}

describe('annotateRefsWithSlots', () => {
  it('标注每个资产名的首次出现为参考板编号', () => {
    const out = annotateRefsWithSlots('沈云萝拉着秦越往山下走，沈云萝回头笑。', [ref('沈云萝'), ref('秦越')])
    expect(out).toBe('沈云萝（参考板第1号）拉着秦越（参考板第2号）往山下走，沈云萝回头笑。')
  })

  it('嵌套名：长名优先，短名不得标进长名前缀', () => {
    const out = annotateRefsWithSlots('雪麓山庄书房里，掌门看着雪麓山庄的方向。', [
      ref('雪麓山庄', 'location'),
      ref('雪麓山庄书房', 'location'),
    ])
    expect(out).toBe('雪麓山庄书房（参考板第2号）里，掌门看着雪麓山庄（参考板第1号）的方向。')
  })

  it('编号与 refs 顺序（参考板分块顺序）一致', () => {
    // collectSegmentAssetRefs 的稳定顺序：地点 → 角色 → 道具
    const refs = [ref('白鹿城', 'location'), ref('沈云萝'), ref('秦越')]
    const out = annotateRefsWithSlots('沈云萝和秦越进了白鹿城。', refs)
    expect(out).toBe('沈云萝（参考板第2号）和秦越（参考板第3号）进了白鹿城（参考板第1号）。')
  })

  it('正文中未出现的名字不标注、不影响其他标注', () => {
    const out = annotateRefsWithSlots('沈云萝下山了。', [ref('沈云萝'), ref('掌门')])
    expect(out).toBe('沈云萝（参考板第1号）下山了。')
  })

  it('同名资产共享首个编号且只标一次', () => {
    const out = annotateRefsWithSlots('掌门坐下，掌门开口。', [ref('掌门'), ref('掌门')])
    expect(out).toBe('掌门（参考板第1号）坐下，掌门开口。')
  })

  it('空 refs 原样返回', () => {
    expect(annotateRefsWithSlots('正文', [])).toBe('正文')
  })

  it('名字含正则元字符时按字面匹配', () => {
    const out = annotateRefsWithSlots('道具A(试) 被拿起。', [ref('A(试)', 'item')])
    expect(out).toBe('道具A(试)（参考板第1号） 被拿起。')
  })
})

describe('buildAssetRefPrompt', () => {
  it('三段式结构 + 编号清单 + 拼贴构图红线', () => {
    const refs: SegmentAssetRef[] = [
      { ...ref('雪麓山庄书房', 'location'), appearance: '书案茶盏' },
      { ...ref('沈云萝'), appearance: '米色短打' },
    ]
    const out = buildAssetRefPrompt('沈云萝（参考板第2号）开口。', refs, true)
    expect(out).toContain('subject_definitions:')
    expect(out).toContain('summary:')
    expect(out).toContain('retention_analysis:')
    expect(out).toContain('1号=雪麓山庄书房（场景：书案茶盏）')
    expect(out).toContain('2号=沈云萝（角色：米色短打）')
    expect(out).toContain('不要求保留 Picture 1 的拼贴构图')
    expect(out).toContain('不得出现重复的人物')
    expect(out).toContain('物品道具仅出现在其归属人物身上')
    expect(out).toContain('沈云萝（参考板第2号）开口。')
  })

  it('单资产直传（useBoard=false）声明为资产参考图', () => {
    const out = buildAssetRefPrompt('山门远景。', [ref('雪麓山庄山门', 'location')], false)
    expect(out).toContain('Picture 1 为资产「雪麓山庄山门」的参考图')
    expect(out).not.toContain('参考板（多个编号分块')
  })
})

/**
 * V2 参考板缺图编号修复：编号必须来自重排后 board.members（单一事实源）。
 * ReferenceBoardService.build 跳过缺图成员后 sharp-worker 对幸存成员重排 slot
 * （1..N 按幸存顺序），原始 refs 下标会与板上编号色块错位 → 人物张冠李戴。
 */
describe('缺图重排编号（编号以重排后 board.members 为准）', () => {
  /** 5 名成员；第 2 人（乙）缺图被拼板剔除，幸存 4 人 slot 重排 1..4 */
  const refs5 = [ref('甲'), ref('乙'), ref('丙'), ref('丁'), ref('戊')]
  const membersAfterDrop: ReferenceBoardMember[] = [
    { assetImageId: 'img_甲', name: '甲', kind: 'character', slot: 1 },
    { assetImageId: 'img_丙', name: '丙', kind: 'character', slot: 2 },
    { assetImageId: 'img_丁', name: '丁', kind: 'character', slot: 3 },
    { assetImageId: 'img_戊', name: '戊', kind: 'character', slot: 4 },
  ]

  it('缺图场景：正文编号跟随幸存顺序，被剔除者不加编号（原实现会把丙错标 3 号）', () => {
    const out = annotateRefsWithSlots('甲乙丙丁戊同框。', refs5, membersAfterDrop)
    expect(out).toBe('甲（参考板第1号）乙丙（参考板第2号）丁（参考板第3号）戊（参考板第4号）同框。')
  })

  it('缺图场景：声明段编号清单与板上色块一一对应，不出现被剔除成员、不出错位编号', () => {
    const out = buildAssetRefPrompt('众人同框。', refs5, true, membersAfterDrop)
    expect(out).toContain('1号=甲（角色）')
    expect(out).toContain('2号=丙（角色）')
    expect(out).toContain('3号=丁（角色）')
    expect(out).toContain('4号=戊（角色）')
    // 被剔除的「乙」不得进编号清单
    expect(out).not.toContain('乙')
    // 原实现按 refs 原始下标会产生的错位编号
    expect(out).not.toContain('3号=丙')
    expect(out).not.toContain('5号=')
  })

  it('无缺图回归：members 与 refs 顺序一致时，编号与原始顺序一致', () => {
    const members: ReferenceBoardMember[] = refs5.map((r, i) => ({
      assetImageId: r.assetImageId,
      name: r.name,
      kind: r.kind,
      slot: i + 1,
    }))
    const annotated = annotateRefsWithSlots('甲和丙上场。', refs5, members)
    expect(annotated).toBe('甲（参考板第1号）和丙（参考板第3号）上场。')
    const prompt = buildAssetRefPrompt(annotated, refs5, true, members)
    expect(prompt).toContain('1号=甲（角色）')
    expect(prompt).toContain('2号=乙（角色）')
    expect(prompt).toContain('3号=丙（角色）')
    expect(prompt).toContain('5号=戊（角色）')
  })

  it('编号以 members 为准、appearance 仍从 refs 按 assetImageId 关联（顺序打乱也正确）', () => {
    const refs: SegmentAssetRef[] = [{ ...ref('沈云萝'), appearance: '米色短打' }, { ...ref('秦越') }]
    const members: ReferenceBoardMember[] = [
      { assetImageId: 'img_秦越', name: '秦越', kind: 'character', slot: 1 },
      { assetImageId: 'img_沈云萝', name: '沈云萝', kind: 'character', slot: 2 },
    ]
    const out = buildAssetRefPrompt('沈云萝看向秦越。', refs, true, members)
    expect(out).toContain('1号=秦越（角色）')
    expect(out).toContain('2号=沈云萝（角色：米色短打）')
  })

  it('空成员/全员缺图：不生成编号提示词、不抛错', () => {
    expect(() => annotateRefsWithSlots('甲上场。', refs5, [])).not.toThrow()
    expect(annotateRefsWithSlots('甲上场。', refs5, [])).toBe('甲上场。')
    expect(() => buildAssetRefPrompt('甲上场。', refs5, true, [])).not.toThrow()
    const prompt = buildAssetRefPrompt('甲上场。', refs5, true, [])
    expect(prompt).toContain('subject_definitions:')
    expect(prompt).toContain('summary:')
    expect(prompt).toContain('retention_analysis:')
    expect(prompt).not.toMatch(/\d+号=/)
  })
})
