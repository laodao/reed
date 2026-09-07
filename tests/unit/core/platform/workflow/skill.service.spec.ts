/**
 * 技能服务测试：内置注册 + 用户技能目录管理（CRUD / 导入导出 / 内置复制 / references 拼装）
 * @module tests/unit/core/platform/workflow/skill.service
 * @description 用临时目录 mock getPathProvider 的 dataPath；校验技能包目录形态
 *              （<root>/<id>/SKILL.md）、来源合并（用户覆盖内置同名）、id 冲突与格式校验。
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpRoot = mkdtempSync(join(tmpdir(), 'skill-svc-'))
vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({ getDataPath: () => tmpRoot }),
}))

import { SkillService } from '@core/platform/workflow/skills/skill.service'

const svc = new SkillService()

describe('技能服务', () => {
  afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }))

  describe('内置技能', () => {
    it('list 含全部内置预置技能（≥6 个，source=builtin）', () => {
      const list = svc.list().filter(s => s.source === 'builtin')
      expect(list.length).toBeGreaterThanOrEqual(6)
      const ids = list.map(s => s.id)
      expect(ids).toContain('short-video-script')
      expect(ids).toContain('wechat-article')
      expect(ids).toContain('deep-analysis')
      // 内置技能均有 inputs schema（短视频脚本至少 material 参数）
      const script = list.find(s => s.id === 'short-video-script')!
      expect(script.inputs.some(i => i.key === 'material' && i.required)).toBe(true)
    })

    it('get 返回内置详情；resolve 可执行（含正文/系统提示词）', () => {
      const s = svc.resolveSkill('wechat-article')
      expect(s?.body).toContain('{{param.material}}')
      expect(s?.systemPrompt).toContain('公众号')
    })

    it('视频写作技能：standard/investigative 均内置可解析，investigative 带态度档与质疑纪律', () => {
      const list = svc.list().filter(s => s.source === 'builtin')
      const standard = list.find(s => s.id === 'video-writer-standard')
      const inv = list.find(s => s.id === 'video-writer-investigative')
      expect(standard).toBeTruthy()
      expect(inv).toBeTruthy()
      expect(standard!.body).toContain('{{param.material}}')
      expect(inv!.body).toContain('{{param.attitude}}')
      expect(inv!.systemPrompt).toContain('调查')
      expect(inv!.inputs.some(i => i.key === 'attitude' && i.options?.some(o => o.value === '犀利质疑'))).toBe(true)
      // 零括注纪律贯穿正文与系统提示词
      expect(inv!.body).toContain('零括注')
      expect(inv!.systemPrompt).toContain('口播正文')
    })
  })

  describe('用户技能（目录管理）', () => {
    beforeEach(() => {
      // 清理上一次用例产生的用户技能目录（保留内置不受影响）
      for (const entry of existsSync(join(tmpRoot, 'skills')) ? readdir(join(tmpRoot, 'skills')) : []) {
        rmSync(join(tmpRoot, 'skills', entry), { recursive: true, force: true })
      }
    })

    it('create：写技能包目录（<id>/SKILL.md），list 合并且用户优先于内置同名', () => {
      const created = svc.create({
        name: 'my-copy', title: '我的文案', description: '自定义文案技能', category: '文案写作',
        inputs: [{ key: 'topic', label: '主题', type: 'string', required: true }],
        systemPrompt: '你是文案专家',
        body: '主题：{{param.topic}}',
      })
      expect(created.id).toBe('my-copy')
      expect(created.source).toBe('user')
      expect(existsSync(join(tmpRoot, 'skills', 'my-copy', 'SKILL.md'))).toBe(true)
      // 持久化：重新扫描仍在
      const again = new SkillService().get('my-copy')
      expect(again?.name).toBe('我的文案')
      expect(again?.inputs).toHaveLength(1)
      // list 合并：内置 + 用户都在，用户版本覆盖内置同名
      const all = svc.list()
      expect(all.some(s => s.id === 'my-copy' && s.source === 'user')).toBe(true)
      expect(all.some(s => s.id === 'short-video-script' && s.source === 'builtin')).toBe(true)
    })

    it('create 校验：name 非 kebab-case / 与内置重名 / 已存在 → 报错', () => {
      expect(() => svc.create({ name: '非法 名称', description: 'x', body: 'b' })).toThrow(/kebab-case/)
      expect(() => svc.create({ name: 'short-video-script', description: 'x', body: 'b' })).toThrow(/内置/)
      svc.create({ name: 'dup-skill', description: 'x', body: 'b' })
      expect(() => svc.create({ name: 'dup-skill', description: 'x', body: 'b' })).toThrow(/已存在/)
    })

    it('update：修改内容写回；内置技能不可更新', () => {
      svc.create({ name: 'upd-skill', description: '旧描述', body: '旧正文' })
      const updated = svc.update('upd-skill', { description: '新描述', body: '新正文' })
      expect(updated.description).toBe('新描述')
      expect(readFileSync(join(tmpRoot, 'skills', 'upd-skill', 'SKILL.md'), 'utf-8')).toContain('新正文')
      expect(() => svc.update('short-video-script', { body: 'x' })).toThrow(/内置/)
    })

    it('remove：删除用户技能目录；内置不可删', () => {
      svc.create({ name: 'del-skill', description: 'x', body: 'b' })
      svc.remove('del-skill')
      expect(svc.get('del-skill')).toBeNull()
      expect(() => svc.remove('short-video-script')).toThrow(/内置/)
    })

    it('forkBuiltin：内置复制为用户副本（写目录、可编辑）；重复复制报错', () => {
      const fork = svc.forkBuiltin('deep-analysis')
      expect(fork.source).toBe('user')
      expect(existsSync(join(tmpRoot, 'skills', 'deep-analysis', 'SKILL.md'))).toBe(true)
      // 副本与内置内容一致
      const copy = svc.get('deep-analysis')!
      expect(copy.body).toContain('{{param.material}}')
      expect(() => svc.forkBuiltin('deep-analysis')).toThrow(/已存在/)
    })

    it('importFromPath：导入目录（含 references）→ resolveSkill 拼装 references', () => {
      const pkg = join(tmpRoot, 'import-pkg')
      mkdirSync(join(pkg, 'references'), { recursive: true })
      writeFileSync(join(pkg, 'SKILL.md'), `---
name: imported-skill
description: 导入的技能
---
正文用参考
`, 'utf-8')
      writeFileSync(join(pkg, 'references', 'style.md'), '风格指南：犀利幽默', 'utf-8')
      const imported = svc.importFromPath(pkg)
      expect(imported.id).toBe('imported-skill')
      const resolved = svc.resolveSkill('imported-skill')
      expect(resolved?.references).toEqual([{ name: 'style.md', content: '风格指南：犀利幽默' }])
      // 目录复制到技能根（references 一并复制）
      expect(existsSync(join(tmpRoot, 'skills', 'imported-skill', 'references', 'style.md'))).toBe(true)
    })

    it('importFromPath：导入 .md 平铺文件（包装为目录）；无效文件报错', () => {
      const md = join(tmpRoot, 'flat.md')
      writeFileSync(md, `---
name: flat-skill
description: 平铺技能
---
正文
`, 'utf-8')
      const s = svc.importFromPath(md)
      expect(s.id).toBe('flat-skill')
      expect(existsSync(join(tmpRoot, 'skills', 'flat-skill', 'SKILL.md'))).toBe(true)
      expect(() => svc.importFromPath(join(tmpRoot, 'nope'))).toThrow(/不存在/)
    })

    it('exportToPath：导出 <destDir>/<id>/SKILL.md（含 references）', () => {
      const dest = join(tmpRoot, 'export-dest')
      const out = svc.exportToPath('short-video-script', dest)
      expect(out).toBe(join(dest, 'short-video-script'))
      expect(existsSync(join(dest, 'short-video-script', 'SKILL.md'))).toBe(true)
    })

    it('用户目录名与 frontmatter name 不一致 → 扫描跳过（日志告警）', () => {
      mkdirSync(join(tmpRoot, 'skills', 'mismatch-dir'), { recursive: true })
      writeFileSync(join(tmpRoot, 'skills', 'mismatch-dir', 'SKILL.md'), `---
name: other-name
description: 目录名不一致
---
正文
`, 'utf-8')
      expect(svc.get('other-name')).toBeNull()
    })
  })
})

function readdir(dir: string): string[] {
  const { readdirSync } = require('node:fs') as typeof import('node:fs')
  return readdirSync(dir)
}
