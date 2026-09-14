/**
 * apply_patch 解析/应用 单测（44 号；锚点 = codex apply-patch crate 行为）
 * @module tests/unit/core/platform/workflow/local/patch
 *
 * 关键对齐点：标记大小写（Move to 小写 to / End of File 大写）、@@ 可省略、
 * 裸空行=空 context、四级模糊匹配顺序、EOF 尾对齐、尾空串哨兵重试、
 * LF 归一（更新过的文件以 LF 结尾）、错误文案逐字。
 */

import { describe, it, expect } from 'vitest'
import { parsePatch, applyPatchOps, PatchParseError } from '@core/platform/workflow/local/patch'

const ok = (patch: string): ReturnType<typeof parsePatch> => parsePatch(patch)

const ADD = (path: string, ...lines: string[]): string =>
  ['*** Begin Patch', `*** Add File: ${path}`, ...lines.map((l) => `+${l}`), '*** End Patch'].join('\n')

const UPDATE = (path: string, ...body: string[]): string =>
  ['*** Begin Patch', `*** Update File: ${path}`, ...body, '*** End Patch'].join('\n')

describe('parsePatch：文法', () => {
  it('Add File：+ 行剥一个前缀、保留行内与后续前导空格；零 + 行=空文件', () => {
    const ops = ok(ADD('new.txt', '  indented'))
    expect(ops).toEqual([{ kind: 'add', path: 'new.txt', contents: '  indented\n' }])
    // 空 + 行 = 空内容行；无内容行 = 空文件
    expect(ok(ADD('e.txt', '')).map((o) => (o as { contents: string }).contents)).toEqual(['\n'])
    expect(ok('*** Begin Patch\n*** Add File: empty.txt\n*** End Patch')).toEqual([
      { kind: 'add', path: 'empty.txt', contents: '' },
    ])
  })

  it('Delete File', () => {
    expect(ok('*** Begin Patch\n*** Delete File: old.txt\n*** End Patch')).toEqual([
      { kind: 'delete', path: 'old.txt' },
    ])
  })

  it('Update：首个 @@ 可省略；+/-/空格 前缀剥一个字符', () => {
    const ops = ok(UPDATE('a.ts', ' old', '-gone', '+new'))
    expect(ops[0]).toEqual({
      kind: 'update',
      path: 'a.ts',
      chunks: [{ oldLines: ['old', 'gone'], newLines: ['old', 'new'], isEndOfFile: false }],
    })
  })

  it('Update：@@ ctx 携带定位上下文；多 chunk 顺序保留', () => {
    const ops = ok(
      UPDATE(
        'a.ts',
        '@@ fn first()',
        ' a',
        '+b',
        '@@ fn second()',
        '-c',
        '+d',
      ),
    )
    const chunks = (ops[0] as { chunks: Array<{ changeContext?: string }> }).chunks
    expect(chunks[0].changeContext).toBe('fn first()')
    expect(chunks[1].changeContext).toBe('fn second()')
  })

  it('裸空行 = 空 context 行（codex streaming_parser 同语义）', () => {
    const ops = ok(UPDATE('a.ts', ' x', '', '+y'))
    const chunk = (ops[0] as { chunks: Array<{ oldLines: string[]; newLines: string[] }> }).chunks[0]
    expect(chunk.oldLines).toEqual(['x', ''])
    expect(chunk.newLines).toEqual(['x', '', 'y']) // 空行进 new（context 语义），+y 再追加
  })

  it('*** End of File 置哨兵位', () => {
    const ops = ok(UPDATE('a.ts', '@@ tail', ' last', '+appended', '*** End of File'))
    const chunk = (ops[0] as { chunks: Array<{ isEndOfFile: boolean }> }).chunks[0]
    expect(chunk.isEndOfFile).toBe(true)
  })

  it('*** Move to:（小写 to）在 Update 内合法', () => {
    const ops = ok(UPDATE('old.txt', '*** Move to: new.txt', ' keep', '+more'))
    expect(ops[0]).toMatchObject({ kind: 'update', path: 'old.txt', moveTo: 'new.txt' })
  })

  it('heredoc 包装剥离（lenient 缺省）', () => {
    const patch = "<<'EOF'\n*** Begin Patch\n*** Add File: x.txt\n+hi\n*** End Patch\nEOF"
    expect(ok(patch)).toEqual([{ kind: 'add', path: 'x.txt', contents: 'hi\n' }])
  })

  it('CRLF：剥单个尾 \\r', () => {
    const ops = ok('*** Begin Patch\r\n*** Add File: x.txt\r\n+hi\r\n*** End Patch\r\n')
    expect(ops).toEqual([{ kind: 'add', path: 'x.txt', contents: 'hi\n' }])
  })
})

describe('parsePatch：错误文案逐字（模型自纠错契约）', () => {
  it('首行非 Begin Patch', () => {
    expect(() => ok('*** Add File: x\n+1')).toThrow(
      new PatchParseError("The first line of the patch must be '*** Begin Patch'", 1),
    )
  })

  it('缺 End Patch', () => {
    expect(() => ok('*** Begin Patch\n*** Add File: x\n+1')).toThrow(
      "The last line of the patch must be '*** End Patch'",
    )
  })

  it('非法 hunk 头（含合法头清单提示）', () => {
    expect(() => ok('*** Begin Patch\n*** Change File: x\n*** End Patch')).toThrow(
      `'*** Change File: x' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`,
    )
  })

  it('Update 内容行前缀非法（逐字）', () => {
    expect(() => ok(UPDATE('a.ts', 'bad line'))).toThrow(
      "Unexpected line found in update hunk: 'bad line'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)",
    )
  })

  it('Update hunk 为空', () => {
    expect(() => ok('*** Begin Patch\n*** Update File: a.ts\n*** End Patch')).toThrow(
      "Update file hunk for path 'a.ts' is empty",
    )
  })

  it('Move to 不在首 chunk 前', () => {
    expect(() => ok(UPDATE('a.ts', ' x', '*** Move to: b.ts'))).toThrow(
      `'*** Move to:' is only valid before the first chunk of an update hunk`,
    )
  })
})

describe('applyPatchOps：应用语义', () => {
  it('update：单 chunk 替换 + LF 归一（更新过的文件以 LF 结尾）', () => {
    const ops = ok(UPDATE('a.ts', ' const a = 1', '-const b = 2', '+const b = 3'))
    const r = applyPatchOps(ops, { read:  () => 'const a = 1\nconst b = 2\n', resolve: (p) => p })
    expect(r.effects).toEqual([
      { action: 'write', displayPath: 'a.ts', absPath: 'a.ts', content: 'const a = 1\nconst b = 3\n' },
    ])
    expect(r.successText).toBe('Success. Updated the following files:\nM a.ts')
  })

  it('多 chunk 共享推进指针：先 @@ ctx 定位再替换', () => {
    const ops = ok(UPDATE('a.ts', '@@ one', '-x=1', '+x=2', '@@ two', '-y=1', '+y=2'))
    const r = applyPatchOps(ops, { read:  () => 'one\nx=1\ny=1\ntwo\ny=1\n', resolve: (p) => p })
    const out = (r.effects[0] as { content: string }).content
    // @@ two 锚点把指针推过第一个 y=1 → chunk2 命中 two 之后那行（codex 顺序语义）
    expect(out).toBe('one\nx=2\ny=1\ntwo\ny=2\n')
  })

  it('纯插入 chunk 恒追加到文件末尾（codex file_update 语义，review P0-2 回归）', () => {
    const ops = ok(UPDATE('a.ts', ' l1', '+l2'))
    const r = applyPatchOps(ops, { read: () => 'l1\nl3\n', resolve: (p) => p })
    // 上下文行保留 + 追加 = 替换语义（此 chunk 非纯插入）
    expect((r.effects[0] as { content: string }).content).toBe('l1\nl2\nl3\n')
    // 常见惯用法：@@ + 纯 + 行 = 末尾追加
    const r2 = applyPatchOps(ok(UPDATE('b.ts', '@@', '+appended')), { read: () => 'x\n', resolve: (p) => p })
    expect((r2.effects[0] as { content: string }).content).toBe('x\nappended\n')
  })

  it('End of File：末尾追加（对齐尾部）', () => {
    const ops = ok(UPDATE('a.ts', ' end', '+tail', '*** End of File'))
    const r = applyPatchOps(ops, { read:  () => 'a\nb\nend\n', resolve: (p) => p })
    expect((r.effects[0] as { content: string }).content).toBe('a\nb\nend\ntail\n')
  })

  it('文件末尾无换行 + End of File 追加（尾空串哨兵重试路径）', () => {
    const ops = ok(UPDATE('a.ts', ' end', '+tail', '*** End of File'))
    const r = applyPatchOps(ops, { read:  () => 'a\nb\nend', resolve: (p) => p })
    expect((r.effects[0] as { content: string }).content).toBe('a\nb\nend\ntail\n')
  })

  it('四级模糊匹配：rstrip → trim → Unicode 归一（顺序不可换）', () => {
    // 二级：行尾空白
    const r1 = applyPatchOps(ok(UPDATE('a', ' x')), { read:  () => 'x   \n', resolve: (p) => p })
    expect((r1.effects[0] as { content: string }).content).toBe('x\n')
    // 三级：前导空白
    const r2 = applyPatchOps(ok(UPDATE('b', ' x')), { read:  () => '   x\n', resolve: (p) => p })
    expect((r2.effects[0] as { content: string }).content).toBe('x\n')
    // 四级：多空格 + 直引号 pattern 归一后命中 弯引号文件行（exact/rstrip/trim 均失配）
    const r3 = applyPatchOps(ok(UPDATE('c', '- a — "b"', '+CHANGED')), { read:  () => 'a — “b”\n', resolve: (p) => p })
    expect((r3.effects[0] as { content: string }).content).toBe('CHANGED\n')
  })

  it('update+moveTo：写新路径并删原路径（汇总 M dest）', () => {
    const ops = ok(UPDATE('old.txt', '*** Move to: new.txt', ' body', '+body2'))
    const r = applyPatchOps(ops, { read:  () => 'body\n', resolve: (p) => p })
    expect(r.effects).toEqual([
      { action: 'write', displayPath: 'new.txt', absPath: 'new.txt', content: 'body\nbody2\n' },
      { action: 'delete', displayPath: 'old.txt', absPath: 'old.txt' },
    ])
    expect(r.successText).toBe('Success. Updated the following files:\nM new.txt')
  })

  it('add+update+delete 混合；apply 顺序对后续 op 可见', () => {
    const ops = ok(
      [
        '*** Begin Patch',
        '*** Add File: c.txt',
        '+seed',
        '*** Update File: c.txt',
        '-seed',
        '+grown',
        '*** Delete File: d.txt',
        '*** End Patch',
      ].join('\n'),
    )
    const r = applyPatchOps(ops, { read:  () => null, resolve: (p) => p })
    expect(r.successText.split('\n')).toEqual([
      'Success. Updated the following files:',
      'A c.txt',
      'M c.txt',
      'D d.txt',
    ])
  })

  it('定位失败：错误带原文行（模型自纠错关键信息）', () => {
    const ops = ok(UPDATE('a.ts', ' alpha', '-beta', '+gamma'))
    expect(() => applyPatchOps(ops, { read:  () => 'nothing here\n', resolve: (p) => p })).toThrow(
      'Failed to find expected lines in a.ts:\nalpha\nbeta',
    )
  })

  it('ctx 定位失败：逐字文案', () => {
    const ops = ok(UPDATE('a.ts', '@@ missing_anchor', ' x'))
    expect(() => applyPatchOps(ops, { read:  () => 'x\n', resolve: (p) => p })).toThrow("Failed to find context 'missing_anchor' in a.ts")
  })

  it('update 不存在的文件', () => {
    const ops = ok(UPDATE('nope.ts', ' x'))
    expect(() => applyPatchOps(ops, { read:  () => null, resolve: (p) => p })).toThrow('Failed to read file to update nope.ts')
  })
})

describe('44 号对抗 review 回归（P0/P1 修复锚点）', () => {
  it('P0-3：哨兵重试不砍 new 尾部真实改动（非对称尾 → 定位失败报错而非静默 no-op）', () => {
    const ops = ok(UPDATE('f.txt', ' a', '-', '+NEW'))
    expect(() => applyPatchOps(ops, { read: () => 'x\na\n', resolve: (p) => p })).toThrow(
      'Failed to find expected lines in f.txt:\na\n',
    )
  })

  it('P1-1：@@x（无空格）不是 chunk 头 → 逐字报错', () => {
    expect(() => ok(UPDATE('a.ts', '@@x', ' y'))).toThrow(
      "Unexpected line found in update hunk: '@@x'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)",
    )
  })

  it('P1-2：End of File 只许动尾部——中段命中报错而非改错位置', () => {
    const ops = ok(UPDATE('f.txt', '@@ marker', '-MID', '+CHANGED', '*** End of File'))
    // 尾对齐位（末行）没有 MID → EOF 语义报错，绝不回扫中段命中
    const content = 'marker\nMID\ntail\nother\n'
    expect(() => applyPatchOps(ops, { read: () => content, resolve: (p) => p })).toThrow(
      'Failed to find expected lines in f.txt:\nMID',
    )
  })

  it('P1-3：缩进的 Update marker 是 context 行而非新 hunk（上游 keeps_indented_update_markers）', () => {
    const ops = ok(UPDATE('f.txt', ' ok', ' *** Update File: g.txt', '+added'))
    const r = applyPatchOps(ops, { read: () => 'ok\n *** Update File: g.txt\n', resolve: (p) => p })
    // context 前缀空格剥除后重写（codex 同语义）；要点 = 该行被当 context 而非新 hunk
    expect((r.effects[0] as { content: string }).content).toBe('ok\n*** Update File: g.txt\nadded\n')
  })

  it('P2-1：@@ 后无行 → Update hunk does not contain any lines', () => {
    expect(() => ok(UPDATE('a.ts', '@@'))).toThrow('Update hunk does not contain any lines')
  })

  it('P2-3：move 后源键清除——同补丁内后续 op 不复活旧内容', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: a.txt',
      '*** Move to: b.txt',
      ' body',
      '+body2',
      '*** Delete File: b.txt',
      '*** End Patch',
    ].join('\n')
    const ops = ok(patch)
    const r = applyPatchOps(ops, { read: () => 'body\n', resolve: (p) => p })
    const writes = r.effects.filter((e) => e.action === 'write')
    expect(writes.map((e) => e.displayPath)).toEqual(['b.txt'])
  })
})
