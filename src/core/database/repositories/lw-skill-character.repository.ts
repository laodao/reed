/**
 * 技能角色关联仓库
 * @module database/repositories/lw-skill-character.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 *              UNIQUE(skill_id, character_id) + INSERT OR IGNORE 模拟。
 */

import { In, type DataSource } from 'typeorm'
import { LwSkillCharacterEntity } from '../entities/lw-skill-character.entity'
import { LwSkillEntity } from '../entities/lw-skill.entity'
import { BaseRepository } from '../base-repository'

export interface SkillCharacterRelation {
  id: string
  skillId: string
  characterId: string
  createdAt: number
}

export class LwSkillCharacterRepository extends BaseRepository<
  LwSkillCharacterEntity,
  SkillCharacterRelation
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwSkillCharacterEntity)
  }

  protected toDto(e: LwSkillCharacterEntity): SkillCharacterRelation {
    return {
      id: e.id,
      skillId: e.skillId,
      characterId: e.characterId,
      createdAt: e.createdAt,
    }
  }

  async getCharacterIdsBySkillId(skillId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { skillId } as any,
      select: ['characterId'],
    })
    return rows.map(r => r.characterId)
  }

  async getSkillIdsByCharacterId(characterId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { characterId } as any,
      select: ['skillId'],
    })
    return rows.map(r => r.skillId)
  }

  async getCharacterIdsBySkillIds(
    skillIds: string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (skillIds.length === 0) return result

    const rows = await this.repo.find({
      where: { skillId: In(skillIds) } as any,
      select: ['skillId', 'characterId'],
    })
    for (const row of rows) {
      if (!result.has(row.skillId)) result.set(row.skillId, [])
      result.get(row.skillId)!.push(row.characterId)
    }
    for (const skillId of skillIds) {
      if (!result.has(skillId)) result.set(skillId, [])
    }
    return result
  }

  /** INSERT OR IGNORE 语义：UNIQUE(skill_id, character_id) 命中时跳过 */
  async add(
    skillId: string,
    characterId: string,
  ): Promise<SkillCharacterRelation> {
    const id = this.generateId()
    const now = Date.now()
    const existing = await this.repo.findOne({
      where: { skillId, characterId } as any,
    })
    if (existing) {
      return this.toDto(existing)
    }
    const saved = await this.repo.save(
      this.repo.create({ id, skillId, characterId, createdAt: now }),
    )
    return this.toDto(saved)
  }

  async batchAdd(skillId: string, characterIds: string[]): Promise<void> {
    if (characterIds.length === 0) return
    await this.dataSource.transaction(async () => {
      for (const cid of characterIds) {
        await this.add(skillId, cid)
      }
    })
  }

  async replaceAll(skillId: string, characterIds: string[]): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwSkillCharacterEntity)
      await repo.delete({ skillId } as any)
      const now = Date.now()
      for (const cid of characterIds) {
        await repo.save(
          repo.create({
            id: this.generateId(),
            skillId,
            characterId: cid,
            createdAt: now,
          }),
        )
      }
    })
  }

  async delete(skillId: string, characterId: string): Promise<boolean> {
    const result = await this.repo.delete({ skillId, characterId } as any)
    return (result.affected ?? 0) > 0
  }

  async deleteBySkillId(skillId: string): Promise<number> {
    const result = await this.repo.delete({ skillId } as any)
    return result.affected ?? 0
  }

  async deleteByCharacterId(characterId: string): Promise<number> {
    const result = await this.repo.delete({ characterId } as any)
    return result.affected ?? 0
  }

  /** 从 JSON 字段迁移到关联表 */
  async migrateFromJson(projectId: string): Promise<number> {
    const skillRepo = this.dataSource.getRepository(LwSkillEntity)
    const skills = await skillRepo.find({
      where: { projectId } as any,
      select: ['id', 'characterIds'],
    })

    let migrated = 0
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwSkillCharacterEntity)
      const now = Date.now()
      for (const skill of skills) {
        const cids = (skill.characterIds as string[] | null) ?? []
        for (const cid of cids) {
          const existing = await repo.findOne({
            where: { skillId: skill.id, characterId: cid } as any,
          })
          if (!existing) {
            await repo.save(
              repo.create({
                id: this.generateId(),
                skillId: skill.id,
                characterId: cid,
                createdAt: now,
              }),
            )
            migrated++
          }
        }
      }
    })
    return migrated
  }

  private generateId(): string {
    return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
