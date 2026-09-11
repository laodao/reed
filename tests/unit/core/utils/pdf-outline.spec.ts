import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import {
  readPdfOutline,
  resolveOutlineLevels,
  mergeOutlineIntoMarkdown,
} from '@core/utils/pdf-outline'
import { buildMiniPdfWithOutline } from './fixtures/minipdf-outline.builder'

/**
 * 书签 PDF 夹具在运行时生成到临时目录：本项目 core.autocrlf=true 且该 PDF 不含 NUL 字节，
 * 入库会被 git 当文本做换行改写（xref 偏移错位 → 解析失败），故不做二进制夹具。
 */
let fixtureDir = ''
let fixturePath = ''

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-pdf-outline-'))
  fixturePath = path.join(fixtureDir, 'minipdf-outline.pdf')
  fs.writeFileSync(fixturePath, buildMiniPdfWithOutline())
})

afterAll(() => {
  if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('resolveOutlineLevels', () => {
  it('多级目录：保留书签嵌套深度（不被标题编号覆盖）', () => {
    const levels = resolveOutlineLevels([
      { title: 'F2PY reference manual', depth: 2 },
      { title: '1.1 Baseline', depth: 3 },
      { title: '1.2 Compilation options', depth: 3 },
    ])
    expect(levels).toEqual([2, 3, 3])
  })

  it('扁平目录：用标题编号推导层级', () => {
    const levels = resolveOutlineLevels([
      { title: '第1章　引言', depth: 1 },
      { title: '1.1　本书面向的读者', depth: 1 },
      { title: '1.2.1　神经网络的众多名称', depth: 1 },
    ])
    expect(levels).toEqual([1, 2, 3])
  })

  it('深度超过 6 时截断到 6', () => {
    expect(resolveOutlineLevels([{ title: 'x', depth: 9 }])).toEqual([6])
  })
})

describe('mergeOutlineIntoMarkdown', () => {
  it('按大纲注入标题并切分正文（标题文本不重复出现在正文里）', () => {
    const md = mergeOutlineIntoMarkdown(
      [
        { pageIndex: 0, markdown: '# WHAT IS NUMPY?\n\nNumPy is the fundamental package.' },
        { pageIndex: 1, markdown: '## Why is NumPy fast?\n\nBecause it is written in C.' },
        { pageIndex: 2, markdown: 'Who else uses NumPy?\n\nMany projects.' },
      ],
      [
        { title: 'What is NumPy?', level: 1, pageIndex: 0 },
        { title: 'Why is NumPy fast?', level: 2, pageIndex: 1 },
        { title: 'Who else uses NumPy?', level: 2, pageIndex: 2 },
      ],
    )
    expect(md).toBe(
      [
        '# What is NumPy?',
        'NumPy is the fundamental package.',
        '## Why is NumPy fast?',
        'Because it is written in C.',
        '## Who else uses NumPy?',
        'Many projects.',
      ].join('\n\n'),
    )
  })

  it('标题被换行拆开 / 大小写不同也能匹配（PDF 正文常为全大写）', () => {
    const md = mergeOutlineIntoMarkdown(
      [{ pageIndex: 0, markdown: 'ARRAY\nCREATION\n\nDetails here.' }],
      [{ title: 'Array creation', level: 1, pageIndex: 0 }],
    )
    expect(md).toBe('# Array creation\n\nDetails here.')
  })

  it('检索起点受目标页限制：目录页中的同名标题不会被误当章节起点', () => {
    const md = mergeOutlineIntoMarkdown(
      [
        { pageIndex: 0, markdown: 'Contents\n\nWhat is NumPy? .... 7\nNumPy quickstart .... 9' },
        { pageIndex: 1, markdown: 'What is NumPy?\n\nBody one.' },
        { pageIndex: 2, markdown: 'NumPy quickstart\n\nBody two.' },
      ],
      [
        { title: 'What is NumPy?', level: 1, pageIndex: 1 },
        { title: 'NumPy quickstart', level: 1, pageIndex: 2 },
      ],
    )
    expect(md).toBe(
      [
        'Contents',
        'What is NumPy? .... 7\nNumPy quickstart .... 9',
        '# What is NumPy?',
        'Body one.',
        '# NumPy quickstart',
        'Body two.',
      ].join('\n\n'),
    )
  })

  it('标题在正文中找不到时仍按目标页插入标题（结构不丢，正文不丢）', () => {
    const md = mergeOutlineIntoMarkdown(
      [
        { pageIndex: 0, markdown: 'Intro text without title.' },
        { pageIndex: 1, markdown: 'Chapter body.' },
      ],
      [{ title: 'Missing Chapter', level: 1, pageIndex: 1 }],
    )
    expect(md).toBe('Intro text without title.\n\n# Missing Chapter\n\nChapter body.')
  })

  it('正文里非大纲标题降级为普通段落（PDF 页眉页脚常被误判为标题）', () => {
    const md = mergeOutlineIntoMarkdown(
      [{ pageIndex: 0, markdown: '## CHAPTER ONE\n\n# WHAT IS NUMPY?\n\nReal body.' }],
      [{ title: 'What is NumPy?', level: 1, pageIndex: 0 }],
    )
    expect(md).toBe('CHAPTER ONE\n\n# What is NumPy?\n\nReal body.')
  })

  it('同名标题多次出现时按顺序各自匹配（前一条不会吃掉后一条）', () => {
    const md = mergeOutlineIntoMarkdown(
      [
        { pageIndex: 0, markdown: 'Examples\n\nFirst example body.' },
        { pageIndex: 1, markdown: 'Examples\n\nSecond example body.' },
      ],
      [
        { title: 'Examples', level: 2, pageIndex: 0 },
        { title: 'Examples', level: 2, pageIndex: 1 },
      ],
    )
    expect(md).toBe(
      ['## Examples', 'First example body.', '## Examples', 'Second example body.'].join('\n\n'),
    )
  })

  it('页码有空洞（调用方剔除了空白页）时仍按原页码定位：标题不会被插到错误位置', () => {
    // 场景来自 numpy-user.pdf：document 第 2 页无文本被剔除，此后所有页的「序号」都比「页码」小 1。
    // 若把页码当数组下标用，书签目标页会整体前移，正文被切碎。
    const md = mergeOutlineIntoMarkdown(
      [
        { pageIndex: 0, markdown: '目录页：What is NumPy? .... 3' },
        // pageIndex 1 缺失（空白页）
        { pageIndex: 2, markdown: 'What is NumPy?\n\nNumPy is the fundamental package.' },
        { pageIndex: 3, markdown: 'Why is NumPy fast?\n\nBecause it is written in C.' },
      ],
      [
        { title: 'What is NumPy?', level: 1, pageIndex: 2 },
        { title: 'Why is NumPy fast?', level: 2, pageIndex: 3 },
      ],
    )
    expect(md).toBe(
      [
        '目录页：What is NumPy? .... 3',
        '# What is NumPy?',
        'NumPy is the fundamental package.',
        '## Why is NumPy fast?',
        'Because it is written in C.',
      ].join('\n\n'),
    )
  })

  it('书签目标页超出实际页码范围时退化为「按当前位置插入」，不丢正文', () => {
    const md = mergeOutlineIntoMarkdown(
      [{ pageIndex: 0, markdown: 'Body of page one.' }],
      [{ title: 'Ghost Chapter', level: 1, pageIndex: 99 }],
    )
    expect(md).toBe('Body of page one.\n\n# Ghost Chapter')
  })

  it('大纲为空时原样返回拼接正文', () => {
    const md = mergeOutlineIntoMarkdown(
      [
        { pageIndex: 0, markdown: 'page one' },
        { pageIndex: 1, markdown: 'page two' },
      ],
      [],
    )
    expect(md).toBe('page one\n\npage two')
  })
})

describe('readPdfOutline', () => {
  it('读取真实 PDF 的书签树：标题、层级、目标页（0 基）', async () => {
    const outline = await readPdfOutline(fs.readFileSync(fixturePath))
    expect(outline.map((e) => [e.title, e.level, e.pageIndex])).toEqual([
      ['Chapter One', 1, 0],
      ['Section 1.1', 2, 0],
      ['Chapter Two', 1, 1],
      ['Chapter Three', 1, 2],
    ])
  })

  it('无书签的 PDF 返回空数组而不抛错', async () => {
    const pdf = path.join(__dirname, 'fixtures', 'sample-ai-chat.pdf')
    const outline = await readPdfOutline(fs.readFileSync(pdf))
    expect(Array.isArray(outline)).toBe(true)
  })
})
