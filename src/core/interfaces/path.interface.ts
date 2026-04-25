/**
 * 路径提供者接口
 * @module core/interfaces/path
 * @description 平台无关的路径获取抽象
 */

/**
 * 子目录配置
 */
export interface SubDirectories {
  database: string
  images: string
  voice: string
  translations: string
  knowledgeBase: string
  video: string
  portrait: string
  diary: string
  longwriting: string
  stv: string
}

/**
 * 路径提供者接口
 * 用于获取应用所需的各类路径
 */
export interface IPathProvider {
  /**
   * 获取用户数据目录
   */
  getUserDataPath(): string

  /**
   * 获取应用数据目录
   */
  getAppDataPath(): string

  /**
   * 获取临时目录
   */
  getTempPath(): string

  /**
   * 获取数据存储路径（可能自定义）
   */
  getDataPath(): string

  /**
   * 设置数据存储路径
   * @param path - 新的数据路径
   */
  setDataPath?(path: string): void

  /**
   * 获取子目录路径配置
   */
  getSubDirectories(): SubDirectories

  /**
   * 获取特定子目录的完整路径
   * @param name - 子目录名称
   */
  getSubDirectoryPath(name: keyof SubDirectories): string
}