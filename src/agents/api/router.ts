/**
 * Agent HTTP API 路由（spec 2026-05-09 ep-redesign §3.2 D4 · P-21）
 *
 * 把 Episode Production Skill 暴露为 HTTP REST API：
 *   POST /api/agents/<skill_name>  body: { ...skill input } → { ok, data }
 *   GET  /api/agents/skills        列所有 skill 元数据
 *
 * 鉴权：当前复用现有 cookie session（requireAuth）；后续 follow-up 加 Bearer API key。
 *
 * 多租户：runWithUserAsync 注入 ALS userId，core service 自动隔离。
 */

import path from 'path'
import { Router, type Request, type Response } from 'express'
import { runWithUserAsync } from '@core/context/user-context'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { requireAuth } from '../../web/server/auth/middleware'
import { ALL_SKILLS, findSkill, type SkillContext } from '../skills/registry'

const router = Router()

/** GET /api/agents/skills — 列所有 skill 元数据（无需登录，便于文档展示） */
router.get('/skills', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    data: ALL_SKILLS.map((s) => ({
      name: s.name,
      displayName: s.displayName,
      description: s.description,
      category: s.category,
      inputSchema: s.inputSchema,
      outputSchema: s.outputSchema,
      errors: s.errors,
      rateLimitPerHour: s.rateLimitPerHour,
    })),
  })
})

/** POST /api/agents/<skill_name> — 调用 skill */
router.post('/:skillName', requireAuth, async (req: Request, res: Response) => {
  const skillName = req.params.skillName
  const skill = findSkill(skillName)
  if (!skill) {
    res.status(404).json({ ok: false, error: `Skill 不存在：${skillName}` })
    return
  }

  const userId = req.user!.userId
  try {
    const result = await runWithUserAsync(userId, async () => {
      const db = getCoreDatabaseManager()
      if (!db.dataSource) throw new Error('数据库未初始化')

      const userDataPath = getPathProvider().getUserDataPath()
      const ctx: SkillContext = {
        ds: db.dataSource,
        userId,
        storageRoot: path.join(userDataPath, 'user-assets'),
        projectAssetRoot: path.join(userDataPath, 'asset-images'),
        tempDir: getPathProvider().getTempPath(),
      }
      return await skill.execute(ctx, req.body ?? {})
    })
    res.json({ ok: true, data: result })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? String(e) })
  }
})

export default router
