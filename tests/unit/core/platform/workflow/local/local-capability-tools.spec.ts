/**
 * 本地能力工具 单测（44 号）：工作区围栏 + 五件工具的门禁与行为
 * @module tests/unit/core/platform/workflow/local/local-capability-tools
 *
 * 锚点：围栏未配置结构化报错 / 绝对路径与 symlink 逃逸拒绝 / .git 写拒绝 /
 * 桌面门禁（Web 端不可用）/ apply_patch 端到端（真实临时目录）/ 审批标记与卡片摘要 /
 * 聊天白名单只含读类两件。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildLocalCapabilityToolDefs,
  LOCAL_CAPABILITY_TOOL_NAMES,
} from '@core/platform/workflow/tools/local-capability-tools'
import { getWorkspaceRoots, resolveWorkspacePath, PathOutsideWorkspaceError, WorkspaceNotConfiguredError } from '@core/platform/workflow/local/workspace'
import { SYSTEM_AGENT_PASSTHROUGH_TOOLS } from '@core/platform/workflow/tools/system-agent-tools'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'

let tmpRoot = ''
let otherDir = ''

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ws44-root-'))
  otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws44-other-'))
  fs.writeFileSync(path.join(tmpRoot, 'hello.txt'), 'line1\nline2\nline3\n')
  fs.mkdirSync(path.join(tmpRoot, 'sub'))
  fs.writeFileSync(path.join(tmpRoot, 'sub', 'a.md'), '# a\n')
  fs.mkdirSync(path.join(tmpRoot, '.git'))
  fs.writeFileSync(path.join(tmpRoot, '.git', 'config'), '[core]\n')
})

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
  fs.rmSync(otherDir, { recursive: true, force: true })
})

const roots = (): string[] => [tmpRoot]
const desktop = (): boolean => true

function tool(name: string, over?: Partial<LocalCapabilityDeps>): AgentToolDef {
  const defs = buildLocalCapabilityToolDefs({ roots, desktop, ...over })
  const found = defs.find((d) => d.name === name)
  if (!found) throw new Error(`tool ${name} not found`)
  return found
}

type LocalCapabilityDeps = Parameters<typeof buildLocalCapabilityToolDefs>[0]

const exec = async (name: string, input: unknown, over?: Partial<LocalCapabilityDeps>): Promise<unknown> => {
  const t = tool(name, over)
  return await (t.execute as (i: unknown, ctx: unknown) => Promise<unknown>)(input, {
    scopeId: 's', rawInput: 'r', logContext: {}, toolCallId: 'c1',
  })
}

// ==================== 工作区围栏 ====================

describe('workspace 围栏', () => {
  it('未配置 roots：resolve 抛结构化指引错误', () => {
    expect(() => resolveWorkspacePath('x', { roots: [] })).toThrow(WorkspaceNotConfiguredError)
    expect(() => resolveWorkspacePath('x', { roots: [] })).toThrow(/AGENT_WORKSPACE_ROOTS/)
  })

  it('env 解析：分隔符切分、非绝对路径跳过', () => {
    const delim = path.delimiter
    const rootsParsed = getWorkspaceRoots(`${tmpRoot}${delim}relative/junk${delim}  ${otherDir}  `)
    expect(rootsParsed).toContain(tmpRoot)
    expect(rootsParsed).toContain(otherDir)
    expect(rootsParsed.some((r) => r.includes('relative/junk'))).toBe(false)
  })

  it('相对路径基于 baseDir 解析；出围栏拒绝', () => {
    expect(resolveWorkspacePath('hello.txt', { roots: [tmpRoot] })).toBe(path.join(tmpRoot, 'hello.txt'))
    expect(() => resolveWorkspacePath('../outside', { roots: [tmpRoot] })).toThrow(PathOutsideWorkspaceError)
    expect(() => resolveWorkspacePath(otherDir, { roots: [tmpRoot] })).toThrow(PathOutsideWorkspaceError)
  })

  it('symlink 指向围栏外：realpath 校验拒绝', () => {
    const link = path.join(tmpRoot, 'escape')
    try {
      fs.symlinkSync(otherDir, link)
      expect(() => resolveWorkspacePath('escape/x.txt', { roots: [tmpRoot], forWrite: true })).toThrow(PathOutsideWorkspaceError)
    } finally {
      try {
        fs.unlinkSync(link)
      } catch {
        // 已清理
      }
    }
  })

  it('.git 内部写拒绝（读不拒）', () => {
    expect(() => resolveWorkspacePath('.git/config', { roots: [tmpRoot], forWrite: true })).toThrow(/\.git/)
    expect(resolveWorkspacePath('.git/config', { roots: [tmpRoot] })).toBe(path.join(tmpRoot, '.git', 'config'))
  })
})

// ==================== 桌面门禁 ====================

describe('桌面端门禁', () => {
  it('Web 运行时五件全部结构化拒绝', async () => {
    for (const name of LOCAL_CAPABILITY_TOOL_NAMES) {
      await expect(exec(name, name === 'fs_apply_patch' ? { patch: 'x' } : name.startsWith('shell') ? { command: 'x', session_id: 1 } : { path: 'hello.txt' }, { desktop: () => false }))
        .rejects.toThrow(/仅桌面端可用/)
    }
  })

  it('白名单事实：聊天宿主直通清单只含读类两件（写/执行不进）', () => {
    expect(SYSTEM_AGENT_PASSTHROUGH_TOOLS).toContain('fs_read_file')
    expect(SYSTEM_AGENT_PASSTHROUGH_TOOLS).toContain('fs_list_dir')
    expect(SYSTEM_AGENT_PASSTHROUGH_TOOLS).not.toContain('fs_apply_patch')
    expect(SYSTEM_AGENT_PASSTHROUGH_TOOLS).not.toContain('shell_exec')
  })
})

// ==================== 工具行为 ====================

describe('fs_read_file / fs_list_dir', () => {
  it('读文本：内容与行数；越界目录拒绝', async () => {
    const r = (await exec('fs_read_file', { path: 'hello.txt' })) as { content: string; total_lines: number }
    expect(r.content).toBe('line1\nline2\nline3\n') // 尾换行保留（join 含末空元素）
    expect(r.total_lines).toBe(4)
    await expect(exec('fs_read_file', { path: '../x' })).rejects.toThrow(PathOutsideWorkspaceError)
  })

  it('列目录：目录在前、含子层（depth=2）', async () => {
    const r = (await exec('fs_list_dir', { depth: 2 })) as { entries: Array<{ path: string; type: string }> }
    const paths = r.entries.map((e) => e.path)
    expect(paths).toContain('hello.txt')
    expect(paths).toContain('sub')
    expect(paths).toContain(path.join('sub', 'a.md'))
  })
})

describe('fs_apply_patch', () => {
  it('审批语义：requiresApproval + 卡片摘要含逐文件动作', () => {
    const t = tool('fs_apply_patch')
    expect(t.requiresApproval).toBe(true)
    const summary = (t.approvalCard?.summary as (i: unknown) => string)({
      patch: '*** Begin Patch\n*** Update File: hello.txt\n-line1\n+line1-edited\n*** Add File: new.txt\n+content\n*** End Patch',
    })
    expect(summary).toContain('修改 hello.txt（+1 / -1）')
    expect(summary).toContain('新增 new.txt（+1 / -0）')
  })

  it('端到端：新增+修改真实文件，成功文案 A/M（codex 逐字）', async () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: sub/new-44.txt',
      '+created by 44',
      '*** Update File: hello.txt',
      '-line2',
      '+line2-edited',
      '*** End Patch',
    ].join('\n')
    const r = (await exec('fs_apply_patch', { patch })) as { output: string }
    expect(r.output).toBe('Success. Updated the following files:\nA sub/new-44.txt\nM hello.txt')
    expect(fs.readFileSync(path.join(tmpRoot, 'sub', 'new-44.txt'), 'utf8')).toBe('created by 44\n')
    expect(fs.readFileSync(path.join(tmpRoot, 'hello.txt'), 'utf8')).toContain('line2-edited')
  })

  it('围栏拒绝：补丁目标指向工作区外', async () => {
    const patch = `*** Begin Patch\n*** Add File: ${path.join(otherDir, 'evil.txt')}\n+nope\n*** End Patch`
    await expect(exec('fs_apply_patch', { patch })).rejects.toThrow(PathOutsideWorkspaceError)
    expect(fs.existsSync(path.join(otherDir, 'evil.txt'))).toBe(false)
  })

  it('.git 内写拒绝；重复目标冲突（codex 逐字）', async () => {
    const gitPatch = '*** Begin Patch\n*** Update File: .git/config\n-[core]\n+[core]\n+tk = x\n*** End Patch'
    await expect(exec('fs_apply_patch', { patch: gitPatch })).rejects.toThrow(/\.git/)
    const dup = '*** Begin Patch\n*** Add File: dup.txt\n+a\n*** Delete File: dup.txt\n*** End Patch'
    await expect(exec('fs_apply_patch', { patch: dup })).rejects.toThrow('multiple operations target')
  })

  it('定位失败：错误带原文行（模型自纠错契约透传）', async () => {
    const patch = '*** Begin Patch\n*** Update File: hello.txt\n-not-exist-line\n+nope\n*** End Patch'
    await expect(exec('fs_apply_patch', { patch })).rejects.toThrow(
      'Failed to find expected lines in hello.txt:\nnot-exist-line',
    )
  })
})

describe('shell_exec / shell_write', () => {
  it('快命令退出码；在途会话续读', async () => {
    const r = (await exec('shell_exec', { command: 'echo shell-44', yield_ms: 2000 })) as { exit_code?: number; output: string; session_id?: number }
    expect(r.exit_code).toBe(0)
    expect(r.output).toContain('shell-44')

    const r1 = (await exec('shell_exec', { command: 'echo p1; sleep 1; echo p2', yield_ms: 300 })) as { session_id: number; output: string }
    expect(r1.session_id).toBeDefined()
    expect(r1.output).toContain('p1')
    let last: { exit_code?: number; output: string } = r1
    for (let i = 0; i < 10 && last.exit_code === undefined; i++) {
      last = (await exec('shell_write', { session_id: r1.session_id, yield_ms: 500 })) as { exit_code?: number; output: string }
    }
    expect(last.exit_code).toBe(0)
    expect(last.output).toContain('p2')
  }, 20_000)
})
