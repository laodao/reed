/**
 * 技能蒸馏服务注册器（懒构造单例；getter 纪律同 skill-registry）
 * @module core/platform/workflow/skills/skill-distill-registry
 * @description 三处共用一个实例：IPC handler（任务表轮询）、工作流节点（execute 同步）、
 *              agent 工具（execute 同步）。测试经 setSkillDistillServiceForTests 注入假件。
 */

import { SkillDistillService } from './skill-distill.service'
import { defaultSkillDistillDeps } from './skill-distill-defaults'

let _service: SkillDistillService | null = null

export function getSkillDistillService(): SkillDistillService {
  if (!_service) _service = new SkillDistillService(defaultSkillDistillDeps)
  return _service
}

/** 测试注入点 */
export function setSkillDistillServiceForTests(s: SkillDistillService | null): void {
  _service = s
}

/** 测试/关停用 */
export function resetSkillDistillService(): void {
  _service = null
}
