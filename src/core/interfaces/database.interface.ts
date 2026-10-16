/**
 * 数据库连接器接口
 * @module core/interfaces/database
 * @description 平台无关的数据库连接抽象
 */

import type Database from 'better-sqlite3'

/**
 * 数据库连接器接口
 * 用于获取和管理数据库连接
 */
export interface IDatabaseConnector {
  /**
   * 获取数据库连接
   * @returns Database 实例
   */
  getConnection(): Database.Database

  /**
   * 获取数据库路径
   */
  getDbPath(): string

  /**
   * 初始化数据库
   */
  initialize(): Promise<void>

  /**
   * 关闭数据库连接
   */
  close(): Promise<void>

  /**
   * 检查数据库是否已初始化
   */
  isInitialized(): boolean
}