import { describe, it, expect } from 'vitest'
import {
  sceneContainsEntity,
  entityScenes,
} from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/scene-entity-utils'
import type { SceneScript } from '../../../../src/shared/types/episode-production/narrative.types'

function makeScene(overrides: Partial<SceneScript>): SceneScript {
  return {
    id: 's1',
    episodeScriptId: 'ep1',
    sceneNumber: 1,
    location: '客栈',
    locationType: 'interior' as any,
    timeOfDay: 'night' as any,
    sceneDescription: '',
    mood: '',
    characters: [],
    originalText: '',
    narration: '',
    dialogues: [],
    actions: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('sceneContainsEntity', () => {
  it('character 通过 characterId 命中', () => {
    const s = makeScene({
      characters: [{ characterId: 'c1', characterName: '张三' } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'character', name: '张三', id: 'c1' })).toBe(true)
  })

  it('character 通过 characterName 命中', () => {
    const s = makeScene({
      characters: [{ characterId: 'cx', characterName: '张三' } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'character', name: '张三' })).toBe(true)
  })

  it('character 通过 characterBindingId 命中', () => {
    const s = makeScene({
      characters: [{ characterBindingId: 'cb1', characterId: 'cx', characterName: 'x' } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'character', name: 'x', id: 'cb1' })).toBe(true)
  })

  it('location 通过 name 命中', () => {
    const s = makeScene({ location: '客栈' })
    expect(sceneContainsEntity(s, { kind: 'location', name: '客栈' })).toBe(true)
  })

  it('location 通过 locationBindingId 命中', () => {
    const s = makeScene({ location: '其他名', locationBindingId: 'lb1' })
    expect(sceneContainsEntity(s, { kind: 'location', name: 'x', id: 'lb1' })).toBe(true)
  })

  it('item 通过 SceneCharacter.props 字符串命中', () => {
    const s = makeScene({
      characters: [{ characterId: 'c1', characterName: '张三', props: ['长剑'] } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'item', name: '长剑' })).toBe(true)
  })

  it('item 通过 SceneCharacter.props ScenePropRef.itemBindingId 命中', () => {
    const s = makeScene({
      characters: [
        { characterId: 'c1', characterName: '张三', props: [{ itemBindingId: 'ib1', name: 'x' }] } as any,
      ],
    })
    expect(sceneContainsEntity(s, { kind: 'item', name: 'x', id: 'ib1' })).toBe(true)
  })

  it('item 通过文本 @name 引用兜底命中（actions[].description）', () => {
    const s = makeScene({
      actions: [{ id: 'a1', description: '掏出 @长剑 砍下', timing: 'during' } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'item', name: '长剑' })).toBe(true)
  })

  it('item 通过文本 @name 引用兜底命中（dialogues[].text）', () => {
    const s = makeScene({
      dialogues: [{ id: 'd1', characterId: 'c1', characterName: '张三', text: '把 @长剑 给我' } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'item', name: '长剑' })).toBe(true)
  })

  it('全部不命中返回 false', () => {
    const s = makeScene({})
    expect(sceneContainsEntity(s, { kind: 'character', name: '不存在' })).toBe(false)
    expect(sceneContainsEntity(s, { kind: 'location', name: '不存在' })).toBe(false)
    expect(sceneContainsEntity(s, { kind: 'item', name: '不存在' })).toBe(false)
  })
})

describe('entityScenes', () => {
  it('返回升序场景编号数组', () => {
    const s1 = makeScene({ sceneNumber: 1, location: '客栈' })
    const s2 = makeScene({ sceneNumber: 2, location: '湖边' })
    const s3 = makeScene({ sceneNumber: 3, location: '客栈' })
    const list = entityScenes({ kind: 'location', name: '客栈' }, [s1, s2, s3])
    expect(list).toEqual([1, 3])
  })

  it('无场景返回 []', () => {
    expect(entityScenes({ kind: 'location', name: 'x' }, [])).toEqual([])
  })
})
