/**
 * 网页收藏服务注册器
 * @module core/platform/assets/web-collect-registry
 * @description workflow-boot 装配后注册单例；collect-webpage 节点与
 *              wf:collect-node-output handler 经 getter 取用（同 asset-registry 纪律）。
 */
import { WebCollectService } from './web-collect.service'

let _service: WebCollectService | null = null

export function registerWebCollectService(svc: WebCollectService): void {
  _service = svc
}

export function getWebCollectService(): WebCollectService {
  if (!_service) {
    throw new Error('网页收藏服务未注册（workflow-boot 装配失败或未调用）')
  }
  return _service
}

/** 测试/关停用 */
export function resetWebCollectService(): void {
  _service = null
}
