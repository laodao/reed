/**
 * episode-production · 项目管理 · IPC handler
 * @module core/packs/episode-production/handlers/project.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { VideoProjectConfig } from '@shared/types/story-to-video.types'
import { buildProjectSummary } from '@core/modules/episode-production/workflow/project-summary'

export function registerProjectHandlers(): void {
  // ==================== 项目管理 ====================
  ipcBridge.handle('ep:list-projects', handleListProjects)
  ipcBridge.handle('ep:get-project', handleGetProject)
  ipcBridge.handle('ep:create-project', handleCreateProject)
  ipcBridge.handle('ep:update-project', handleUpdateProject)
  ipcBridge.handle('ep:delete-project', handleDeleteProject)
  // FU5-A1 项目卡片聚合视图（episodeCount / progressPct / currentStageLabel / sourceType）
  ipcBridge.handle('ep:list-projects-summary', handleListProjectsSummary)
}

// ==================== 项目管理处理器 ====================

async function handleListProjects(
  _event: any,
  longWritingProjectId?: string
): Promise<IpcResponse> {
  try {
    console.log('[EpisodeProductionHandler] handleListProjects 被调用, longWritingProjectId:', longWritingProjectId)
    const db = getCoreDatabaseManager()
    if (!db.videoProjects) {
      console.error('[EpisodeProductionHandler] videoProjects 仓库未初始化')
      return { success: false, error: '数据库未初始化' }
    }

    const projects = longWritingProjectId
      ? await db.videoProjects.getByLongWritingProjectId(longWritingProjectId)
      : await db.videoProjects.getAll()

    console.log('[EpisodeProductionHandler] 查询到的项目数量:', projects.length)
    console.log('[EpisodeProductionHandler] 项目列表:', JSON.stringify(projects, null, 2))

    return { success: true, data: projects }
  } catch (error: any) {
    console.error('[EpisodeProductionHandler] 错误:', error)
    return { success: false, error: error.message || '获取项目列表失败' }
  }
}

async function handleGetProject(
  _event: any,
  projectId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    const project = await db.videoProjects.getById(projectId)
    if (!project) {
      return { success: false, error: '项目不存在' }
    }

    return { success: true, data: project }
  } catch (error: any) {
    return { success: false, error: error.message || '获取项目失败' }
  }
}

async function handleCreateProject(
  _event: any,
  name: string,
  longWritingProjectId: string | undefined,
  config?: VideoProjectConfig // 可选：剧本导入等路径不传，repo 层默认 {}
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    const project = await db.videoProjects.create({
      name,
      longWritingProjectId: longWritingProjectId || undefined,  // 空字符串转为 undefined
      config
    })

    return { success: true, data: project }
  } catch (error: any) {
    return { success: false, error: error.message || '创建项目失败' }
  }
}

async function handleUpdateProject(
  _event: any,
  projectId: string,
  data: { name?: string; status?: string; config?: VideoProjectConfig; longWritingProjectId?: string }
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    const project = await db.videoProjects.update(projectId, data)
    if (!project) {
      return { success: false, error: '项目不存在' }
    }

    return { success: true, data: project }
  } catch (error: any) {
    return { success: false, error: error.message || '更新项目失败' }
  }
}

async function handleListProjectsSummary(
  _event: any,
  longWritingProjectId?: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoProjects || !db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    const projects = longWritingProjectId
      ? await db.videoProjects.getByLongWritingProjectId(longWritingProjectId)
      : await db.videoProjects.getAll()

    // 并发拉每个项目的 episodes（user_id scope 已在 repo 层加好）
    const summaries = await Promise.all(
      projects.map(async (p) => {
        const episodes = await db.videoEpisodes!.getByProjectId(p.id)
        return buildProjectSummary(p, episodes)
      }),
    )
    return { success: true, data: summaries }
  } catch (error: any) {
    console.error('[handleListProjectsSummary] 错误:', error)
    return { success: false, error: error.message || '获取项目摘要失败' }
  }
}

async function handleDeleteProject(
  _event: any,
  projectId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoProjects || !db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    // 引用完整性检查：项目下还有剧集时禁止删除，要求先删剧集
    // getByProjectId 已过滤 deletedAt: IsNull()，只统计未删除的剧集
    const episodes = await db.videoEpisodes.getByProjectId(projectId)
    if (episodes.length > 0) {
      return {
        success: false,
        error: `项目下还有 ${episodes.length} 个剧集，请先删除所有剧集后再删除项目`,
      }
    }

    const success = await db.videoProjects.delete(projectId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除项目失败' }
  }
}
