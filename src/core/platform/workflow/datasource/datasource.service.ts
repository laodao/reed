/**
 * 数据源服务（CRUD + testConnection + 节点执行入口）
 * @module core/platform/workflow/datasource/datasource.service
 * @description
 *  - 数据源配置 CRUD（密码经 SecureStorage 加密后落库，绝不明文）
 *  - testConnection / executeSql：解密凭据 → 路由到对应驱动适配器
 *  - 供工作流「数据库」节点与 Agent 选数据源执行；同一套执行器（datasource-executor）
 *  本服务由 workflow-boot 装配注册（同 variable-data.service 模式）。
 */

import type { DataSourceRepository } from '@core/database/repositories/datasource.repository'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import type {
  DataSourceConfig,
  DataSourceConnectionParams,
  DataSourceQueryResult,
  DataSourceTestResult,
  CreateDataSourceRequest,
  UpdateDataSourceRequest,
} from '@shared/types/datasource.types'
import { DATA_SOURCE_DRIVER_META } from '@shared/types/datasource.types'
import {
  testDataSourceConnection,
  executeDataSourceSql,
} from './datasource-executor.service'

type Repo = DataSourceRepository

export class DataSourceService {
  constructor(private readonly repository: Repo) {}

  // ==================== CRUD ====================

  async list(): Promise<DataSourceConfig[]> {
    return this.repository.getAll()
  }

  async get(id: string): Promise<DataSourceConfig | null> {
    return this.repository.getById(id)
  }

  async create(input: CreateDataSourceRequest): Promise<DataSourceConfig> {
    const id = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    return this.repository.create({
      id,
      name: input.name,
      driver: input.driver,
      host: input.host,
      port: input.port || DATA_SOURCE_DRIVER_META[input.driver].defaultPort,
      database: input.database,
      username: input.username,
      passwordEnc: await this.encryptPassword(input.password),
      ssl: input.ssl ?? false,
    })
  }

  async update(id: string, input: UpdateDataSourceRequest): Promise<boolean> {
    const patch: Partial<UpdateDataSourceRequest> = {
      name: input.name,
      driver: input.driver,
      host: input.host,
      port: input.port,
      database: input.database,
      username: input.username,
      ssl: input.ssl,
      isEnabled: input.isEnabled,
    }
    if (input.password) patch.passwordEnc = await this.encryptPassword(input.password)
    return this.repository.update(id, patch as any)
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id)
  }

  async toggleEnabled(id: string): Promise<boolean> {
    return this.repository.toggleEnabled(id)
  }

  // ==================== 测试 / 执行 ====================

  /** 测试连接：读配置 + 解密凭据 + 交给驱动 */
  async testConnection(id: string): Promise<DataSourceTestResult> {
    const config = await this.repository.getById(id)
    if (!config) return { success: false, message: '数据源不存在' }
    if (!config.isEnabled) return { success: false, message: '数据源已禁用' }
    const params = await this.toConnectionParams(config)
    return testDataSourceConnection(config.driver, params)
  }

  /** 对数据源执行 SQL（节点/Agent 共用入口） */
  async execute(
    id: string,
    sql: string,
    parameters: ReadonlyArray<unknown> = [],
  ): Promise<DataSourceQueryResult> {
    const config = await this.repository.getById(id)
    if (!config) throw new Error('数据源不存在')
    if (!config.isEnabled) throw new Error('数据源已禁用')
    const params = await this.toConnectionParams(config)
    return executeDataSourceSql(config.driver, params, sql, parameters)
  }

  /** 列出启用中的数据源：供节点下拉/Agent 候选名单 */
  async listEligible(): Promise<DataSourceConfig[]> {
    return this.repository.getEnabled()
  }

  // ==================== 内部 ====================

  private async encryptPassword(password?: string): Promise<string | null> {
    if (!password) return null
    const ss = getSecureStorage()
    if (!ss.isInitialized()) await ss.initialize()
    return ss.encrypt(password)
  }

  private async decryptPassword(passwordEnc: string | null): Promise<string | undefined> {
    if (!passwordEnc) return undefined
    const ss = getSecureStorage()
    if (!ss.isInitialized()) await ss.initialize()
    return ss.decrypt(passwordEnc)
  }

  /** 配置 → 连接参数（解密密码） */
  async toConnectionParams(config: DataSourceConfig): Promise<DataSourceConnectionParams> {
    return {
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username ?? undefined,
      password: await this.decryptPassword(config.passwordEnc),
      ssl: config.ssl,
    }
  }
}

// ==================== 注册器 ====================

let _svc: DataSourceService | null = null

export function registerDataSourceService(svc: DataSourceService): void {
  _svc = svc
}

export function getDataSourceService(): DataSourceService {
  if (!_svc) {
    throw new Error('数据源服务未注册（workflow-boot 装配失败或未调用）')
  }
  return _svc
}

export function resetDataSourceService(): void {
  _svc = null
}
