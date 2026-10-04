import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { DiaryFolderRepository } from '@core/database/repositories/diary-folder.repository'
import { DiaryEntryRepository } from '@core/database/repositories/diary-entry.repository'
import { DiaryLinkRepository } from '@core/database/repositories/diary-link.repository'
import { DiaryAttachmentRepository } from '@core/database/repositories/diary-attachment.repository'
import { DiaryEntryEntity } from '@core/database/entities/diary-entry.entity'

describe.each(getTestDialects())('Diary Repositories [%s]', dialect => {
  let tds: TestDataSource
  let folders: DiaryFolderRepository
  let entries: DiaryEntryRepository
  let links: DiaryLinkRepository
  let attachments: DiaryAttachmentRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    folders = new DiaryFolderRepository(tds.ds)
    entries = new DiaryEntryRepository(tds.ds)
    links = new DiaryLinkRepository(tds.ds)
    attachments = new DiaryAttachmentRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  // ============ DiaryFolder ============

  it('Folder: create + findById + childCount/entryCount', async () => {
    const f = await folders.create({ name: 'root' } as any, 'root')
    expect(f.name).toBe('root')
    expect(f.childCount).toBe(0)
    expect(f.entryCount).toBe(0)

    const got = await folders.findById(f.id)
    expect(got!.id).toBe(f.id)
  })

  it('Folder: findRootFolders 只返回 parent_id IS NULL', async () => {
    const root = await folders.create({ name: 'root' } as any, 'root')
    await folders.create({ name: 'child', parentId: root.id } as any, 'root/child')
    const roots = await folders.findRootFolders()
    expect(roots).toHaveLength(1)
    expect(roots[0].name).toBe('root')
  })

  it('Folder: findChildren 按 parent_id 过滤', async () => {
    const root = await folders.create({ name: 'root' } as any, 'root')
    await folders.create({ name: 'a', parentId: root.id } as any, 'root/a')
    await folders.create({ name: 'b', parentId: root.id } as any, 'root/b')
    expect((await folders.findChildren(root.id)).length).toBe(2)
  })

  it('Folder: childCount/entryCount 聚合正确', async () => {
    const root = await folders.create({ name: 'root' } as any, 'root')
    await folders.create({ name: 'c1', parentId: root.id } as any, 'root/c1')
    await folders.create({ name: 'c2', parentId: root.id } as any, 'root/c2')
    await entries.create({ folderId: root.id, content: 'hi' } as any, 'root/x.md')

    const got = await folders.findById(root.id)
    expect(got!.childCount).toBe(2)
    expect(got!.entryCount).toBe(1)
  })

  it('Folder: brainOptIn 默认关 + update 置位往返', async () => {
    const f = await folders.create({ name: 'brain-test' } as any, 'brain-test')
    expect(f.brainOptIn).toBe(false)

    await folders.update(f.id, { brainOptIn: true } as any)
    const got = await folders.findById(f.id)
    expect(got!.brainOptIn).toBe(true)

    await folders.update(f.id, { brainOptIn: false } as any)
    expect((await folders.findById(f.id))!.brainOptIn).toBe(false)
  })

  it('Folder: existsByName 区分 parent', async () => {
    await folders.create({ name: 'a' } as any, 'a')
    expect(await folders.existsByName('a')).toBe(true)
    expect(await folders.existsByName('a', 'some-id')).toBe(false)
  })

  it('Folder: update 部分字段 + delete', async () => {
    const f = await folders.create({ name: 'old' } as any, 'old')
    expect(await folders.update(f.id, { name: 'new' } as any, 'new')).toBe(true)
    const got = await folders.findById(f.id)
    expect(got!.name).toBe('new')
    expect(got!.path).toBe('new')
    expect(await folders.delete(f.id)).toBe(true)
    expect(await folders.findById(f.id)).toBeNull()
  })

  // ============ DiaryEntry ============

  it('Entry: create 默认 wordCount=0 + tags 往返', async () => {
    const f = await folders.create({ name: 'root' } as any, 'root')
    const e = await entries.create(
      { folderId: f.id, title: 'T1', content: 'hello' } as any,
      'root/t1.md',
    )
    expect(e.wordCount).toBe(0)

    await entries.update(e.id, { tags: ['a', 'b'] } as any)
    const got = await entries.findById(e.id)
    expect(got!.tags).toEqual(['a', 'b'])
  })

  it('Entry: update content 自动算 wordCount', async () => {
    const f = await folders.create({ name: 'root' } as any, 'root')
    const e = await entries.create(
      { folderId: f.id, title: 'T1' } as any,
      'root/t1.md',
    )
    await entries.update(e.id, { content: 'hello world abc' } as any)
    const got = await entries.findById(e.id)
    expect(got!.wordCount).toBeGreaterThan(0)
  })

  it('Entry: search 模糊匹配标题/内容', async () => {
    const f = await folders.create({ name: 'root' } as any, 'root')
    await entries.create(
      { folderId: f.id, title: 'apple notes', content: 'about fruit' } as any,
      'root/a.md',
    )
    await entries.create(
      { folderId: f.id, title: 'banana', content: 'apple is red' } as any,
      'root/b.md',
    )
    const list = await entries.search('apple')
    expect(list).toHaveLength(2)
  })

  it('Entry: 软删除后列表/搜索/findAll 不再可见，findDeleted 可见，可恢复', async () => {
    const f = await folders.create({ name: 'root' } as any, 'root')
    const a = await entries.create({ folderId: f.id, title: 'A', content: 'alpha' } as any, 'root/a.md')
    await entries.create({ folderId: f.id, title: 'B', content: 'beta' } as any, 'root/b.md')

    expect(await entries.softDelete(a.id)).toBe(true)
    expect((await entries.findByFolder(f.id)).map(e => e.title)).toEqual(['B'])
    expect((await entries.findAll()).map(e => e.title)).toEqual(['B'])
    expect((await entries.search('alpha')).length).toBe(0)
    expect((await entries.search('beta')).length).toBe(1)

    const deleted = await entries.findDeleted()
    expect(deleted).toHaveLength(1)
    expect(deleted[0].title).toBe('A')
    expect(deleted[0].deletedAt).toBeTruthy()

    // findById 不受软删除影响（回收站恢复/彻底删除依赖）
    expect((await entries.findById(a.id))!.title).toBe('A')

    expect(await entries.restore(a.id)).toBe(true)
    expect((await entries.findByFolder(f.id)).length).toBe(2)
    expect((await entries.findDeleted()).length).toBe(0)
  })

  it('Entry: findByDateRange 左闭右开区间 + 排除软删除', async () => {
    const f = await folders.create({ name: 'root' } as any, 'root')
    const e1 = await entries.create({ folderId: f.id, title: 'today' } as any, 'root/t.md')
    const e2 = await entries.create({ folderId: f.id, title: 'old' } as any, 'root/o.md')

    // e2 挪到 2020-01-15（远离区间边界，避免时区歧义）
    await tds.ds.getRepository(DiaryEntryEntity).update(e2.id, {
      createdAt: new Date('2020-01-15T10:00:00Z'),
    })

    const jan = await entries.findByDateRange(
      new Date('2020-01-01T00:00:00Z'),
      new Date('2020-02-01T00:00:00Z'),
      f.id,
    )
    expect(jan.map(e => e.title)).toEqual(['old'])

    // 软删除的条目即使落在区间内也不出现
    await entries.softDelete(e1.id)
    const today = new Date()
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    expect((await entries.findByDateRange(dayStart, dayEnd, f.id)).length).toBe(0)
  })

  it('Entry: move 切换 folder', async () => {
    const f1 = await folders.create({ name: 'a' } as any, 'a')
    const f2 = await folders.create({ name: 'b' } as any, 'b')
    const e = await entries.create({ folderId: f1.id, title: 'T' } as any, 'a/t.md')
    await entries.move(e.id, f2.id, 'b/t.md')
    const got = await entries.findById(e.id)
    expect(got!.folderId).toBe(f2.id)
    expect(got!.filePath).toBe('b/t.md')
  })

  // ============ DiaryLink ============

  it('Link: outgoing / incoming / unresolved', async () => {
    const f = await folders.create({ name: 'r' } as any, 'r')
    const e1 = await entries.create({ folderId: f.id, title: 'A' } as any, 'r/a.md')
    const e2 = await entries.create({ folderId: f.id, title: 'B' } as any, 'r/b.md')

    await links.create(e1.id, 'B', { targetEntryId: e2.id, linkText: 'see B' })
    await links.create(e1.id, 'NotExist')

    expect((await links.findOutgoingLinks(e1.id)).length).toBe(2)
    expect((await links.findUnresolvedLinks(e1.id)).length).toBe(1)

    const incoming = await links.findIncomingLinks(e2.id)
    expect(incoming).toHaveLength(1)
    expect(incoming[0].sourceEntryTitle).toBe('A')
  })

  it('Link: createMany + deleteBySource + updateTarget', async () => {
    const f = await folders.create({ name: 'r' } as any, 'r')
    const e1 = await entries.create({ folderId: f.id, title: 'A' } as any, 'r/a.md')
    await links.createMany([
      { sourceEntryId: e1.id, targetTitle: 'X' },
      { sourceEntryId: e1.id, targetTitle: 'Y' },
    ])
    expect((await links.findOutgoingLinks(e1.id)).length).toBe(2)

    const e2 = await entries.create({ folderId: f.id, title: 'X' } as any, 'r/x.md')
    await links.updateTarget('X', e2.id)
    expect((await links.findUnresolvedLinks(e1.id)).length).toBe(1) // 只剩 Y

    await links.deleteBySource(e1.id)
    expect((await links.findOutgoingLinks(e1.id)).length).toBe(0)
  })

  it('Link: findIncomingLinks 带 context + updateTitleReferences 同步显示快照', async () => {
    const f = await folders.create({ name: 'r' } as any, 'r')
    const src = await entries.create(
      { folderId: f.id, title: 'A', content: '今天聊到 [[B]] 这个话题，值得展开写一写。' } as any,
      'r/a.md',
    )
    const dst = await entries.create({ folderId: f.id, title: 'B' } as any, 'r/b.md')
    await links.create(src.id, 'B', { targetEntryId: dst.id })

    const incoming = await links.findIncomingLinks(dst.id)
    expect(incoming).toHaveLength(1)
    expect(incoming[0].sourceEntryTitle).toBe('A')
    expect(incoming[0].context).toContain('[[B]]')

    // 目标改名 B → B2：反链显示快照同步
    await links.updateTitleReferences(dst.id, 'B', 'B2')
    const outgoing = await links.findOutgoingLinks(src.id)
    expect(outgoing[0].targetTitle).toBe('B2')
  })

  // ============ DiaryAttachment ============

  it('Attachment: create + findByEntry + count + delete', async () => {
    const f = await folders.create({ name: 'r' } as any, 'r')
    const e = await entries.create({ folderId: f.id, title: 'A' } as any, 'r/a.md')

    await attachments.create(e.id, 'a.png', '/abs/r/.assets/a.png', 1024, 'image/png')
    await attachments.create(e.id, 'b.png', '/abs/r/.assets/b.png', 2048)

    expect(await attachments.count(e.id)).toBe(2)
    const list = await attachments.findByEntry(e.id)
    expect(list[0].mimeType === 'image/png' || list[1].mimeType === 'image/png').toBe(true)

    await attachments.deleteByEntry(e.id)
    expect(await attachments.count(e.id)).toBe(0)
  })
})
