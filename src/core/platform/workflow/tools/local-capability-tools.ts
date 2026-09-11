/**
 * 本地能力工具（44 号；借 codex exec_command/apply_patch/read 语义）
 * @module core/platform/workflow/tools/local-capability-tools
 *
 * 面向「本项目作为基础设施承载 AI coding / 文档生产等业务」的本地工具面：
 *   fs_read_file / fs_list_dir   读类，免审批（对标 codex 只读沙箱自动放行）
 *   fs_apply_patch               补丁格式写类，需审批（approvalCard 展示变更摘要）
 *   shell_exec / shell_write     命令执行，需审批 + Amendment 缓疲劳
 *
 * 安全：工作区围栏（AGENT_WORKSPACE_ROOTS）+ realpath 防 symlink 逃逸 + .git 写拒绝；
 * 无 OS 级沙箱（登记 44 号），安全由围栏 + 审批默认拒绝承担。
 * 桌面端限定（Web 端结构化报错——与 code_run 同一门禁，防服务端 RCE）。
 *
 * 依赖方向（22 号 §3，同 builtin 工具）：引擎在 workflow/local/，本文件装配注册进
 * agent-runtime 的 AgentToolRegistry；宿主按白名单选用（聊天宿主只放读类两件）。
 */

import { z } from 'zod'
import { createLogger } from '@core/utils/logger'
import fs from 'node:fs'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { isElectronRuntime } from '../nodes/code-nodes'
import { parsePatch, applyPatchOps, PatchParseError, type PatchOp } from '../local/patch'
import { ShellSessionManager } from '../local/shell-sessions'
import { getWorkspaceRoots, resolveWorkspacePath } from '../local/workspace'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'

// —— 常量（观测面/预算；登记 44 号） ——
const READ_FILE_MAX_BYTES = 512 * 1024
const READ_FILE_KEEP_BYTES = 128 * 1024
const BINARY_SNIFF_BYTES = 8 * 1024
const LIST_DIR_MAX_ENTRIES = 2_000
const PATCH_SUMMARY_MAX_CHARS = 2_000

const logger = createLogger('LocalCapabilityTools')

// ==================== 输入 schema ====================

const FsReadFileInput = z.object({
  path: z.string().min(1).describe('文件路径（相对工作区根或绝对路径，必须在已配置的工作区内）'),
  offset_lines: z.number().int().min(1).optional().describe('起始行（1-based，缺省 1）'),
  max_lines: z.number().int().min(1).max(5_000).optional().describe('最多返回行数（缺省 2000）'),
})

const FsListDirInput = z.object({
  path: z.string().optional().describe('目录路径（缺省=工作区根）'),
  depth: z.number().int().min(1).max(3).optional().describe('递归深度（缺省 1）'),
})

const FsApplyPatchInput = z.object({
  patch: z.string().min(1).describe('补丁全文（codex apply_patch 格式：*** Begin Patch ... *** End Patch）'),
})

const ShellExecInput = z.object({
  command: z.string().min(1).describe('要执行的 shell 命令（/bin/bash -c）'),
  workdir: z.string().optional().describe('工作目录（必须在已配置的工作区内；缺省=第一个工作区根）'),
  yield_ms: z.number().int().min(250).max(30_000).optional().describe('首次返回前等待毫秒（缺省 10000；超时进程仍在运行则返回 session_id）'),
})

const ShellWriteInput = z.object({
  session_id: z.number().int().describe('shell_exec 返回的会话 id'),
  data: z.string().optional().describe('写入 stdin 的文本（含换行才会被执行；缺省=纯轮询读输出）'),
  close_stdin: z.boolean().optional().describe('发送 EOF 关闭 stdin'),
  yield_ms: z.number().int().min(250).max(300_000).optional().describe('本次等待毫秒（纯轮询缺省 5000，有输入缺省 250）'),
})

// ==================== 装配 ====================

export interface LocalCapabilityToolsDeps {
  /** 测试注入口（缺省读 AGENT_WORKSPACE_ROOTS） */
  roots?: () => string[]
  /** 测试注入口（缺省 isElectronRuntime()） */
  desktop?: () => boolean
  /** 测试注入口（缺省共享单例） */
  sessions?: ShellSessionManager
}

/** 共享会话管理器（进程级单例：会话表跨工具调用存活） */
let sharedSessions: ShellSessionManager | null = null
function getSessions(): ShellSessionManager {
  sharedSessions ??= new ShellSessionManager()
  // 进程退出兜底：杀光在途子进程（防桌面应用退出后孤儿进程——review P2-7）
  process.once('exit', () => sharedSessions?.killAll())
  return sharedSessions
}

export function buildLocalCapabilityToolDefs(deps: LocalCapabilityToolsDeps = {}): AgentToolDef[] {
  const roots = deps.roots ?? (() => getWorkspaceRoots())
  const isDesktop = deps.desktop ?? isElectronRuntime
  const sessions = deps.sessions ?? getSessions()

  const assertDesktop = (): void => {
    if (!isDesktop()) {
      throw new Error('本地文件/命令工具仅桌面端可用（Web 端不支持在服务端执行本地操作）')
    }
  }

  // —— 读类①：读文件 ——
  const fsReadFile: AgentToolDef<z.infer<typeof FsReadFileInput>> = {
    name: 'fs_read_file',
    description:
      '读取工作区内的文本文件（大文件自动保头保尾；二进制文件只回元信息）。相对路径基于第一个工作区根。',
    inputSchema: FsReadFileInput,
    dangerLevel: 'read',
    async execute(input) {
      assertDesktop()
      const abs = resolveWorkspacePath(input.path, { roots: roots() })
      const stat = await fsp.stat(abs)
      if (stat.isDirectory()) throw new Error(`path is a directory: ${input.path}`)
      // 大文件不全量载入（对抗 review P1-4：GB 级文件会 OOM 主进程）——定长读头尾
      if (stat.size > READ_FILE_MAX_BYTES) {
        const handle = await fsp.open(abs, 'r')
        try {
          const head = Buffer.alloc(READ_FILE_KEEP_BYTES)
          await handle.read(head, 0, READ_FILE_KEEP_BYTES, 0)
          const tailStart = stat.size - READ_FILE_KEEP_BYTES
          const tail = Buffer.alloc(READ_FILE_KEEP_BYTES)
          await handle.read(tail, 0, READ_FILE_KEEP_BYTES, tailStart)
          return {
            path: input.path,
            content: `${head.toString('utf8')}\n... ${stat.size - READ_FILE_KEEP_BYTES * 2} bytes omitted ...\n${tail.toString('utf8')}`,
            size_bytes: stat.size,
            note: '文件过大，仅保留头尾（可用 offset_lines/max_lines 之外改用 shell 工具处理）',
          }
        } finally {
          await handle.close()
        }
      }
      const raw = await fsp.readFile(abs)
      if (raw.subarray(0, Math.min(BINARY_SNIFF_BYTES, raw.length)).includes(0)) {
        return { path: input.path, binary: true, size_bytes: raw.length }
      }
      const allLines = raw.toString('utf8').split('\n')
      const offset = input.offset_lines ?? 1
      const maxLines = input.max_lines ?? 2_000
      const slice = allLines.slice(offset - 1, offset - 1 + maxLines)
      return {
        path: input.path,
        content: slice.join('\n'),
        total_lines: allLines.length,
        offset_lines: offset,
        truncated: offset - 1 + slice.length < allLines.length || undefined,
      }
    },
  }

  // —— 读类②：列目录 ——
  const fsListDir: AgentToolDef<z.infer<typeof FsListDirInput>> = {
    name: 'fs_list_dir',
    description: '列目录（可递归至 3 层）。缺省列出第一个工作区根。',
    inputSchema: FsListDirInput,
    dangerLevel: 'read',
    async execute(input) {
      assertDesktop()
      const abs = resolveWorkspacePath(input.path ?? '.', { roots: roots() })
      const depth = input.depth ?? 1
      const entries: Array<Record<string, unknown>> = []
      const walk = async (dir: string, level: number): Promise<void> => {
        if (entries.length >= LIST_DIR_MAX_ENTRIES) return
        let names: fs.Dirent[]
        try {
          names = await fsp.readdir(dir, { withFileTypes: true })
        } catch (e) {
          if (level === 0) throw e
          return
        }
        names.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
        for (const d of names) {
          if (entries.length >= LIST_DIR_MAX_ENTRIES) return
          const full = path.join(dir, d.name)
          const rel = path.relative(abs, full)
          if (d.isDirectory()) {
            entries.push({ path: rel, type: 'dir' })
            if (level < depth) await walk(full, level + 1)
          } else {
            let size: number | undefined
            try {
              size = (await fsp.stat(full)).size
            } catch {
              size = undefined
            }
            entries.push({ path: rel, type: 'file', ...(size !== undefined ? { size_bytes: size } : {}) })
          }
        }
      }
      await walk(abs, 0)
      return { root: input.path ?? '.', entries }
    },
  }

  // —— 写类：补丁应用 ——
  const fsApplyPatch: AgentToolDef<z.infer<typeof FsApplyPatchInput>> = {
    name: 'fs_apply_patch',
    description:
      '用补丁一次修改多个文件（codex apply_patch 格式）。支持 *** Add File / Update File（+ Move to）/ Delete File；' +
      'Update 用 @@ 上下文定位，上下文匹配带容错（尾空白/全空白/Unicode 标点归一）。写 .git 或工作区外会被拒绝。',
    inputSchema: FsApplyPatchInput,
    dangerLevel: 'write',
    requiresApproval: true,
    approvalCard: {
      title: '应用文件补丁',
      summary: (i) => summarizePatch((i as { patch?: string }).patch ?? ''),
    },
    async execute(input) {
      assertDesktop()
      if (!input.patch.trim()) throw new Error('empty patch')
      // ① 解析（错误文案逐字对齐 codex；行号包装）
      let ops: PatchOp[]
      try {
        ops = parsePatch(input.patch)
      } catch (e) {
        if (e instanceof PatchParseError) {
          throw new Error(`Invalid hunk on line ${e.lineNumber}: ${e.message}`)
        }
        throw e
      }
      // ② 围栏解析 + 重复目标冲突（codex invocation.rs:234-241）
      const r = roots()
      const seen = new Map<string, string>()
      for (const op of ops) {
        const targets = op.kind === 'update' ? [op.path, ...(op.moveTo ? [op.moveTo] : [])] : [op.path]
        for (const target of targets) {
          const abs = resolveWorkspacePath(target, { roots: r, forWrite: true })
          const prev = seen.get(abs)
          if (prev !== undefined && !(op.kind === 'update' && prev === op.path)) {
            throw new Error(`multiple operations target ${abs}`)
          }
          if (!seen.has(abs)) seen.set(abs, target)
        }
      }
      // ③ 纯函数应用（ops 保持原始拼写；resolve 注入围栏校验后的绝对路径）
      const contentOf = new Map<string, string | null>()
      const readOf = (p: string): string | null => {
        const abs = resolveWorkspacePath(p, { roots: r, forWrite: true })
        if (contentOf.has(abs)) return contentOf.get(abs) ?? null
        try {
          const c = fs.readFileSync(abs, 'utf8')
          contentOf.set(abs, c)
          return c
        } catch {
          contentOf.set(abs, null)
          return null
        }
      }
      const resolveOf = (p: string): string => resolveWorkspacePath(p, { roots: r, forWrite: true })
      const { effects, successText } = applyPatchOps(ops, { read: readOf, resolve: resolveOf })
      if (effects.length === 0) {
        return { output: successText }
      }
      // ④ 落盘（写自动建父目录；codex write_file_with_missing_parent_retry 同语义）
      for (const effect of effects) {
        if (effect.action === 'write') {
          await fsp.mkdir(path.dirname(effect.absPath), { recursive: true })
          await fsp.writeFile(effect.absPath, effect.content ?? '', 'utf8')
        } else {
          try {
            const st = await fsp.stat(effect.absPath)
            if (st.isDirectory()) throw new Error(`path is a directory: ${effect.displayPath}`)
            await fsp.unlink(effect.absPath)
          } catch (e) {
            if (e instanceof Error && e.message.startsWith('path is a directory')) throw e
            throw new Error(`Failed to delete file ${effect.displayPath}`)
          }
        }
      }
      return { output: successText }
    },
  }

  // —— 执行类：shell_exec / shell_write ——
  const shellExec: AgentToolDef<z.infer<typeof ShellExecInput>> = {
    name: 'shell_exec',
    description:
      '执行 shell 命令（/bin/bash -c）。长命令在 yield_ms（缺省 10s）后返回部分输出与会话 id（session_id），' +
      '用 shell_write 续读；已结束则直接给退出码。stdout/stderr 合流输出，超大输出自动保头保尾。',
    inputSchema: ShellExecInput,
    dangerLevel: 'exec',
    requiresApproval: true,
    executeTimeoutMs: 90_000,
    async execute(input) {
      assertDesktop()
      const workdir = input.workdir
        ? resolveWorkspacePath(input.workdir, { roots: roots() })
        : resolveWorkspacePath('.', { roots: roots() })
      const r = await sessions.exec({ command: input.command, workdir, yieldMs: input.yield_ms })
      return r
    },
  }

  const shellWrite: AgentToolDef<z.infer<typeof ShellWriteInput>> = {
    name: 'shell_write',
    description:
      '向 shell_exec 的在途会话写 stdin（文本需自带换行才会被执行）或纯轮询读取新输出；close_stdin 发送 EOF；' +
      'data 为 U+0003 时对进程发中断（SIGINT）。会话退出后返回退出码并失效。',
    inputSchema: ShellWriteInput,
    dangerLevel: 'exec',
    requiresApproval: true,
    executeTimeoutMs: 320_000,
    async execute(input) {
      assertDesktop()
      return await sessions.write({
        sessionId: input.session_id,
        ...(input.data !== undefined ? { data: input.data } : {}),
        ...(input.close_stdin !== undefined ? { closeStdin: input.close_stdin } : {}),
        ...(input.yield_ms !== undefined ? { yieldMs: input.yield_ms } : {}),
      })
    },
  }

  // 具体泛型 → 数组形态收口（registry.register 内部再做宽化）
  return [fsReadFile, fsListDir, fsApplyPatch, shellExec, shellWrite] as unknown as AgentToolDef[]
}

/** 注册进 registry（workflow-boot 组合根调用；source='builtin'）。
 *  Web 端整组跳过（对抗 review P2-4）：模型可见面不出现只会报错的工具 */
export function registerLocalCapabilityTools(registry: AgentToolRegistry, deps: LocalCapabilityToolsDeps = {}): void {
  if (!(deps.desktop ?? isElectronRuntime)()) {
    logger.info('[local-capability] 非桌面运行时，跳过本地能力工具注册')
    return
  }
  for (const def of buildLocalCapabilityToolDefs(deps)) {
    registry.register(def)
  }
}

/** 本地能力工具名清单（宿主白名单引用） */
export const LOCAL_CAPABILITY_TOOL_NAMES = ['fs_read_file', 'fs_list_dir', 'fs_apply_patch', 'shell_exec', 'shell_write'] as const

// ==================== 内部 ====================

/** 审批卡摘要：逐文件动作 + 行数增减（截断到预算） */
function summarizePatch(patch: string): string {
  const lines: string[] = []
  let currentFile = ''
  let added = 0
  let removed = 0
  const flush = (): void => {
    if (currentFile) lines.push(`${currentFile}（+${added} / -${removed}）`)
    added = 0
    removed = 0
  }
  for (const raw of patch.split('\n')) {
    const t = raw.trim()
    if (t.startsWith('*** Add File:') || t.startsWith('*** Delete File:') || t.startsWith('*** Update File:')) {
      flush()
      currentFile = t.replace(/^\*\*\* (Add File|Delete File|Update File): /, (_m, kind) => `${kind === 'Delete File' ? '删除' : kind === 'Add File' ? '新增' : '修改'} `)
      continue
    }
    if (t.startsWith('*** Move to:')) {
      flush()
      lines.push(`${t.slice('*** Move to:'.length).trim()}（自原文件移动）`)
      currentFile = ''
      continue
    }
    if (t.startsWith('+')) added++
    else if (t.startsWith('-') && !t.startsWith('---')) removed++
  }
  flush()
  const text = lines.length > 0 ? lines.join('\n') : '（空补丁）'
  return text.length > PATCH_SUMMARY_MAX_CHARS ? `${text.slice(0, PATCH_SUMMARY_MAX_CHARS)}…` : text
}
