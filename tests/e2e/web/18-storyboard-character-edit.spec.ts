/**
 * P5-T34 分镜内角色编辑 e2e（spec §4.5.3 + §4.5.9）
 *
 * 验证：
 *   1. ep:list-storyboard-characters / save / clear 三 IPC 真接通
 *   2. 同场景两 storyboard 真能保存不同 expression / action 配置
 *      （spec §4.5.9 实操示例：分镜 1.2 张三 angry 举手 / 分镜 1.3
 *      李四 surprised 3q_left）
 *   3. clear 后 list 返回空（回退场景级）
 *
 * 不调 generate-keyframes（费钱 + 慢）；P5-T31 单测已覆盖"分镜级覆盖
 * scene 级"的核心生成逻辑。本 spec 只验证 UI 流程的 CRUD 数据流。
 */

import { test, expect } from '@playwright/test'
import { invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - P5-T34 分镜内角色编辑 e2e', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('IPC list-storyboard-characters 空 storyboard 返回 []', async ({ page }) => {
    const data = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'ep:list-storyboard-characters',
      ['sb_nonexistent'],
    )
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(0)
  })

  test('IPC save → list → clear 完整数据流（spec §4.5.3）', async ({ page }) => {
    // 用 P7 e2e 已经准备好的 storyboard 之一
    const storyboards = await invokeIpcUnwrap<{ id: string }[]>(
      page.context().request,
      'ep:list-storyboards',
      ['ss_1777968309597_8yjeltob7'], // P7 茶馆相遇 sceneScript 1
    ).catch(() => null)
    test.skip(
      !storyboards || storyboards.length === 0,
      '需要 P7 e2e 准备好的 storyboard，跳过',
    )

    const sbId = storyboards![0].id

    // 1. save 写入 2 条 character override
    const inputs = [
      {
        characterId: 'cb_test_a',
        positionX: 30,
        positionY: 50,
        positionScale: 1.0,
        expression: 'angry',
        action: '怒指对方',
        facing: 'front',
      },
      {
        characterId: 'cb_test_b',
        positionX: 70,
        positionY: 50,
        positionScale: 0.9,
        expression: 'surprised',
        facing: 'three_quarter_left',
      },
    ]
    const saved = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'ep:save-storyboard-characters',
      [sbId, inputs],
    )
    expect(saved.length).toBe(2)

    // 2. list 验证（按 sortOrder 升序）
    const listed = await invokeIpcUnwrap<
      Array<{
        characterId: string
        expression?: string
        action?: string
        facing?: string
      }>
    >(page.context().request, 'ep:list-storyboard-characters', [sbId])
    expect(listed.length).toBe(2)
    expect(listed[0].characterId).toBe('cb_test_a')
    expect(listed[0].expression).toBe('angry')
    expect(listed[0].action).toBe('怒指对方')
    expect(listed[0].facing).toBe('front')
    expect(listed[1].characterId).toBe('cb_test_b')
    expect(listed[1].expression).toBe('surprised')
    expect(listed[1].facing).toBe('three_quarter_left')

    // 3. save 全量替换 — 第二次只 1 条覆盖第一次的 2 条
    const saved2 = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'ep:save-storyboard-characters',
      [
        sbId,
        [
          {
            characterId: 'cb_test_c',
            expression: 'happy',
          },
        ],
      ],
    )
    expect(saved2.length).toBe(1)

    const listed2 = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'ep:list-storyboard-characters',
      [sbId],
    )
    expect(listed2.length).toBe(1)

    // 4. clear 清空
    await invokeIpcUnwrap<void>(
      page.context().request,
      'ep:clear-storyboard-characters',
      [sbId],
    )
    const listed3 = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'ep:list-storyboard-characters',
      [sbId],
    )
    expect(listed3.length).toBe(0)
  })

  test('两个 storyboard 互不干扰（spec §4.5.9 实操示例）', async ({ page }) => {
    const storyboards = await invokeIpcUnwrap<{ id: string }[]>(
      page.context().request,
      'ep:list-storyboards',
      ['ss_1777968309597_8yjeltob7'],
    ).catch(() => null)
    test.skip(
      !storyboards || storyboards.length < 2,
      '需要至少 2 个 storyboard，跳过',
    )

    const sb1Id = storyboards![0].id
    const sb2Id = storyboards![1].id

    // 分别配置不同
    await invokeIpcUnwrap(page.context().request, 'ep:save-storyboard-characters', [
      sb1Id,
      [{ characterId: 'cb_zhangsan', expression: 'angry', action: '举手指向李四' }],
    ])
    await invokeIpcUnwrap(page.context().request, 'ep:save-storyboard-characters', [
      sb2Id,
      [{ characterId: 'cb_lisi', expression: 'surprised', facing: 'three_quarter_left' }],
    ])

    // 验证互不干扰
    const list1 = await invokeIpcUnwrap<Array<{ characterId: string; expression?: string }>>(
      page.context().request,
      'ep:list-storyboard-characters',
      [sb1Id],
    )
    const list2 = await invokeIpcUnwrap<Array<{ characterId: string; expression?: string }>>(
      page.context().request,
      'ep:list-storyboard-characters',
      [sb2Id],
    )

    expect(list1[0].characterId).toBe('cb_zhangsan')
    expect(list1[0].expression).toBe('angry')
    expect(list2[0].characterId).toBe('cb_lisi')
    expect(list2[0].expression).toBe('surprised')

    // 清理
    await invokeIpcUnwrap(page.context().request, 'ep:clear-storyboard-characters', [sb1Id])
    await invokeIpcUnwrap(page.context().request, 'ep:clear-storyboard-characters', [sb2Id])
  })
})
