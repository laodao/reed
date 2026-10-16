/**
 * 技能服务注册器
 * @module core/platform/workflow/skills/skill-registry
 * @description workflow-boot 装配后注册单例；skill-call 节点与 IPC handler 经 getter 取用。
 *              未注册时 getter 抛错（同 getToolService 纪律）。
 */

import { SkillService } from './skill.service'

let _skillService: SkillService | null = null

export function registerSkillService(svc: SkillService): void {
  _skillService = svc
}

export function getSkillService(): SkillService {
  if (!_skillService) {
    throw new Error('技能服务未注册（workflow-boot 装配失败或未调用）')
  }
  return _skillService
}

/** 测试/关停用 */
export function resetSkillService(): void {
  _skillService = null
}
