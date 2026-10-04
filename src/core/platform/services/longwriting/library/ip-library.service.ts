/**
 * 角色 IP 库服务（设定资产库 P0-2026-09-24）
 * @module platform/services/longwriting/library/ip-library.service
 *
 * IP 角色的静态原型（背景/欲望/软肋/弧光/能力）在库；故事内的演变
 * （状态切片/关系边/事件）全部在项目侧既有机制，导入后互不干扰。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type {
  IpCharacter,
  IpEdge,
  CreateIpCharacterRequest,
  UpdateIpCharacterRequest,
  CreateIpEdgeRequest,
} from '@shared/types/lw-library.types'

export class IpLibraryService {
  private db() {
    return getCoreDatabaseManager()
  }

  async listCharacters(includeArchived = false): Promise<IpCharacter[]> {
    return includeArchived ? this.db().lwIpCharacters!.listActive() : this.db().lwIpCharacters!.listActive()
  }

  async listByWorld(worldId: string): Promise<IpCharacter[]> {
    return this.db().lwIpCharacters!.listByWorldId(worldId)
  }

  async getCharacter(
    id: string,
  ): Promise<(IpCharacter & { edges: IpEdge[]; referencingProjects: number }) | null> {
    const character = await this.db().lwIpCharacters!.getById(id)
    if (!character) return null
    const [edges, bindings] = await Promise.all([
      this.db().lwIpEdges!.listByCharacterId(id),
      this.db().lwIpBindings!.listByIpCharacterId(id),
    ])
    return { ...character, edges, referencingProjects: bindings.length }
  }

  async createCharacter(req: CreateIpCharacterRequest): Promise<IpCharacter> {
    return this.db().lwIpCharacters!.create(req)
  }

  async updateCharacter(id: string, req: UpdateIpCharacterRequest): Promise<IpCharacter | null> {
    return this.db().lwIpCharacters!.updateRow(id, req)
  }

  async deleteCharacter(id: string): Promise<{ ok: boolean; referencingProjects: number }> {
    const bindings = await this.db().lwIpBindings!.listByIpCharacterId(id)
    // 删除语义：项目侧导入行与绑定行保留（悬空），仅删库行与其关系边
    const edges = await this.db().lwIpEdges!.listByCharacterId(id)
    for (const edge of edges) {
      await this.db().lwIpEdges!.deleteRow(edge.id)
    }
    await this.db().lwIpCharacters!.deleteRow(id)
    return { ok: true, referencingProjects: bindings.length }
  }

  // ---------- 库内原型关系 ----------

  async listEdges(characterId: string): Promise<IpEdge[]> {
    return this.db().lwIpEdges!.listByCharacterId(characterId)
  }

  async createEdge(req: CreateIpEdgeRequest): Promise<IpEdge> {
    return this.db().lwIpEdges!.create(req)
  }

  async deleteEdge(id: string): Promise<boolean> {
    return this.db().lwIpEdges!.deleteRow(id)
  }
}
