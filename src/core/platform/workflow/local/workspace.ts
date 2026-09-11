/**
 * 本地能力的工作区围栏（44 号）
 * @module core/platform/workflow/local/workspace
 *
 * 安全模型对标 codex safety.rs：codex 无路径黑名单，拒绝/放行完全基于
 * FileSystemSandboxPolicy 的 writable roots（can_write_path）。我们无 OS 沙箱，
 * 等价物 = AGENT_WORKSPACE_ROOTS 围栏 + realpath 防 symlink 逃逸 + .git 内部写拒绝。
 * 未配置围栏 = 本地工具整体不可用（安全默认，结构化指引开启）。
 */

import path from 'node:path'
import fs from 'node:fs'

/** 工作区围栏 env（path.delimiter 分隔的绝对路径） */
export const WORKSPACE_ROOTS_ENV = 'AGENT_WORKSPACE_ROOTS'

export class WorkspaceNotConfiguredError extends Error {
  constructor() {
    super(
      `本地文件/命令能力未启用：请配置环境变量 ${WORKSPACE_ROOTS_ENV}（允许 Agent 读写的绝对路径，` +
        `多路径用 "${path.delimiter}" 分隔，如 /home/me/project${path.delimiter}/tmp/build）`,
    )
    this.name = 'WorkspaceNotConfiguredError'
  }
}

export class PathOutsideWorkspaceError extends Error {
  constructor(readonly inputPath: string, reason: string) {
    super(reason)
    this.name = 'PathOutsideWorkspaceError'
  }
}

/** 解析围栏配置；未配置返回 []（调用方以 WorkspaceNotConfiguredError 拒绝服务） */
export function getWorkspaceRoots(env: string | undefined = process.env[WORKSPACE_ROOTS_ENV]): string[] {
  if (!env || env.trim() === '') return []
  const roots: string[] = []
  for (const raw of env.split(path.delimiter)) {
    const p = raw.trim()
    if (p === '' || !path.isAbsolute(p)) continue
    try {
      // realpath 归一（macOS /var → /private/var 之类的 symlink 前缀）
      roots.push(fs.realpathSync(p))
    } catch {
      // 不存在的根：按字面 resolve 保留（写时可 mkdir -p 建出来）
      roots.push(path.resolve(p))
    }
  }
  return roots
}

/**
 * 解析并校验路径：
 * - 绝对路径：必须落在某个 root 内
 * - 相对路径：基于 baseDir（缺省首个 root）
 * - realpath 校验最深存在祖先（防 symlink 指向围栏外）
 * - forWrite：拒绝 .git 内部路径
 * 返回归一绝对路径。
 */
export function resolveWorkspacePath(
  inputPath: string,
  opts: { roots: string[]; baseDir?: string; forWrite?: boolean },
): string {
  if (opts.roots.length === 0) throw new WorkspaceNotConfiguredError()
  if (inputPath.trim() === '') throw new PathOutsideWorkspaceError(inputPath, 'empty path')

  const baseDir = opts.baseDir && opts.baseDir.trim() !== '' ? opts.baseDir : opts.roots[0]
  // baseDir 自身必须在围栏内（shell workdir 等入口共用本校验）
  if (baseDir !== opts.roots[0] || path.isAbsolute(inputPath)) {
    assertInsideSomeRoot(baseDir, opts.roots, 'baseDir')
  }
  const joined = path.isAbsolute(inputPath) ? path.normalize(inputPath) : path.resolve(baseDir, inputPath)
  assertInsideSomeRoot(joined, opts.roots, inputPath)

  const finalAbs = assertRealpathInsideRoot(joined, opts.roots, inputPath)

  if (opts.forWrite) {
    const parts = finalAbs.split(path.sep)
    if (parts.includes('.git')) {
      throw new PathOutsideWorkspaceError(inputPath, 'writing inside .git is not allowed')
    }
  }
  return finalAbs
}

function assertInsideSomeRoot(abs: string, roots: string[], inputPath: string): void {
  const ok = roots.some((root) => {
    const rel = path.relative(root, abs)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  })
  if (!ok) {
    throw new PathOutsideWorkspaceError(
      inputPath,
      `writing outside of the project; rejected by user approval settings: ${inputPath}`,
    )
  }
}

/** symlink 逃逸：对最深存在祖先取 realpath 后重新校验围栏 */
function assertRealpathInsideRoot(abs: string, roots: string[], inputPath: string): string {
  let existing = abs
  for (;;) {
    try {
      fs.statSync(existing)
      break
    } catch {
      const parent = path.dirname(existing)
      if (parent === existing) break // 到底（如盘根）——按原路径放行由后续 open 报错
      existing = parent
    }
  }
  let realExisting = existing
  try {
    realExisting = fs.realpathSync(existing)
  } catch {
    // raced delete：退回字面路径
  }
  const finalAbs = realExisting + abs.slice(existing.length)
  assertInsideSomeRoot(finalAbs, roots, inputPath)
  return finalAbs
}
