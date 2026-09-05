/**
 * 资产来源跳转解析器（需求 3）
 * @module core/platform/assets/asset-source-link
 * @description 资产 source_ref=runId → 反查运行：
 *              - triggerInfo.source='app-session'（应用会话触发）→ 应用跳转
 *                （appId/sessionId → 应用会话页）
 *              - 手动/定时/其他触发 → 工作流运行跳转（runId → 运行详情页）
 *              由 workflow-boot 装配注入 AssetService（资产模块保持独立）。
 */

import type { AssetSourceLink, AssetSourceLinkResolver } from '@shared/types/asset.types'
import type { WorkflowRunRepository, WorkflowRunRecord } from '@core/database/repositories/workflow-run.repository'
import type { AppRepository, AppRecord } from '@core/database/repositories/app.repository'

export interface AssetSourceLinkDeps {
  runs: WorkflowRunRepository
  apps: AppRepository
}

/** 运行记录中带出的应用标识（triggerInfo.source=app-session） */
interface AppTriggerInfo {
  source?: string
  appId?: string
  sessionId?: string
}

export function createAssetSourceLinkResolver(deps: AssetSourceLinkDeps): AssetSourceLinkResolver {
  return {
    async resolve(runId: string): Promise<AssetSourceLink | null> {
      const run: WorkflowRunRecord | null = await deps.runs.getById(runId)
      if (!run) return null

      // 应用会话触发：跳应用会话页
      const info = (run.triggerInfo ?? {}) as AppTriggerInfo
      if (info.source === 'app-session' && info.appId) {
        const app: AppRecord | null = await deps.apps.findById(info.appId)
        return {
          type: 'app',
          appId: info.appId,
          sessionId: info.sessionId,
          runId: run.id,
          label: app?.name ?? '应用',
        }
      }

      // 工作流触发：跳运行详情（执行历史）
      return {
        type: 'workflow',
        runId: run.id,
        definitionId: run.definitionId,
        label: '工作流运行',
      }
    },
  }
}
