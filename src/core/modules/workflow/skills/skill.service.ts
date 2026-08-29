/**
 * 技能服务（Skill 技能包管理）
 * @module core/modules/workflow/skills/skill.service
 * @description 技能来源两级：
 *  - 内置：代码内联 SKILL.md（source=builtin），只读，可「复制为自定义」；
 *  - 用户：技能包目录 <dataPath>/skills/<id>/SKILL.md（source=user），可新建/编辑/删除/导入/导出。
 *  支持：列表/详情/解析（含 references 拼装）/CRUD/目录导入/导出/内置复制。
 *  执行（skill-call 节点）经 resolveSkill 取完整定义（正文 + 系统提示词 + references）。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import { createLogger } from '@core/utils/logger'
import { SKILL_MD_FILENAME, SKILL_NAME_PATTERN } from '@shared/types/workflow-skill.types'
import type { WorkflowSkill, WorkflowSkillInput } from '@shared/types/workflow-skill.types'
import { BUILTIN_SKILLS } from './builtin-skills'
import { parseSkillMarkdown, serializeSkillMarkdown } from './skill-parser'

const logger = createLogger('SkillService')

/** 技能包新增/编辑入参（不含 id——id 由 name 派生） */
export interface UpsertSkillInput {
  name: string
  description: string
  title?: string
  whenToUse?: string
  category?: string
  inputs?: WorkflowSkillInput[]
  systemPrompt?: string
  body: string
  outputDesc?: string
}

export class SkillService {
  /** 用户技能根目录（dataPath/skills） */
  private root(): string {
    return join(getPathProvider().getDataPath(), 'skills')
  }

  // ==================== 内置 ====================

  private builtinAll(): WorkflowSkill[] {
    return BUILTIN_SKILLS.map(b => parseSkillMarkdown(b.markdown, { source: 'builtin' }))
  }

  private builtinById(id: string): WorkflowSkill | null {
    for (const b of BUILTIN_SKILLS) {
      if (b.id === id) return parseSkillMarkdown(b.markdown, { source: 'builtin' })
    }
    return null
  }

  // ==================== 用户（目录 bundle 扫描） ====================

  private userSkillDir(id: string): string {
    return join(this.root(), id)
  }

  /** 扫描用户技能目录（仅识别 <root>/<id>/SKILL.md，目录名须与 frontmatter name 一致） */
  private userAll(): WorkflowSkill[] {
    const root = this.root()
    if (!existsSync(root)) return []
    const out: WorkflowSkill[] = []
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const md = join(root, entry.name, SKILL_MD_FILENAME)
      if (!existsSync(md)) continue
      try {
        const skill = parseSkillMarkdown(readFileSync(md, 'utf-8'), {
          dirPath: join(root, entry.name),
          source: 'user',
        })
        if (skill.id !== entry.name) {
          logger.warn(`[skills] 技能目录名 ${entry.name} 与 frontmatter name ${skill.id} 不一致，跳过`)
          continue
        }
        out.push(skill)
      } catch (e) {
        logger.warn(`[skills] 跳过无效技能 ${entry.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    return out
  }

  private userById(id: string): WorkflowSkill | null {
    return this.userAll().find(s => s.id === id) ?? null
  }

  /** 读取技能包 references/（.md/.txt），执行时拼入上下文 */
  private withReferences(skill: WorkflowSkill): WorkflowSkill {
    if (!skill.dirPath) return skill
    const refDir = join(skill.dirPath, 'references')
    if (!existsSync(refDir)) return skill
    const refs = readdirSync(refDir)
      .filter(f => /\.(md|txt)$/i.test(f))
      .map(f => ({ name: f, content: readFileSync(join(refDir, f), 'utf-8') }))
    return refs.length > 0 ? { ...skill, references: refs } : skill
  }

  /** 写技能包（目录 + SKILL.md） */
  private writeSkill(skill: WorkflowSkill): void {
    const dir = this.userSkillDir(skill.id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, SKILL_MD_FILENAME), serializeSkillMarkdown(skill), 'utf-8')
  }

  // ==================== 对外 API ====================

  /** 全部技能（用户优先覆盖内置同名；按 id 排序） */
  list(): WorkflowSkill[] {
    const map = new Map<string, WorkflowSkill>()
    for (const s of this.builtinAll()) map.set(s.id, s)
    for (const s of this.userAll()) map.set(s.id, s) // 用户覆盖内置（宽容：手工放置同名目录）
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id))
  }

  /** 技能详情（不含 references；列表页/编辑用） */
  get(id: string): WorkflowSkill | null {
    return this.userById(id) ?? this.builtinById(id)
  }

  /** 执行用：完整定义（含 references 拼装） */
  resolveSkill(id: string): WorkflowSkill | null {
    const user = this.userById(id)
    if (user) return this.withReferences(user)
    return this.builtinById(id)
  }

  /** 新建用户技能（name=kebab-case，不与内置/已有冲突） */
  create(input: UpsertSkillInput): WorkflowSkill {
    const id = input.name.trim()
    if (!SKILL_NAME_PATTERN.test(id)) {
      throw new Error('技能名称必须是 kebab-case（小写字母数字，用中划线分隔）')
    }
    if (this.builtinById(id)) throw new Error(`技能 ${id} 与内置技能重名，请换一个名称`)
    if (this.userById(id)) throw new Error(`技能 ${id} 已存在`)
    const skill: WorkflowSkill = {
      id,
      name: input.title?.trim() || id,
      description: input.description.trim(),
      whenToUse: input.whenToUse?.trim() || undefined,
      category: input.category?.trim() || '未分类',
      source: 'user',
      dirPath: null,
      inputs: input.inputs ?? [],
      outputDesc: input.outputDesc?.trim() || undefined,
      systemPrompt: input.systemPrompt ?? '',
      body: input.body,
      modelInvocable: true,
    }
    this.writeSkill(skill)
    return this.userById(id)!
  }

  /** 更新用户技能（内置技能返回错误——需先复制为自定义） */
  update(id: string, patch: Partial<UpsertSkillInput>): WorkflowSkill {
    const current = this.userById(id)
    if (!current) throw new Error(`技能 ${id} 不存在或为内置技能（内置请先「复制为自定义」）`)
    const next: WorkflowSkill = {
      ...current,
      description: patch.description !== undefined ? patch.description.trim() : current.description,
      name: patch.title !== undefined && patch.title.trim() ? patch.title.trim() : (patch.name !== undefined ? patch.name : current.name),
      whenToUse: patch.whenToUse !== undefined ? (patch.whenToUse.trim() || undefined) : current.whenToUse,
      category: patch.category !== undefined ? (patch.category.trim() || '未分类') : current.category,
      inputs: patch.inputs !== undefined ? patch.inputs : current.inputs,
      outputDesc: patch.outputDesc !== undefined ? (patch.outputDesc.trim() || undefined) : current.outputDesc,
      systemPrompt: patch.systemPrompt !== undefined ? patch.systemPrompt : current.systemPrompt,
      body: patch.body !== undefined ? patch.body : current.body,
    }
    this.writeSkill(next)
    return this.userById(id)!
  }

  /** 删除用户技能（内置返回错误） */
  remove(id: string): void {
    if (this.builtinById(id) && !this.userById(id)) {
      throw new Error('内置技能不可删除（可「复制为自定义」后编辑副本）')
    }
    const dir = this.userSkillDir(id)
    if (!existsSync(dir)) throw new Error(`技能 ${id} 不存在`)
    rmSync(dir, { recursive: true, force: true })
  }

  /** 内置技能复制为自定义（用户副本） */
  forkBuiltin(id: string): WorkflowSkill {
    const builtin = this.builtinById(id)
    if (!builtin) throw new Error(`内置技能 ${id} 不存在`)
    if (this.userById(id)) throw new Error(`技能 ${id} 的自定义版本已存在（可先删除再复制）`)
    this.writeSkill({ ...builtin, source: 'user', dirPath: null })
    return this.userById(id)!
  }

  /**
   * 导入技能包：目录（含 SKILL.md 及其 references/assets）或 .md 文件。
   * 统一落为 <root>/<id>/SKILL.md 目录形态；id 冲突报错。
   */
  importFromPath(srcPath: string): WorkflowSkill {
    if (!existsSync(srcPath)) throw new Error('导入路径不存在')
    const stat = statSync(srcPath)
    let skill: WorkflowSkill
    let copyFromDir: string | null = null
    if (stat.isDirectory()) {
      const md = join(srcPath, SKILL_MD_FILENAME)
      if (!existsSync(md)) throw new Error(`目录 ${srcPath} 下没有 SKILL.md`)
      skill = parseSkillMarkdown(readFileSync(md, 'utf-8'), { dirPath: srcPath, source: 'user' })
      copyFromDir = srcPath
    } else if (/\.md$/i.test(srcPath)) {
      skill = parseSkillMarkdown(readFileSync(srcPath, 'utf-8'), { source: 'user' })
      if (basename(srcPath, extname(srcPath)) !== skill.id) {
        // 平铺文件：文件名与 frontmatter name 不一致时以 frontmatter 为准（目录形态统一）
        logger.warn(`[skills] 文件 ${basename(srcPath)} 与技能名 ${skill.id} 不一致，以 frontmatter 为准`)
      }
    } else {
      throw new Error('仅支持导入技能目录或 .md 技能文件')
    }
    if (this.builtinById(skill.id)) throw new Error(`技能 ${skill.id} 与内置技能重名`)
    if (this.userById(skill.id)) throw new Error(`技能 ${skill.id} 已存在，请先删除再导入`)
    if (copyFromDir) {
      const dest = this.userSkillDir(skill.id)
      mkdirSync(dest, { recursive: true })
      // 只复制技能包内容（SKILL.md / prompts / references / assets），不复制无关文件
      for (const name of readdirSync(srcPath)) {
        const s = join(srcPath, name)
        if (existsSync(s)) cpSync(s, join(dest, name), { recursive: true })
      }
    } else {
      this.writeSkill(skill)
    }
    return this.userById(skill.id)!
  }

  /** 导出技能包到目标目录：<destDir>/<id>/（SKILL.md + references/assets） */
  exportToPath(id: string, destDir: string): string {
    const skill = this.resolveSkill(id)
    if (!skill) throw new Error(`技能 ${id} 不存在`)
    const out = join(destDir, id)
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, SKILL_MD_FILENAME), serializeSkillMarkdown(skill), 'utf-8')
    if (skill.dirPath) {
      for (const name of ['prompts', 'references', 'assets']) {
        const src = join(skill.dirPath, name)
        if (existsSync(src)) cpSync(src, join(out, name), { recursive: true })
      }
    }
    return out
  }
}
