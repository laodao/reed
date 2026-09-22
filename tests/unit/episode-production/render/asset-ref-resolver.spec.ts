import { describe, expect, it } from 'vitest'
import {
  annotateRefsWithSlots,
  buildAssetRefPrompt,
  type SegmentAssetRef,
} from '@core/platform/episode-production/render/video/asset-ref-resolver'

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
